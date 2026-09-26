//! Non-blocking WAV-only playback worker.
//!
//! Owns the audio output stream on a dedicated thread (rodio's stream handle
//! is not meant to hop threads) and exposes a bounded command channel so the
//! live event loop can `enqueue` cues without ever waiting on audio I/O.

use parking_lot::Mutex;
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, SyncSender, TryRecvError, TrySendError, sync_channel};
use std::time::{Duration, Instant};

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
    /// When the cue stops being worth playing (a lead cue whose moment has
    /// come); a cue still waiting in the queue by then is dropped. `None`
    /// never expires.
    pub stale_at: Option<Instant>,
}

impl QueuedCue {
    fn is_stale(&self, now: Instant) -> bool {
        self.stale_at.is_some_and(|stale_at| now >= stale_at)
    }
}

/// Published atomically as one coherent settings snapshot.
#[derive(Debug, Clone, Copy)]
pub struct PlaybackSettings {
    pub enabled: bool,
    pub volume: f32,
    pub policy: VoiceQueuePolicy,
}

impl Default for PlaybackSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            volume: 1.0,
            policy: VoiceQueuePolicy::default(),
        }
    }
}

#[derive(Debug, Default, Clone, Copy)]
struct ControlState {
    settings: PlaybackSettings,
    stop_epoch: u64,
    shutdown: bool,
}

struct PlaybackMessage {
    cue: QueuedCue,
    epoch: u64,
}

#[derive(Clone)]
pub struct PlayerHandle {
    tx: SyncSender<PlaybackMessage>,
    control: Arc<Mutex<ControlState>>,
}

pub trait PlaybackSink: Send + Sync {
    fn enqueue(&self, cue: QueuedCue);
    fn apply_settings(&self, settings: PlaybackSettings);
    fn stop_all(&self);
    fn shutdown(&self);
}

impl PlayerHandle {
    pub fn spawn() -> VoiceResult<Self> {
        let (tx, rx) = sync_channel(COMMAND_CHANNEL_CAPACITY);
        let control = Arc::new(Mutex::new(ControlState::default()));
        let worker_control = Arc::clone(&control);
        std::thread::Builder::new()
            .name("voice-playback".into())
            .spawn(move || run_worker(rx, worker_control, RodioOutput::open_default()))
            .map_err(|error| {
                VoiceError::Internal(format!("failed to spawn voice playback thread: {error}"))
            })?;
        Ok(Self { tx, control })
    }

    pub fn enqueue(&self, cue: QueuedCue) {
        let epoch = {
            let control = self.control.lock();
            if !control.settings.enabled || control.shutdown {
                return;
            }
            control.stop_epoch
        };
        // A stop racing this send makes the message stale, even if it arrives late.
        match self.tx.try_send(PlaybackMessage { cue, epoch }) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                warn!(target: "app::voice", "playback queue is full; dropping cue");
            }
            Err(TrySendError::Disconnected(_)) => {
                warn!(target: "app::voice", "playback worker is not running; dropping cue");
            }
        }
    }

    pub fn apply_settings(&self, mut settings: PlaybackSettings) {
        settings.volume = settings.volume.clamp(0.0, 1.0);
        let mut control = self.control.lock();
        if control.settings.enabled && !settings.enabled {
            control.stop_epoch = control.stop_epoch.wrapping_add(1);
        }
        control.settings = settings;
    }

    pub fn stop_all(&self) {
        let mut control = self.control.lock();
        control.stop_epoch = control.stop_epoch.wrapping_add(1);
    }

    pub fn shutdown(&self) {
        self.control.lock().shutdown = true;
    }
}

impl PlaybackSink for PlayerHandle {
    fn enqueue(&self, cue: QueuedCue) {
        PlayerHandle::enqueue(self, cue);
    }
    fn apply_settings(&self, settings: PlaybackSettings) {
        PlayerHandle::apply_settings(self, settings);
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
    /// Applies `volume` to the currently open output, if any.
    fn set_volume(&mut self, volume: f32);
    /// Starts `cue` immediately at `volume`. Must not block. The volume is
    /// passed explicitly because the underlying output may be (re)created
    /// lazily here, after any earlier `set_volume` call has been lost.
    fn start(&mut self, cue: &QueuedCue, volume: f32);
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

    fn start(&mut self, cue: &QueuedCue, volume: f32) {
        let Some(device_sink) = &self.device_sink else {
            if !self.warned_no_device {
                self.warned_no_device = true;
                warn!(target: "app::voice", "no audio output device; voice cues cannot be played");
            }
            return;
        };
        let player = self.player.get_or_insert_with(|| {
            // A fresh rodio Player defaults to volume 1.0; apply the
            // configured volume before any sound is appended.
            let player = Player::connect_new(device_sink.mixer());
            player.set_volume(volume);
            player
        });
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
    stop_epoch: u64,
}

impl<O: CueOutput> WorkerState<O> {
    fn new(output: O) -> Self {
        Self {
            output,
            queue: Vec::with_capacity(MAX_QUEUE_LEN),
            enabled: false,
            volume: 1.0,
            policy: VoiceQueuePolicy::default(),
            playing_priority: None,
            stop_epoch: 0,
        }
    }

    fn is_playing(&self) -> bool {
        self.output.is_busy()
    }

    fn handle_enqueue(&mut self, cue: QueuedCue) {
        if !self.enabled || cue.is_stale(Instant::now()) {
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
        self.output.start(&cue, self.volume);
        self.playing_priority = Some(cue.priority);
    }

    /// Highest priority first; ties resolve to the oldest arrival. Cues that
    /// went stale while waiting are dropped first.
    fn pop_next(&mut self) -> Option<QueuedCue> {
        let now = Instant::now();
        self.queue.retain(|cue| !cue.is_stale(now));
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

fn run_worker<O: CueOutput>(
    rx: Receiver<PlaybackMessage>,
    control: Arc<Mutex<ControlState>>,
    output: O,
) {
    let mut state = WorkerState::new(output);
    loop {
        if !sync_control(&mut state, &control) {
            return;
        }
        let received = rx.recv_timeout(POLL_INTERVAL);
        if !sync_control(&mut state, &control) {
            return;
        }
        match received {
            Ok(message) => {
                if !apply_message(&mut state, &control, message) {
                    return;
                }
                // Bound each drain so sustained traffic cannot postpone control checks.
                for _ in 1..COMMAND_CHANNEL_CAPACITY {
                    match rx.try_recv() {
                        Ok(message) => {
                            if !apply_message(&mut state, &control, message) {
                                return;
                            }
                        }
                        Err(TryRecvError::Empty) => break,
                        Err(TryRecvError::Disconnected) => {
                            state.stop_all();
                            return;
                        }
                    }
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                state.stop_all();
                return;
            }
        }
        if !sync_control(&mut state, &control) {
            return;
        }
        state.advance_queue_if_idle();
    }
}

/// Copy under a short lock; all output operations happen after releasing it.
fn sync_control<O: CueOutput>(state: &mut WorkerState<O>, control: &Mutex<ControlState>) -> bool {
    let current = *control.lock();
    if current.shutdown {
        state.stop_all();
        return false;
    }
    if current.stop_epoch != state.stop_epoch {
        state.stop_all();
        state.stop_epoch = current.stop_epoch;
    }
    state.enabled = current.settings.enabled;
    state.policy = current.settings.policy;
    if state.volume != current.settings.volume {
        state.volume = current.settings.volume;
        state.output.set_volume(state.volume);
    }
    true
}

fn apply_message<O: CueOutput>(
    state: &mut WorkerState<O>,
    control: &Mutex<ControlState>,
    message: PlaybackMessage,
) -> bool {
    if !sync_control(state, control) {
        return false;
    }
    if message.epoch == state.stop_epoch {
        state.handle_enqueue(message.cue);
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
        /// Volume passed to each `start`, parallel to `started`.
        start_volumes: Vec<f32>,
        stops: usize,
    }

    impl CueOutput for FakeOutput {
        fn is_busy(&self) -> bool {
            self.busy
        }
        fn set_volume(&mut self, _volume: f32) {}
        fn start(&mut self, cue: &QueuedCue, volume: f32) {
            self.started.push(cue.rule_id.clone());
            self.start_volumes.push(volume);
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
            stale_at: None,
        }
    }

    /// A lead cue whose moment is `offset` away (negative: already passed).
    fn lead_cue(rule_id: &str, priority: u8, offset_ms: i64) -> QueuedCue {
        let now = Instant::now();
        let magnitude = Duration::from_millis(offset_ms.unsigned_abs());
        QueuedCue {
            stale_at: if offset_ms >= 0 {
                now.checked_add(magnitude)
            } else {
                now.checked_sub(magnitude)
            },
            ..cue(rule_id, priority)
        }
    }

    fn finish_current(state: &mut WorkerState<FakeOutput>) {
        state.output.busy = false;
        state.advance_queue_if_idle();
    }

    #[test]
    fn full_command_channel_drops_new_cue() {
        let (tx, rx) = sync_channel(1);
        let handle = PlayerHandle {
            tx,
            control: Arc::new(Mutex::new(ControlState::default())),
        };
        handle.apply_settings(PlaybackSettings {
            enabled: true,
            ..Default::default()
        });
        let first = QueuedCue {
            rule_id: "first".to_string(),
            priority: 1,
            wav_path: Some(PathBuf::from("first.wav")),
            stale_at: None,
        };
        let second = QueuedCue {
            rule_id: "second".to_string(),
            priority: 2,
            wav_path: Some(PathBuf::from("second.wav")),
            stale_at: None,
        };

        handle.enqueue(first);
        handle.enqueue(second);

        let received = rx.try_recv().unwrap().cue;
        assert_eq!(received.rule_id, "first");
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn controls_survive_full_channel_and_new_epoch_cues_survive_stop() {
        let (tx, rx) = sync_channel(1);
        let handle = PlayerHandle {
            tx,
            control: Arc::new(Mutex::new(ControlState::default())),
        };
        handle.apply_settings(PlaybackSettings {
            enabled: true,
            ..Default::default()
        });
        let mut state = WorkerState::new(FakeOutput::default());
        handle.enqueue(cue("old", 1));
        handle.stop_all();
        assert!(apply_message(
            &mut state,
            &handle.control,
            rx.try_recv().unwrap()
        ));
        assert!(state.output.started.is_empty());
        handle.enqueue(cue("new", 1));
        assert!(apply_message(
            &mut state,
            &handle.control,
            rx.try_recv().unwrap()
        ));
        assert_eq!(state.output.started, ["new"]);
        handle.enqueue(cue("stale", 1));
        handle.apply_settings(PlaybackSettings::default());
        handle.apply_settings(PlaybackSettings {
            enabled: true,
            volume: 0.25,
            ..Default::default()
        });
        assert!(apply_message(
            &mut state,
            &handle.control,
            rx.try_recv().unwrap()
        ));
        assert!(!state.output.busy);
        assert!(state.queue.is_empty());
        assert_eq!(state.volume, 0.25);
        handle.enqueue(cue("pending", 1));
        handle.shutdown();
        assert!(!sync_control(&mut state, &handle.control));
        handle.enqueue(cue("rejected", 1));
        assert_eq!(rx.try_recv().unwrap().cue.rule_id, "pending");
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn worker_observes_stop_between_messages_and_shutdown_under_sustained_traffic() {
        struct BusyProducer {
            handle: PlayerHandle,
            starts: Arc<Mutex<Vec<String>>>,
        }
        impl CueOutput for BusyProducer {
            fn is_busy(&self) -> bool {
                false
            }
            fn set_volume(&mut self, _: f32) {}
            fn stop(&mut self) {}
            fn start(&mut self, current: &QueuedCue, _: f32) {
                let count = {
                    let mut starts = self.starts.lock();
                    starts.push(current.rule_id.clone());
                    starts.len()
                };
                if count == 1 {
                    self.handle.stop_all();
                    self.handle.enqueue(cue("new", 1));
                } else if count < 40 {
                    // The worker never gets an empty channel until it sees shutdown.
                    for _ in 0..COMMAND_CHANNEL_CAPACITY {
                        self.handle.enqueue(cue("new", 1));
                    }
                } else {
                    self.handle.shutdown();
                }
            }
        }
        let (tx, rx) = sync_channel(COMMAND_CHANNEL_CAPACITY);
        let control = Arc::new(Mutex::new(ControlState::default()));
        let handle = PlayerHandle {
            tx,
            control: Arc::clone(&control),
        };
        handle.apply_settings(PlaybackSettings {
            enabled: true,
            ..Default::default()
        });
        for _ in 0..COMMAND_CHANNEL_CAPACITY {
            handle.enqueue(cue("old", 1));
        }
        let starts = Arc::new(Mutex::new(Vec::new()));
        run_worker(
            rx,
            control,
            BusyProducer {
                handle,
                starts: Arc::clone(&starts),
            },
        );
        let starts = starts.lock();
        assert_eq!(starts.len(), 40);
        assert_eq!(starts[0], "old");
        assert!(starts[1..].iter().all(|id| id == "new"));
    }

    #[test]
    fn dequeues_by_priority_then_arrival_order() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.enabled = true;
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
    fn stale_lead_cues_are_dropped_on_arrival_and_while_waiting() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.enabled = true;
        // Arrives after the moment it warns about: never played.
        state.handle_enqueue(lead_cue("late", 5, -1));
        assert!(state.output.started.is_empty());

        state.handle_enqueue(cue("playing", 1));
        state.handle_enqueue(lead_cue("expires-while-queued", 9, 5));
        state.handle_enqueue(lead_cue("still-valid", 1, 60_000));
        std::thread::sleep(Duration::from_millis(20));
        finish_current(&mut state);
        assert_eq!(state.output.started, vec!["playing", "still-valid"]);
        assert!(state.queue.is_empty());
    }

    #[test]
    fn idle_worker_does_not_let_new_cue_overtake_pending_higher_one() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.enabled = true;
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
        state.enabled = true;
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
        state.enabled = true;
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
    fn first_cue_and_rebuilt_output_start_at_configured_volume() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.enabled = true;
        state.policy = VoiceQueuePolicy::InterruptForHigherPriority;
        state.volume = 0.25;

        // First cue after startup: output is created lazily inside `start`.
        state.handle_enqueue(cue("first", 1));
        // Interrupt discards the output; the replacement must not reset to 1.0.
        state.handle_enqueue(cue("urgent", 200));
        // Explicit stop, then a fresh cue once idle.
        state.stop_all();
        state.handle_enqueue(cue("after-stop", 1));

        assert_eq!(state.output.started, vec!["first", "urgent", "after-stop"]);
        assert_eq!(state.output.start_volumes, vec![0.25, 0.25, 0.25]);
    }

    #[test]
    fn disabling_stops_and_clears() {
        let mut state = WorkerState::new(FakeOutput::default());
        state.enabled = true;
        state.handle_enqueue(cue("playing", 1));
        state.handle_enqueue(cue("queued", 1));
        let control = Mutex::new(ControlState {
            stop_epoch: 1,
            ..Default::default()
        });
        assert!(sync_control(&mut state, &control));
        assert!(state.queue.is_empty());
        assert_eq!(state.playing_priority, None);
        state.handle_enqueue(cue("ignored", 1));
        assert_eq!(state.output.started, vec!["playing"]);
    }
}
