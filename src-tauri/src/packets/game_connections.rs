use crate::packets::utils::Server;
use std::collections::{HashMap, HashSet};

const GAME_PROCESS_NAMES: &[&str] = &[
    "bpsr",
    "bpsr_steam",
    "bpsr_epic",
    "starsea",
    "starasia",
    "starsea_steam",
    "starasia_steam",
    "star",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct Endpoint {
    addr: [u8; 4],
    port: u16,
}

impl Endpoint {
    fn new(addr: [u8; 4], port: u16) -> Self {
        Self { addr, port }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct FlowKey([u8; 12]);

impl FlowKey {
    fn from_server(server: Server) -> Self {
        Self::from_endpoints(
            Endpoint::new(server.source_addr(), server.source_port()),
            Endpoint::new(server.destination_addr(), server.destination_port()),
        )
    }

    fn from_endpoints(a: Endpoint, b: Endpoint) -> Self {
        let left = (a.addr, a.port);
        let right = (b.addr, b.port);
        let ((first_addr, first_port), (second_addr, second_port)) = if left <= right {
            (left, right)
        } else {
            (right, left)
        };

        let mut key = [0u8; 12];
        key[..4].copy_from_slice(&first_addr);
        key[4..6].copy_from_slice(&first_port.to_be_bytes());
        key[6..10].copy_from_slice(&second_addr);
        key[10..12].copy_from_slice(&second_port.to_be_bytes());
        Self(key)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Game,
    NonGame,
}

struct TcpTableSnapshot {
    game_endpoints: HashSet<Endpoint>,
    non_game_flows: HashSet<FlowKey>,
    pid_cache: HashMap<u32, bool>,
}

type SnapshotFn =
    fn(&HashSet<&'static str>, &HashMap<u32, bool>) -> Result<TcpTableSnapshot, String>;

pub struct GameConnectionFilter {
    game_endpoints: HashSet<Endpoint>,
    non_game_flows: HashSet<FlowKey>,
    pid_cache: HashMap<u32, bool>,
    process_names: HashSet<&'static str>,
    snapshot: SnapshotFn,
}

impl GameConnectionFilter {
    pub fn new() -> Self {
        Self {
            game_endpoints: HashSet::new(),
            non_game_flows: HashSet::new(),
            pid_cache: HashMap::new(),
            process_names: GAME_PROCESS_NAMES.iter().copied().collect(),
            snapshot: platform::snapshot_tcp_table,
        }
    }

    pub fn classify(&mut self, server: Server) -> Verdict {
        if self.contains_positive(server) {
            return Verdict::Game;
        }

        let flow = FlowKey::from_server(server);
        if self.non_game_flows.contains(&flow) {
            return Verdict::NonGame;
        }

        self.refresh();

        if self.contains_positive(server) {
            return Verdict::Game;
        }

        self.non_game_flows.insert(flow);
        Verdict::NonGame
    }

    pub fn forget_flow(&mut self, server: Server) {
        self.non_game_flows.remove(&FlowKey::from_server(server));
    }

    fn contains_positive(&self, server: Server) -> bool {
        self.contains_endpoint(server.source_addr(), server.source_port())
            || self.contains_endpoint(server.destination_addr(), server.destination_port())
    }

    fn contains_endpoint(&self, addr: [u8; 4], port: u16) -> bool {
        self.game_endpoints.contains(&Endpoint::new(addr, port))
    }

    fn refresh(&mut self) {
        match (self.snapshot)(&self.process_names, &self.pid_cache) {
            Ok(snapshot) => {
                self.game_endpoints = snapshot.game_endpoints;
                self.non_game_flows = snapshot.non_game_flows;
                self.pid_cache = snapshot.pid_cache;
            }
            Err(err) => {
                log::debug!(target: "app::capture", "failed to refresh game TCP connections: {err}");
            }
        }
    }
}

impl Default for GameConnectionFilter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
mod platform {
    use super::{Endpoint, FlowKey, HashMap, HashSet, TcpTableSnapshot};
    use std::ffi::OsString;
    use std::mem::size_of;
    use std::os::raw::c_void;
    use std::os::windows::ffi::OsStringExt;
    use std::ptr::null_mut;

    const AF_INET: u32 = 2;
    const TCP_TABLE_OWNER_PID_ALL: u32 = 5;
    const NO_ERROR: u32 = 0;
    const ERROR_INSUFFICIENT_BUFFER: u32 = 122;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;

    type Handle = *mut c_void;

    #[repr(C)]
    struct TcpRowOwnerPid {
        state: u32,
        local_addr: [u8; 4],
        local_port: [u8; 4],
        remote_addr: [u8; 4],
        remote_port: [u8; 4],
        owning_pid: u32,
    }

    #[link(name = "iphlpapi")]
    unsafe extern "system" {
        fn GetExtendedTcpTable(
            tcp_table: *mut c_void,
            tcp_table_length: *mut u32,
            sort: i32,
            ip_version: u32,
            tcp_table_type: u32,
            reserved: u32,
        ) -> u32;
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> Handle;
        fn QueryFullProcessImageNameW(
            process: Handle,
            flags: u32,
            exe_name: *mut u16,
            size: *mut u32,
        ) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
    }

    pub fn snapshot_tcp_table(
        process_names: &HashSet<&'static str>,
        previous_pid_cache: &HashMap<u32, bool>,
    ) -> Result<TcpTableSnapshot, String> {
        let rows = tcp_rows()?;
        let mut game_endpoints = HashSet::new();
        let mut non_game_flows = HashSet::new();
        let mut pid_cache = HashMap::new();

        for row in rows {
            if row.remote_addr == [0, 0, 0, 0] {
                continue;
            }

            let is_target = match pid_cache.get(&row.owning_pid) {
                Some(is_target) => *is_target,
                None => {
                    let is_target = previous_pid_cache
                        .get(&row.owning_pid)
                        .copied()
                        .unwrap_or_else(|| {
                            process_name(row.owning_pid)
                                .as_deref()
                                .is_some_and(|name| process_names.contains(name))
                        });
                    pid_cache.insert(row.owning_pid, is_target);
                    is_target
                }
            };

            let local = Endpoint::new(row.local_addr, port_from_bytes(row.local_port));
            let remote = Endpoint::new(row.remote_addr, port_from_bytes(row.remote_port));

            if is_target {
                game_endpoints.insert(local);
                game_endpoints.insert(remote);
            } else {
                non_game_flows.insert(FlowKey::from_endpoints(local, remote));
            }
        }

        Ok(TcpTableSnapshot {
            game_endpoints,
            non_game_flows,
            pid_cache,
        })
    }

    fn tcp_rows() -> Result<Vec<TcpRowOwnerPid>, String> {
        let mut table_len = 0u32;
        let first = unsafe {
            GetExtendedTcpTable(
                null_mut(),
                &mut table_len,
                0,
                AF_INET,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        };

        if first != ERROR_INSUFFICIENT_BUFFER && first != NO_ERROR {
            return Err(format!("GetExtendedTcpTable sizing failed with {first}"));
        }

        let mut table = vec![0u8; table_len as usize];
        let result = unsafe {
            GetExtendedTcpTable(
                table.as_mut_ptr().cast(),
                &mut table_len,
                0,
                AF_INET,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        };

        if result != NO_ERROR {
            return Err(format!("GetExtendedTcpTable failed with {result}"));
        }

        if table.len() < size_of::<u32>() {
            return Ok(Vec::new());
        }

        let count = u32::from_ne_bytes(table[0..4].try_into().map_err(|e| format!("{e}"))?);
        let rows_start = size_of::<u32>();
        let row_size = size_of::<TcpRowOwnerPid>();
        let mut rows = Vec::with_capacity(count as usize);

        for idx in 0..count as usize {
            let start = rows_start + idx * row_size;
            let end = start + row_size;
            if end > table.len() {
                break;
            }
            let row = unsafe { std::ptr::read_unaligned(table[start..end].as_ptr().cast()) };
            rows.push(row);
        }

        Ok(rows)
    }

    fn port_from_bytes(port: [u8; 4]) -> u16 {
        u16::from_be_bytes([port[0], port[1]])
    }

    fn process_name(pid: u32) -> Option<String> {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return None;
        }

        let mut buffer = vec![0u16; 1024];
        let mut len = buffer.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut len) };
        unsafe {
            CloseHandle(handle);
        }

        if ok == 0 || len == 0 {
            return None;
        }

        let path = OsString::from_wide(&buffer[..len as usize]);
        let file_name = std::path::Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())?;
        Some(
            file_name
                .trim_end_matches(".exe")
                .trim_end_matches(".EXE")
                .to_ascii_lowercase(),
        )
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{HashMap, HashSet, TcpTableSnapshot};

    pub fn snapshot_tcp_table(
        _process_names: &HashSet<&'static str>,
        _previous_pid_cache: &HashMap<u32, bool>,
    ) -> Result<TcpTableSnapshot, String> {
        Ok(TcpTableSnapshot {
            game_endpoints: HashSet::new(),
            non_game_flows: HashSet::new(),
            pid_cache: HashMap::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    thread_local! {
        static SNAPSHOT_CALLS: Cell<usize> = const { Cell::new(0) };
    }

    fn server() -> Server {
        Server::new([10, 0, 0, 1], 40000, [20, 0, 0, 1], 50000)
    }

    fn reversed_server() -> Server {
        Server::new([20, 0, 0, 1], 50000, [10, 0, 0, 1], 40000)
    }

    fn endpoint(addr: [u8; 4], port: u16) -> Endpoint {
        Endpoint::new(addr, port)
    }

    fn snapshot_with_game(
        _process_names: &HashSet<&'static str>,
        _previous_pid_cache: &HashMap<u32, bool>,
    ) -> Result<TcpTableSnapshot, String> {
        SNAPSHOT_CALLS.with(|calls| calls.set(calls.get() + 1));
        Ok(TcpTableSnapshot {
            game_endpoints: HashSet::from([endpoint([10, 0, 0, 1], 40000)]),
            non_game_flows: HashSet::from([FlowKey::from_endpoints(
                endpoint([1, 1, 1, 1], 1111),
                endpoint([2, 2, 2, 2], 2222),
            )]),
            pid_cache: HashMap::from([(123, true), (456, false)]),
        })
    }

    fn empty_snapshot(
        _process_names: &HashSet<&'static str>,
        _previous_pid_cache: &HashMap<u32, bool>,
    ) -> Result<TcpTableSnapshot, String> {
        SNAPSHOT_CALLS.with(|calls| calls.set(calls.get() + 1));
        Ok(TcpTableSnapshot {
            game_endpoints: HashSet::new(),
            non_game_flows: HashSet::new(),
            pid_cache: HashMap::new(),
        })
    }

    fn filter_with_snapshot(snapshot: SnapshotFn) -> GameConnectionFilter {
        GameConnectionFilter {
            game_endpoints: HashSet::new(),
            non_game_flows: HashSet::new(),
            pid_cache: HashMap::new(),
            process_names: GAME_PROCESS_NAMES.iter().copied().collect(),
            snapshot,
        }
    }

    fn reset_calls() {
        SNAPSHOT_CALLS.with(|calls| calls.set(0));
    }

    fn snapshot_calls() -> usize {
        SNAPSHOT_CALLS.with(Cell::get)
    }

    #[test]
    fn classify_returns_game_when_endpoint_cached() {
        let mut filter = filter_with_snapshot(empty_snapshot);
        filter.game_endpoints.insert(endpoint([10, 0, 0, 1], 40000));

        assert_eq!(filter.classify(server()), Verdict::Game);
        assert_eq!(filter.classify(reversed_server()), Verdict::Game);
    }

    #[test]
    fn classify_returns_non_game_when_flow_cached() {
        let mut filter = filter_with_snapshot(empty_snapshot);
        filter.non_game_flows.insert(FlowKey::from_server(server()));

        assert_eq!(filter.classify(server()), Verdict::NonGame);
        assert_eq!(filter.classify(reversed_server()), Verdict::NonGame);
    }

    #[test]
    fn classify_triggers_refresh_on_miss() {
        reset_calls();
        let mut filter = filter_with_snapshot(snapshot_with_game);

        assert_eq!(filter.classify(server()), Verdict::Game);
        assert_eq!(snapshot_calls(), 1);
    }

    #[test]
    fn refresh_rebuilds_all_collections() {
        let mut filter = filter_with_snapshot(snapshot_with_game);
        filter
            .game_endpoints
            .insert(endpoint([99, 99, 99, 99], 9999));
        filter.non_game_flows.insert(FlowKey::from_endpoints(
            endpoint([3, 3, 3, 3], 3333),
            endpoint([4, 4, 4, 4], 4444),
        ));
        filter.pid_cache.insert(999, false);

        filter.refresh();

        assert!(filter.contains_endpoint([10, 0, 0, 1], 40000));
        assert!(!filter.contains_endpoint([99, 99, 99, 99], 9999));
        assert_eq!(filter.pid_cache, HashMap::from([(123, true), (456, false)]));
        assert!(!filter.non_game_flows.contains(&FlowKey::from_endpoints(
            endpoint([3, 3, 3, 3], 3333),
            endpoint([4, 4, 4, 4], 4444),
        )));
    }

    #[test]
    fn forget_flow_drops_negative_cache() {
        reset_calls();
        let mut filter = filter_with_snapshot(empty_snapshot);
        filter.non_game_flows.insert(FlowKey::from_server(server()));

        filter.forget_flow(server());

        assert_eq!(filter.classify(server()), Verdict::NonGame);
        assert_eq!(snapshot_calls(), 1);
    }
}
