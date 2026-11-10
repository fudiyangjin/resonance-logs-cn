use crate::packets::capture_source::{
    CaptureError, CapturedPacket, PacketFormat, PacketSource, SourceDrops,
};
use libloading::{Library, Symbol};
use log::info;
use std::ffi::{CStr, CString};
use std::ptr;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

// Type definitions for pcap functions
type PcapFindAllDevs = unsafe extern "C" fn(*mut *mut PcapIf, *mut i8) -> i32;
type PcapFreeAllDevs = unsafe extern "C" fn(*mut PcapIf);
type PcapCreate = unsafe extern "C" fn(*const i8, *mut i8) -> *mut PcapT;
type PcapSetSnaplen = unsafe extern "C" fn(*mut PcapT, i32) -> i32;
type PcapSetPromisc = unsafe extern "C" fn(*mut PcapT, i32) -> i32;
type PcapSetTimeout = unsafe extern "C" fn(*mut PcapT, i32) -> i32;
type PcapSetBufferSize = unsafe extern "C" fn(*mut PcapT, i32) -> i32;
type PcapActivate = unsafe extern "C" fn(*mut PcapT) -> i32;
type PcapClose = unsafe extern "C" fn(*mut PcapT);
type PcapNextEx = unsafe extern "C" fn(*mut PcapT, *mut *mut PcapPkthdr, *mut *const u8) -> i32;
type PcapGetErr = unsafe extern "C" fn(*mut PcapT) -> *mut i8;
type PcapDataLink = unsafe extern "C" fn(*mut PcapT) -> i32;
type PcapCompile = unsafe extern "C" fn(*mut PcapT, *mut BpfProgram, *const i8, i32, u32) -> i32;
type PcapSetFilter = unsafe extern "C" fn(*mut PcapT, *mut BpfProgram) -> i32;
type PcapFreeCode = unsafe extern "C" fn(*mut BpfProgram);
type PcapSetImmediateMode = unsafe extern "C" fn(*mut PcapT, i32) -> i32;
type PcapHandler = unsafe extern "C" fn(*mut u8, *const PcapPkthdr, *const u8);
type PcapDispatch = unsafe extern "C" fn(*mut PcapT, i32, PcapHandler, *mut u8) -> i32;
type PcapStats = unsafe extern "C" fn(*mut PcapT, *mut PcapStat) -> i32;

const NPCAP_SNAPLEN: i32 = 65_536;
/// Game connections are identified through this host's TCP table, so other
/// hosts' traffic is always discarded; promiscuous mode would only add noise.
const NPCAP_PROMISC: i32 = 0;
const NPCAP_TIMEOUT_MS: i32 = 1_000;
const NPCAP_BUFFER_SIZE: i32 = 64 * 1024 * 1024;
const NPCAP_IMMEDIATE: i32 = 1;
/// IPv4 TCP outside well-known ports, keeping only segments that carry
/// payload or SYN/FIN/RST (the reassembler ignores other empty segments).
const NPCAP_FILTER: &str = "ip and tcp and not portrange 0-1000 and \
(tcp[tcpflags] & (tcp-syn|tcp-fin|tcp-rst) != 0 or \
(ip[2:2] - ((ip[0]&0xf)<<2) - ((tcp[12]&0xf0)>>2)) != 0)";

// Common libpcap datalink constants we care about.
const DLT_NULL: i32 = 0;
const DLT_EN10MB: i32 = 1;
const DLT_RAW: i32 = 12;
const DLT_LOOP: i32 = 108;

#[repr(C)]
pub struct PcapIf {
    pub next: *mut PcapIf,
    pub name: *mut i8,
    pub description: *mut i8,
    pub addresses: *mut PcapAddr,
    pub flags: u32,
}

#[repr(C)]
pub struct PcapAddr {
    pub next: *mut PcapAddr,
    pub addr: *mut libc::sockaddr,
    pub netmask: *mut libc::sockaddr,
    pub broadaddr: *mut libc::sockaddr,
    pub dstaddr: *mut libc::sockaddr,
}

#[repr(C)]
pub struct PcapPkthdr {
    pub ts: libc::timeval,
    pub caplen: u32,
    pub len: u32,
}

/// `struct pcap_stat`. Npcap appends Windows-only counters after the three
/// portable ones; they are reserved here so the call never writes past it.
#[repr(C)]
#[derive(Default)]
struct PcapStat {
    _ps_recv: u32,
    ps_drop: u32,
    ps_ifdrop: u32,
    _ps_capt: u32,
    _ps_sent: u32,
    _ps_netdrop: u32,
}

#[repr(C)]
struct BpfProgram {
    bf_len: u32,
    bf_insns: *mut BpfInsn,
}

#[repr(C)]
struct BpfInsn {
    code: u16,
    jt: u8,
    jf: u8,
    k: u32,
}

pub enum PcapT {}

pub struct NpcapContext {
    lib: Arc<Library>,
}

impl NpcapContext {
    pub fn new() -> Result<Self, String> {
        unsafe {
            let lib = Library::new("wpcap.dll")
                .map_err(|e| format!("Failed to load wpcap.dll: {}", e))?;
            Ok(Self { lib: Arc::new(lib) })
        }
    }

    pub fn list_devices(&self) -> Result<Vec<Device>, String> {
        let mut devices = Vec::new();
        unsafe {
            let find_all_devs: Symbol<PcapFindAllDevs> = self
                .lib
                .get(b"pcap_findalldevs")
                .map_err(|e| e.to_string())?;
            let free_all_devs: Symbol<PcapFreeAllDevs> = self
                .lib
                .get(b"pcap_freealldevs")
                .map_err(|e| e.to_string())?;

            let mut alldevs: *mut PcapIf = ptr::null_mut();
            let mut errbuf = [0i8; 256];

            if find_all_devs(&mut alldevs, errbuf.as_mut_ptr()) == -1 {
                return Err(CStr::from_ptr(errbuf.as_ptr())
                    .to_string_lossy()
                    .into_owned());
            }

            let mut curr = alldevs;
            while !curr.is_null() {
                let name = CStr::from_ptr((*curr).name).to_string_lossy().into_owned();
                let description = if !(*curr).description.is_null() {
                    Some(
                        CStr::from_ptr((*curr).description)
                            .to_string_lossy()
                            .into_owned(),
                    )
                } else {
                    None
                };

                devices.push(Device { name, description });
                curr = (*curr).next;
            }

            free_all_devs(alldevs);
        }
        Ok(devices)
    }
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct Device {
    pub name: String,
    pub description: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn get_network_devices() -> Result<Vec<Device>, String> {
    let context = NpcapContext::new()?;
    context.list_devices()
}

#[tauri::command]
#[specta::specta]
pub fn check_npcap_status() -> bool {
    NpcapContext::new().is_ok()
}

pub struct NpcapCapture {
    handle: *mut PcapT,
    #[allow(dead_code)] // Kept alive to ensure fn ptrs remain valid
    lib: Arc<Library>,
    data_link: i32,
    #[allow(dead_code)] // Legacy fallback for next_packet()
    fn_next_ex: PcapNextEx,
    fn_get_err: PcapGetErr,
    fn_close: PcapClose,
    fn_dispatch: PcapDispatch,
    fn_stats: Option<PcapStats>,
}

// SAFETY: the pcap handle is only used by the thread that owns this value.
unsafe impl Send for NpcapCapture {}

impl NpcapCapture {
    pub fn new(device_name: &str) -> Result<Self, String> {
        let context = NpcapContext::new()?;
        unsafe {
            let create: Symbol<PcapCreate> =
                context.lib.get(b"pcap_create").map_err(|e| e.to_string())?;
            let set_snaplen: Symbol<PcapSetSnaplen> = context
                .lib
                .get(b"pcap_set_snaplen")
                .map_err(|e| e.to_string())?;
            let set_promisc: Symbol<PcapSetPromisc> = context
                .lib
                .get(b"pcap_set_promisc")
                .map_err(|e| e.to_string())?;
            let set_timeout: Symbol<PcapSetTimeout> = context
                .lib
                .get(b"pcap_set_timeout")
                .map_err(|e| e.to_string())?;
            let set_buffer_size: Symbol<PcapSetBufferSize> = context
                .lib
                .get(b"pcap_set_buffer_size")
                .map_err(|e| e.to_string())?;
            let set_immediate: Symbol<PcapSetImmediateMode> = context
                .lib
                .get(b"pcap_set_immediate_mode")
                .map_err(|e| e.to_string())?;
            let activate: Symbol<PcapActivate> = context
                .lib
                .get(b"pcap_activate")
                .map_err(|e| e.to_string())?;
            let close: Symbol<PcapClose> =
                context.lib.get(b"pcap_close").map_err(|e| e.to_string())?;
            let get_err: Symbol<PcapGetErr> =
                context.lib.get(b"pcap_geterr").map_err(|e| e.to_string())?;
            let data_link_fn: Symbol<PcapDataLink> = context
                .lib
                .get(b"pcap_datalink")
                .map_err(|e| e.to_string())?;
            let compile: Symbol<PcapCompile> = context
                .lib
                .get(b"pcap_compile")
                .map_err(|e| e.to_string())?;
            let set_filter: Symbol<PcapSetFilter> = context
                .lib
                .get(b"pcap_setfilter")
                .map_err(|e| e.to_string())?;
            let free_code: Symbol<PcapFreeCode> = context
                .lib
                .get(b"pcap_freecode")
                .map_err(|e| e.to_string())?;

            // Cache hot-path fn ptrs once; valid as long as Arc<Library> is alive.
            let fn_next_ex: PcapNextEx = *context
                .lib
                .get::<PcapNextEx>(b"pcap_next_ex")
                .map_err(|e| e.to_string())?;
            let fn_get_err: PcapGetErr = *get_err;
            let fn_close: PcapClose = *close;
            let fn_dispatch: PcapDispatch = *context
                .lib
                .get::<PcapDispatch>(b"pcap_dispatch")
                .map_err(|e| e.to_string())?;
            let fn_stats: Option<PcapStats> =
                context.lib.get::<PcapStats>(b"pcap_stats").ok().map(|f| *f);

            let device_c = CString::new(device_name).map_err(|e| e.to_string())?;
            let mut errbuf = [0i8; 256];

            let handle = create(device_c.as_ptr(), errbuf.as_mut_ptr());

            if handle.is_null() {
                return Err(CStr::from_ptr(errbuf.as_ptr())
                    .to_string_lossy()
                    .into_owned());
            }

            let configure = || -> Result<(), String> {
                if set_snaplen(handle, NPCAP_SNAPLEN) != 0 {
                    return Err(format!(
                        "pcap_set_snaplen failed: {}",
                        pcap_error(*get_err, handle)
                    ));
                }
                if set_promisc(handle, NPCAP_PROMISC) != 0 {
                    return Err(format!(
                        "pcap_set_promisc failed: {}",
                        pcap_error(*get_err, handle)
                    ));
                }
                if set_timeout(handle, NPCAP_TIMEOUT_MS) != 0 {
                    return Err(format!(
                        "pcap_set_timeout failed: {}",
                        pcap_error(*get_err, handle)
                    ));
                }
                if set_immediate(handle, NPCAP_IMMEDIATE) != 0 {
                    return Err(format!(
                        "pcap_set_immediate_mode failed: {}",
                        pcap_error(*get_err, handle)
                    ));
                }
                if set_buffer_size(handle, NPCAP_BUFFER_SIZE) != 0 {
                    return Err(format!(
                        "pcap_set_buffer_size failed: {}",
                        pcap_error(*get_err, handle)
                    ));
                }

                let activate_result = activate(handle);
                if activate_result < 0 {
                    return Err(format!(
                        "pcap_activate failed ({}): {}",
                        activate_result,
                        pcap_error(*get_err, handle)
                    ));
                }
                if activate_result > 0 {
                    log::warn!(
                        "pcap_activate warning ({}) for device {}: {}",
                        activate_result,
                        device_name,
                        pcap_error(*get_err, handle)
                    );
                }

                set_bpf_filter(
                    handle,
                    *compile,
                    *set_filter,
                    *free_code,
                    *get_err,
                    NPCAP_FILTER,
                )?;

                Ok(())
            };

            if let Err(err) = configure() {
                close(handle);
                return Err(err);
            }

            info!(
                "Npcap handle configured device={} buffer_size={} bytes snaplen={} timeout_ms={} immediate={} filter={}",
                device_name,
                NPCAP_BUFFER_SIZE,
                NPCAP_SNAPLEN,
                NPCAP_TIMEOUT_MS,
                NPCAP_IMMEDIATE,
                NPCAP_FILTER
            );

            let data_link = data_link_fn(handle);
            static LOGGED_DLT: OnceLock<i32> = OnceLock::new();
            if LOGGED_DLT.set(data_link).is_ok() {
                info!(
                    "Npcap datalink type for device {}: {}",
                    device_name, data_link
                );
            }

            Ok(Self {
                handle,
                lib: context.lib,
                data_link,
                fn_next_ex,
                fn_get_err,
                fn_close,
                fn_dispatch,
                fn_stats,
            })
        }
    }

    /// Cumulative drop counters from `pcap_stats`.
    pub fn stats(&self) -> Option<SourceDrops> {
        let stats_fn = self.fn_stats?;
        let mut stat = PcapStat::default();
        // SAFETY: `handle` is an activated pcap handle and `stat` is a valid,
        // writable `pcap_stat` (with room for the Windows extension fields).
        let result = unsafe { stats_fn(self.handle, &mut stat) };
        (result == 0).then_some(SourceDrops {
            buffer: u64::from(stat.ps_drop),
            interface: u64::from(stat.ps_ifdrop),
        })
    }

    pub fn datalink(&self) -> i32 {
        self.data_link
    }

    #[inline]
    #[allow(dead_code)] // Legacy fallback; dispatch_batch is the primary path
    pub fn next_packet(&self) -> Result<Option<Vec<u8>>, String> {
        unsafe {
            let mut header: *mut PcapPkthdr = ptr::null_mut();
            let mut data: *const u8 = ptr::null();

            let res = (self.fn_next_ex)(self.handle, &mut header, &mut data);

            match res {
                1 => {
                    let len = (*header).caplen as usize;
                    let packet_data = std::slice::from_raw_parts(data, len).to_vec();
                    Ok(Some(packet_data))
                }
                0 => Ok(None),
                -1 => Err(format!(
                    "Error reading packet: {}",
                    pcap_error(self.fn_get_err, self.handle)
                )),
                -2 => Ok(None),
                _ => Err(format!("Unknown pcap_next_ex return code: {}", res)),
            }
        }
    }

    /// Dispatch up to `max` packets via a callback, returning the number processed.
    ///
    /// The callback receives the raw packet bytes (lifetime limited to the call)
    /// and the capture time from the packet header, in microseconds since the
    /// Unix epoch. Pass `max = -1` to drain the entire kernel buffer in one syscall.
    ///
    /// # Safety
    /// The `&[u8]` passed to `on_packet` is only valid for the duration of the
    /// callback invocation. The closure **must not** store the slice beyond return.
    /// Panics inside `on_packet` are caught via `catch_unwind` to avoid UB across
    /// the FFI boundary.
    pub fn dispatch_batch<F: FnMut(&[u8], i64)>(
        &self,
        max: i32,
        on_packet: &mut F,
    ) -> Result<i32, String> {
        unsafe extern "C" fn trampoline<F: FnMut(&[u8], i64)>(
            user: *mut u8,
            header: *const PcapPkthdr,
            data: *const u8,
        ) {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                // SAFETY: `user` is the `&mut F` pointer we passed to pcap_dispatch.
                // `header`/`data` are valid for the duration of this callback per libpcap.
                unsafe {
                    let f = &mut *(user as *mut F);
                    let len = (*header).caplen as usize;
                    let ts = (*header).ts;
                    let captured_us = i64::from(ts.tv_sec) * 1_000_000 + i64::from(ts.tv_usec);
                    let slice = std::slice::from_raw_parts(data, len);
                    f(slice, captured_us);
                }
            }));
            if result.is_err() {
                log::error!("panic caught inside pcap_dispatch callback");
            }
        }

        let user_ptr = on_packet as *mut F as *mut u8;
        let res = unsafe { (self.fn_dispatch)(self.handle, max, trampoline::<F>, user_ptr) };

        match res {
            n if n >= 0 => Ok(n),
            -1 => Err(format!("pcap_dispatch error: {}", unsafe {
                pcap_error(self.fn_get_err, self.handle)
            })),
            -2 => Ok(0), // breakloop (treat as zero processed)
            other => Err(format!("pcap_dispatch unknown return: {}", other)),
        }
    }
}

unsafe fn pcap_error(get_err: PcapGetErr, handle: *mut PcapT) -> String {
    let err = unsafe { get_err(handle) };
    if err.is_null() {
        "unknown pcap error".to_string()
    } else {
        unsafe { CStr::from_ptr(err) }
            .to_string_lossy()
            .into_owned()
    }
}

fn set_bpf_filter(
    handle: *mut PcapT,
    compile: PcapCompile,
    set_filter: PcapSetFilter,
    free_code: PcapFreeCode,
    get_err: PcapGetErr,
    filter: &str,
) -> Result<(), String> {
    let filter_c = CString::new(filter).map_err(|e| e.to_string())?;
    let mut program = BpfProgram {
        bf_len: 0,
        bf_insns: ptr::null_mut(),
    };

    let compile_result = unsafe { compile(handle, &mut program, filter_c.as_ptr(), 1, 0) };
    if compile_result != 0 {
        return Err(format!(
            "pcap_compile failed for filter {:?}: {}",
            filter,
            unsafe { pcap_error(get_err, handle) }
        ));
    }

    let set_result = unsafe { set_filter(handle, &mut program) };
    unsafe {
        free_code(&mut program);
    }

    if set_result != 0 {
        return Err(format!(
            "pcap_setfilter failed for filter {:?}: {}",
            filter,
            unsafe { pcap_error(get_err, handle) }
        ));
    }

    Ok(())
}

impl Drop for NpcapCapture {
    fn drop(&mut self) {
        unsafe {
            (self.fn_close)(self.handle);
        }
    }
}

/// Npcap capture on one device, normalised to raw IP or Ethernet frames.
pub struct NpcapSource {
    capture: NpcapCapture,
}

impl NpcapSource {
    pub fn open(device: &str) -> Result<Self, CaptureError> {
        if device.trim().is_empty() {
            return Err(CaptureError::Npcap("device is empty".to_string()));
        }

        let capture = NpcapCapture::new(device).map_err(CaptureError::Npcap)?;
        info!(target: "app::capture", "Npcap handle opened device={}", device);
        Ok(Self { capture })
    }
}

impl PacketSource for NpcapSource {
    fn pump(
        &mut self,
        on_packet: &mut dyn FnMut(CapturedPacket<'_>),
    ) -> Result<usize, CaptureError> {
        let datalink = self.capture.datalink();
        let format = packet_format_for_datalink(datalink);
        // Every packet of this dispatch was buffered before the call, so one
        // clock anchor serves the whole batch.
        let anchor = ClockAnchor::now();
        let mut delivered = 0usize;
        self.capture
            .dispatch_batch(-1, &mut |raw_pkt: &[u8], captured_us: i64| {
                let Some(data) = normalize_slice_for_datalink(raw_pkt, datalink) else {
                    return;
                };
                delivered += 1;
                on_packet(CapturedPacket {
                    format,
                    data,
                    captured_at: anchor.instant_for_wall_us(captured_us),
                });
            })
            .map_err(CaptureError::Npcap)?;
        Ok(delivered)
    }

    fn drops(&mut self) -> Option<SourceDrops> {
        self.capture.stats()
    }
}

/// A matching pair of `Instant` and wall-clock readings, used to map pcap
/// header timestamps (wall clock) onto `Instant`.
#[derive(Clone, Copy)]
struct ClockAnchor {
    instant: Instant,
    wall_us: i64,
}

impl ClockAnchor {
    fn now() -> Self {
        Self {
            instant: Instant::now(),
            wall_us: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|elapsed| i64::try_from(elapsed.as_micros()).unwrap_or(i64::MAX))
                .unwrap_or_default(),
        }
    }

    /// Times after the anchor (clock adjustments) map to the anchor itself.
    fn instant_for_wall_us(self, captured_us: i64) -> Instant {
        let age_us = u64::try_from(self.wall_us.saturating_sub(captured_us)).unwrap_or(0);
        self.instant
            .checked_sub(Duration::from_micros(age_us))
            .unwrap_or(self.instant)
    }
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
        log::warn!(
            "Unsupported DLT_NULL/LOOP family {} (datalink {}), dropping packets",
            family,
            datalink
        );
    }
}

fn log_unsupported_datalink(datalink: i32) {
    static LOGGED_DLT: OnceLock<i32> = OnceLock::new();
    if LOGGED_DLT.set(datalink).is_ok() {
        log::warn!(
            "Unsupported Npcap datalink type {}, dropping packets",
            datalink
        );
    }
}
