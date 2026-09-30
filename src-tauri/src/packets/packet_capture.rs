use crate::live::runtime::events::CaptureEnvelope;
use crate::packets::game_connections::{Distribution, GameConnectionFilter, Verdict};
use crate::packets::npcap::NpcapCapture;
use crate::packets::packet_process::{CaptureEmitter, process_packet};
use crate::packets::reassembler::Reassembler;
use crate::packets::utils::{Server, TCPReassembler, TcpInsertResult, tcp_sequence_before};
use etherparse::NetSlice::Ipv4;
use etherparse::SlicedPacket;
use etherparse::TransportSlice::Tcp;
use log::{error, info, warn};
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::Arc;
use std::sync::OnceLock;
use std::sync::atomic::AtomicUsize;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;
use windivert::WinDivert;
use windivert::prelude::{NetworkLayer, WinDivertFlags};

const MAX_BACKTRACK_BYTES: u32 = 2 * 1024 * 1024; // 2 MiB safety window before considering a reset
const SESSION_IDLE_TIMEOUT: Duration = Duration::from_secs(90);

// Common libpcap datalink constants we care about.
const DLT_NULL: i32 = 0;
const DLT_EN10MB: i32 = 1;
const DLT_RAW: i32 = 12;
const DLT_LOOP: i32 = 108;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PacketFormat {
    RawIp,
    Ethernet,
    Unsupported,
}

#[derive(Clone, Debug)]
pub enum CaptureMethod {
    WinDivert,
    Npcap(String),
}

trait PacketSource: Send {
    fn pump(&mut self, on_packet: &mut dyn FnMut(PacketFormat, &[u8])) -> Result<i32, String>;
}

struct WinDivertSource {
    handle: WinDivert<NetworkLayer>,
    buffer: Vec<u8>,
}

impl WinDivertSource {
    fn new() -> Result<Self, String> {
        let handle = WinDivert::network(
            "!loopback && ip && tcp",
            0,
            WinDivertFlags::new().set_sniff(),
        )
        .map_err(|e| format!("failed to initialize WinDivert: {e}"))?;

        info!(target: "app::capture", "WinDivert handle opened");

        Ok(Self {
            handle,
            buffer: vec![0u8; 10 * 1024 * 1024],
        })
    }
}

impl PacketSource for WinDivertSource {
    fn pump(&mut self, on_packet: &mut dyn FnMut(PacketFormat, &[u8])) -> Result<i32, String> {
        let packet = self
            .handle
            .recv(Some(&mut self.buffer))
            .map_err(|e| e.to_string())?;
        on_packet(PacketFormat::RawIp, packet.data.as_ref());
        Ok(1)
    }
}

struct NpcapSource {
    capture: NpcapCapture,
}

impl NpcapSource {
    fn new(device: &str) -> Result<Self, String> {
        if device.trim().is_empty() {
            return Err("Npcap device is empty".to_string());
        }

        let capture = NpcapCapture::new(device)?;
        info!(target: "app::capture", "Npcap handle opened device={}", device);
        Ok(Self { capture })
    }
}

impl PacketSource for NpcapSource {
    fn pump(&mut self, on_packet: &mut dyn FnMut(PacketFormat, &[u8])) -> Result<i32, String> {
        let datalink = self.capture.datalink();
        let packet_format = packet_format_for_datalink(datalink);
        self.capture.dispatch_batch(-1, &mut |raw_pkt: &[u8]| {
            let Some(pkt) = normalize_slice_for_datalink(raw_pkt, datalink) else {
                return;
            };
            on_packet(packet_format, pkt);
        })
    }
}

struct SessionState {
    tcp_reassembler: TCPReassembler,
    reassembler: Reassembler,
    last_seen: Instant,
    stream_id: u64,
    stream_epoch: u64,
    /// Last distribution announced downstream for this stream.
    distribution: Option<Distribution>,
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
        }
    }

    fn begin_new_epoch(&mut self) {
        self.stream_epoch = self.stream_epoch.saturating_add(1);
    }
}

const CAPTURE_CHANNEL_CAP: usize = 4096;

pub struct CaptureWorkerHandle {
    cancellation: CancellationToken,
    join: Option<JoinHandle<()>>,
}

impl Drop for CaptureWorkerHandle {
    fn drop(&mut self) {
        self.cancellation.cancel();
    }
}

impl CaptureWorkerHandle {
    pub fn join(mut self) -> std::thread::Result<()> {
        self.cancellation.cancel();
        self.join
            .take()
            .expect("capture join handle is present")
            .join()
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
    let (restart_sender, mut restart_receiver) = watch::channel(false);

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

    let thread_cancellation = cancellation.clone();
    let thread_outstanding = Arc::clone(&outstanding);
    let join = std::thread::Builder::new()
        .name("packet-capture".to_string())
        .spawn(move || {
            let capture_span = tracing::info_span!(
                target: "app::capture",
                "capture_thread",
                method = ?method
            );
            let _capture_guard = capture_span.enter();
            let mut emitter = CaptureEmitter::new(
                packet_sender,
                thread_cancellation.clone(),
                thread_outstanding,
            );

            while !thread_cancellation.is_cancelled() && !emitter.is_stopped() {
                read_packets(
                    &mut emitter,
                    &mut restart_receiver,
                    &thread_cancellation,
                    method.clone(),
                );

                if thread_cancellation.is_cancelled() || emitter.is_stopped() {
                    break;
                }
                if *restart_receiver.borrow() {
                    let _ = restart_sender.send(false);
                    continue;
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
            join: Some(join),
        },
        outstanding,
    }
}

fn read_packets(
    emitter: &mut CaptureEmitter,
    restart_receiver: &mut watch::Receiver<bool>,
    cancellation: &CancellationToken,
    method: CaptureMethod,
) {
    let read_span =
        tracing::info_span!(target: "app::capture", "capture_read_loop", method = ?method);
    let _read_guard = read_span.enter();

    let mut source: Box<dyn PacketSource> = match &method {
        CaptureMethod::WinDivert => match WinDivertSource::new() {
            Ok(s) => Box::new(s),
            Err(e) => {
                error!(target: "app::capture", "capture_source_init_failed method=WinDivert err={e}");
                return;
            }
        },
        CaptureMethod::Npcap(device) => match NpcapSource::new(device) {
            Ok(s) => Box::new(s),
            Err(e) => {
                error!(
                    target: "app::capture",
                    "capture_source_init_failed method=Npcap device={} err={}",
                    device,
                    e
                );
                return;
            }
        },
    };

    let mut sessions: HashMap<Server, SessionState> = HashMap::new();
    let mut game_connections = GameConnectionFilter::new();
    let mut cleanup_last_run = Instant::now();

    // Shared mutable flag: set to `true` by the dispatch callback when it
    // encounters a packet that requires a session cleanup pass.
    let mut needs_cleanup = false;

    loop {
        let dispatch_result = source.pump(&mut |packet_format, pkt| {
            let network_slices = match packet_format {
                PacketFormat::RawIp => SlicedPacket::from_ip(pkt),
                PacketFormat::Ethernet => SlicedPacket::from_ethernet(pkt),
                PacketFormat::Unsupported => return,
            };
            let Ok(network_slices) = network_slices else {
                return;
            };
            let Some(Ipv4(ip_packet)) = network_slices.net else {
                return;
            };
            let Some(Tcp(tcp_packet)) = network_slices.transport else {
                return;
            };

            let curr_server = Server::new(
                ip_packet.header().source(),
                tcp_packet.to_header().source_port,
                ip_packet.header().destination(),
                tcp_packet.to_header().destination_port,
            );
            let verdict = game_connections.classify(curr_server);
            let session_known = sessions.contains_key(&curr_server);
            if !matches!(verdict, Verdict::Game(_)) && !session_known {
                return;
            }

            let now = Instant::now();
            let stream_id = stable_stream_id(curr_server);
            let session = sessions
                .entry(curr_server)
                .or_insert_with(|| SessionState::new(now, stream_id));
            session.last_seen = now;
            if let Verdict::Game(distribution) = verdict
                && session.distribution != Some(distribution)
            {
                session.distribution = Some(distribution);
                if !emitter.emit_game_client(session.stream_id, session.stream_epoch, distribution)
                {
                    return;
                }
            }

            process_tcp_packet(
                curr_server,
                &tcp_packet,
                emitter,
                session,
                &mut game_connections,
            );

            if cleanup_last_run.elapsed() >= Duration::from_secs(30) {
                needs_cleanup = true;
            }
        });

        match dispatch_result {
            Ok(0) => {
                // Timeout with no packets; yield briefly to avoid a hot spin.
                std::thread::sleep(Duration::from_millis(1));
            }
            Ok(_) => {}
            Err(e) => {
                error!(target: "app::capture", "capture_error err={}", e);
                break;
            }
        }

        if needs_cleanup {
            needs_cleanup = false;
            let before = sessions.len();
            sessions.retain(|_, session| session.last_seen.elapsed() < SESSION_IDLE_TIMEOUT);
            let removed = before.saturating_sub(sessions.len());
            if removed > 0 {
                info!(target: "app::capture", "Removed {} idle TCP sessions", removed);
            }
            cleanup_last_run = Instant::now();
        }

        if cancellation.is_cancelled() || emitter.is_stopped() || *restart_receiver.borrow() {
            break;
        }
    }
}

fn process_tcp_packet(
    curr_server: Server,
    tcp_packet: &etherparse::TcpSlice<'_>,
    emitter: &mut CaptureEmitter,
    session: &mut SessionState,
    game_connections: &mut GameConnectionFilter,
) {
    let sequence_number = tcp_packet.sequence_number();
    let payload = tcp_packet.payload();
    let payload_len = payload.len();

    if tcp_packet.syn() {
        info!(
            target: "app::capture",
            "SYN observed for {curr_server}; resetting TCP reassembler state"
        );
        let had_previous_epoch = session.tcp_reassembler.next_sequence().is_some();
        if had_previous_epoch {
            session.begin_new_epoch();
        }
        reset_stream(
            &mut session.tcp_reassembler,
            &mut session.reassembler,
            Some(sequence_number.wrapping_add(1)),
        );
        if had_previous_epoch
            && !emitter.emit_reassembly_reset(session.stream_id, session.stream_epoch)
        {
            return;
        }
        if payload_len == 0 {
            return;
        }
    }

    let mut defer_reset = false;
    if tcp_packet.fin() || tcp_packet.rst() {
        defer_reset = true;
        game_connections.forget_flow(curr_server);
    }

    if payload_len == 0 {
        if defer_reset {
            reset_stream(&mut session.tcp_reassembler, &mut session.reassembler, None);
            session.begin_new_epoch();
            let _ = emitter.emit_reassembly_reset(session.stream_id, session.stream_epoch);
        }
        return;
    }

    if let Some(expected) = session.tcp_reassembler.next_sequence() {
        if tcp_sequence_before(sequence_number, expected) {
            let backwards = expected.wrapping_sub(sequence_number);
            if backwards > MAX_BACKTRACK_BYTES {
                warn!(
                    target: "app::capture",
                    "Sequence regression detected for {curr_server}: expected {expected}, \
                    got {sequence_number} (backwards {backwards} bytes). Resetting stream"
                );
                reset_stream(
                    &mut session.tcp_reassembler,
                    &mut session.reassembler,
                    Some(sequence_number),
                );
                session.begin_new_epoch();
                if !emitter.emit_reassembly_reset(session.stream_id, session.stream_epoch) {
                    return;
                }
            }
        }
    }

    match session
        .tcp_reassembler
        .insert_segment(sequence_number, payload)
    {
        TcpInsertResult::Contiguous(buffer) => {
            session.reassembler.feed_bytes(bytes::Bytes::from(buffer));
        }
        TcpInsertResult::SkippedGap {
            from,
            to,
            reason,
            data,
        } => {
            warn!(
                target: "app::capture",
                "TCP gap skipped for {curr_server}: from={from} to={to} reason={reason:?}; clearing frame reassembler"
            );
            if !emitter.emit_stream_gap(session.stream_id, session.stream_epoch, from, to) {
                return;
            }
            session.reassembler.take_remaining();
            if !data.is_empty() {
                session.reassembler.feed_bytes(bytes::Bytes::from(data));
            }
        }
        TcpInsertResult::Gap | TcpInsertResult::NoData => {}
    }

    while let Some(packet) = session.reassembler.try_next() {
        process_packet(&packet, emitter, session.stream_id, session.stream_epoch);
        if emitter.is_stopped() {
            return;
        }
    }

    if defer_reset {
        reset_stream(&mut session.tcp_reassembler, &mut session.reassembler, None);
        session.begin_new_epoch();
        let _ = emitter.emit_reassembly_reset(session.stream_id, session.stream_epoch);
    }
}

fn stable_stream_id(server: Server) -> u64 {
    let mut hasher = DefaultHasher::new();
    server.hash(&mut hasher);
    hasher.finish()
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

fn reset_stream(
    tcp_reassembler: &mut TCPReassembler,
    reassembler: &mut Reassembler,
    next_seq: Option<u32>,
) {
    reassembler.take_remaining();
    tcp_reassembler.reset(next_seq);
}

fn packet_format_for_datalink(datalink: i32) -> PacketFormat {
    match datalink {
        DLT_EN10MB => PacketFormat::Ethernet,
        DLT_RAW | DLT_NULL | DLT_LOOP => PacketFormat::RawIp,
        other => {
            log_unsupported_datalink(other);
            PacketFormat::Unsupported
        }
    }
}

#[inline]
fn normalize_slice_for_datalink(data: &[u8], datalink: i32) -> Option<&[u8]> {
    match datalink {
        DLT_EN10MB | DLT_RAW => Some(data),
        DLT_NULL | DLT_LOOP => {
            if data.len() <= 4 {
                return None;
            }
            let family = u32::from_ne_bytes([data[0], data[1], data[2], data[3]]);
            match family {
                2 => Some(&data[4..]),
                23 | 24 => None,
                other => {
                    log_unsupported_loopback_family(other, datalink);
                    None
                }
            }
        }
        other => {
            log_unsupported_datalink(other);
            None
        }
    }
}

fn log_unsupported_loopback_family(family: u32, datalink: i32) {
    static LOGGED_FAMILY: OnceLock<u32> = OnceLock::new();
    if LOGGED_FAMILY.set(family).is_ok() {
        warn!(
            "Unsupported DLT_NULL/LOOP family {} (datalink {}), dropping packets",
            family, datalink
        );
    }
}

fn log_unsupported_datalink(datalink: i32) {
    static LOGGED_DLT: OnceLock<i32> = OnceLock::new();
    if LOGGED_DLT.set(datalink).is_ok() {
        warn!(
            "Unsupported Npcap datalink type {}, dropping packets",
            datalink
        );
    }
}
