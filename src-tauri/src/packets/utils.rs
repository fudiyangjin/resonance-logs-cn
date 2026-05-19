use std::collections::BTreeMap;
use std::fmt;
use std::time::{Duration, Instant};

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub struct Server {
    src_addr: [u8; 4],
    src_port: u16,
    dst_addr: [u8; 4],
    dst_port: u16,
}

impl Server {
    pub fn new(src_addr: [u8; 4], src_port: u16, dst_addr: [u8; 4], dst_port: u16) -> Self {
        Self {
            src_addr,
            src_port,
            dst_addr,
            dst_port,
        }
    }

    pub fn source_addr(&self) -> [u8; 4] {
        self.src_addr
    }

    pub fn source_port(&self) -> u16 {
        self.src_port
    }

    pub fn destination_addr(&self) -> [u8; 4] {
        self.dst_addr
    }

    pub fn destination_port(&self) -> u16 {
        self.dst_port
    }
}

impl fmt::Display for Server {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}:{} -> {}:{}",
            ip_to_str(&self.src_addr),
            self.src_port,
            ip_to_str(&self.dst_addr),
            self.dst_port
        )
    }
}

fn ip_to_str(ip: &[u8; 4]) -> String {
    format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3])
}

#[inline]
pub fn tcp_sequence_before(a: u32, b: u32) -> bool {
    (a.wrapping_sub(b) as i32) < 0
}

#[inline]
#[allow(dead_code)]
pub fn tcp_sequence_after(a: u32, b: u32) -> bool {
    (a.wrapping_sub(b) as i32) > 0
}

pub struct TCPReassembler {
    cache: BTreeMap<u32, Vec<u8>>, // sequence -> payload
    next_seq: Option<u32>,         // next expected sequence
    buffered_bytes: usize,         // Total bytes currently in the cache
    gap_started_at: Option<Instant>,
    gap_bytes: usize,
}

const MAX_TCP_CACHE_SIZE: usize = 5 * 1024 * 1024; // 5MB limit
const GAP_SKIP_BUFFERED_BYTES: usize = 512 * 1024;
const GAP_SKIP_WAIT: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GapSkipReason {
    BufferedBytes,
    WaitTime,
    HardLimit,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TcpInsertResult {
    NoData,
    Gap,
    Contiguous(Vec<u8>),
    SkippedGap {
        from: u32,
        to: u32,
        reason: GapSkipReason,
        data: Vec<u8>,
    },
}

#[derive(Debug, Clone, Copy)]
struct SkippedGap {
    from: u32,
    to: u32,
    reason: GapSkipReason,
}

impl TCPReassembler {
    pub fn new() -> Self {
        Self {
            cache: BTreeMap::new(),
            next_seq: None,
            buffered_bytes: 0,
            gap_started_at: None,
            gap_bytes: 0,
        }
    }

    /// Insert a TCP payload segment for the given sequence number.
    /// Returns the new reassembly state and any contiguous bytes now available.
    pub fn insert_segment(&mut self, sequence_number: u32, payload: &[u8]) -> TcpInsertResult {
        if payload.is_empty() {
            return TcpInsertResult::NoData;
        }

        let expected = match self.next_seq {
            Some(seq) => seq,
            None => {
                self.next_seq = Some(sequence_number);
                sequence_number
            }
        };

        let mut start_seq = sequence_number;
        let mut data = payload;

        if tcp_sequence_before(start_seq, expected) {
            let overlap = expected.wrapping_sub(start_seq) as usize;
            if overlap >= data.len() {
                return TcpInsertResult::NoData;
            }
            start_seq = expected;
            data = &data[overlap..];
        }

        // Avoid storing duplicates unless the new payload is longer.
        match self.cache.get_mut(&start_seq) {
            Some(existing) => {
                if data.len() > existing.len() {
                    self.buffered_bytes -= existing.len();
                    existing.clear();
                    existing.extend_from_slice(data);
                    self.buffered_bytes += existing.len();
                }
            }
            None => {
                self.cache.insert(start_seq, data.to_vec());
                self.buffered_bytes += data.len();
            }
        }

        let skipped_gap = self.skip_gap_if_needed();
        let output = self.drain_contiguous();
        self.refresh_gap_state();

        match (skipped_gap, output) {
            (Some(skipped), Some(data)) => TcpInsertResult::SkippedGap {
                from: skipped.from,
                to: skipped.to,
                reason: skipped.reason,
                data,
            },
            (Some(skipped), None) => TcpInsertResult::SkippedGap {
                from: skipped.from,
                to: skipped.to,
                reason: skipped.reason,
                data: Vec::new(),
            },
            (None, Some(data)) => TcpInsertResult::Contiguous(data),
            (None, None) if self.has_gap() => TcpInsertResult::Gap,
            (None, None) => TcpInsertResult::NoData,
        }
    }

    fn drain_contiguous(&mut self) -> Option<Vec<u8>> {
        let mut cursor = self.next_seq.unwrap();
        let mut output: Vec<u8> = Vec::new();

        while let Some(mut segment) = self.cache.remove(&cursor) {
            self.buffered_bytes -= segment.len();
            cursor = cursor.wrapping_add(segment.len() as u32);
            if output.is_empty() {
                output = std::mem::take(&mut segment);
            } else {
                output.extend_from_slice(&segment);
            }
        }

        if output.is_empty() {
            None
        } else {
            self.next_seq = Some(cursor);
            Some(output)
        }
    }

    fn skip_gap_if_needed(&mut self) -> Option<SkippedGap> {
        self.refresh_gap_state();
        let reason = self.gap_skip_reason()?;
        let from = self.next_seq?;
        let (&to, _) = self.cache.iter().next()?;

        self.next_seq = Some(to);
        self.clear_gap_state();

        Some(SkippedGap { from, to, reason })
    }

    fn gap_skip_reason(&self) -> Option<GapSkipReason> {
        if self.buffered_bytes > MAX_TCP_CACHE_SIZE {
            Some(GapSkipReason::HardLimit)
        } else if self.gap_bytes > GAP_SKIP_BUFFERED_BYTES {
            Some(GapSkipReason::BufferedBytes)
        } else if self
            .gap_started_at
            .is_some_and(|started_at| started_at.elapsed() >= GAP_SKIP_WAIT)
        {
            Some(GapSkipReason::WaitTime)
        } else {
            None
        }
    }

    fn refresh_gap_state(&mut self) {
        if self.has_gap() {
            if self.gap_started_at.is_none() {
                self.gap_started_at = Some(Instant::now());
            }
            self.gap_bytes = self.buffered_bytes;
        } else {
            self.clear_gap_state();
        }
    }

    fn has_gap(&self) -> bool {
        let Some(expected) = self.next_seq else {
            return false;
        };
        self.cache
            .iter()
            .next()
            .is_some_and(|(&first_cached_seq, _)| tcp_sequence_after(first_cached_seq, expected))
    }

    fn clear_gap_state(&mut self) {
        self.gap_started_at = None;
        self.gap_bytes = 0;
    }

    pub fn reset(&mut self, next_seq: Option<u32>) {
        self.cache.clear();
        self.buffered_bytes = 0;
        self.next_seq = next_seq;
        self.clear_gap_state();
    }

    pub fn next_sequence(&self) -> Option<u32> {
        self.next_seq
    }

    #[cfg(test)]
    fn age_gap_by(&mut self, duration: Duration) {
        if let Some(started_at) = self.gap_started_at {
            self.gap_started_at = started_at.checked_sub(duration);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{GAP_SKIP_BUFFERED_BYTES, GapSkipReason, TCPReassembler, TcpInsertResult};
    use std::time::Duration;

    #[test]
    fn reassembles_in_order() {
        let mut reassembler = TCPReassembler::new();
        assert_eq!(
            reassembler.insert_segment(10, b"abc"),
            TcpInsertResult::Contiguous(b"abc".to_vec())
        );
        assert_eq!(
            reassembler.insert_segment(13, b"def"),
            TcpInsertResult::Contiguous(b"def".to_vec())
        );
    }

    #[test]
    fn reassembles_out_of_order_once_gap_filled() {
        let mut reassembler = TCPReassembler::new();
        assert_eq!(
            reassembler.insert_segment(100, b"abc"),
            TcpInsertResult::Contiguous(b"abc".to_vec())
        );
        assert_eq!(
            reassembler.insert_segment(106, b"ghi"),
            TcpInsertResult::Gap
        );
        assert_eq!(
            reassembler.insert_segment(103, b"def"),
            TcpInsertResult::Contiguous(b"defghi".to_vec())
        );
    }

    #[test]
    fn trims_overlapping_segments_and_ignores_duplicates() {
        let mut reassembler = TCPReassembler::new();
        assert_eq!(
            reassembler.insert_segment(50, b"abc"),
            TcpInsertResult::Contiguous(b"abc".to_vec())
        );
        // Duplicate shorter payload should be ignored
        assert_eq!(
            reassembler.insert_segment(50, b"ab"),
            TcpInsertResult::NoData
        );
        // Overlapping payload should emit only unseen bytes
        assert_eq!(
            reassembler.insert_segment(51, b"bcdef"),
            TcpInsertResult::Contiguous(b"def".to_vec())
        );
    }

    #[test]
    fn reset_drops_state_and_reinitializes() {
        let mut reassembler = TCPReassembler::new();
        assert_eq!(
            reassembler.insert_segment(500, b"abc"),
            TcpInsertResult::Contiguous(b"abc".to_vec())
        );
        reassembler.reset(None);
        assert_eq!(reassembler.next_sequence(), None);
        assert_eq!(
            reassembler.insert_segment(42, b"xyz"),
            TcpInsertResult::Contiguous(b"xyz".to_vec())
        );
    }

    #[test]
    fn waits_for_small_gap() {
        let mut reassembler = TCPReassembler::new();
        assert_eq!(
            reassembler.insert_segment(100, b"abc"),
            TcpInsertResult::Contiguous(b"abc".to_vec())
        );
        assert_eq!(
            reassembler.insert_segment(106, b"ghi"),
            TcpInsertResult::Gap
        );
        assert_eq!(reassembler.next_sequence(), Some(103));
    }

    #[test]
    fn skips_gap_after_buffer_threshold() {
        let mut reassembler = TCPReassembler::new();
        reassembler.reset(Some(100));

        let payload = vec![b'x'; GAP_SKIP_BUFFERED_BYTES + 1];
        assert_eq!(
            reassembler.insert_segment(200, &payload),
            TcpInsertResult::SkippedGap {
                from: 100,
                to: 200,
                reason: GapSkipReason::BufferedBytes,
                data: payload
            }
        );
    }

    #[test]
    fn skips_gap_after_wait_threshold() {
        let mut reassembler = TCPReassembler::new();
        reassembler.reset(Some(100));

        assert_eq!(
            reassembler.insert_segment(200, b"abc"),
            TcpInsertResult::Gap
        );
        reassembler.age_gap_by(Duration::from_millis(501));

        assert_eq!(
            reassembler.insert_segment(203, b"def"),
            TcpInsertResult::SkippedGap {
                from: 100,
                to: 200,
                reason: GapSkipReason::WaitTime,
                data: b"abcdef".to_vec()
            }
        );
    }
}
