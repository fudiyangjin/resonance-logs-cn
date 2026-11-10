//! Capture pipeline wiring.
//!
//! ```text
//! packet-capture thread            bounded RawBatch channel        packet-stream thread
//! driver batch read  ─▶ admission ───────────────────────────▶ TCP + frame reassembly ─▶ CaptureEmitter
//!                     ◀──────────── FlowControl (ignore flow) ──
//! ```
//!
//! The capture thread only reads the driver, picks game segments and copies
//! them out, so downstream backpressure or command fences fill the channel
//! (and then the enlarged driver queue) instead of stalling driver reads.

use crate::live::runtime::events::CaptureEnvelope;
use crate::packets::capture_source::{PacketSource, ReadWaker, SourceDrops};
use crate::packets::flow_admission::{FlowAdmission, FlowControl, RawBatch};
use crate::packets::npcap::NpcapSource;
use crate::packets::packet_process::CaptureEmitter;
use crate::packets::stream_processor::StreamProcessor;
use crate::packets::windivert_source::WinDivertSource;
use log::{error, info, warn};
use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

const CAPTURE_CHANNEL_CAP: usize = 4096;
/// Batches in flight between the capture and stream threads.
const RAW_CHANNEL_BATCHES: usize = 256;
const STATS_INTERVAL: Duration = Duration::from_secs(60);
/// Warn when a game process holds connections but nothing was captured.
const GAME_SILENCE_WARN_AFTER: Duration = Duration::from_secs(30);

#[derive(Clone, Debug)]
pub enum CaptureMethod {
    WinDivert,
    Npcap(String),
}

/// Waker of the source the capture thread is currently reading, if any.
type WakerSlot = Arc<Mutex<Option<ReadWaker>>>;

pub struct CaptureWorkerHandle {
    cancellation: CancellationToken,
    read_waker: WakerSlot,
    capture: Option<JoinHandle<()>>,
    stream: Option<JoinHandle<()>>,
}

impl Drop for CaptureWorkerHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

impl CaptureWorkerHandle {
    /// Cancels capture and releases a driver read that would otherwise wait
    /// for the next packet.
    fn stop(&self) {
        self.cancellation.cancel();
        if let Some(wake) = self.read_waker.lock().as_ref() {
            wake();
        }
    }

    /// Cancels capture and waits for both threads. The stream thread exits
    /// after the capture thread, so the envelope sender closes last.
    pub fn join(mut self) -> std::thread::Result<()> {
        self.stop();
        let capture = self.capture.take().map_or(Ok(()), JoinHandle::join);
        let stream = self.stream.take().map_or(Ok(()), JoinHandle::join);
        capture.and(stream)
    }
}

pub struct CaptureRuntime {
    pub receiver: tokio::sync::mpsc::Receiver<CaptureEnvelope>,
    pub worker: CaptureWorkerHandle,
    pub outstanding: Arc<AtomicUsize>,
}

impl CaptureRuntime {
    pub fn into_parts(
        self,
    ) -> (
        tokio::sync::mpsc::Receiver<CaptureEnvelope>,
        CaptureWorkerHandle,
        Arc<AtomicUsize>,
    ) {
        (self.receiver, self.worker, self.outstanding)
    }
}

pub fn start_capture(method: CaptureMethod) -> CaptureRuntime {
    let (packet_sender, packet_receiver) =
        tokio::sync::mpsc::channel::<CaptureEnvelope>(CAPTURE_CHANNEL_CAP);
    let outstanding = Arc::new(AtomicUsize::new(0));
    let cancellation = CancellationToken::new();
    let (raw_sender, raw_receiver) = mpsc::sync_channel::<RawBatch>(RAW_CHANNEL_BATCHES);
    let (control_sender, control_receiver) = mpsc::channel::<FlowControl>();
    let backlog = Arc::new(AtomicUsize::new(0));
    let read_waker: WakerSlot = Arc::new(Mutex::new(None));

    match &method {
        CaptureMethod::WinDivert => {
            info!(target: "app::capture", "capture_start method=WinDivert");
        }
        CaptureMethod::Npcap(device) => {
            if device.trim().is_empty() {
                error!(target: "app::capture", "capture_start_failed method=Npcap err=empty_device");
            }
            info!(target: "app::capture", "capture_start method=Npcap device={device}");
        }
    }

    let emitter = CaptureEmitter::new(
        packet_sender,
        cancellation.clone(),
        Arc::clone(&outstanding),
    );
    let stream_backlog = Arc::clone(&backlog);
    let stream = std::thread::Builder::new()
        .name("packet-stream".to_string())
        .spawn(move || {
            StreamProcessor::new(emitter, control_sender).run(raw_receiver, stream_backlog);
        })
        .expect("failed to spawn packet stream thread");

    let thread_cancellation = cancellation.clone();
    let thread_waker = Arc::clone(&read_waker);
    let capture = std::thread::Builder::new()
        .name("packet-capture".to_string())
        .spawn(move || {
            let capture_span = tracing::info_span!(
                target: "app::capture",
                "capture_thread",
                method = ?method
            );
            let _capture_guard = capture_span.enter();
            let mut channel = CaptureChannel {
                raw: raw_sender,
                control: control_receiver,
                backlog,
                read_waker: thread_waker,
            };
            let mut admission = FlowAdmission::new();
            let mut stats = CaptureStats::new();

            while !thread_cancellation.is_cancelled() {
                let exit = read_packets(
                    &method,
                    &mut admission,
                    &mut channel,
                    &mut stats,
                    &thread_cancellation,
                );
                if exit != ReadExit::SourceFailed || thread_cancellation.is_cancelled() {
                    break;
                }
                warn!("Packet capture exited unexpectedly. Restarting in 1s...");
                wait_with_cancellation(&thread_cancellation, Duration::from_secs(1));
            }
            info!(target: "app::capture", "capture thread exiting");
        })
        .expect("failed to spawn packet capture thread");

    CaptureRuntime {
        receiver: packet_receiver,
        worker: CaptureWorkerHandle {
            cancellation,
            read_waker,
            capture: Some(capture),
            stream: Some(stream),
        },
        outstanding,
    }
}

struct CaptureChannel {
    raw: SyncSender<RawBatch>,
    control: Receiver<FlowControl>,
    /// Batches sent to the stream thread and not yet received.
    backlog: Arc<AtomicUsize>,
    read_waker: WakerSlot,
}

/// Publishes the open source's waker for the worker handle and withdraws it
/// when the read loop ends, whichever way it ends.
struct WakerRegistration<'a>(&'a WakerSlot);

impl<'a> WakerRegistration<'a> {
    fn new(slot: &'a WakerSlot, waker: Option<ReadWaker>) -> Self {
        *slot.lock() = waker;
        Self(slot)
    }
}

impl Drop for WakerRegistration<'_> {
    fn drop(&mut self) {
        *self.0.lock() = None;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReadExit {
    Cancelled,
    StreamClosed,
    SourceFailed,
}

fn open_source(method: &CaptureMethod) -> Option<Box<dyn PacketSource>> {
    let opened: Result<Box<dyn PacketSource>, _> = match method {
        CaptureMethod::WinDivert => {
            WinDivertSource::open().map(|source| Box::new(source) as Box<dyn PacketSource>)
        }
        CaptureMethod::Npcap(device) => {
            NpcapSource::open(device).map(|source| Box::new(source) as Box<dyn PacketSource>)
        }
    };
    match opened {
        Ok(source) => Some(source),
        Err(error) => {
            error!(
                target: "app::capture",
                "capture_source_init_failed method={method:?} err={error} source={:?}",
                std::error::Error::source(&error)
            );
            None
        }
    }
}

fn read_packets(
    method: &CaptureMethod,
    admission: &mut FlowAdmission,
    channel: &mut CaptureChannel,
    stats: &mut CaptureStats,
    cancellation: &CancellationToken,
) -> ReadExit {
    let read_span =
        tracing::info_span!(target: "app::capture", "capture_read_loop", method = ?method);
    let _read_guard = read_span.enter();

    let Some(mut source) = open_source(method) else {
        return ReadExit::SourceFailed;
    };
    // A new handle counts drops from zero; diff against it, not the old one.
    stats.last_drops = None;
    let _registration = WakerRegistration::new(&channel.read_waker, source.read_waker());
    // `stop` may have run before the waker was published; it cancels first,
    // so checking after publishing cannot miss it.
    if cancellation.is_cancelled() {
        return ReadExit::Cancelled;
    }
    let mut batch: RawBatch = Vec::new();

    loop {
        for control in channel.control.try_iter() {
            admission.apply(control);
        }

        let result = source.pump(&mut |packet| {
            stats.packets += 1;
            if let Some(segment) = admission.admit(&packet) {
                batch.push(segment);
            }
        });
        match result {
            Ok(0) => {
                // Source timeout with no packets; yield briefly to avoid a hot spin.
                std::thread::sleep(Duration::from_millis(1));
            }
            Ok(_) => stats.reads += 1,
            Err(_) if cancellation.is_cancelled() => return ReadExit::Cancelled,
            Err(error) => {
                error!(
                    target: "app::capture",
                    "capture_error err={error} source={:?}",
                    std::error::Error::source(&error)
                );
                return ReadExit::SourceFailed;
            }
        }

        if !batch.is_empty() {
            let segments = batch.len();
            let full = std::mem::replace(&mut batch, Vec::with_capacity(segments));
            let depth = channel.backlog.fetch_add(1, Ordering::Relaxed) + 1;
            let send_started = Instant::now();
            if channel.raw.send(full).is_err() {
                return ReadExit::StreamClosed;
            }
            stats.record_forward(segments, depth, send_started.elapsed());
        }

        let now = Instant::now();
        admission.maintain(now);
        stats.check_game_silence(now, admission);
        if stats.due(now) {
            stats.log(source.drops(), admission.ignored_flows());
        }

        if cancellation.is_cancelled() {
            return ReadExit::Cancelled;
        }
    }
}

struct CaptureStats {
    since: Instant,
    packets: u64,
    reads: u64,
    forwarded_segments: u64,
    max_backlog: usize,
    send_blocked: Duration,
    last_drops: Option<SourceDrops>,
    last_forward: Instant,
    silence_checked_at: Instant,
    silence_warned: bool,
}

impl CaptureStats {
    fn new() -> Self {
        let now = Instant::now();
        Self {
            since: now,
            packets: 0,
            reads: 0,
            forwarded_segments: 0,
            max_backlog: 0,
            send_blocked: Duration::ZERO,
            last_drops: None,
            last_forward: now,
            silence_checked_at: now,
            silence_warned: false,
        }
    }

    fn record_forward(&mut self, segments: usize, backlog: usize, blocked: Duration) {
        self.forwarded_segments += segments as u64;
        self.max_backlog = self.max_backlog.max(backlog);
        self.send_blocked += blocked;
        self.last_forward = Instant::now();
        self.silence_warned = false;
    }

    /// Warns once per silence when a game process has TCP connections but
    /// none of its packets reach the capture (wrong Npcap adapter, or a proxy
    /// that moved the game's traffic somewhere the driver cannot see).
    fn check_game_silence(&mut self, now: Instant, admission: &mut FlowAdmission) {
        if self.silence_warned
            || now.saturating_duration_since(self.last_forward) < GAME_SILENCE_WARN_AFTER
            || now.saturating_duration_since(self.silence_checked_at) < GAME_SILENCE_WARN_AFTER
        {
            return;
        }
        self.silence_checked_at = now;
        if admission.game_connections_present() {
            self.silence_warned = true;
            warn!(
                target: "app::capture",
                "game_traffic_missing: the game holds TCP connections but no game packets were captured for {}s; \
                with Npcap select the adapter that carries game traffic (the TUN/VPN adapter when a proxy is on); \
                proxies that redirect the game to 127.0.0.1 cannot be captured",
                GAME_SILENCE_WARN_AFTER.as_secs()
            );
        }
    }

    fn due(&self, now: Instant) -> bool {
        now.saturating_duration_since(self.since) >= STATS_INTERVAL
    }

    fn log(&mut self, drops: Option<SourceDrops>, ignored_flows: usize) {
        if self.packets > 0 {
            let avg_batch = self.packets as f64 / self.reads.max(1) as f64;
            let dropped = match (drops, self.last_drops) {
                (Some(now), Some(before)) => format!(
                    " driver_drop={} interface_drop={}",
                    now.buffer.saturating_sub(before.buffer),
                    now.interface.saturating_sub(before.interface)
                ),
                (Some(now), None) => format!(
                    " driver_drop={} interface_drop={}",
                    now.buffer, now.interface
                ),
                (None, _) => String::new(),
            };
            info!(
                target: "app::capture",
                "capture_stats packets={} reads={} avg_batch={:.1} forwarded_segments={} max_backlog={} send_blocked_ms={} ignored_flows={}{}",
                self.packets,
                self.reads,
                avg_batch,
                self.forwarded_segments,
                self.max_backlog,
                self.send_blocked.as_millis(),
                ignored_flows,
                dropped
            );
        }
        let now = Instant::now();
        *self = Self {
            since: now,
            last_drops: drops.or(self.last_drops),
            last_forward: self.last_forward,
            silence_checked_at: self.silence_checked_at,
            silence_warned: self.silence_warned,
            ..Self::new()
        };
    }
}

fn wait_with_cancellation(cancellation: &CancellationToken, duration: Duration) {
    let deadline = Instant::now() + duration;
    while !cancellation.is_cancelled() && Instant::now() < deadline {
        std::thread::sleep(
            deadline
                .saturating_duration_since(Instant::now())
                .min(Duration::from_millis(25)),
        );
    }
}
