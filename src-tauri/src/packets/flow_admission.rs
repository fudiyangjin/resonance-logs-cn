//! Capture-thread side of the pipeline: decides which TCP segments belong to
//! game connections and copies only those out of the driver buffer.
//!
//! Everything here must stay cheap and non-blocking (apart from the
//! occasional TCP table snapshot on an unknown flow), because the capture
//! thread has to keep draining the driver queue.

use crate::packets::capture_source::{CapturedPacket, PacketFormat};
use crate::packets::game_connections::{Distribution, GameConnectionFilter, Verdict};
use crate::packets::utils::Server;
use bytes::Bytes;
use etherparse::{NetSlice, SlicedPacket, TransportSlice};
use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::time::{Duration, Instant};

/// Admitted flows unseen for this long are forgotten.
pub const FLOW_IDLE_TIMEOUT: Duration = Duration::from_secs(90);
const CLEANUP_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SegmentFlags {
    pub syn: bool,
    pub fin: bool,
    pub rst: bool,
}

/// One TCP segment of an admitted flow, owned so it can cross threads.
#[derive(Debug, Clone)]
pub struct RawSegment {
    pub server: Server,
    pub sequence: u32,
    pub flags: SegmentFlags,
    pub payload: Bytes,
    /// Set while the TCP table attributes the flow to a game process.
    pub distribution: Option<Distribution>,
    /// Connection generation of the flow; bumped on every SYN so feedback
    /// about an earlier connection on the same tuple can be told apart.
    pub generation: u32,
    pub captured_at: Instant,
}

/// Segments from one driver read, in capture order.
pub type RawBatch = Vec<RawSegment>;

/// Feedback from the stream thread to the capture thread.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlowControl {
    /// The stream of this connection generation does not carry the game
    /// protocol; stop forwarding it until the next SYN.
    Ignore { server: Server, generation: u32 },
}

#[derive(Debug)]
struct AdmittedFlow {
    last_seen: Instant,
    ignored: bool,
    generation: u32,
}

pub struct FlowAdmission {
    connections: GameConnectionFilter,
    admitted: HashMap<Server, AdmittedFlow>,
    last_cleanup: Instant,
}

impl FlowAdmission {
    pub fn new() -> Self {
        Self::with_filter(GameConnectionFilter::new())
    }

    fn with_filter(connections: GameConnectionFilter) -> Self {
        Self {
            connections,
            admitted: HashMap::new(),
            last_cleanup: Instant::now(),
        }
    }

    /// Returns the segment to forward when `packet` belongs to a game flow
    /// that has not been ignored.
    pub fn admit(&mut self, packet: &CapturedPacket<'_>) -> Option<RawSegment> {
        let sliced = match packet.format {
            PacketFormat::RawIp => SlicedPacket::from_ip(packet.data),
            PacketFormat::Ethernet => SlicedPacket::from_ethernet(packet.data),
            PacketFormat::Unsupported => return None,
        }
        .ok()?;
        let Some(NetSlice::Ipv4(ip)) = sliced.net else {
            return None;
        };
        let Some(TransportSlice::Tcp(tcp)) = sliced.transport else {
            return None;
        };

        let header = ip.header();
        let server = Server::new(
            header.source(),
            tcp.source_port(),
            header.destination(),
            tcp.destination_port(),
        );
        let flags = SegmentFlags {
            syn: tcp.syn(),
            fin: tcp.fin(),
            rst: tcp.rst(),
        };
        let opens_connection = flags.syn && !tcp.ack();
        if opens_connection {
            // A new connection may reuse a tuple cached as non-game.
            self.connections.forget_flow(server);
        }

        let distribution = match self.connections.classify(server) {
            Verdict::Game(distribution) => Some(distribution),
            Verdict::NonGame => None,
        };
        let flow = match (distribution, self.admitted.entry(server)) {
            (_, Entry::Occupied(entry)) => entry.into_mut(),
            (Some(_), Entry::Vacant(entry)) => entry.insert(AdmittedFlow {
                last_seen: packet.captured_at,
                ignored: false,
                generation: 0,
            }),
            (None, Entry::Vacant(_)) => return None,
        };
        flow.last_seen = Instant::now();
        if flags.syn {
            // SYN and SYN-ACK both start a new stream in their direction; the
            // stream thread re-checks its protocol from scratch.
            flow.generation = flow.generation.wrapping_add(1);
            flow.ignored = false;
        }
        if flags.fin || flags.rst {
            self.connections.forget_flow(server);
        }
        if flow.ignored {
            return None;
        }

        Some(RawSegment {
            server,
            sequence: tcp.sequence_number(),
            flags,
            payload: Bytes::copy_from_slice(tcp.payload()),
            distribution,
            generation: flow.generation,
            captured_at: packet.captured_at,
        })
    }

    pub fn apply(&mut self, control: FlowControl) {
        match control {
            FlowControl::Ignore { server, generation } => match self.admitted.entry(server) {
                // A newer connection on the tuple must not inherit the verdict.
                Entry::Occupied(entry) => {
                    let flow = entry.into_mut();
                    if flow.generation == generation {
                        flow.ignored = true;
                    }
                }
                // Evicted meanwhile: remember the verdict for when it resumes.
                Entry::Vacant(entry) => {
                    entry.insert(AdmittedFlow {
                        last_seen: Instant::now(),
                        ignored: true,
                        generation,
                    });
                }
            },
        }
    }

    /// Forgets idle flows; cheap enough to call after every read.
    pub fn maintain(&mut self, now: Instant) {
        if now.saturating_duration_since(self.last_cleanup) < CLEANUP_INTERVAL {
            return;
        }
        self.last_cleanup = now;
        self.admitted
            .retain(|_, flow| now.saturating_duration_since(flow.last_seen) < FLOW_IDLE_TIMEOUT);
    }

    /// Re-reads the TCP table and reports whether a game process currently
    /// holds TCP connections.
    pub fn game_connections_present(&mut self) -> bool {
        self.connections.refresh_now();
        self.connections.has_game_connections()
    }

    #[must_use]
    pub fn ignored_flows(&self) -> usize {
        self.admitted.values().filter(|flow| flow.ignored).count()
    }
}

impl Default for FlowAdmission {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLIENT: [u8; 4] = [10, 0, 0, 1];
    const SERVER: [u8; 4] = [20, 0, 0, 1];

    fn tcp_packet(
        src: [u8; 4],
        dst: [u8; 4],
        flags: SegmentFlags,
        ack: bool,
        payload: &[u8],
    ) -> Vec<u8> {
        let mut builder = etherparse::PacketBuilder::ipv4(src, dst, 64).tcp(
            if src == CLIENT { 40_000 } else { 5_003 },
            if src == CLIENT { 5_003 } else { 40_000 },
            1_000,
            65_535,
        );
        if flags.syn {
            builder = builder.syn();
        }
        if flags.fin {
            builder = builder.fin();
        }
        if flags.rst {
            builder = builder.rst();
        }
        if ack {
            builder = builder.ack(1);
        }
        let mut out = Vec::with_capacity(builder.size(payload.len()));
        builder.write(&mut out, payload).expect("write test packet");
        out
    }

    fn captured(data: &[u8]) -> CapturedPacket<'_> {
        CapturedPacket {
            format: PacketFormat::RawIp,
            data,
            captured_at: Instant::now(),
        }
    }

    fn game_admission() -> FlowAdmission {
        FlowAdmission::with_filter(GameConnectionFilter::with_game_endpoint(
            CLIENT,
            40_000,
            Distribution::Star,
        ))
    }

    #[test]
    fn forwards_game_segments_with_distribution() {
        let mut admission = game_admission();
        let packet = tcp_packet(SERVER, CLIENT, SegmentFlags::default(), true, b"hello");
        let segment = admission.admit(&captured(&packet)).expect("game segment");
        assert_eq!(segment.payload.as_ref(), b"hello");
        assert_eq!(segment.distribution, Some(Distribution::Star));
        assert_eq!(segment.sequence, 1_000);
    }

    #[test]
    fn drops_non_game_flows() {
        let mut admission = FlowAdmission::with_filter(GameConnectionFilter::with_game_endpoint(
            [1, 1, 1, 1],
            1,
            Distribution::Star,
        ));
        let packet = tcp_packet(SERVER, CLIENT, SegmentFlags::default(), true, b"hello");
        assert!(admission.admit(&captured(&packet)).is_none());
    }

    #[test]
    fn ignored_flow_resumes_on_new_connection() {
        let mut admission = game_admission();
        let data = tcp_packet(CLIENT, SERVER, SegmentFlags::default(), true, b"GET /");
        let segment = admission.admit(&captured(&data)).expect("admitted");

        admission.apply(FlowControl::Ignore {
            server: segment.server,
            generation: segment.generation,
        });
        assert!(admission.admit(&captured(&data)).is_none());
        assert_eq!(admission.ignored_flows(), 1);

        let syn = SegmentFlags {
            syn: true,
            ..SegmentFlags::default()
        };
        let reopen = tcp_packet(CLIENT, SERVER, syn, false, b"");
        assert!(admission.admit(&captured(&reopen)).is_some());
        assert!(admission.admit(&captured(&data)).is_some());
    }

    #[test]
    fn ignored_reply_direction_resumes_on_syn_ack() {
        let mut admission = game_admission();
        let reply = tcp_packet(SERVER, CLIENT, SegmentFlags::default(), true, b"HTTP/1.1");
        let segment = admission.admit(&captured(&reply)).expect("admitted");
        admission.apply(FlowControl::Ignore {
            server: segment.server,
            generation: segment.generation,
        });
        assert!(admission.admit(&captured(&reply)).is_none());

        let syn = SegmentFlags {
            syn: true,
            ..SegmentFlags::default()
        };
        let syn_ack = tcp_packet(SERVER, CLIENT, syn, true, b"");
        assert!(admission.admit(&captured(&syn_ack)).is_some());
        assert!(admission.admit(&captured(&reply)).is_some());
    }

    #[test]
    fn stale_ignore_does_not_silence_a_new_connection() {
        let mut admission = game_admission();
        let data = tcp_packet(CLIENT, SERVER, SegmentFlags::default(), true, b"GET /");
        let old = admission.admit(&captured(&data)).expect("admitted");

        let syn = SegmentFlags {
            syn: true,
            ..SegmentFlags::default()
        };
        let reopen = admission
            .admit(&captured(&tcp_packet(CLIENT, SERVER, syn, false, b"")))
            .expect("syn admitted");
        assert_ne!(reopen.generation, old.generation);

        // Feedback about the previous connection arrives after the SYN.
        admission.apply(FlowControl::Ignore {
            server: old.server,
            generation: old.generation,
        });
        assert!(admission.admit(&captured(&data)).is_some());
    }

    #[test]
    fn ignore_for_an_evicted_flow_is_remembered() {
        let mut admission = game_admission();
        let data = tcp_packet(CLIENT, SERVER, SegmentFlags::default(), true, b"GET /");
        let segment = admission.admit(&captured(&data)).expect("admitted");
        admission.maintain(Instant::now() + FLOW_IDLE_TIMEOUT + CLEANUP_INTERVAL);
        assert_eq!(admission.ignored_flows(), 0);

        admission.apply(FlowControl::Ignore {
            server: segment.server,
            generation: segment.generation,
        });
        assert!(admission.admit(&captured(&data)).is_none());
    }
}
