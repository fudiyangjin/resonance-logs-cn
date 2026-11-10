//! Batched WinDivert sniffing on top of the raw `windivert-sys` bindings.
//!
//! The `windivert` wrapper crate keeps its handle private and its batched
//! receive panics on any packet it cannot parse, so capture talks to the
//! driver directly and splits batches itself.

use crate::packets::capture_source::{
    CaptureError, CapturedPacket, PacketFormat, PacketSource, ReadWaker,
};
use std::ffi::CString;
use std::sync::Arc;
use std::time::Instant;
use windivert_sys::address::WINDIVERT_ADDRESS;
use windivert_sys::{
    WinDivertClose, WinDivertFlags, WinDivertLayer, WinDivertOpen, WinDivertParam, WinDivertRecvEx,
    WinDivertSetParam, WinDivertShutdown, WinDivertShutdownMode,
};
use windows_0_48::Win32::Foundation::HANDLE;

/// Local IPv4 TCP traffic that can matter to stream reassembly. Pure ACKs
/// carry no payload and the reassembler only looks at SYN/FIN/RST on empty
/// segments, so dropping the rest in the kernel loses nothing.
pub const WINDIVERT_FILTER: &str =
    "!loopback && ip && tcp && (tcp.PayloadLength > 0 || tcp.Syn || tcp.Fin || tcp.Rst)";

/// Driver-side queue limits (packet count and bytes at their maximum). Late
/// packets are still useful to a sniffer, so they may wait longer than the
/// 2 s default before the driver drops them.
const QUEUE_LENGTH: u64 = 16_384;
const QUEUE_SIZE_BYTES: u64 = 32 * 1024 * 1024;
const QUEUE_TIME_MS: u64 = 4_000;

/// Packets per receive call. The driver returns as soon as one packet is
/// queued and only adds packets that are already waiting, so batching never
/// delays an idle stream.
const BATCH_PACKETS: usize = 64;
/// Largest packet WinDivert can deliver (`WINDIVERT_MTU_MAX`).
const MAX_PACKET_BYTES: usize = 40 + 0xFFFF;

const IPV4_MIN_HEADER: usize = 20;

/// Owns an open WinDivert handle and closes it on drop.
struct DivertHandle(HANDLE);

impl DivertHandle {
    fn open_sniffer(filter: &str) -> Result<Self, CaptureError> {
        let filter = CString::new(filter)?;
        let flags = WinDivertFlags::new().set_sniff().set_recv_only();
        // SAFETY: `filter` is a valid NUL-terminated string that outlives the
        // call; the remaining arguments are plain values.
        let handle = unsafe { WinDivertOpen(filter.as_ptr(), WinDivertLayer::Network, 0, flags) };
        if handle.is_invalid() {
            return Err(CaptureError::WinDivertOpen(std::io::Error::last_os_error()));
        }
        Ok(Self(handle))
    }

    fn set_param(&self, param: WinDivertParam, value: u64) {
        // SAFETY: `self.0` is an open handle owned by this wrapper.
        let ok = unsafe { WinDivertSetParam(self.0, param, value) };
        if !ok.as_bool() {
            log::warn!(
                target: "app::capture",
                "windivert_set_param_failed param={param:?} value={value} err={}",
                std::io::Error::last_os_error()
            );
        }
    }

    /// Blocks until at least one packet is queued, then fills `buffer` and
    /// `addrs` with every packet already waiting (up to their capacity).
    /// Returns the number of payload bytes and addresses written.
    fn recv_batch(
        &self,
        buffer: &mut [u8],
        addrs: &mut [WINDIVERT_ADDRESS],
    ) -> Result<(usize, usize), CaptureError> {
        let mut recv_len = 0u32;
        let address_size = std::mem::size_of::<WINDIVERT_ADDRESS>();
        let mut addr_len = u32::try_from(std::mem::size_of_val(addrs)).unwrap_or(u32::MAX);
        let buffer_len = u32::try_from(buffer.len()).unwrap_or(u32::MAX);
        // SAFETY: `self.0` is open; `buffer` and `addrs` are exclusively
        // borrowed for the call and their lengths are passed alongside them.
        let ok = unsafe {
            WinDivertRecvEx(
                self.0,
                buffer.as_mut_ptr().cast(),
                buffer_len,
                &mut recv_len,
                0,
                addrs.as_mut_ptr(),
                &mut addr_len,
                std::ptr::null_mut(),
            )
        };
        if !ok.as_bool() {
            return Err(CaptureError::WinDivertRecv(std::io::Error::last_os_error()));
        }
        Ok((recv_len as usize, addr_len as usize / address_size))
    }

    /// Stops queueing new packets. A blocked [`Self::recv_batch`] returns
    /// once the queue is drained, failing with `ERROR_NO_DATA`.
    fn shutdown_recv(&self) {
        // SAFETY: `self.0` is open; WinDivert allows shutdown from another
        // thread while a receive is pending on the same handle.
        unsafe {
            WinDivertShutdown(self.0, WinDivertShutdownMode::Recv);
        }
    }
}

impl Drop for DivertHandle {
    fn drop(&mut self) {
        // SAFETY: the handle is open and dropped exactly once.
        unsafe {
            WinDivertClose(self.0);
        }
    }
}

// SAFETY: a WinDivert handle is a kernel object handle; WinDivert's calls are
// thread-safe, and the wrapper only closes it in `Drop`, which needs exclusive
// ownership.
unsafe impl Send for DivertHandle {}
// SAFETY: see `Send`; shared access only issues receive/shutdown requests.
unsafe impl Sync for DivertHandle {}

pub struct WinDivertSource {
    /// Shared only with read wakers, which hold it weakly.
    handle: Arc<DivertHandle>,
    buffer: Vec<u8>,
    addrs: Vec<WINDIVERT_ADDRESS>,
    qpc_frequency: i64,
    malformed_logged: bool,
}

impl WinDivertSource {
    pub fn open() -> Result<Self, CaptureError> {
        let handle = DivertHandle::open_sniffer(WINDIVERT_FILTER)?;
        handle.set_param(WinDivertParam::QueueLength, QUEUE_LENGTH);
        handle.set_param(WinDivertParam::QueueSize, QUEUE_SIZE_BYTES);
        handle.set_param(WinDivertParam::QueueTime, QUEUE_TIME_MS);
        log::info!(
            target: "app::capture",
            "WinDivert handle opened filter=\"{WINDIVERT_FILTER}\" queue_length={QUEUE_LENGTH} queue_size={QUEUE_SIZE_BYTES} queue_time_ms={QUEUE_TIME_MS} batch={BATCH_PACKETS}"
        );
        Ok(Self {
            handle: Arc::new(handle),
            buffer: vec![0u8; BATCH_PACKETS * MAX_PACKET_BYTES],
            addrs: vec![WINDIVERT_ADDRESS::default(); BATCH_PACKETS],
            qpc_frequency: qpc::frequency(),
            malformed_logged: false,
        })
    }
}

impl PacketSource for WinDivertSource {
    /// Receives one batch and hands every packet to `on_packet`.
    fn pump(
        &mut self,
        on_packet: &mut dyn FnMut(CapturedPacket<'_>),
    ) -> Result<usize, CaptureError> {
        let (recv_len, count) = self.handle.recv_batch(&mut self.buffer, &mut self.addrs)?;
        let now = Instant::now();
        let now_ticks = qpc::now();
        let frequency = self.qpc_frequency;
        let addrs = &self.addrs[..count.min(self.addrs.len())];
        let batch = &self.buffer[..recv_len.min(self.buffer.len())];

        let mut delivered = 0usize;
        let result = split_ipv4_batch(batch, addrs.len(), &mut |index, packet| {
            let age = qpc::ticks_to_duration(now_ticks - addrs[index].timestamp, frequency);
            delivered += 1;
            on_packet(CapturedPacket {
                format: PacketFormat::RawIp,
                data: packet,
                captured_at: now.checked_sub(age).unwrap_or(now),
            });
        });
        if let Err(error) = result
            && !self.malformed_logged
        {
            self.malformed_logged = true;
            log::warn!(target: "app::capture", "windivert_batch_split_stopped err={error:?}");
        }
        Ok(delivered)
    }

    /// WinDivert reads have no timeout; shutting the handle down is the only
    /// way to release a read when capture stops while no traffic arrives.
    fn read_waker(&self) -> Option<ReadWaker> {
        let handle = Arc::downgrade(&self.handle);
        Some(Box::new(move || {
            if let Some(handle) = handle.upgrade() {
                handle.shutdown_recv();
            }
        }))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BatchSplitError {
    /// A packet header was cut off or not IPv4/IPv6.
    BadHeader { index: usize },
    /// A packet claims more bytes than the batch holds.
    Overrun { index: usize },
}

/// Walks `count` back-to-back IP packets in `batch`, using each header's
/// total length, the same way `WinDivertHelperParsePacket` finds the next
/// packet of a batch. Stops at the first inconsistent packet instead of
/// guessing where the following one starts.
pub fn split_ipv4_batch(
    batch: &[u8],
    count: usize,
    on_packet: &mut dyn FnMut(usize, &[u8]),
) -> Result<(), BatchSplitError> {
    let mut offset = 0usize;
    for index in 0..count {
        let rest = &batch[offset.min(batch.len())..];
        let total_len = match rest.first().map(|byte| byte >> 4) {
            Some(4) if rest.len() >= IPV4_MIN_HEADER => {
                usize::from(u16::from_be_bytes([rest[2], rest[3]]))
            }
            Some(6) if rest.len() >= 40 => 40 + usize::from(u16::from_be_bytes([rest[4], rest[5]])),
            _ => return Err(BatchSplitError::BadHeader { index }),
        };
        if total_len < IPV4_MIN_HEADER {
            return Err(BatchSplitError::BadHeader { index });
        }
        let Some(packet) = rest.get(..total_len) else {
            return Err(BatchSplitError::Overrun { index });
        };
        on_packet(index, packet);
        offset += total_len;
    }
    Ok(())
}

/// `QueryPerformanceCounter`, the clock of `WINDIVERT_ADDRESS::timestamp`.
mod qpc {
    use std::time::Duration;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn QueryPerformanceCounter(count: *mut i64) -> i32;
        fn QueryPerformanceFrequency(frequency: *mut i64) -> i32;
    }

    pub fn now() -> i64 {
        let mut ticks = 0i64;
        // SAFETY: writes one i64 through a valid pointer; cannot fail on XP+.
        unsafe {
            QueryPerformanceCounter(&mut ticks);
        }
        ticks
    }

    pub fn frequency() -> i64 {
        let mut frequency = 0i64;
        // SAFETY: writes one i64 through a valid pointer; cannot fail on XP+.
        unsafe {
            QueryPerformanceFrequency(&mut frequency);
        }
        frequency.max(1)
    }

    /// Converts a tick delta to a duration; negative deltas become zero.
    pub fn ticks_to_duration(ticks: i64, frequency: i64) -> Duration {
        let Ok(ticks) = u64::try_from(ticks) else {
            return Duration::ZERO;
        };
        let frequency = frequency.max(1) as u64;
        let secs = ticks / frequency;
        let nanos = (ticks % frequency) * 1_000_000_000 / frequency;
        Duration::new(secs, nanos as u32)
    }
}

#[cfg(test)]
mod tests {
    use super::{BatchSplitError, qpc, split_ipv4_batch};
    use std::time::Duration;

    fn ipv4_packet(total_len: u16, fill: u8) -> Vec<u8> {
        let mut packet = vec![fill; usize::from(total_len)];
        packet[0] = 0x45;
        packet[2..4].copy_from_slice(&total_len.to_be_bytes());
        packet
    }

    fn split(batch: &[u8], count: usize) -> (Vec<(usize, usize)>, Result<(), BatchSplitError>) {
        let mut seen = Vec::new();
        let result = split_ipv4_batch(batch, count, &mut |index, packet| {
            seen.push((index, packet.len()));
        });
        (seen, result)
    }

    #[test]
    fn splits_back_to_back_packets() {
        let mut batch = ipv4_packet(40, 1);
        batch.extend(ipv4_packet(60, 2));
        batch.extend(ipv4_packet(1500, 3));
        let (seen, result) = split(&batch, 3);
        assert_eq!(result, Ok(()));
        assert_eq!(seen, vec![(0, 40), (1, 60), (2, 1500)]);
    }

    #[test]
    fn stops_at_truncated_packet() {
        let mut batch = ipv4_packet(40, 1);
        batch.extend(&ipv4_packet(60, 2)[..30]);
        let (seen, result) = split(&batch, 2);
        assert_eq!(seen, vec![(0, 40)]);
        assert_eq!(result, Err(BatchSplitError::Overrun { index: 1 }));
    }

    #[test]
    fn rejects_zero_total_length() {
        let mut batch = ipv4_packet(40, 1);
        batch[2..4].copy_from_slice(&0u16.to_be_bytes());
        let (seen, result) = split(&batch, 1);
        assert!(seen.is_empty());
        assert_eq!(result, Err(BatchSplitError::BadHeader { index: 0 }));
    }

    #[test]
    fn rejects_length_beyond_buffer() {
        let mut batch = ipv4_packet(40, 1);
        batch[2..4].copy_from_slice(&9000u16.to_be_bytes());
        let (seen, result) = split(&batch, 1);
        assert!(seen.is_empty());
        assert_eq!(result, Err(BatchSplitError::Overrun { index: 0 }));
    }

    #[test]
    fn rejects_unknown_ip_version() {
        let (seen, result) = split(&[0x00; 40], 1);
        assert!(seen.is_empty());
        assert_eq!(result, Err(BatchSplitError::BadHeader { index: 0 }));
    }

    #[test]
    fn converts_qpc_ticks() {
        assert_eq!(qpc::ticks_to_duration(-5, 10_000_000), Duration::ZERO);
        assert_eq!(
            qpc::ticks_to_duration(15_000_000, 10_000_000),
            Duration::from_millis(1500)
        );
    }
}
