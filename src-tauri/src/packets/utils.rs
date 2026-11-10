use bytes::Bytes;
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

const MAX_TCP_CACHE_SIZE: usize = 5 * 1024 * 1024; // 5MB limit
const GAP_SKIP_BUFFERED_BYTES: usize = 512 * 1024;
const GAP_SKIP_WAIT: Duration = Duration::from_millis(1000);

/// Unwrapped stream positions start here so a segment up to 2^31 bytes
/// before the first one seen still maps to a non-negative position.
const POSITION_BASE: u64 = 1 << 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GapSkipReason {
    BufferedBytes,
    WaitTime,
    HardLimit,
}

/// Ordered output of [`TCPReassembler`]. A `Gap` always precedes the data
/// that follows the skipped hole, so consumers can drop partial frames first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamEvent {
    Data(Bytes),
    Gap {
        from: u32,
        to: u32,
        reason: GapSkipReason,
    },
}

#[derive(Debug)]
struct CachedSegment {
    data: Bytes,
    /// When the segment reached the reassembler; dates the hole before it.
    arrived_at: Instant,
}

/// Reorders TCP payload into a contiguous byte stream.
///
/// Sequence numbers are unwrapped into 64-bit stream positions, so ordering
/// stays correct across the 32-bit wraparound. Between calls every cached
/// segment starts after the next expected position; segments made obsolete
/// by a longer or differently split retransmission are trimmed or dropped
/// while draining instead of lingering in the cache.
pub struct TCPReassembler {
    cache: BTreeMap<u64, CachedSegment>,
    next: Option<u64>,
    buffered_bytes: usize,
    #[cfg(test)]
    fast_path_hits: usize,
}

impl TCPReassembler {
    pub fn new() -> Self {
        Self {
            cache: BTreeMap::new(),
            next: None,
            buffered_bytes: 0,
            #[cfg(test)]
            fast_path_hits: 0,
        }
    }

    /// Inserts one TCP payload segment and reports the resulting stream data
    /// and skipped holes, in stream order, to `out`.
    ///
    /// `now` must come from the same clock that is later passed to
    /// [`Self::skip_expired_gap`] (the caller's processing time), so a backlog
    /// in front of the reassembler never makes a fresh hole look expired.
    pub fn insert_segment(
        &mut self,
        sequence_number: u32,
        payload: Bytes,
        now: Instant,
        out: &mut impl FnMut(StreamEvent),
    ) {
        if payload.is_empty() {
            return;
        }

        let next = *self
            .next
            .get_or_insert(POSITION_BASE + u64::from(sequence_number));
        let start = unwrap_sequence(next, sequence_number);
        let end = start + payload.len() as u64;
        if end <= next {
            return;
        }

        let (start, data) = if start < next {
            (next, payload.slice((next - start) as usize..))
        } else {
            (start, payload)
        };

        // Fast path: nothing buffered and the segment is exactly in order.
        if start == next && self.cache.is_empty() {
            self.next = Some(end);
            #[cfg(test)]
            {
                self.fast_path_hits += 1;
            }
            out(StreamEvent::Data(data));
            return;
        }

        match self.cache.get_mut(&start) {
            Some(existing) => {
                // Keep the earliest arrival: it dates the hole in front of it.
                if data.len() > existing.data.len() {
                    self.buffered_bytes = self.buffered_bytes - existing.data.len() + data.len();
                    existing.data = data;
                }
            }
            None => {
                self.buffered_bytes += data.len();
                self.cache.insert(
                    start,
                    CachedSegment {
                        data,
                        arrived_at: now,
                    },
                );
            }
        }

        self.drain_contiguous(out);
        self.skip_expired_gap(now, out);
    }

    /// Skips holes whose buffered data has waited long enough, or whose
    /// buffer is too large, then drains what becomes contiguous. Called after
    /// every insert and periodically while no packets arrive, so a stalled
    /// stream does not depend on future traffic to make progress.
    /// Returns whether any hole was skipped.
    pub fn skip_expired_gap(&mut self, now: Instant, out: &mut impl FnMut(StreamEvent)) -> bool {
        let mut skipped = false;
        while let Some(reason) = self.gap_skip_reason(now) {
            let (Some(from), Some((&to, _))) = (self.next, self.cache.first_key_value()) else {
                break;
            };
            // Invariant: every cached segment starts after `next`.
            debug_assert!(to > from);
            out(StreamEvent::Gap {
                from: from as u32,
                to: to as u32,
                reason,
            });
            self.next = Some(to);
            self.drain_contiguous(out);
            skipped = true;
        }
        skipped
    }

    fn drain_contiguous(&mut self, out: &mut impl FnMut(StreamEvent)) {
        let Some(mut cursor) = self.next else {
            return;
        };
        while let Some(entry) = self.cache.first_entry() {
            let start = *entry.key();
            if start > cursor {
                break;
            }
            let segment = entry.remove();
            self.buffered_bytes -= segment.data.len();
            let end = start + segment.data.len() as u64;
            if end <= cursor {
                // Fully covered by data already delivered.
                continue;
            }
            let data = if start < cursor {
                segment.data.slice((cursor - start) as usize..)
            } else {
                segment.data
            };
            cursor = end;
            out(StreamEvent::Data(data));
        }
        self.next = Some(cursor);
    }

    fn gap_skip_reason(&self, now: Instant) -> Option<GapSkipReason> {
        let (_, first) = self.cache.first_key_value()?;
        if self.buffered_bytes > MAX_TCP_CACHE_SIZE {
            Some(GapSkipReason::HardLimit)
        } else if self.buffered_bytes > GAP_SKIP_BUFFERED_BYTES {
            Some(GapSkipReason::BufferedBytes)
        } else if now.saturating_duration_since(first.arrived_at) >= GAP_SKIP_WAIT {
            Some(GapSkipReason::WaitTime)
        } else {
            None
        }
    }

    /// Whether data is buffered behind a missing segment.
    pub fn has_gap(&self) -> bool {
        !self.cache.is_empty()
    }

    pub fn reset(&mut self, next_seq: Option<u32>) {
        self.cache.clear();
        self.buffered_bytes = 0;
        self.next = next_seq.map(|seq| POSITION_BASE + u64::from(seq));
    }

    pub fn next_sequence(&self) -> Option<u32> {
        self.next.map(|position| position as u32)
    }

    #[cfg(test)]
    pub fn fast_path_hits(&self) -> usize {
        self.fast_path_hits
    }
}

impl Default for TCPReassembler {
    fn default() -> Self {
        Self::new()
    }
}

/// Maps a 32-bit sequence number to the 64-bit stream position closest to
/// `next`, which is how TCP itself interprets a sequence number.
#[inline]
fn unwrap_sequence(next: u64, sequence_number: u32) -> u64 {
    let delta = i64::from(sequence_number.wrapping_sub(next as u32) as i32);
    next.saturating_add_signed(delta)
}

#[cfg(test)]
mod tests {
    use super::{
        GAP_SKIP_BUFFERED_BYTES, GAP_SKIP_WAIT, GapSkipReason, MAX_TCP_CACHE_SIZE, StreamEvent,
        TCPReassembler,
    };
    use bytes::Bytes;
    use std::time::{Duration, Instant};

    /// Test output: delivered bytes are merged until a gap separates them.
    #[derive(Debug, PartialEq, Eq)]
    enum Out {
        Data(Vec<u8>),
        Gap(u32, u32, GapSkipReason),
    }

    fn insert_at(r: &mut TCPReassembler, seq: u32, payload: &[u8], now: Instant) -> Vec<Out> {
        let mut events = Vec::new();
        r.insert_segment(seq, Bytes::copy_from_slice(payload), now, &mut |event| {
            events.push(event)
        });
        merge(events)
    }

    fn insert(r: &mut TCPReassembler, seq: u32, payload: &[u8]) -> Vec<Out> {
        insert_at(r, seq, payload, Instant::now())
    }

    fn merge(events: Vec<StreamEvent>) -> Vec<Out> {
        let mut out: Vec<Out> = Vec::new();
        for event in events {
            match event {
                StreamEvent::Data(bytes) => match out.last_mut() {
                    Some(Out::Data(data)) => data.extend_from_slice(&bytes),
                    _ => out.push(Out::Data(bytes.to_vec())),
                },
                StreamEvent::Gap { from, to, reason } => out.push(Out::Gap(from, to, reason)),
            }
        }
        out
    }

    fn data(bytes: &[u8]) -> Vec<Out> {
        vec![Out::Data(bytes.to_vec())]
    }

    fn pattern(range: std::ops::Range<u32>) -> Vec<u8> {
        range.map(|i| (i % 251) as u8).collect()
    }

    #[test]
    fn reassembles_in_order() {
        let mut r = TCPReassembler::new();
        assert_eq!(insert(&mut r, 10, b"abc"), data(b"abc"));
        assert_eq!(insert(&mut r, 13, b"def"), data(b"def"));
    }

    #[test]
    fn reassembles_out_of_order_once_gap_filled() {
        let mut r = TCPReassembler::new();
        assert_eq!(insert(&mut r, 100, b"abc"), data(b"abc"));
        assert_eq!(insert(&mut r, 106, b"ghi"), vec![]);
        assert!(r.has_gap());
        assert_eq!(insert(&mut r, 103, b"def"), data(b"defghi"));
        assert!(!r.has_gap());
    }

    #[test]
    fn trims_overlapping_segments_and_ignores_duplicates() {
        let mut r = TCPReassembler::new();
        assert_eq!(insert(&mut r, 50, b"abc"), data(b"abc"));
        assert_eq!(insert(&mut r, 50, b"ab"), vec![]);
        assert_eq!(insert(&mut r, 51, b"bcdef"), data(b"def"));
    }

    #[test]
    fn reset_drops_state_and_reinitializes() {
        let mut r = TCPReassembler::new();
        assert_eq!(insert(&mut r, 500, b"abc"), data(b"abc"));
        r.reset(None);
        assert_eq!(r.next_sequence(), None);
        assert_eq!(insert(&mut r, 42, b"xyz"), data(b"xyz"));
    }

    #[test]
    fn waits_for_small_gap() {
        let mut r = TCPReassembler::new();
        assert_eq!(insert(&mut r, 100, b"abc"), data(b"abc"));
        assert_eq!(insert(&mut r, 106, b"ghi"), vec![]);
        assert_eq!(r.next_sequence(), Some(103));
    }

    #[test]
    fn skips_gap_after_buffer_threshold() {
        let mut r = TCPReassembler::new();
        r.reset(Some(100));
        let payload = vec![b'x'; GAP_SKIP_BUFFERED_BYTES + 1];
        let mut expected = vec![Out::Gap(100, 200, GapSkipReason::BufferedBytes)];
        expected.extend(data(&payload));
        assert_eq!(insert(&mut r, 200, &payload), expected);
    }

    #[test]
    fn skips_gap_after_wait_threshold() {
        let mut r = TCPReassembler::new();
        r.reset(Some(100));
        let t0 = Instant::now();
        assert_eq!(insert_at(&mut r, 200, b"abc", t0), vec![]);
        let later = t0 + GAP_SKIP_WAIT + Duration::from_millis(1);
        assert_eq!(
            insert_at(&mut r, 203, b"def", later),
            vec![
                Out::Gap(100, 200, GapSkipReason::WaitTime),
                Out::Data(b"abcdef".to_vec())
            ]
        );
    }

    #[test]
    fn fast_path_hits_for_in_order_segments() {
        let mut r = TCPReassembler::new();
        assert_eq!(r.fast_path_hits(), 0);
        insert(&mut r, 10, b"abc");
        assert_eq!(r.fast_path_hits(), 1);
        insert(&mut r, 13, b"def");
        assert_eq!(r.fast_path_hits(), 2);
    }

    #[test]
    fn fast_path_not_hit_for_out_of_order() {
        let mut r = TCPReassembler::new();
        insert(&mut r, 100, b"abc");
        assert_eq!(r.fast_path_hits(), 1);
        insert(&mut r, 106, b"ghi");
        assert_eq!(r.fast_path_hits(), 1);
        assert_eq!(insert(&mut r, 103, b"def"), data(b"defghi"));
        assert_eq!(r.fast_path_hits(), 1);
    }

    /// Regression: a coalesced retransmission covering a cached segment used
    /// to leave it in the cache, which hid every later gap until 5 MB piled up.
    #[test]
    fn covering_retransmit_leaves_no_stale_segment() {
        let mut r = TCPReassembler::new();
        r.reset(Some(100));
        let t0 = Instant::now();
        assert_eq!(insert_at(&mut r, 200, &pattern(200..300), t0), vec![]);
        assert_eq!(
            insert_at(&mut r, 100, &pattern(100..300), t0),
            data(&pattern(100..300))
        );
        assert!(!r.has_gap());

        // [300,310) is never seen; the next hole must be detected and timed.
        assert_eq!(insert_at(&mut r, 310, &pattern(310..320), t0), vec![]);
        assert!(r.has_gap());
        let later = t0 + GAP_SKIP_WAIT;
        assert_eq!(
            insert_at(&mut r, 320, &pattern(320..330), later),
            vec![
                Out::Gap(300, 310, GapSkipReason::WaitTime),
                Out::Data(pattern(310..330))
            ]
        );
    }

    /// Regression: a retransmission split differently from the original used
    /// to stall the stream permanently.
    #[test]
    fn partially_overlapping_retransmit_keeps_stream_flowing() {
        let mut r = TCPReassembler::new();
        r.reset(Some(100));
        assert_eq!(insert(&mut r, 200, &pattern(200..300)), vec![]);
        assert_eq!(
            insert(&mut r, 100, &pattern(100..250)),
            data(&pattern(100..300))
        );
        assert_eq!(
            insert(&mut r, 300, &pattern(300..400)),
            data(&pattern(300..400))
        );
        assert!(!r.has_gap());
    }

    /// Regression: after a covering retransmission, the next forced skip used
    /// to jump backwards onto the stale segment and replay old bytes.
    #[test]
    fn forced_skip_after_covering_retransmit_moves_forward() {
        let mut r = TCPReassembler::new();
        r.reset(Some(100));
        let t0 = Instant::now();
        insert_at(&mut r, 200, &pattern(200..300), t0);
        insert_at(&mut r, 100, &pattern(100..300), t0);

        // [300,310) is lost; feed in-order data until the buffer forces a skip.
        let mut delivered = 200usize;
        let mut gaps = Vec::new();
        let mut seq = 310u32;
        while gaps.is_empty() && (seq as usize) < MAX_TCP_CACHE_SIZE * 2 {
            r.insert_segment(
                seq,
                Bytes::from(pattern(seq..seq + 1400)),
                t0,
                &mut |event| match event {
                    StreamEvent::Data(bytes) => delivered += bytes.len(),
                    StreamEvent::Gap { from, to, reason } => gaps.push((from, to, reason)),
                },
            );
            seq += 1400;
        }
        assert_eq!(gaps, vec![(300, 310, GapSkipReason::BufferedBytes)]);
        // Every byte except the lost 10 is delivered exactly once.
        assert_eq!(delivered, (seq - 100) as usize - 10);
    }

    /// Each hole is timed from when data behind it arrived, so holes found
    /// after a skip are not each delayed by another full wait.
    #[test]
    fn holes_are_timed_by_their_own_data() {
        let mut r = TCPReassembler::new();
        r.reset(Some(0));
        let t0 = Instant::now();
        insert_at(&mut r, 10, &pattern(10..20), t0);
        insert_at(&mut r, 30, &pattern(30..40), t0);
        let later = t0 + GAP_SKIP_WAIT;
        let mut events = Vec::new();
        assert!(r.skip_expired_gap(later, &mut |event| events.push(event)));
        assert_eq!(
            merge(events),
            vec![
                Out::Gap(0, 10, GapSkipReason::WaitTime),
                Out::Data(pattern(10..20)),
                Out::Gap(20, 30, GapSkipReason::WaitTime),
                Out::Data(pattern(30..40)),
            ]
        );
    }

    #[test]
    fn skip_expired_gap_without_new_packets() {
        let mut r = TCPReassembler::new();
        r.reset(Some(0));
        let t0 = Instant::now();
        insert_at(&mut r, 10, b"abc", t0);
        assert!(!r.skip_expired_gap(t0 + Duration::from_millis(500), &mut |_| {}));
        assert!(r.has_gap());
        assert!(r.skip_expired_gap(t0 + GAP_SKIP_WAIT, &mut |_| {}));
        assert!(!r.has_gap());
        assert_eq!(r.next_sequence(), Some(13));
    }

    #[test]
    fn reorders_across_sequence_wraparound() {
        let mut r = TCPReassembler::new();
        r.reset(Some(u32::MAX - 2));
        assert_eq!(insert(&mut r, 1, b"de"), vec![]);
        assert_eq!(insert(&mut r, u32::MAX - 2, b"abc"), data(b"abc"));
        assert_eq!(insert(&mut r, 0, b"x"), data(b"xde"));
        assert_eq!(r.next_sequence(), Some(3));
    }
}
