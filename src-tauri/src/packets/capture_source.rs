//! Types shared by the packet sources (WinDivert, Npcap) and the capture
//! thread that drives them.

use std::time::Instant;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PacketFormat {
    RawIp,
    Ethernet,
    Unsupported,
}

/// One packet as delivered by a capture driver. `data` is only valid for the
/// duration of the callback it is passed to.
pub struct CapturedPacket<'a> {
    pub format: PacketFormat,
    pub data: &'a [u8],
    /// When the driver captured the packet, mapped onto `Instant`.
    pub captured_at: Instant,
}

/// Cumulative kernel-side drop counters, when the driver reports them.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SourceDrops {
    /// Dropped because the capture buffer was full.
    pub buffer: u64,
    /// Dropped by the network interface or its driver.
    pub interface: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("failed to open windivert handle")]
    WinDivertOpen(#[source] std::io::Error),
    #[error("windivert receive failed")]
    WinDivertRecv(#[source] std::io::Error),
    #[error("npcap: {0}")]
    Npcap(String),
    #[error("capture filter contains a NUL byte")]
    InvalidFilter(#[from] std::ffi::NulError),
}

/// Makes a source's blocked read return, callable from any thread. Holding
/// it must not keep the source's handle alive.
pub type ReadWaker = Box<dyn Fn() + Send + Sync>;

pub trait PacketSource: Send {
    /// Blocks until packets are available (or a source timeout elapses) and
    /// hands each one to `on_packet`. Returns the number delivered.
    ///
    /// # Errors
    /// Returns an error when the driver handle failed and must be reopened.
    fn pump(
        &mut self,
        on_packet: &mut dyn FnMut(CapturedPacket<'_>),
    ) -> Result<usize, CaptureError>;

    /// Kernel drop counters, if the source exposes them.
    fn drops(&mut self) -> Option<SourceDrops> {
        None
    }

    /// A waker for reads that can block indefinitely. Sources whose reads
    /// time out on their own (Npcap) need none.
    fn read_waker(&self) -> Option<ReadWaker> {
        None
    }
}
