use crate::packets;
use crate::packets::npcap::NpcapCapture;
use crate::packets::opcodes::Pkt;
use crate::packets::packet_process::process_packet;
use crate::packets::reassembler::Reassembler;
use crate::packets::utils::{Server, TCPReassembler, TcpInsertResult, tcp_sequence_before};
use bytes::Bytes;
use etherparse::NetSlice::Ipv4;
use etherparse::SlicedPacket;
use etherparse::TransportSlice::Tcp;
use log::{debug, error, info, warn};
use once_cell::sync::OnceCell;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use tokio::sync::watch;
use windivert::WinDivert;
use windivert::prelude::NetworkLayer;
use windivert::prelude::WinDivertFlags;

// Global sender for restart signal
static RESTART_SENDER: OnceCell<watch::Sender<bool>> = OnceCell::new();

const MAX_BACKTRACK_BYTES: u32 = 2 * 1024 * 1024; // 2 MiB safety window before considering a reset

// Common libpcap datalink constants we care about.
const DLT_NULL: i32 = 0;
const DLT_EN10MB: i32 = 1;
const DLT_RAW: i32 = 12;
const DLT_LOOP: i32 = 108;

#[derive(Clone, Debug)]
pub enum CaptureMethod {
    WinDivert,
    Npcap(String),
}

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
        .map_err(|e| format!("Failed to initialize WinDivert: {}", e))?;

        info!(target: "app::capture", "WinDivert handle opened");

        Ok(Self {
            handle,
            buffer: vec![0u8; 10 * 1024 * 1024],
        })
    }
}

impl PacketSource for WinDivertSource {
    fn next_packet(&mut self) -> Result<Option<Vec<u8>>, String> {
        self.handle
            .recv(Some(&mut self.buffer))
            .map(|packet| Some(packet.data.to_vec()))
            .map_err(|e| e.to_string())
    }

    fn packet_format(&self) -> PacketFormat {
        PacketFormat::RawIp
    }
}

struct NpcapSource {
    capture: NpcapCapture,
}

impl NpcapSource {
    fn new(device: &str) -> Result<Self, String> {
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

pub fn start_capture(
    method: CaptureMethod,
) -> (
    tokio::sync::mpsc::UnboundedReceiver<(packets::opcodes::Pkt, Bytes)>,
    Arc<AtomicUsize>,
) {
    let (packet_sender, packet_receiver) =
        tokio::sync::mpsc::unbounded_channel::<(packets::opcodes::Pkt, Bytes)>();
    let queue_depth = Arc::new(AtomicUsize::new(0));
    let capture_queue_depth = Arc::clone(&queue_depth);
    let (restart_sender, mut restart_receiver) = watch::channel(false);
    RESTART_SENDER.set(restart_sender.clone()).ok();

    match &method {
        CaptureMethod::WinDivert => {
            info!(target: "app::capture", "capture_start method=WinDivert")
        }
        CaptureMethod::Npcap(dev) => {
            info!(target: "app::capture", "capture_start method=Npcap device={}", dev)
        }
    }

    // Use std::thread::spawn to avoid blocking the async runtime with WinDivert recv
    std::thread::spawn(move || {
        let capture_span =
            tracing::info_span!(target: "app::capture", "capture_thread", method = ?method);
        let _capture_guard = capture_span.enter();
        loop {
            read_packets(
                &packet_sender,
                &capture_queue_depth,
                &mut restart_receiver,
                method.clone(),
            );

            // Check if this was a requested restart or a crash/exit
            if !*restart_receiver.borrow() {
                warn!("Packet capture exited unexpectedly. Restarting in 1s...");
                std::thread::sleep(std::time::Duration::from_secs(1));
                continue;
            }

            // Wait for restart signal if it was requested
            while !*restart_receiver.borrow() {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            // Reset signal to false before next loop
            let _ = restart_sender.send(false);
        }
        // info!("oopsies {}", line!());
    });
    (packet_receiver, queue_depth)
}

#[allow(clippy::too_many_lines)]
fn read_packets(
    packet_sender: &tokio::sync::mpsc::UnboundedSender<(packets::opcodes::Pkt, Bytes)>,
    queue_depth: &AtomicUsize,
    restart_receiver: &mut watch::Receiver<bool>,
    method: CaptureMethod,
) {
    let read_span =
        tracing::info_span!(target: "app::capture", "capture_read_loop", method = ?method);
    let _read_guard = read_span.enter();

    let mut source: Box<dyn PacketSource> = match method {
        CaptureMethod::WinDivert => match WinDivertSource::new() {
            Ok(s) => Box::new(s),
            Err(e) => {
                error!(target: "app::capture", "capture_source_init_failed method=WinDivert err={}", e);
                return;
            }
        },
        CaptureMethod::Npcap(device) => match NpcapSource::new(&device) {
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

    let mut known_server: Option<Server> = None; // nothing at start
    let mut tcp_reassembler: TCPReassembler = TCPReassembler::new();
    let mut reassembler = Reassembler::new();

    loop {
        let packet_data = match source.next_packet() {
            Ok(Some(data)) => data,
            Ok(None) => continue, // Timeout or ignored packet
            Err(e) => {
                error!(target: "app::capture", "capture_error err={}", e);
                break; // Exit loop on error? Or retry?
            }
        };

        // info!("{}", line!());
        let packet_format = source.packet_format();
        let network_slices = match packet_format {
            PacketFormat::RawIp => SlicedPacket::from_ip(&packet_data),
            PacketFormat::Ethernet => SlicedPacket::from_ethernet(&packet_data),
            PacketFormat::Unsupported => continue,
        };
        let Ok(network_slices) = network_slices else {
            continue; // if it's not ip, go next packet
        };
        // info!("{}", line!());
        let Some(Ipv4(ip_packet)) = network_slices.net else {
            continue;
        };
        // info!("{}", line!());
        let Some(Tcp(tcp_packet)) = network_slices.transport else {
            continue;
        };
        // info!("{}", line!());
        let curr_server = Server::new(
            ip_packet.header().source(),
            tcp_packet.to_header().source_port,
            ip_packet.header().destination(),
            tcp_packet.to_header().destination_port,
        );
        // trace!(
        //     "{} ({}) => {:?}",
        //     curr_server,
        //     tcp_packet.payload().len(),
        //     tcp_packet.payload(),
        // );

        // 1. Try to identify game server via small packets
        if known_server != Some(curr_server) {
            let tcp_payload = tcp_packet.payload();
            if tcp_payload.len() >= 10 && tcp_payload[4] == 0 {
                const FRAG_LENGTH_SIZE: usize = 4;
                const SIGNATURE: [u8; 6] = [0x00, 0x63, 0x33, 0x53, 0x42, 0x00];
                const MAX_FRAG_ITERATIONS: usize = 2000; // Circuit breaker

                let mut i = 0usize;
                let mut offset = 10usize;
                while tcp_payload.len().saturating_sub(offset) >= FRAG_LENGTH_SIZE {
                    i += 1;
                    if i >= MAX_FRAG_ITERATIONS {
                        error!(
                            "TCP fragment processing stuck after {i} iterations - forcing recovery. \
                            remaining={}, line={}",
                            tcp_payload.len().saturating_sub(offset),
                            line!()
                        );
                        break;
                    }
                    if i % 1000 == 0 {
                        warn!(
                            "High iteration count in fragment processing: iteration={i}, remaining={}, line={}",
                            tcp_payload.len().saturating_sub(offset),
                            line!()
                        );
                    }

                    let len_bytes = &tcp_payload[offset..offset + FRAG_LENGTH_SIZE];
                    let tcp_frag_payload_len = u32::from_be_bytes([
                        len_bytes[0],
                        len_bytes[1],
                        len_bytes[2],
                        len_bytes[3],
                    ])
                    .saturating_sub(FRAG_LENGTH_SIZE as u32)
                        as usize;
                    offset += FRAG_LENGTH_SIZE;

                    if tcp_payload.len().saturating_sub(offset) < tcp_frag_payload_len {
                        break;
                    }

                    let tcp_frag = &tcp_payload[offset..offset + tcp_frag_payload_len];
                    offset += tcp_frag_payload_len;

                    if tcp_frag.len() >= 5 + SIGNATURE.len()
                        && tcp_frag[5..5 + SIGNATURE.len()] == SIGNATURE
                    {
                        info!(
                            target: "app::capture",
                            "Got Scene Server Address (by change): {curr_server}"
                        );
                        known_server = Some(curr_server);
                        let payload_len = u32::try_from(tcp_payload.len()).unwrap_or(u32::MAX);
                        let seq_end = tcp_packet.sequence_number().wrapping_add(payload_len);
                        reset_stream(&mut tcp_reassembler, &mut reassembler, Some(seq_end));
                        if let Err(err) = packet_sender.send((Pkt::ServerChangeInfo, Bytes::new()))
                        {
                            debug!("Failed to send packet: {err}");
                        } else {
                            queue_depth.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
            }
            // 2. Payload length is 98 = Login packets?
            if tcp_payload.len() == 98 {
                const SIGNATURE_1: [u8; 10] =
                    [0x00, 0x00, 0x00, 0x62, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01];
                const SIGNATURE_2: [u8; 6] = [0x00, 0x00, 0x00, 0x00, 0x0a, 0x4e];
                if tcp_payload.len() >= 20
                    && tcp_payload[0..10] == SIGNATURE_1
                    && tcp_payload[14..20] == SIGNATURE_2
                {
                    info!(
                        target: "app::capture",
                        "Got Scene Server Address by Login Return Packet: {curr_server}"
                    );
                    known_server = Some(curr_server);
                    let payload_len = u32::try_from(tcp_payload.len()).unwrap_or(u32::MAX);
                    let seq_end = tcp_packet.sequence_number().wrapping_add(payload_len);
                    reset_stream(&mut tcp_reassembler, &mut reassembler, Some(seq_end));
                    if let Err(err) = packet_sender.send((Pkt::ServerChangeInfo, Bytes::new())) {
                        debug!("Failed to send packet: {err}");
                    } else {
                        queue_depth.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
            continue;
        }

        let sequence_number = tcp_packet.sequence_number();
        let payload = tcp_packet.payload();
        let payload_len = payload.len();

        if tcp_packet.syn() {
            info!(
                target: "app::capture",
                "SYN observed for {curr_server}; resetting TCP reassembler state"
            );
            reset_stream(
                &mut tcp_reassembler,
                &mut reassembler,
                Some(sequence_number.wrapping_add(1)),
            );
            if payload_len == 0 {
                continue;
            }
        }

        let mut defer_reset = false;
        if tcp_packet.fin() || tcp_packet.rst() {
            defer_reset = true;
        }

        if payload_len == 0 {
            if defer_reset {
                reset_stream(&mut tcp_reassembler, &mut reassembler, None);
            }
            continue;
        }

        if let Some(expected) = tcp_reassembler.next_sequence() {
            if tcp_sequence_before(sequence_number, expected) {
                let backwards = expected.wrapping_sub(sequence_number);
                if backwards > MAX_BACKTRACK_BYTES {
                    warn!(
                        target: "app::capture",
                        "Sequence regression detected for {curr_server}: expected {expected}, \
                        got {sequence_number} (backwards {backwards} bytes). Resetting stream"
                    );
                    reset_stream(
                        &mut tcp_reassembler,
                        &mut reassembler,
                        Some(sequence_number),
                    );
                }
            }
        }

        match tcp_reassembler.insert_segment(sequence_number, payload) {
            TcpInsertResult::Contiguous(buffer) => {
                reassembler.feed_owned(buffer);
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
                reassembler.take_remaining();
                if !data.is_empty() {
                    reassembler.feed_owned(data);
                }
            }
            TcpInsertResult::Gap | TcpInsertResult::NoData => {}
        }

        while let Some(packet) = reassembler.try_next() {
            process_packet(&packet, packet_sender, queue_depth);
        }

        if defer_reset {
            reset_stream(&mut tcp_reassembler, &mut reassembler, None);
        }
        if *restart_receiver.borrow() {
            break;
        }
    } // todo: if it errors, it breaks out of the loop but will it ever error?
    // info!("{}", line!());
}

// Function to send restart signal from another thread/task
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
