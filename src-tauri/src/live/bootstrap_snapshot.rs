use crate::live::counter_tracker::CounterRule;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const SNAPSHOT_FILE_NAME: &str = "monitorRuntime.json";

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct MonitorRuntimeSnapshot {
    pub live: LiveRuntimeSnapshot,
    pub skill: SkillRuntimeSnapshot,
    pub monster: MonsterRuntimeSnapshot,
}

impl Default for MonitorRuntimeSnapshot {
    fn default() -> Self {
        Self {
            live: LiveRuntimeSnapshot::default(),
            skill: SkillRuntimeSnapshot::default(),
            monster: MonsterRuntimeSnapshot::default(),
        }
    }
}

impl MonitorRuntimeSnapshot {
    pub fn normalize(mut self) -> Result<Self, String> {
        self.live.event_update_rate_ms = self.live.event_update_rate_ms.clamp(50, 2000);

        dedup_and_sort_i32(&mut self.skill.monitored_skill_ids);
        if self.skill.monitored_skill_ids.len() > 10 {
            return Err("You can monitor up to 10 skills".to_string());
        }
        dedup_and_sort_i32(&mut self.skill.monitored_buff_ids);
        dedup_and_sort_i32(&mut self.skill.monitored_panel_attr_ids);
        self.skill
            .buff_counter_rules
            .sort_by_key(|rule| rule.rule_id);
        self.skill
            .buff_counter_rules
            .dedup_by_key(|rule| rule.rule_id);

        if !self.skill.enabled {
            self.skill.monitored_skill_ids.clear();
            self.skill.monitored_buff_ids.clear();
            self.skill.monitor_all_buff = false;
            self.skill.monitored_panel_attr_ids.clear();
            self.skill.buff_counter_rules.clear();
        }

        dedup_and_sort_i32(&mut self.monster.global_ids);
        dedup_and_sort_i32(&mut self.monster.self_applied_ids);
        if !self.monster.enabled {
            self.monster.global_ids.clear();
            self.monster.self_applied_ids.clear();
        }

        Ok(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct LiveRuntimeSnapshot {
    pub event_update_rate_ms: u64,
}

impl Default for LiveRuntimeSnapshot {
    fn default() -> Self {
        Self {
            event_update_rate_ms: 200,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SkillRuntimeSnapshot {
    pub enabled: bool,
    pub monitored_skill_ids: Vec<i32>,
    pub monitored_buff_ids: Vec<i32>,
    pub monitor_all_buff: bool,
    pub monitored_panel_attr_ids: Vec<i32>,
    pub buff_counter_rules: Vec<CounterRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MonsterRuntimeSnapshot {
    pub enabled: bool,
    pub global_ids: Vec<i32>,
    pub self_applied_ids: Vec<i32>,
}

pub(crate) fn save_monitor_runtime_snapshot(
    app_handle: &AppHandle,
    snapshot: &MonitorRuntimeSnapshot,
) -> Result<(), String> {
    let app_data_dirs = [
        app_handle.path().app_data_dir(),
        app_handle.path().app_local_data_dir(),
    ];
    let mut last_err = None;

    for dir in app_data_dirs.into_iter().flatten() {
        let target_dir = dir.join("stores");
        if let Err(error) = std::fs::create_dir_all(&target_dir) {
            last_err = Some(format!("create_dir_all {}: {}", target_dir.display(), error));
            continue;
        }

        let path = target_dir.join(SNAPSHOT_FILE_NAME);
        match std::fs::write(
            &path,
            serde_json::to_vec_pretty(snapshot).map_err(|error| error.to_string())?,
        ) {
            Ok(_) => {
                info!(
                    target: "app::startup",
                    "saved monitor runtime snapshot to {} (event_update_rate_ms={} skill_enabled={} monitored_skills={} monitored_buffs={} panel_attrs={} counter_rules={} monster_enabled={} monster_global={} monster_self_applied={})",
                    path.display(),
                    snapshot.live.event_update_rate_ms,
                    snapshot.skill.enabled,
                    snapshot.skill.monitored_skill_ids.len(),
                    snapshot.skill.monitored_buff_ids.len(),
                    snapshot.skill.monitored_panel_attr_ids.len(),
                    snapshot.skill.buff_counter_rules.len(),
                    snapshot.monster.enabled,
                    snapshot.monster.global_ids.len(),
                    snapshot.monster.self_applied_ids.len()
                );
                return Ok(());
            }
            Err(error) => {
                last_err = Some(format!("write {}: {}", path.display(), error));
            }
        }
    }

    Err(last_err.unwrap_or_else(|| "failed to save monitor runtime snapshot".to_string()))
}

pub(crate) fn load_monitor_runtime_snapshot(app_handle: &AppHandle) -> Option<MonitorRuntimeSnapshot> {
    for path in snapshot_path_candidates(app_handle) {
        if !path.exists() {
            continue;
        }

        let file = match std::fs::File::open(&path) {
            Ok(file) => file,
            Err(error) => {
                warn!(
                    target: "app::startup",
                    "failed to open monitor runtime snapshot {}: {}",
                    path.display(),
                    error
                );
                continue;
            }
        };

        let snapshot = match serde_json::from_reader::<_, MonitorRuntimeSnapshot>(file) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                warn!(
                    target: "app::startup",
                    "failed to parse monitor runtime snapshot {}: {}",
                    path.display(),
                    error
                );
                continue;
            }
        };

        match snapshot.normalize() {
            Ok(snapshot) => {
                info!(
                    target: "app::startup",
                    "loaded monitor runtime snapshot from {} (event_update_rate_ms={} skill_enabled={} monitored_skills={} monitored_buffs={} panel_attrs={} counter_rules={} monster_enabled={} monster_global={} monster_self_applied={})",
                    path.display(),
                    snapshot.live.event_update_rate_ms,
                    snapshot.skill.enabled,
                    snapshot.skill.monitored_skill_ids.len(),
                    snapshot.skill.monitored_buff_ids.len(),
                    snapshot.skill.monitored_panel_attr_ids.len(),
                    snapshot.skill.buff_counter_rules.len(),
                    snapshot.monster.enabled,
                    snapshot.monster.global_ids.len(),
                    snapshot.monster.self_applied_ids.len()
                );
                return Some(snapshot);
            }
            Err(error) => {
                warn!(
                    target: "app::startup",
                    "invalid monitor runtime snapshot {}: {}",
                    path.display(),
                    error
                );
            }
        }
    }

    None
}

fn snapshot_path_candidates(app_handle: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::with_capacity(4);
    if let Ok(dir) = app_handle.path().app_data_dir() {
        candidates.push(dir.join("stores").join(SNAPSHOT_FILE_NAME));
        candidates.push(dir.join(SNAPSHOT_FILE_NAME));
    }
    if let Ok(dir) = app_handle.path().app_local_data_dir() {
        candidates.push(dir.join("stores").join(SNAPSHOT_FILE_NAME));
        candidates.push(dir.join(SNAPSHOT_FILE_NAME));
    }
    candidates
}

fn dedup_and_sort_i32(values: &mut Vec<i32>) {
    values.sort_unstable();
    values.dedup();
}
