use crate::packets::game_connections::{GameConnectionFilter, Verdict};
use crate::packets::npcap::NpcapCapture;
use crate::packets::opcodes::CaptureEvent;
use crate::packets::packet_process::process_packet;
use crate::packets::reassembler::Reassembler;
use crate::packets::utils::{Server, TCPReassembler, TcpInsertResult, tcp_sequence_before};
use etherparse::NetSlice::Ipv4;
use etherparse::SlicedPacket;
use etherparse::TransportSlice::Tcp;
use log::{error, info, warn};
use once_cell::sync::OnceCell;
use std::collections::HashMap;
use std::sync::atomic::AtomicUsize;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::watch;

// Global sender for restart signal.
static RESTART_SENDER: OnceCell<watch::Sender<bool>> = OnceCell::new();

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

trait PacketSource: Send {
    fn next_packet(&mut self) -> Result<Option<Vec<u8>>, String>;
    fn packet_format(&self) -> PacketFormat;
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

    fn packet_format_for_datalink(&self) -> PacketFormat {
        match self.capture.datalink() {
            DLT_EN10MB => PacketFormat::Ethernet,
            DLT_RAW | DLT_NULL | DLT_LOOP => PacketFormat::RawIp,
            other => {
                log_unsupported_datalink(other);
                PacketFormat::Unsupported
            }
        }
    }

    fn normalize_packet(&self, data: Vec<u8>) -> Option<Vec<u8>> {
        match self.capture.datalink() {
            DLT_EN10MB | DLT_RAW => Some(data),
            DLT_NULL | DLT_LOOP => {
                if data.len() <= 4 {
                    return None;
                }
                let family = u32::from_ne_bytes([data[0], data[1], data[2], data[3]]);
                match family {
                    2 => Some(data[4..].to_vec()), // AF_INET on Windows
                    23 | 24 => None,               // IPv6 families, ignored for now
                    other => {
                        log_unsupported_loopback_family(other, self.capture.datalink());
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
}

impl PacketSource for NpcapSource {
    fn next_packet(&mut self) -> Result<Option<Vec<u8>>, String> {
        match self.capture.next_packet()? {
            Some(data) => Ok(self.normalize_packet(data)),
            None => Ok(None),
        }
    }

    fn packet_format(&self) -> PacketFormat {
        self.packet_format_for_datalink()
    }
}

struct SessionState {
    tcp_reassembler: TCPReassembler,
    reassembler: Reassembler,
    last_seen: Instant,
}

impl SessionState {
    fn new(now: Instant) -> Self {
        Self {
            tcp_reassembler: TCPReassembler::new(),
            reassembler: Reassembler::new(),
            last_seen: now,
        }
    }
}

pub fn start_capture(
    npcap_device: String,
) -> (
    tokio::sync::mpsc::UnboundedReceiver<CaptureEvent>,
    Arc<AtomicUsize>,
) {
    let (packet_sender, packet_receiver) = tokio::sync::mpsc::unbounded_channel::<CaptureEvent>();
    let queue_depth = Arc::new(AtomicUsize::new(0));
    let capture_queue_depth = Arc::clone(&queue_depth);
    let (restart_sender, mut restart_receiver) = watch::channel(false);
    RESTART_SENDER.set(restart_sender.clone()).ok();

    if npcap_device.trim().is_empty() {
        error!(target: "app::capture", "capture_start_failed method=Npcap err=empty_device");
        return (packet_receiver, queue_depth);
    }

    info!(target: "app::capture", "capture_start method=Npcap device={}", npcap_device);

    std::thread::spawn(move || {
        let capture_span = tracing::info_span!(
            target: "app::capture",
            "capture_thread",
            method = "Npcap",
            device = %npcap_device
        );
        let _capture_guard = capture_span.enter();
        loop {
            read_packets(
                &packet_sender,
                &capture_queue_depth,
                &mut restart_receiver,
                &npcap_device,
            );

            // Check if this was a requested restart or a crash/exit.
            if !*restart_receiver.borrow() {
                warn!("Packet capture exited unexpectedly. Restarting in 1s...");
                std::thread::sleep(Duration::from_secs(1));
                continue;
            }

            // Wait for restart signal if it was requested.
            while !*restart_receiver.borrow() {
                std::thread::sleep(Duration::from_millis(100));
            }
            // Reset signal to false before next loop.
            let _ = restart_sender.send(false);
        }
    });
    (packet_receiver, queue_depth)
}

fn read_packets(
    packet_sender: &tokio::sync::mpsc::UnboundedSender<CaptureEvent>,
    queue_depth: &AtomicUsize,
    restart_receiver: &mut watch::Receiver<bool>,
    npcap_device: &str,
) {
    let read_span =
        tracing::info_span!(target: "app::capture", "capture_read_loop", method = "Npcap");
    let _read_guard = read_span.enter();

    let mut source: Box<dyn PacketSource> = match NpcapSource::new(npcap_device) {
        Ok(s) => Box::new(s),
        Err(e) => {
            error!(
                target: "app::capture",
                "capture_source_init_failed method=Npcap device={} err={}",
                npcap_device,
                e
            );
            return;
        }
    };

    let mut sessions: HashMap<Server, SessionState> = HashMap::new();
    let mut game_connections = GameConnectionFilter::new();
    let mut cleanup_last_run = Instant::now();

    loop {
        let packet_data = match source.next_packet() {
            Ok(Some(data)) => data,
            Ok(None) => continue, // Timeout or ignored packet
            Err(e) => {
                error!(target: "app::capture", "capture_error err={}", e);
                break;
            }
        };

        let packet_format = source.packet_format();
        let network_slices = match packet_format {
            PacketFormat::RawIp => SlicedPacket::from_ip(&packet_data),
            PacketFormat::Ethernet => SlicedPacket::from_ethernet(&packet_data),
            PacketFormat::Unsupported => continue,
        };
        let Ok(network_slices) = network_slices else {
            continue;
        };
        let Some(Ipv4(ip_packet)) = network_slices.net else {
            continue;
        };
        let Some(Tcp(tcp_packet)) = network_slices.transport else {
            continue;
        };

        let curr_server = Server::new(
            ip_packet.header().source(),
            tcp_packet.to_header().source_port,
            ip_packet.header().destination(),
            tcp_packet.to_header().destination_port,
        );
        let verdict = game_connections.classify(curr_server);
        let session_known = sessions.contains_key(&curr_server);
        let allow_processing = matches!(verdict, Verdict::Game) || session_known;
        if !allow_processing {
            continue;
        }

        let now = Instant::now();
        let session = sessions
            .entry(curr_server)
            .or_insert_with(|| SessionState::new(now));
        session.last_seen = now;

        process_tcp_packet(
            curr_server,
            &tcp_packet,
            packet_sender,
            queue_depth,
            session,
            &mut game_connections,
        );

        if cleanup_last_run.elapsed() >= Duration::from_secs(30) {
            let before = sessions.len();
            sessions.retain(|_, session| session.last_seen.elapsed() < SESSION_IDLE_TIMEOUT);
            let removed = before.saturating_sub(sessions.len());
            if removed > 0 {
                info!(target: "app::capture", "Removed {} idle TCP sessions", removed);
            }
            cleanup_last_run = Instant::now();
        }

        if *restart_receiver.borrow() {
            break;
        }
    }
}

fn process_tcp_packet(
    curr_server: Server,
    tcp_packet: &etherparse::TcpSlice<'_>,
    packet_sender: &tokio::sync::mpsc::UnboundedSender<CaptureEvent>,
    queue_depth: &AtomicUsize,
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
        reset_stream(
            &mut session.tcp_reassembler,
            &mut session.reassembler,
            Some(sequence_number.wrapping_add(1)),
        );
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
            }
        }
    }

    match session
        .tcp_reassembler
        .insert_segment(sequence_number, payload)
    {
        TcpInsertResult::Contiguous(buffer) => {
            session.reassembler.feed_owned(buffer);
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
            session.reassembler.take_remaining();
            if !data.is_empty() {
                session.reassembler.feed_owned(data);
            }
        }
        TcpInsertResult::Gap | TcpInsertResult::NoData => {}
    }

    while let Some(packet) = session.reassembler.try_next() {
        process_packet(&packet, packet_sender, queue_depth);
    }

    if defer_reset {
        reset_stream(&mut session.tcp_reassembler, &mut session.reassembler, None);
    }
}

// Function to send restart signal from another thread/task.
#[allow(dead_code)]
pub fn request_restart() {
    if let Some(sender) = RESTART_SENDER.get() {
        let _ = sender.send(true);
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
