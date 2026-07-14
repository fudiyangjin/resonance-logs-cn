//! Non-blocking WAV-only playback worker.
//!
//! Owns the audio output stream on a dedicated thread (rodio's stream handle
//! is not meant to hop threads) and exposes a bounded command channel so the
//! live event loop can `enqueue` cues without ever waiting on audio I/O.

use std::collections::VecDeque;
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

    fn send_control(&self, command: PlayerCommand, description: &str) {
        if self.tx.send(command).is_err() {
            warn!(target: "app::voice", "playback worker is not running; dropping {description}");
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

struct WorkerState {
    device_sink: Option<MixerDeviceSink>,
    player: Option<Player>,
    queue: VecDeque<QueuedCue>,
    enabled: bool,
    volume: f32,
    policy: VoiceQueuePolicy,
    playing_priority: Option<u8>,
}

impl WorkerState {
    fn new() -> Self {
        let device_sink = match DeviceSinkBuilder::open_default_sink() {
            Ok(sink) => Some(sink),
            Err(e) => {
                warn!(target: "app::voice", "no audio output device available: {e}");
                None
            }
        };
        let player = device_sink
            .as_ref()
            .map(|sink| Player::connect_new(sink.mixer()));
        Self {
            device_sink,
            player,
            queue: VecDeque::new(),
            enabled: true,
            volume: 1.0,
            policy: VoiceQueuePolicy::default(),
            playing_priority: None,
        }
    }

    fn is_playing(&self) -> bool {
        self.player.as_ref().is_some_and(|p| !p.empty())
    }

    fn handle_enqueue(&mut self, cue: QueuedCue) {
        if !self.enabled {
            return;
        }

        if self.is_playing() {
            let current_priority = self.playing_priority.unwrap_or(0);
            match self.policy {
                VoiceQueuePolicy::InterruptForHigherPriority if cue.priority > current_priority => {
                    if let Some(player) = &self.player {
                        player.stop();
                    }
                    self.queue.clear();
                    self.play_now(cue);
                    return;
                }
                _ => {}
            }
        } else {
            self.play_now(cue);
            return;
        }

        if self.queue.len() >= MAX_QUEUE_LEN {
            match self.policy {
                VoiceQueuePolicy::DropLowPriority
                | VoiceQueuePolicy::InterruptForHigherPriority => {
                    if let Some((min_idx, min_cue)) = self
                        .queue
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, c)| c.priority)
                    {
                        if min_cue.priority < cue.priority {
                            self.queue.remove(min_idx);
                        } else {
                            return;
                        }
                    }
                }
            }
        }
        self.queue.push_back(cue);
    }

    fn play_now(&mut self, cue: QueuedCue) {
        let Some(device_sink) = &self.device_sink else {
            return;
        };
        if self.player.is_none() {
            self.player = Some(Player::connect_new(device_sink.mixer()));
        }
        let Some(player) = &self.player else {
            return;
        };
        player.set_volume(self.volume);
        match &cue.wav_path {
            Some(wav_path) => {
                let file = match File::open(wav_path) {
                    Ok(file) => file,
                    Err(e) => {
                        warn!(target: "app::voice", "cannot open cue wav {}: {e}", wav_path.display());
                        player.append(fallback_tone());
                        self.playing_priority = Some(cue.priority);
                        return;
                    }
                };
                match Decoder::new_wav(BufReader::new(file)) {
                    Ok(source) => player.append(source),
                    Err(e) => {
                        warn!(target: "app::voice", "cannot decode cue wav {}: {e}", wav_path.display());
                        player.append(fallback_tone());
                    }
                }
            }
            None => player.append(fallback_tone()),
        }
        self.playing_priority = Some(cue.priority);
    }

    fn advance_queue_if_idle(&mut self) {
        if self.is_playing() {
            return;
        }
        self.playing_priority = None;
        if let Some(cue) = self.queue.pop_front() {
            self.play_now(cue);
        }
    }
}

fn run_worker(rx: Receiver<PlayerCommand>) {
    let mut state = WorkerState::new();
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
fn apply_command(state: &mut WorkerState, command: PlayerCommand) -> bool {
    match command {
        PlayerCommand::Enqueue(cue) => state.handle_enqueue(cue),
        PlayerCommand::SetEnabled(enabled) => {
            state.enabled = enabled;
            if !enabled {
                if let Some(player) = &state.player {
                    player.stop();
                }
                state.queue.clear();
                state.playing_priority = None;
            }
        }
        PlayerCommand::SetVolume(volume) => {
            state.volume = volume.clamp(0.0, 1.0);
            if let Some(player) = &state.player {
                player.set_volume(state.volume);
            }
        }
        PlayerCommand::SetQueuePolicy(policy) => state.policy = policy,
        PlayerCommand::StopAll => {
            if let Some(player) = &state.player {
                player.stop();
            }
            state.queue.clear();
            state.playing_priority = None;
        }
        PlayerCommand::Shutdown => return false,
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
