//! Stream thread of the capture pipeline: TCP reassembly, frame splitting
//! and emission of capture envelopes.
//!
//! Blocking on the downstream queue only backs up the bounded channel from
//! the capture thread, never the driver read loop itself.

use crate::packets::flow_admission::{FLOW_IDLE_TIMEOUT, FlowControl, RawBatch, RawSegment};
use crate::packets::game_connections::Distribution;
use crate::packets::packet_process::{CaptureEmitter, process_packet};
use crate::packets::reassembler::{Reassembler, is_plausible_frame_len};
use crate::packets::utils::{
    GapSkipReason, Server, StreamEvent, TCPReassembler, tcp_sequence_before,
};
use log::{info, warn};
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant};

const MAX_BACKTRACK_BYTES: u32 = 2 * 1024 * 1024; // 2 MiB safety window before considering a reset
const CLEANUP_INTERVAL: Duration = Duration::from_secs(30);
/// How often stalled holes are re-checked while no packets arrive.
const GAP_POLL_INTERVAL: Duration = Duration::from_millis(100);
/// Minimum spacing of repeated ignore requests for one non-game stream.
const IGNORE_RESEND_INTERVAL: Duration = Duration::from_secs(1);
const STATS_INTERVAL: Duration = Duration::from_secs(60);

struct SessionState {
    tcp_reassembler: TCPReassembler,
    reassembler: Reassembler,
    last_seen: Instant,
    stream_id: u64,
    stream_epoch: u64,
    /// Last distribution announced downstream for this stream.
    distribution: Option<Distribution>,
    /// Connection generation of the latest segment, echoed in ignore requests.
    generation: u32,
    /// The stream started with something that cannot be a game frame. Only
    /// decided at a stream start we actually saw, so a game connection joined
    /// mid-way is never ignored.
    not_game: bool,
    /// When the capture thread was last asked to stop forwarding this stream.
    ignore_sent_at: Option<Instant>,
    /// A SYN was seen; the first payload bytes are the start of the stream.
    awaiting_stream_start: bool,
}

impl SessionState {
    fn new(now: Instant, stream_id: u64) -> Self {
        Self {
            tcp_reassembler: TCPReassembler::new(),
            reassembler: Reassembler::new(),
            last_seen: now,
            stream_id,
            stream_epoch: 1,
            distribution: None,
            generation: 0,
            not_game: false,
            ignore_sent_at: None,
            awaiting_stream_start: false,
        }
    }

    fn begin_new_epoch(&mut self) {
        self.stream_epoch = self.stream_epoch.saturating_add(1);
    }

    fn reset_stream(&mut self, next_seq: Option<u32>) {
        self.reassembler.take_remaining();
        self.tcp_reassembler.reset(next_seq);
    }
}

#[derive(Default)]
struct StreamStats {
    segments: u64,
    payload_bytes: u64,
    gaps_wait: u64,
    gaps_buffered: u64,
    gaps_hard_limit: u64,
    ignored_streams: u64,
    /// Driver capture time to the stream thread picking the segment up.
    queue_latency_total: Duration,
    queue_latency_max: Duration,
}

impl StreamStats {
    fn record_gap(&mut self, reason: GapSkipReason) {
        match reason {
            GapSkipReason::WaitTime => self.gaps_wait += 1,
            GapSkipReason::BufferedBytes => self.gaps_buffered += 1,
            GapSkipReason::HardLimit => self.gaps_hard_limit += 1,
        }
    }

    fn record_segment(&mut self, payload_len: usize, queue_latency: Duration) {
        self.segments += 1;
        self.payload_bytes += payload_len as u64;
        self.queue_latency_total += queue_latency;
        self.queue_latency_max = self.queue_latency_max.max(queue_latency);
    }
}

pub struct StreamProcessor {
    emitter: CaptureEmitter,
    control: Sender<FlowControl>,
    sessions: HashMap<Server, SessionState>,
    /// Reused buffer for reassembler output.
    events: Vec<StreamEvent>,
    last_cleanup: Instant,
    stats: StreamStats,
    stats_since: Instant,
    /// Origin of [`Self::hole_clock`].
    started_at: Instant,
}

impl StreamProcessor {
    pub fn new(emitter: CaptureEmitter, control: Sender<FlowControl>) -> Self {
        let now = Instant::now();
        Self {
            emitter,
            control,
            sessions: HashMap::new(),
            events: Vec::new(),
            last_cleanup: now,
            stats: StreamStats::default(),
            stats_since: now,
            started_at: now,
        }
    }

    /// Clock for TCP hole timeouts. It stands still while the emitter waits on
    /// downstream (a command fence or a full decode queue): this thread reads
    /// no input meanwhile, so a retransmission may already be queued behind
    /// it. Driver capture times are never used here either, since a backlog
    /// or a skewed driver clock would make fresh holes look expired.
    fn hole_clock(&self) -> Instant {
        let active = self
            .started_at
            .elapsed()
            .saturating_sub(self.emitter.blocked_time());
        self.started_at + active
    }

    /// Processes batches until the capture thread hangs up or the emitter
    /// is stopped. `backlog` counts batches sent but not yet received.
    pub fn run(mut self, input: Receiver<RawBatch>, backlog: Arc<AtomicUsize>) {
        while !self.emitter.is_stopped() {
            match input.recv_timeout(GAP_POLL_INTERVAL) {
                Ok(batch) => {
                    backlog.fetch_sub(1, Ordering::Relaxed);
                    for segment in batch {
                        self.process_segment(segment);
                        if self.emitter.is_stopped() {
                            return;
                        }
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            let now = Instant::now();
            self.poll_stalled_gaps(now);
            self.maintain(now);
        }
        info!(target: "app::capture", "stream thread exiting");
    }

    fn process_segment(&mut self, segment: RawSegment) {
        let now = Instant::now();
        let hole_now = self.hole_clock();
        let server = segment.server;
        self.stats.record_segment(
            segment.payload.len(),
            now.saturating_duration_since(segment.captured_at),
        );
        let session = self
            .sessions
            .entry(server)
            .or_insert_with(|| SessionState::new(now, stable_stream_id(server)));
        session.last_seen = now;
        session.generation = segment.generation;

        if let Some(distribution) = segment.distribution
            && session.distribution != Some(distribution)
        {
            session.distribution = Some(distribution);
            if !self
                .emitter
                .emit_game_client(session.stream_id, session.stream_epoch, distribution)
            {
                return;
            }
        }

        let sequence_number = segment.sequence;
        if segment.flags.syn {
            info!(
                target: "app::capture",
                "SYN observed for {server}; resetting TCP reassembler state"
            );
            let had_previous_epoch = session.tcp_reassembler.next_sequence().is_some();
            if had_previous_epoch {
                session.begin_new_epoch();
            }
            session.reset_stream(Some(sequence_number.wrapping_add(1)));
            session.not_game = false;
            session.ignore_sent_at = None;
            session.awaiting_stream_start = true;
            if had_previous_epoch
                && !self
                    .emitter
                    .emit_reassembly_reset(session.stream_id, session.stream_epoch)
            {
                return;
            }
            if segment.payload.is_empty() {
                return;
            }
        }

        if session.not_game {
            // The capture thread still forwards this stream (its entry was
            // evicted and re-admitted, or the request raced); ask again.
            // `last_seen` stays fresh so the verdict outlives the traffic.
            request_ignore(session, server, &self.control, now);
            return;
        }

        let defer_reset = segment.flags.fin || segment.flags.rst;
        if segment.payload.is_empty() {
            if defer_reset {
                session.reset_stream(None);
                session.begin_new_epoch();
                let _ = self
                    .emitter
                    .emit_reassembly_reset(session.stream_id, session.stream_epoch);
            }
            return;
        }

        if let Some(expected) = session.tcp_reassembler.next_sequence()
            && tcp_sequence_before(sequence_number, expected)
        {
            let backwards = expected.wrapping_sub(sequence_number);
            if backwards > MAX_BACKTRACK_BYTES {
                warn!(
                    target: "app::capture",
                    "Sequence regression detected for {server}: expected {expected}, \
                    got {sequence_number} (backwards {backwards} bytes). Resetting stream"
                );
                session.reset_stream(Some(sequence_number));
                session.begin_new_epoch();
                if !self
                    .emitter
                    .emit_reassembly_reset(session.stream_id, session.stream_epoch)
                {
                    return;
                }
            }
        }

        let events = &mut self.events;
        session.tcp_reassembler.insert_segment(
            sequence_number,
            segment.payload,
            hole_now,
            &mut |event| events.push(event),
        );
        if !self.handle_stream_events(server, now) {
            return;
        }

        if defer_reset && let Some(session) = self.sessions.get_mut(&server) {
            session.reset_stream(None);
            session.begin_new_epoch();
            let _ = self
                .emitter
                .emit_reassembly_reset(session.stream_id, session.stream_epoch);
        }
    }

    /// Applies the reassembler output buffered in `self.events` to the
    /// session of `server`. Returns false once the emitter has stopped.
    fn handle_stream_events(&mut self, server: Server, now: Instant) -> bool {
        let mut events = std::mem::take(&mut self.events);
        let keep_going = self.apply_events(server, &mut events, now);
        events.clear();
        self.events = events;
        keep_going
    }

    fn apply_events(
        &mut self,
        server: Server,
        events: &mut Vec<StreamEvent>,
        now: Instant,
    ) -> bool {
        let Some(session) = self.sessions.get_mut(&server) else {
            return true;
        };
        for event in events.drain(..) {
            match event {
                StreamEvent::Gap { from, to, reason } => {
                    warn!(
                        target: "app::capture",
                        "TCP gap skipped for {server}: from={from} to={to} reason={reason:?}; clearing frame reassembler"
                    );
                    self.stats.record_gap(reason);
                    // The stream start, if pending, was lost with the hole.
                    session.awaiting_stream_start = false;
                    session.reassembler.take_remaining();
                    if !self.emitter.emit_stream_gap(
                        session.stream_id,
                        session.stream_epoch,
                        from,
                        to,
                    ) {
                        return false;
                    }
                }
                StreamEvent::Data(bytes) => {
                    session.reassembler.feed_bytes(bytes);
                    if session.awaiting_stream_start
                        && let Some(frame_len) = session.reassembler.peek_frame_len()
                    {
                        session.awaiting_stream_start = false;
                        if !is_plausible_frame_len(frame_len) {
                            mark_not_game(session, server, &self.control, now);
                            self.stats.ignored_streams += 1;
                            break;
                        }
                    }
                    while let Some(frame) = session.reassembler.try_next() {
                        process_packet(
                            &frame,
                            &mut self.emitter,
                            session.stream_id,
                            session.stream_epoch,
                        );
                        if self.emitter.is_stopped() {
                            return false;
                        }
                    }
                }
            }
        }
        true
    }

    /// Skips holes whose wait expired even though no new segment arrived.
    fn poll_stalled_gaps(&mut self, now: Instant) {
        let hole_now = self.hole_clock();
        let stalled: Vec<Server> = self
            .sessions
            .iter()
            .filter(|(_, session)| session.tcp_reassembler.has_gap())
            .map(|(server, _)| *server)
            .collect();
        for server in stalled {
            let Some(session) = self.sessions.get_mut(&server) else {
                continue;
            };
            let events = &mut self.events;
            if session
                .tcp_reassembler
                .skip_expired_gap(hole_now, &mut |event| events.push(event))
                && !self.handle_stream_events(server, now)
            {
                return;
            }
        }
    }

    fn maintain(&mut self, now: Instant) {
        if now.saturating_duration_since(self.last_cleanup) >= CLEANUP_INTERVAL {
            self.last_cleanup = now;
            let before = self.sessions.len();
            self.sessions.retain(|_, session| {
                now.saturating_duration_since(session.last_seen) < FLOW_IDLE_TIMEOUT
            });
            let removed = before.saturating_sub(self.sessions.len());
            if removed > 0 {
                info!(target: "app::capture", "Removed {} idle TCP sessions", removed);
            }
        }

        if now.saturating_duration_since(self.stats_since) >= STATS_INTERVAL {
            self.log_stats();
            self.stats = StreamStats::default();
            self.stats_since = now;
        }
    }

    fn log_stats(&self) {
        let stats = &self.stats;
        if stats.segments == 0 {
            return;
        }
        let queue_latency_avg_ms =
            stats.queue_latency_total.as_secs_f64() * 1000.0 / stats.segments as f64;
        info!(
            target: "app::capture",
            "stream_stats segments={} payload_bytes={} sessions={} gaps_wait={} gaps_buffered={} gaps_hard_limit={} ignored_streams={} queue_latency_avg_ms={:.1} queue_latency_max_ms={}",
            stats.segments,
            stats.payload_bytes,
            self.sessions.len(),
            stats.gaps_wait,
            stats.gaps_buffered,
            stats.gaps_hard_limit,
            stats.ignored_streams,
            queue_latency_avg_ms,
            stats.queue_latency_max.as_millis()
        );
    }
}

/// Stops processing a stream that is not the game protocol and asks the
/// capture thread to stop forwarding it.
fn mark_not_game(
    session: &mut SessionState,
    server: Server,
    control: &Sender<FlowControl>,
    now: Instant,
) {
    info!(target: "app::capture", "ignoring non-game stream {server}");
    session.not_game = true;
    session.awaiting_stream_start = false;
    session.reset_stream(None);
    request_ignore(session, server, control, now);
}

/// Sends an ignore request for the session's current connection generation,
/// at most once per [`IGNORE_RESEND_INTERVAL`].
fn request_ignore(
    session: &mut SessionState,
    server: Server,
    control: &Sender<FlowControl>,
    now: Instant,
) {
    if session
        .ignore_sent_at
        .is_some_and(|sent| now.saturating_duration_since(sent) < IGNORE_RESEND_INTERVAL)
    {
        return;
    }
    session.ignore_sent_at = Some(now);
    // The capture thread may already be gone during shutdown.
    let _ = control.send(FlowControl::Ignore {
        server,
        generation: session.generation,
    });
}

fn stable_stream_id(server: Server) -> u64 {
    let mut hasher = DefaultHasher::new();
    server.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::runtime::events::CaptureEnvelope;
    use crate::packets::flow_admission::SegmentFlags;
    use crate::packets::packet_process::{CAPTURE_PIPELINE_FENCE, SYNTHETIC_GAME_CLIENT_OPCODE};
    use bytes::Bytes;
    use std::sync::mpsc;
    use tokio_util::sync::CancellationToken;

    const NOTIFY_FRAGMENT: u16 = 2;

    struct Harness {
        processor: StreamProcessor,
        envelopes: tokio::sync::mpsc::Receiver<CaptureEnvelope>,
        control: mpsc::Receiver<FlowControl>,
        outstanding: Arc<AtomicUsize>,
    }

    fn harness() -> Harness {
        let (sender, envelopes) = tokio::sync::mpsc::channel(1024);
        let outstanding = Arc::new(AtomicUsize::new(0));
        let emitter =
            CaptureEmitter::new(sender, CancellationToken::new(), Arc::clone(&outstanding));
        let (control_tx, control) = mpsc::channel();
        Harness {
            processor: StreamProcessor::new(emitter, control_tx),
            envelopes,
            control,
            outstanding,
        }
    }

    fn server() -> Server {
        Server::new([20, 0, 0, 1], 5_003, [10, 0, 0, 1], 40_000)
    }

    fn ignore(generation: u32) -> FlowControl {
        FlowControl::Ignore {
            server: server(),
            generation,
        }
    }

    fn segment(sequence: u32, syn: bool, payload: &[u8]) -> RawSegment {
        RawSegment {
            server: server(),
            sequence,
            flags: SegmentFlags {
                syn,
                ..SegmentFlags::default()
            },
            payload: Bytes::copy_from_slice(payload),
            distribution: None,
            generation: 0,
            captured_at: Instant::now(),
        }
    }

    /// One outer frame holding a single notify message.
    fn notify_frame(method_id: u32) -> Vec<u8> {
        let mut body = Vec::new();
        body.extend_from_slice(&7u64.to_be_bytes()); // service id
        body.extend_from_slice(&0u32.to_be_bytes()); // stub id
        body.extend_from_slice(&method_id.to_be_bytes());
        body.extend_from_slice(b"payload");
        let mut frame = Vec::new();
        frame.extend_from_slice(&((6 + body.len()) as u32).to_be_bytes());
        frame.extend_from_slice(&NOTIFY_FRAGMENT.to_be_bytes());
        frame.extend_from_slice(&body);
        frame
    }

    fn drain(h: &mut Harness) -> Vec<CaptureEnvelope> {
        let mut out = Vec::new();
        while let Ok(envelope) = h.envelopes.try_recv() {
            out.push(envelope);
        }
        out
    }

    #[test]
    fn game_stream_start_is_parsed() {
        let mut h = harness();
        h.processor.process_segment(segment(99, true, b""));
        h.processor
            .process_segment(segment(100, false, &notify_frame(42)));

        let envelopes = drain(&mut h);
        assert_eq!(envelopes.len(), 1);
        assert_eq!(envelopes[0].key.method_id, Some(42));
        assert!(h.control.try_recv().is_err());
    }

    #[test]
    fn tls_stream_start_is_ignored() {
        let mut h = harness();
        h.processor.process_segment(segment(99, true, b""));
        let client_hello = [0x16, 0x03, 0x01, 0x02, 0x00, 0x01, 0x00, 0x01, 0xfc];
        h.processor
            .process_segment(segment(100, false, &client_hello));

        assert_eq!(h.control.try_recv(), Ok(ignore(0)));
        // Later data of the ignored stream emits nothing, even valid frames.
        h.processor.process_segment(segment(
            100 + client_hello.len() as u32,
            false,
            &notify_frame(1),
        ));
        assert!(drain(&mut h).is_empty());
    }

    #[test]
    fn http_stream_start_is_ignored() {
        let mut h = harness();
        h.processor.process_segment(segment(99, true, b""));
        h.processor
            .process_segment(segment(100, false, b"GET /patch/manifest HTTP/1.1\r\n"));
        assert_eq!(h.control.try_recv(), Ok(ignore(0)));
    }

    /// A game connection joined mid-way may start misaligned; it is never
    /// ignored, whatever it takes to line up with a frame boundary.
    #[test]
    fn midstream_stream_is_never_ignored() {
        let mut h = harness();
        let chunk = vec![0xffu8; 64 * 1024];
        let mut sequence = 1_000u32;
        for _ in 0..16 {
            h.processor
                .process_segment(segment(sequence, false, &chunk));
            sequence += chunk.len() as u32;
        }
        h.processor
            .process_segment(segment(sequence, false, &notify_frame(9)));

        assert!(h.control.try_recv().is_err());
        assert_eq!(drain(&mut h).len(), 1);
    }

    #[test]
    fn midstream_game_stream_is_kept() {
        let mut h = harness();
        let frame = notify_frame(5);
        let mut sequence = 1_000u32;
        for _ in 0..64 {
            h.processor
                .process_segment(segment(sequence, false, &frame));
            sequence += frame.len() as u32;
        }
        assert!(h.control.try_recv().is_err());
        assert_eq!(drain(&mut h).len(), 64);
    }

    /// Segments still reaching an ignored stream (its capture-side entry was
    /// evicted and re-admitted) renew the request with their generation.
    #[test]
    fn ignored_stream_renews_request_for_current_generation() {
        let mut h = harness();
        h.processor.process_segment(segment(99, true, b""));
        h.processor
            .process_segment(segment(100, false, b"HTTP/1.1"));
        assert_eq!(h.control.try_recv(), Ok(ignore(0)));

        let session = h.processor.sessions.get_mut(&server()).expect("session");
        session.ignore_sent_at = session
            .ignore_sent_at
            .map(|sent| sent - IGNORE_RESEND_INTERVAL);
        let mut resumed = segment(108, false, b"more");
        resumed.generation = 7;
        h.processor.process_segment(resumed);
        assert_eq!(h.control.try_recv(), Ok(ignore(7)));

        // Within the resend interval nothing more is sent.
        h.processor.process_segment(segment(112, false, b"more"));
        assert!(h.control.try_recv().is_err());
    }

    /// A hole created while the thread is behind the driver is timed from
    /// when this thread saw the data, not from the (older) capture time.
    #[test]
    fn backlog_does_not_expire_fresh_holes() {
        let mut h = harness();
        h.processor.process_segment(segment(99, true, b""));
        let frame = notify_frame(3);
        let len = frame.len() as u32;
        let stale = Instant::now() - Duration::from_secs(5);

        let mut late = segment(100 + len, false, &frame);
        late.captured_at = stale;
        h.processor.process_segment(late);
        h.processor.poll_stalled_gaps(Instant::now());

        let mut retransmit = segment(100, false, &frame);
        retransmit.captured_at = stale;
        h.processor.process_segment(retransmit);

        assert_eq!(h.processor.stats.gaps_wait, 0);
        assert_eq!(drain(&mut h).len(), 2);
    }

    /// While another stream's emit waits on a command fence for longer than
    /// the hole wait, this thread reads no input; the retransmission queued
    /// behind must still fill the hole afterwards.
    #[test]
    fn downstream_stall_does_not_expire_open_holes() {
        let mut h = harness();
        h.processor.process_segment(segment(99, true, b""));
        let frame = notify_frame(3);
        let len = frame.len() as u32;
        h.processor
            .process_segment(segment(100 + len, false, &frame));

        h.outstanding
            .fetch_or(CAPTURE_PIPELINE_FENCE, Ordering::AcqRel);
        let gate = Arc::clone(&h.outstanding);
        let release = std::thread::spawn(move || {
            // Longer than the 1s hole wait.
            std::thread::sleep(Duration::from_millis(1_200));
            gate.fetch_and(!CAPTURE_PIPELINE_FENCE, Ordering::AcqRel);
        });
        let mut other = segment(5_000, false, &notify_frame(4));
        other.server = Server::new([20, 0, 0, 2], 5_003, [10, 0, 0, 1], 40_001);
        h.processor.process_segment(other);
        release.join().expect("release thread");
        h.processor.poll_stalled_gaps(Instant::now());

        h.processor.process_segment(segment(100, false, &frame));

        assert_eq!(h.processor.stats.gaps_wait, 0);
        assert_eq!(drain(&mut h).len(), 3);
    }

    #[test]
    fn distribution_change_emits_game_client() {
        let mut h = harness();
        let mut first = segment(1_000, false, &notify_frame(5));
        first.distribution = Some(Distribution::Star);
        h.processor.process_segment(first);

        let envelopes = drain(&mut h);
        assert_eq!(envelopes[0].key.opcode, SYNTHETIC_GAME_CLIENT_OPCODE);
        assert_eq!(envelopes.len(), 2);
    }
}
