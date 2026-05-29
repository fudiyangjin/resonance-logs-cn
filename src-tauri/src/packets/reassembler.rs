use bytes::{Bytes, BytesMut};
use std::convert::TryInto;

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
            max_buffer_size: 10 * 1024 * 1024, // 10 MB
        }
    }

    /// Push incoming bytes (e.g., TCP payload) into the reassembler.
    #[allow(dead_code)]
    pub fn push(&mut self, data: &[u8]) {
        self.buffer.extend_from_slice(data);
        // If buffer grows beyond max, drop to recover from malformed input.
        if self.buffer.len() > self.max_buffer_size {
            self.buffer.clear();
        }
    }

    /// Try to extract the next complete frame if available.
    /// Returns Some(frame_bytes) or None if not enough data yet.
    pub fn try_next(&mut self) -> Option<Bytes> {
        // Need at least 4 bytes to read length
        if self.buffer.len() < 4 {
            return None;
        }

        // Read u32 big-endian from buffer[0..4]
        let len_bytes = &self.buffer[..4];
        let frame_len = u32::from_be_bytes(len_bytes.try_into().unwrap()) as usize;

        // Sanity check: frame length must be >= 4 (header included) and not absurd
        if frame_len == 0 || frame_len > self.max_buffer_size {
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

    /// Feed an owned Vec<u8> into the reassembler without copying when possible.
    /// If the internal buffer is empty we take ownership of the
    /// provided Vec to avoid an extra copy. Otherwise we extend the buffer.
    pub fn feed_owned(&mut self, bytes: Vec<u8>) {
        if self.buffer.is_empty() {
            // reuse the allocation
            self.buffer = Bytes::from(bytes).into();
            return;
        }
        self.buffer.extend_from_slice(&bytes);
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

    fn make_frame(payload: &[u8]) -> Vec<u8> {
        let total_len = (4 + payload.len()) as u32;
        let mut v = total_len.to_be_bytes().to_vec();
        v.extend_from_slice(payload);
        v
    }

    #[test]
    fn single_frame_in_one_push() {
        let mut r = Reassembler::new();
        let frame = make_frame(b"hello");
        r.push(&frame);
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
        r.push(&combined);
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
        r.push(&frame[..split]);
        assert!(r.try_next().is_none());
        r.push(&frame[split..]);
        let got = r.try_next().unwrap();
        assert_eq!(&got[4..], b"split-me");
    }

    #[test]
    fn take_remaining_clears_partial_frame_before_recovery() {
        let mut r = Reassembler::new();
        let partial = make_frame(b"lost-frame");
        let next = make_frame(b"after-gap");

        r.push(&partial[..6]);
        assert!(r.try_next().is_none());
        assert!(!r.take_remaining().is_empty());

        r.push(&next);
        let got = r.try_next().unwrap();
        assert_eq!(&got[4..], b"after-gap");
        assert!(r.try_next().is_none());
    }
}
