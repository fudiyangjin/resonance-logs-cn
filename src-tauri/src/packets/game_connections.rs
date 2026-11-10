use crate::packets::utils::Server;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

/// Minimum spacing of the snapshots that re-check flows missing from an
/// earlier one. Such flows (stray packets of closed connections, rewritten
/// tuples) would otherwise force a snapshot on every packet; the spacing also
/// bounds how long a game connection stays ignored after a failed snapshot or
/// one taken before its row appeared.
const ABSENT_RECHECK_INTERVAL: Duration = Duration::from_secs(1);
/// Absent flows not re-checked for this long are forgotten.
const ABSENT_FLOW_TTL: Duration = Duration::from_secs(60);

const GAME_PROCESS_NAMES: &[&str] = &[
    "bpsr",
    "bpsr_steam",
    "bpsr_epic",
    "starsea",
    "starasia",
    "startw",
    "starsea_steam",
    "starasia_steam",
    "star",
];

/// Game distribution: the process name without its `_steam` / `_epic` launcher
/// suffix. Launchers of one distribution share servers, so teammates on
/// different launchers must land in the same team-share room.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Distribution {
    Bpsr = 1,
    StarSea = 2,
    StarAsia = 3,
    StarTw = 4,
    Star = 5,
}

impl Distribution {
    const ALL: [Self; 5] = [
        Self::Bpsr,
        Self::StarSea,
        Self::StarAsia,
        Self::StarTw,
        Self::Star,
    ];

    /// `stem` is the lowercase process file name without `.exe`.
    #[must_use]
    pub fn from_process_stem(stem: &str) -> Option<Self> {
        let base = stem
            .strip_suffix("_steam")
            .or_else(|| stem.strip_suffix("_epic"))
            .unwrap_or(stem);
        Self::ALL.into_iter().find(|dist| dist.as_str() == base)
    }

    /// Wire code of the team-share protocol.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Bpsr => "bpsr",
            Self::StarSea => "starsea",
            Self::StarAsia => "starasia",
            Self::StarTw => "startw",
            Self::Star => "star",
        }
    }

    /// One-byte payload of the synthetic game-client envelope.
    #[must_use]
    pub const fn code(self) -> u8 {
        self as u8
    }

    #[must_use]
    pub fn from_code(code: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|dist| dist.code() == code)
    }
}

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
    Game(Distribution),
    NonGame,
}

type PidCache = HashMap<u32, Option<Distribution>>;

struct TcpTableSnapshot {
    game_endpoints: HashMap<Endpoint, Distribution>,
    non_game_flows: HashSet<FlowKey>,
    pid_cache: PidCache,
}

type SnapshotFn = fn(&HashSet<&'static str>, &PidCache) -> Result<TcpTableSnapshot, String>;

pub struct GameConnectionFilter {
    game_endpoints: HashMap<Endpoint, Distribution>,
    non_game_flows: HashSet<FlowKey>,
    /// Flows missing from the snapshot that last checked them, with when it
    /// did. Kept across refreshes, unlike `non_game_flows`, which each
    /// snapshot replaces.
    absent_flows: HashMap<FlowKey, Instant>,
    /// When the last snapshot was attempted, successful or not.
    last_snapshot: Option<Instant>,
    pid_cache: PidCache,
    process_names: HashSet<&'static str>,
    snapshot: SnapshotFn,
}

impl GameConnectionFilter {
    pub fn new() -> Self {
        Self {
            game_endpoints: HashMap::new(),
            non_game_flows: HashSet::new(),
            absent_flows: HashMap::new(),
            last_snapshot: None,
            pid_cache: HashMap::new(),
            process_names: GAME_PROCESS_NAMES.iter().copied().collect(),
            snapshot: platform::snapshot_tcp_table,
        }
    }

    pub fn classify(&mut self, server: Server) -> Verdict {
        self.classify_at(server, Instant::now())
    }

    fn classify_at(&mut self, server: Server, now: Instant) -> Verdict {
        if let Some(dist) = self.positive(server) {
            return Verdict::Game(dist);
        }

        let flow = FlowKey::from_server(server);
        if self.non_game_flows.contains(&flow) {
            return Verdict::NonGame;
        }
        if self.absent_flows.contains_key(&flow) && !self.recheck_due(now) {
            return Verdict::NonGame;
        }

        self.refresh(now);

        if let Some(dist) = self.positive(server) {
            self.absent_flows.remove(&flow);
            return Verdict::Game(dist);
        }

        if self.non_game_flows.contains(&flow) {
            self.absent_flows.remove(&flow);
        } else {
            // Also after a failed snapshot: the verdict only stands until
            // the next re-check.
            self.absent_flows.insert(flow, now);
        }
        Verdict::NonGame
    }

    /// Absent flows share one re-check snapshot per interval.
    fn recheck_due(&self, now: Instant) -> bool {
        self.last_snapshot
            .is_none_or(|at| now.saturating_duration_since(at) >= ABSENT_RECHECK_INTERVAL)
    }

    /// Drops any cached non-game verdict, so the next packet of this tuple
    /// is classified afresh (connection closed or a new one starting).
    pub fn forget_flow(&mut self, server: Server) {
        let flow = FlowKey::from_server(server);
        self.non_game_flows.remove(&flow);
        self.absent_flows.remove(&flow);
    }

    /// Whether the last snapshot saw any game connection.
    #[must_use]
    pub fn has_game_connections(&self) -> bool {
        !self.game_endpoints.is_empty()
    }

    /// Takes a fresh TCP table snapshot now, outside the classify path.
    pub fn refresh_now(&mut self) {
        self.refresh(Instant::now());
    }

    /// A filter that already knows one game endpoint and whose snapshots are
    /// empty, for tests of code built on top of the filter.
    #[cfg(test)]
    pub(crate) fn with_game_endpoint(addr: [u8; 4], port: u16, distribution: Distribution) -> Self {
        let mut filter = Self {
            snapshot: |_, _| {
                Ok(TcpTableSnapshot {
                    game_endpoints: HashMap::new(),
                    non_game_flows: HashSet::new(),
                    pid_cache: HashMap::new(),
                })
            },
            ..Self::new()
        };
        filter
            .game_endpoints
            .insert(Endpoint::new(addr, port), distribution);
        filter
    }

    fn positive(&self, server: Server) -> Option<Distribution> {
        self.endpoint(server.source_addr(), server.source_port())
            .or_else(|| self.endpoint(server.destination_addr(), server.destination_port()))
    }

    fn endpoint(&self, addr: [u8; 4], port: u16) -> Option<Distribution> {
        self.game_endpoints.get(&Endpoint::new(addr, port)).copied()
    }

    fn refresh(&mut self, now: Instant) {
        self.last_snapshot = Some(now);
        match (self.snapshot)(&self.process_names, &self.pid_cache) {
            Ok(snapshot) => {
                self.game_endpoints = snapshot.game_endpoints;
                self.non_game_flows = snapshot.non_game_flows;
                self.pid_cache = snapshot.pid_cache;
                self.absent_flows.retain(|_, checked_at| {
                    now.saturating_duration_since(*checked_at) < ABSENT_FLOW_TTL
                });
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
    use super::{Distribution, Endpoint, FlowKey, HashMap, HashSet, PidCache, TcpTableSnapshot};
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
        previous_pid_cache: &PidCache,
    ) -> Result<TcpTableSnapshot, String> {
        let rows = tcp_rows()?;
        let mut game_endpoints = HashMap::new();
        let mut non_game_flows = HashSet::new();
        let mut pid_cache = HashMap::new();

        for row in rows {
            if row.remote_addr == [0, 0, 0, 0] {
                continue;
            }

            let target = match pid_cache.get(&row.owning_pid) {
                Some(target) => *target,
                None => {
                    let target = previous_pid_cache
                        .get(&row.owning_pid)
                        .copied()
                        .unwrap_or_else(|| {
                            process_name(row.owning_pid)
                                .filter(|name| process_names.contains(name.as_str()))
                                .and_then(|name| Distribution::from_process_stem(&name))
                        });
                    pid_cache.insert(row.owning_pid, target);
                    target
                }
            };

            let local = Endpoint::new(row.local_addr, port_from_bytes(row.local_port));
            let remote = Endpoint::new(row.remote_addr, port_from_bytes(row.remote_port));

            if let Some(dist) = target {
                game_endpoints.insert(local, dist);
                game_endpoints.insert(remote, dist);
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

    /// Reads attempted before giving up on a table that keeps growing.
    const TABLE_READ_ATTEMPTS: usize = 3;
    /// Room for connections opened between sizing the table and reading it,
    /// which is common exactly when a game opens many connections at once.
    const TABLE_HEADROOM_ROWS: usize = 64;

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

        let mut table = Vec::new();
        let mut read = false;
        for _ in 0..TABLE_READ_ATTEMPTS {
            table.resize(
                table_len as usize + TABLE_HEADROOM_ROWS * size_of::<TcpRowOwnerPid>(),
                0u8,
            );
            let mut len = u32::try_from(table.len()).map_err(|e| format!("{e}"))?;
            let result = unsafe {
                GetExtendedTcpTable(
                    table.as_mut_ptr().cast(),
                    &mut len,
                    0,
                    AF_INET,
                    TCP_TABLE_OWNER_PID_ALL,
                    0,
                )
            };
            match result {
                NO_ERROR => {
                    read = true;
                    break;
                }
                // `len` now holds the size the grown table needs.
                ERROR_INSUFFICIENT_BUFFER => table_len = len,
                other => return Err(format!("GetExtendedTcpTable failed with {other}")),
            }
        }
        if !read {
            return Err("GetExtendedTcpTable kept outgrowing its buffer".to_string());
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
    use super::{HashMap, HashSet, PidCache, TcpTableSnapshot};

    pub fn snapshot_tcp_table(
        _process_names: &HashSet<&'static str>,
        _previous_pid_cache: &PidCache,
    ) -> Result<TcpTableSnapshot, String> {
        Ok(TcpTableSnapshot {
            game_endpoints: HashMap::new(),
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

    /// Counts a snapshot call and returns its 1-based number.
    fn count_snapshot() -> usize {
        SNAPSHOT_CALLS.with(|calls| {
            calls.set(calls.get() + 1);
            calls.get()
        })
    }

    fn game_snapshot() -> TcpTableSnapshot {
        TcpTableSnapshot {
            game_endpoints: HashMap::from([(endpoint([10, 0, 0, 1], 40000), Distribution::Star)]),
            non_game_flows: HashSet::from([FlowKey::from_endpoints(
                endpoint([1, 1, 1, 1], 1111),
                endpoint([2, 2, 2, 2], 2222),
            )]),
            pid_cache: HashMap::from([(123, Some(Distribution::Star)), (456, None)]),
        }
    }

    fn snapshot_with_game(
        _process_names: &HashSet<&'static str>,
        _previous_pid_cache: &PidCache,
    ) -> Result<TcpTableSnapshot, String> {
        count_snapshot();
        Ok(game_snapshot())
    }

    /// The first read fails, as when the table grows while it is read.
    fn failing_then_game_snapshot(
        _process_names: &HashSet<&'static str>,
        _previous_pid_cache: &PidCache,
    ) -> Result<TcpTableSnapshot, String> {
        if count_snapshot() == 1 {
            return Err("table grew while it was read".to_string());
        }
        Ok(game_snapshot())
    }

    fn empty_snapshot(
        _process_names: &HashSet<&'static str>,
        _previous_pid_cache: &PidCache,
    ) -> Result<TcpTableSnapshot, String> {
        count_snapshot();
        Ok(TcpTableSnapshot {
            game_endpoints: HashMap::new(),
            non_game_flows: HashSet::new(),
            pid_cache: HashMap::new(),
        })
    }

    fn filter_with_snapshot(snapshot: SnapshotFn) -> GameConnectionFilter {
        GameConnectionFilter {
            game_endpoints: HashMap::new(),
            non_game_flows: HashSet::new(),
            absent_flows: HashMap::new(),
            last_snapshot: None,
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
        filter
            .game_endpoints
            .insert(endpoint([10, 0, 0, 1], 40000), Distribution::Bpsr);

        assert_eq!(filter.classify(server()), Verdict::Game(Distribution::Bpsr));
        assert_eq!(
            filter.classify(reversed_server()),
            Verdict::Game(Distribution::Bpsr)
        );
    }

    #[test]
    fn launcher_suffixes_share_a_distribution() {
        for name in GAME_PROCESS_NAMES {
            assert!(Distribution::from_process_stem(name).is_some(), "{name}");
        }
        assert_eq!(
            Distribution::from_process_stem("bpsr_steam"),
            Some(Distribution::Bpsr)
        );
        assert_eq!(
            Distribution::from_process_stem("bpsr_epic"),
            Some(Distribution::Bpsr)
        );
        assert_eq!(
            Distribution::from_process_stem("starasia_steam"),
            Some(Distribution::StarAsia)
        );
        assert_eq!(
            Distribution::from_process_stem("star"),
            Some(Distribution::Star)
        );
        assert_eq!(Distribution::from_process_stem("notepad"), None);
        for dist in Distribution::ALL {
            assert_eq!(Distribution::from_code(dist.code()), Some(dist));
        }
        assert_eq!(Distribution::from_code(0), None);
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

        assert_eq!(filter.classify(server()), Verdict::Game(Distribution::Star));
        assert_eq!(snapshot_calls(), 1);
    }

    #[test]
    fn refresh_rebuilds_all_collections() {
        let mut filter = filter_with_snapshot(snapshot_with_game);
        filter
            .game_endpoints
            .insert(endpoint([99, 99, 99, 99], 9999), Distribution::Bpsr);
        filter.non_game_flows.insert(FlowKey::from_endpoints(
            endpoint([3, 3, 3, 3], 3333),
            endpoint([4, 4, 4, 4], 4444),
        ));
        filter.pid_cache.insert(999, None);

        filter.refresh(Instant::now());

        assert_eq!(
            filter.endpoint([10, 0, 0, 1], 40000),
            Some(Distribution::Star)
        );
        assert_eq!(filter.endpoint([99, 99, 99, 99], 9999), None);
        assert_eq!(
            filter.pid_cache,
            HashMap::from([(123, Some(Distribution::Star)), (456, None)])
        );
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

    #[test]
    fn alternating_absent_flows_refresh_once_each() {
        reset_calls();
        let mut filter = filter_with_snapshot(empty_snapshot);

        for _ in 0..10 {
            assert_eq!(filter.classify(server()), Verdict::NonGame);
            assert_eq!(
                filter.classify(Server::new([30, 0, 0, 1], 1, [40, 0, 0, 1], 2)),
                Verdict::NonGame
            );
        }

        assert_eq!(snapshot_calls(), 2);
    }

    #[test]
    fn forget_flow_clears_absent_verdict() {
        reset_calls();
        let mut filter = filter_with_snapshot(empty_snapshot);
        assert_eq!(filter.classify(server()), Verdict::NonGame);

        filter.forget_flow(reversed_server());
        assert_eq!(filter.classify(server()), Verdict::NonGame);

        assert_eq!(snapshot_calls(), 2);
    }

    /// A failed snapshot (or one taken before the game's row appeared) holds
    /// a game connection back only until the next re-check, whatever other
    /// traffic does meanwhile.
    #[test]
    fn absent_flow_is_rechecked_after_interval() {
        reset_calls();
        let mut filter = filter_with_snapshot(failing_then_game_snapshot);
        let start = Instant::now();

        assert_eq!(filter.classify_at(server(), start), Verdict::NonGame);
        assert_eq!(
            filter.classify_at(server(), start + ABSENT_RECHECK_INTERVAL / 2),
            Verdict::NonGame
        );
        assert_eq!(snapshot_calls(), 1);

        assert_eq!(
            filter.classify_at(server(), start + ABSENT_RECHECK_INTERVAL),
            Verdict::Game(Distribution::Star)
        );
        assert_eq!(snapshot_calls(), 2);
        assert!(filter.absent_flows.is_empty());
    }

    #[test]
    fn absent_flows_share_one_recheck_per_interval() {
        reset_calls();
        let mut filter = filter_with_snapshot(empty_snapshot);
        let start = Instant::now();
        let flows: Vec<Server> = (1..=5)
            .map(|port| Server::new([30, 0, 0, 1], port, [40, 0, 0, 1], 2))
            .collect();
        for flow in &flows {
            assert_eq!(filter.classify_at(*flow, start), Verdict::NonGame);
        }
        assert_eq!(snapshot_calls(), 5);

        let later = start + ABSENT_RECHECK_INTERVAL;
        for _ in 0..3 {
            for flow in &flows {
                assert_eq!(filter.classify_at(*flow, later), Verdict::NonGame);
            }
        }
        assert_eq!(snapshot_calls(), 6);
    }
}
