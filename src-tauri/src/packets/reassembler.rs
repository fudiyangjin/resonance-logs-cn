use bytes::{Bytes, BytesMut};

/// Largest frame the reassembler accepts; longer length prefixes are treated
/// as corrupt stream data.
pub const MAX_FRAME_LEN: usize = 10 * 1024 * 1024; // 10 MB

/// Smallest valid frame: the length prefix counts itself, so anything shorter
/// than its own 4 bytes means the stream is misaligned.
const MIN_FRAME_LEN: usize = 4;

/// Whether `len` could be the length prefix of a game frame. This is the
/// single rule [`Reassembler::try_next`] applies before discarding data.
#[must_use]
pub fn is_plausible_frame_len(len: usize) -> bool {
    (MIN_FRAME_LEN..=MAX_FRAME_LEN).contains(&len)
}

/// A simple TCP reassembler for length-prefixed frames where each frame
/// starts with a u32 length (big-endian) followed by that many bytes.
///
/// The reassembler keeps a single BytesMut buffer. When a complete frame is
/// available, it returns a Bytes view.
pub struct Reassembler {
    buffer: BytesMut,
    /// Safety cap to avoid pathological allocations (can be tuned)
    max_buffer_size: usize,
}

impl Reassembler {
    pub fn new() -> Self {
        Self {
            buffer: BytesMut::with_capacity(4096),
            max_buffer_size: MAX_FRAME_LEN,
        }
    }

    /// Try to extract the next complete frame if available.
    /// Returns Some(frame_bytes) or None if not enough data yet.
    pub fn try_next(&mut self) -> Option<Bytes> {
        let frame_len = self.peek_frame_len()?;

        // Sanity check: frame length must be >= 4 (header included) and not absurd
        if !is_plausible_frame_len(frame_len) {
            // Avoid trying to parse insane frame sizes; drop buffer to recover.
            self.buffer.clear();
            return None;
        }

        if self.buffer.len() < frame_len {
            // Not enough bytes yet
            return None;
        }

        Some(self.buffer.split_to(frame_len).freeze())
    }

    /// Length prefix of the next frame, once its 4 bytes are buffered.
    #[must_use]
    pub fn peek_frame_len(&self) -> Option<usize> {
        let prefix: [u8; 4] = self.buffer.get(..4)?.try_into().ok()?;
        Some(u32::from_be_bytes(prefix) as usize)
    }

    /// Feed `Bytes` into the reassembler. When the internal buffer is empty the
    /// data is adopted in-place; otherwise the bytes are appended.
    pub fn feed_bytes(&mut self, b: Bytes) {
        if self.buffer.is_empty() {
            self.buffer = BytesMut::from(b.as_ref());
            return;
        }
        self.buffer.extend_from_slice(&b);
        if self.buffer.len() > self.max_buffer_size {
            self.buffer.clear();
        }
    }

    /// Take and return the remaining unconsumed bytes and
    /// reset the internal buffer.
    pub fn take_remaining(&mut self) -> Bytes {
        self.buffer.split().freeze()
    }
}

#[cfg(test)]
mod tests {
    use super::Reassembler;
    use bytes::Bytes;

    fn make_frame(payload: &[u8]) -> Vec<u8> {
        let total_len = (4 + payload.len()) as u32;
        let mut v = total_len.to_be_bytes().to_vec();
        v.extend_from_slice(payload);
        v
    }

    fn feed(r: &mut Reassembler, data: &[u8]) {
        r.feed_bytes(Bytes::copy_from_slice(data));
    }

    #[test]
    fn single_frame_in_one_push() {
        let mut r = Reassembler::new();
        let frame = make_frame(b"hello");
        feed(&mut r, &frame);
        let got = r.try_next();
        assert!(got.is_some());
        assert_eq!(&got.unwrap()[4..], b"hello");
        assert!(r.try_next().is_none());
    }

    #[test]
    fn two_frames_in_one_push() {
        let mut r = Reassembler::new();
        let f1 = make_frame(b"foo");
        let f2 = make_frame(b"barbaz");
        let mut combined = Vec::new();
        combined.extend_from_slice(&f1);
        combined.extend_from_slice(&f2);
        feed(&mut r, &combined);
        let g1 = r.try_next().unwrap();
        assert_eq!(&g1[4..], b"foo");
        let g2 = r.try_next().unwrap();
        assert_eq!(&g2[4..], b"barbaz");
        assert!(r.try_next().is_none());
    }

    #[test]
    fn frame_split_across_pushes() {
        let mut r = Reassembler::new();
        let frame = make_frame(b"split-me");
        // push first half
        let split = frame.len() / 2;
        feed(&mut r, &frame[..split]);
        assert!(r.try_next().is_none());
        feed(&mut r, &frame[split..]);
        let got = r.try_next().unwrap();
        assert_eq!(&got[4..], b"split-me");
    }

    #[test]
    fn drops_buffer_for_implausible_length() {
        let mut r = Reassembler::new();
        // A TLS record header read as a frame length is far above the cap.
        feed(&mut r, &[0x16, 0x03, 0x01, 0x02, 0x00, 0x01, 0x00]);
        assert_eq!(r.peek_frame_len(), Some(0x1603_0102));
        assert!(r.try_next().is_none());
        assert_eq!(r.peek_frame_len(), None);
    }

    #[test]
    fn length_shorter_than_its_prefix_is_discarded() {
        let mut r = Reassembler::new();
        feed(&mut r, &[0, 0, 0, 2, 0xaa, 0xbb]);
        assert!(r.try_next().is_none());
        assert_eq!(r.peek_frame_len(), None);

        // A header-only frame (length 4) stays a valid, aligned frame.
        feed(&mut r, &[0, 0, 0, 4]);
        assert_eq!(r.try_next().map(|frame| frame.len()), Some(4));
    }

    #[test]
    fn plausible_frame_len_bounds() {
        assert!(!super::is_plausible_frame_len(0));
        assert!(!super::is_plausible_frame_len(3));
        assert!(super::is_plausible_frame_len(4));
        assert!(super::is_plausible_frame_len(super::MAX_FRAME_LEN));
        assert!(!super::is_plausible_frame_len(super::MAX_FRAME_LEN + 1));
        assert!(!super::is_plausible_frame_len(
            u32::from_be_bytes(*b"GET ") as usize
        ));
    }

    #[test]
    fn take_remaining_clears_partial_frame_before_recovery() {
        let mut r = Reassembler::new();
        let partial = make_frame(b"lost-frame");
        let next = make_frame(b"after-gap");

        feed(&mut r, &partial[..6]);
        assert!(r.try_next().is_none());
        assert!(!r.take_remaining().is_empty());

        feed(&mut r, &next);
        let got = r.try_next().unwrap();
        assert_eq!(&got[4..], b"after-gap");
        assert!(r.try_next().is_none());
    }
}
