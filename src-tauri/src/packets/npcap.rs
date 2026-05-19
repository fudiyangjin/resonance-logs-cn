use libloading::{Library, Symbol};
use log::info;
use std::ffi::{CStr, CString};
use std::ptr;
use std::sync::Arc;
use std::sync::OnceLock;

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

const NPCAP_SNAPLEN: i32 = 65_536;
const NPCAP_PROMISC: i32 = 1;
const NPCAP_TIMEOUT_MS: i32 = 1_000;
const NPCAP_BUFFER_SIZE: i32 = 64 * 1024 * 1024;

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
    lib: Arc<Library>,
    data_link: i32,
}

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
                    "tcp and not portrange 0-1000",
                )?;

                Ok(())
            };

            if let Err(err) = configure() {
                close(handle);
                return Err(err);
            }

            info!(
                "Npcap handle configured device={} buffer_size={} bytes snaplen={} timeout_ms={} filter={}",
                device_name,
                NPCAP_BUFFER_SIZE,
                NPCAP_SNAPLEN,
                NPCAP_TIMEOUT_MS,
                "tcp and not portrange 0-1000"
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
            })
        }
    }

    pub fn datalink(&self) -> i32 {
        self.data_link
    }

    pub fn next_packet(&self) -> Result<Option<Vec<u8>>, String> {
        unsafe {
            let next_ex: Symbol<PcapNextEx> =
                self.lib.get(b"pcap_next_ex").map_err(|e| e.to_string())?;

            let mut header: *mut PcapPkthdr = ptr::null_mut();
            let mut data: *const u8 = ptr::null();

            let res = next_ex(self.handle, &mut header, &mut data);

            match res {
                1 => {
                    // Success
                    let len = (*header).caplen as usize;
                    let packet_data = std::slice::from_raw_parts(data, len).to_vec();
                    Ok(Some(packet_data))
                }
                0 => Ok(None), // Timeout
                -1 => {
                    let get_err: Symbol<PcapGetErr> =
                        self.lib.get(b"pcap_geterr").map_err(|e| e.to_string())?;
                    Err(format!(
                        "Error reading packet: {}",
                        pcap_error(*get_err, self.handle)
                    ))
                }
                -2 => Ok(None), // EOF
                _ => Err(format!("Unknown pcap_next_ex return code: {}", res)),
            }
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
            if let Ok(close) = self.lib.get::<PcapClose>(b"pcap_close") {
                close(self.handle);
            }
        }
    }
}
