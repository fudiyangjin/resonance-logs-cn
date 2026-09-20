//! Non-blocking WAV-only playback worker.
//!
//! Owns the audio output stream on a dedicated thread (rodio's stream handle
//! is not meant to hop threads) and exposes a bounded command channel so the
//! live event loop can `enqueue` cues without ever waiting on audio I/O.

use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, SyncSender, TryRecvError, TrySendError, sync_channel};
use std::time::Duration;

use log::warn;
use rodio::source::SineWave;
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};

use super::error::{VoiceError, VoiceResult};
use super::models::VoiceQueuePolicy;

const MAX_QUEUE_LEN: usize = 8;
const COMMAND_CHANNEL_CAPACITY: usize = 32;
const POLL_INTERVAL: Duration = Duration::from_millis(60);

/// Frequency/duration of the built-in fallback tone played when a cue's
/// phrase has no generated (or missing-on-disk) audio, so a misconfigured
/// or not-yet-generated rule is still audible instead of silently dropped.
const FALLBACK_TONE_HZ: f32 = 880.0;
const FALLBACK_TONE_DURATION: Duration = Duration::from_millis(160);
const FALLBACK_TONE_FADE: Duration = Duration::from_millis(70);
const FALLBACK_TONE_AMPLITUDE: f32 = 0.3;

fn fallback_tone() -> impl Source<Item = f32> + Send + 'static {
    SineWave::new(FALLBACK_TONE_HZ)
        .take_duration(FALLBACK_TONE_DURATION)
        .amplify(FALLBACK_TONE_AMPLITUDE)
        .fade_out(FALLBACK_TONE_FADE)
}

/// A cue queued for playback. `wav_path` is `None` when the phrase has no
/// generated (or missing-on-disk) audio; the worker then plays a short
/// built-in tone instead of silently dropping the cue.
#[derive(Debug, Clone)]
pub struct QueuedCue {
    pub rule_id: String,
    pub priority: u8,
    pub wav_path: Option<PathBuf>,
}

enum PlayerCommand {
    Enqueue(QueuedCue),
    SetEnabled(bool),
    SetVolume(f32),
    SetQueuePolicy(VoiceQueuePolicy),
    StopAll,
    Shutdown,
}

/// Handle owned by `VoiceService`; cheap to clone-share via `Arc` since it only
/// wraps a channel sender.
#[derive(Clone)]
pub struct PlayerHandle {
    tx: SyncSender<PlayerCommand>,
}

pub trait PlaybackSink: Send + Sync {
    fn enqueue(&self, cue: QueuedCue);
    fn set_enabled(&self, enabled: bool);
    fn set_volume(&self, volume: f32);
    fn set_queue_policy(&self, policy: VoiceQueuePolicy);
    fn stop_all(&self);
    fn shutdown(&self);
}

impl PlayerHandle {
    pub fn spawn() -> VoiceResult<Self> {
        let (tx, rx) = sync_channel(COMMAND_CHANNEL_CAPACITY);
        std::thread::Builder::new()
            .name("voice-playback".into())
            .spawn(move || run_worker(rx))
            .map_err(|error| {
                VoiceError::Internal(format!("failed to spawn voice playback thread: {error}"))
            })?;
        Ok(Self { tx })
    }

    /// Never blocks: the send only fails if the worker thread has exited.
    pub fn enqueue(&self, cue: QueuedCue) {
        match self.tx.try_send(PlayerCommand::Enqueue(cue)) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                warn!(target: "app::voice", "playback command queue is full; dropping cue");
            }
            Err(TrySendError::Disconnected(_)) => {
                warn!(target: "app::voice", "playback worker is not running; dropping cue");
            }
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.send_control(PlayerCommand::SetEnabled(enabled), "enabled setting");
    }

    pub fn set_volume(&self, volume: f32) {
        self.send_control(PlayerCommand::SetVolume(volume), "volume setting");
    }

    pub fn set_queue_policy(&self, policy: VoiceQueuePolicy) {
        self.send_control(PlayerCommand::SetQueuePolicy(policy), "queue policy");
    }

    pub fn stop_all(&self) {
        self.send_control(PlayerCommand::StopAll, "stop command");
    }

    pub fn shutdown(&self) {
        self.send_control(PlayerCommand::Shutdown, "shutdown command");
    }

    /// Never blocks the caller (the live event loop): a saturated channel
    /// drops the setting change with a warning instead of stalling. The
    /// next settings sync re-sends the full state anyway.
    fn send_control(&self, command: PlayerCommand, description: &str) {
        match self.tx.try_send(command) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                warn!(target: "app::voice", "playback command queue is full; dropping {description}");
            }
            Err(TrySendError::Disconnected(_)) => {
                warn!(target: "app::voice", "playback worker is not running; dropping {description}");
            }
        }
    }
}

impl PlaybackSink for PlayerHandle {
    fn enqueue(&self, cue: QueuedCue) {
        PlayerHandle::enqueue(self, cue);
    }

    fn set_enabled(&self, enabled: bool) {
        PlayerHandle::set_enabled(self, enabled);
    }

    fn set_volume(&self, volume: f32) {
        PlayerHandle::set_volume(self, volume);
    }

    fn set_queue_policy(&self, policy: VoiceQueuePolicy) {
        PlayerHandle::set_queue_policy(self, policy);
    }

    fn stop_all(&self) {
        PlayerHandle::stop_all(self);
    }

    fn shutdown(&self) {
        PlayerHandle::shutdown(self);
    }
}

/// Loads and applies the cue's audio onto a rodio [`Player`]. Split out of
/// the worker so the queueing logic can be unit-tested with a fake output.
trait CueOutput {
    /// True while a sound is still playing.
    fn is_busy(&self) -> bool;
    fn set_volume(&mut self, volume: f32);
    /// Starts `cue` immediately. Must not block.
    fn start(&mut self, cue: &QueuedCue);
    /// Stops whatever is playing and discards any pending sound.
    fn stop(&mut self);
}

struct RodioOutput {
    device_sink: Option<MixerDeviceSink>,
    player: Option<Player>,
    warned_no_device: bool,
}

impl RodioOutput {
    fn open_default() -> Self {
        let device_sink = match DeviceSinkBuilder::open_default_sink() {
            Ok(sink) => Some(sink),
            Err(e) => {
                warn!(target: "app::voice", "no audio output device available: {e}");
                None
            }
        };
        Self {
            device_sink,
            player: None,
            warned_no_device: false,
        }
    }
}

impl CueOutput for RodioOutput {
    fn is_busy(&self) -> bool {
        self.player.as_ref().is_some_and(|p| !p.empty())
    }

    fn set_volume(&mut self, volume: f32) {
        if let Some(player) = &self.player {
            player.set_volume(volume);
        }
    }

    fn start(&mut self, cue: &QueuedCue) {
        let Some(device_sink) = &self.device_sink else {
            if !self.warned_no_device {
                self.warned_no_device = true;
                warn!(target: "app::voice", "no audio output device; voice cues cannot be played");
            }
            return;
        };
        let player = self
            .player
            .get_or_insert_with(|| Player::connect_new(device_sink.mixer()));
        match &cue.wav_path {
            Some(wav_path) => match File::open(wav_path) {
                Ok(file) => match Decoder::new(BufReader::new(file)) {
                    Ok(source) => player.append(source),
                    Err(e) => {
                        warn!(target: "app::voice", "cannot decode cue wav {}: {e}", wav_path.display());
                        player.append(fallback_tone());
                    }
                },
                Err(e) => {
                    warn!(target: "app::voice", "cannot open cue wav {}: {e}", wav_path.display());
                    player.append(fallback_tone());
                }
            },
            None => player.append(fallback_tone()),
        }
    }

    /// Dropping a non-detached `Player` stops its sounds immediately. This
    /// is deliberately *not* `Player::stop` followed by `append`: rodio's
    /// `append` on a stopped player calls `sleep_until_end` first, which
    /// would block the worker thread until the interrupted sound drained.
    fn stop(&mut self) {
        self.player = None;
    }
}

struct WorkerState<O: CueOutput> {
    output: O,
    /// Pending cues in arrival order; dequeued by priority (see `pop_next`).
    queue: Vec<QueuedCue>,
    enabled: bool,
    volume: f32,
    policy: VoiceQueuePolicy,
    playing_priority: Option<u8>,
}

impl<O: CueOutput> WorkerState<O> {
    fn new(output: O) -> Self {
        Self {
            output,
            queue: Vec::with_capacity(MAX_QUEUE_LEN),
            enabled: true,
            volume: 1.0,
            policy: VoiceQueuePolicy::default(),
            playing_priority: None,
        }
    }

    fn is_playing(&self) -> bool {
        self.output.is_busy()
    }

    fn handle_enqueue(&mut self, cue: QueuedCue) {
        if !self.enabled {
            return;
        }

        if self.is_playing()
            && self.policy == VoiceQueuePolicy::InterruptForHigherPriority
            && cue.priority > self.playing_priority.unwrap_or(0)
        {
            self.output.stop();
            self.queue.clear();
            self.play_now(cue);
            return;
        }

        if self.queue.len() >= MAX_QUEUE_LEN {
            // Both policies shed the lowest-priority pending cue when full,
            // and refuse the newcomer if it would itself be the lowest.
            let Some(min_idx) = self
                .queue
                .iter()
                .enumerate()
                .min_by_key(|(_, c)| c.priority)
                .map(|(idx, _)| idx)
            else {
                return;
            };
            if self.queue[min_idx].priority < cue.priority {
                self.queue.remove(min_idx);
            } else {
                warn!(
                    target: "app::voice",
                    "voice queue full; dropping cue for rule {} (priority {})",
                    cue.rule_id, cue.priority
                );
                return;
            }
        }
        // Even when idle, go through the queue so an older, higher-priority
        // cue that is waiting for the poll tick is never overtaken.
        self.queue.push(cue);
        self.advance_queue_if_idle();
    }

    fn play_now(&mut self, cue: QueuedCue) {
        self.output.set_volume(self.volume);
        self.output.start(&cue);
        self.playing_priority = Some(cue.priority);
    }

    /// Highest priority first; ties resolve to the oldest arrival.
    fn pop_next(&mut self) -> Option<QueuedCue> {
        let idx = self
            .queue
            .iter()
            .enumerate()
            .rev() // max_by_key keeps the last max, so reversed = oldest
            .max_by_key(|(_, c)| c.priority)
            .map(|(idx, _)| idx)?;
        Some(self.queue.remove(idx))
    }

    fn advance_queue_if_idle(&mut self) {
        if self.is_playing() {
            return;
        }
        match self.pop_next() {
            Some(cue) => self.play_now(cue),
            None => self.playing_priority = None,
        }
    }

    fn stop_all(&mut self) {
        self.output.stop();
        self.queue.clear();
        self.playing_priority = None;
    }
}

fn run_worker(rx: Receiver<PlayerCommand>) {
    let mut state = WorkerState::new(RodioOutput::open_default());
    loop {
        match rx.recv_timeout(POLL_INTERVAL) {
            Ok(command) => {
                if !apply_command(&mut state, command) {
                    return;
                }
                // Drain any additional buffered commands before re-polling so bursts
                // (e.g. rapid setting changes) don't each incur a full poll interval.
                loop {
                    match rx.try_recv() {
                        Ok(command) => {
                            if !apply_command(&mut state, command) {
                                return;
                            }
                        }
                        Err(TryRecvError::Empty) => break,
                        Err(TryRecvError::Disconnected) => return,
                    }
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
        }
        state.advance_queue_if_idle();
    }
}

/// Returns false when the worker should exit.
fn apply_command<O: CueOutput>(state: &mut WorkerState<O>, command: PlayerCommand) -> bool {
    match command {
        PlayerCommand::Enqueue(cue) => state.handle_enqueue(cue),
        PlayerCommand::SetEnabled(enabled) => {
            state.enabled = enabled;
            if !enabled {
                state.stop_all();
            }
        }
        PlayerCommand::SetVolume(volume) => {
            state.volume = volume.clamp(0.0, 1.0);
            state.output.set_volume(state.volume);
        }
        PlayerCommand::SetQueuePolicy(policy) => state.policy = policy,
        PlayerCommand::StopAll => state.stop_all(),
        PlayerCommand::Shutdown => return false,
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct FakeOutput {
        busy: bool,
        started: Vec<String>,
        stops: usize,
    }

    impl CueOutput for FakeOutput {
        fn is_busy(&self) -> bool {
            self.busy
        }
        fn set_volume(&mut self, _volume: f32) {}
        fn start(&mut self, cue: &QueuedCue) {
            self.started.push(cue.rule_id.clone());
            self.busy = true;
        }
        fn stop(&mut self) {
            self.stops += 1;
            self.busy = false;
        }
    }

    fn cue(rule_id: &str, priority: u8) -> QueuedCue {
        QueuedCue {
            rule_id: rule_id.to_string(),
            priority,
            wav_path: None,
        }
    }

    fn finish_current(state: &mut WorkerState<FakeOutput>) {
        state.output.busy = false;
        state.advance_queue_if_idle();
    }

    #[test]
    fn full_command_channel_drops_new_cue() {
        let (tx, rx) = sync_channel(1);
        let handle = PlayerHandle { tx };
        let first = QueuedCue {
            rule_id: "first".to_string(),
            priority: 1,
            wav_path: Some(PathBuf::from("first.wav")),
        };
        let second = QueuedCue {
            rule_id: "second".to_string(),
            priority: 2,
            wav_path: Some(PathBuf::from("second.wav")),
        };

        handle.enqueue(first);
        handle.enqueue(second);

        let PlayerCommand::Enqueue(received) = rx.try_recv().unwrap() else {
            panic!("expected queued cue");
        };
        assert_eq!(received.rule_id, "first");
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn full_command_channel_does_not_block_settings() {
        let (tx, _rx) = sync_channel(1);
        let handle = PlayerHandle { tx };
        handle.set_volume(0.5);
        // Channel is now full; these must return instead of blocking forever.
        handle.set_enabled(false);
        handle.set_queue_policy(VoiceQueuePolicy::InterruptForHigherPriority);
    }

    #[test]
    fn dequeues_by_priority_then_arrival_order() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.handle_enqueue(cue("playing", 1));
        state.handle_enqueue(cue("low-a", 1));
        state.handle_enqueue(cue("high", 5));
        state.handle_enqueue(cue("low-b", 1));
        assert_eq!(state.output.started, vec!["playing"]);

        finish_current(&mut state);
        finish_current(&mut state);
        finish_current(&mut state);
        assert_eq!(
            state.output.started,
            vec!["playing", "high", "low-a", "low-b"]
        );
        assert!(state.queue.is_empty());
        finish_current(&mut state);
        assert_eq!(state.playing_priority, None);
    }

    #[test]
    fn idle_worker_does_not_let_new_cue_overtake_pending_higher_one() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.handle_enqueue(cue("first", 1));
        state.handle_enqueue(cue("pending-high", 9));
        // Sound ends, but the poll tick has not run yet when a new cue lands.
        state.output.busy = false;
        state.handle_enqueue(cue("late-low", 1));
        assert_eq!(state.output.started, vec!["first", "pending-high"]);
    }

    #[test]
    fn interrupt_policy_replaces_output_and_clears_queue() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.policy = VoiceQueuePolicy::InterruptForHigherPriority;
        state.handle_enqueue(cue("playing", 1));
        state.handle_enqueue(cue("queued", 1));
        state.handle_enqueue(cue("urgent", 200));
        assert_eq!(state.output.stops, 1);
        assert_eq!(state.output.started, vec!["playing", "urgent"]);
        assert!(state.queue.is_empty());
        assert_eq!(state.playing_priority, Some(200));
    }

    #[test]
    fn full_queue_sheds_lowest_priority_and_refuses_lower_newcomer() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.handle_enqueue(cue("playing", 5));
        for i in 0..MAX_QUEUE_LEN {
            state.handle_enqueue(cue(&format!("q{i}"), 5));
        }
        assert_eq!(state.queue.len(), MAX_QUEUE_LEN);
        state.handle_enqueue(cue("too-low", 1));
        assert_eq!(state.queue.len(), MAX_QUEUE_LEN);
        assert!(state.queue.iter().all(|c| c.rule_id != "too-low"));
        state.handle_enqueue(cue("higher", 9));
        assert_eq!(state.queue.len(), MAX_QUEUE_LEN);
        assert!(state.queue.iter().any(|c| c.rule_id == "higher"));
    }

    #[test]
    fn disabling_stops_and_clears() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.handle_enqueue(cue("playing", 1));
        state.handle_enqueue(cue("queued", 1));
        assert!(apply_command(&mut state, PlayerCommand::SetEnabled(false)));
        assert!(state.queue.is_empty());
        assert_eq!(state.playing_priority, None);
        state.handle_enqueue(cue("ignored", 1));
        assert_eq!(state.output.started, vec!["playing"]);
    }
}
