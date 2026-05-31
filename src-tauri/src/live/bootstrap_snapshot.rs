use crate::live::counter_tracker::CounterRule;
use crate::live::season_cultivate::{FactorCounterTemplate, normalize_factor_templates};
use log::{info, warn};
use serde::{Deserialize, Deserializer, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const SNAPSHOT_FILE_NAME: &str = "monitorRuntime.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
pub enum AppLocale {
    #[serde(rename = "zh-CN")]
    ZhCn,
    #[serde(rename = "en-US")]
    EnUs,
    #[serde(rename = "ja-JP")]
    JaJp,
}

impl AppLocale {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ZhCn => "zh-CN",
            Self::EnUs => "en-US",
            Self::JaJp => "ja-JP",
        }
    }

    fn from_str(value: &str) -> Self {
        match value {
            "en-US" => Self::EnUs,
            "ja-JP" => Self::JaJp,
            "zh-CN" => Self::ZhCn,
            _ => Self::default(),
        }
    }
}

impl Default for AppLocale {
    fn default() -> Self {
        Self::ZhCn
    }
}

impl<'de> Deserialize<'de> for AppLocale {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        Ok(value
            .as_str()
            .map(Self::from_str)
            .unwrap_or_else(Self::default))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct MonitorRuntimeSnapshot {
    #[serde(rename = "i18n")]
    #[specta(rename = "i18n")]
    pub i18n: I18nRuntimeSnapshot,
    pub live: LiveRuntimeSnapshot,
    pub skill: SkillRuntimeSnapshot,
    pub monster: MonsterRuntimeSnapshot,
    pub teammate: TeammateRuntimeSnapshot,
}

impl Default for MonitorRuntimeSnapshot {
    fn default() -> Self {
        Self {
            i18n: I18nRuntimeSnapshot::default(),
            live: LiveRuntimeSnapshot::default(),
            skill: SkillRuntimeSnapshot::default(),
            monster: MonsterRuntimeSnapshot::default(),
            teammate: TeammateRuntimeSnapshot::default(),
        }
    }
}

impl MonitorRuntimeSnapshot {
    pub fn normalize(mut self) -> Result<Self, String> {
        self.live.event_update_rate_ms = self.live.event_update_rate_ms.clamp(50, 2000);

        dedup_and_sort_i32(&mut self.skill.monitored_skill_ids);
        if self.skill.monitored_skill_ids.len() > 10 {
            return Err("最多监控10个技能".to_string());
        }
        dedup_and_sort_i32(&mut self.skill.monitored_buff_ids);
        dedup_and_sort_i32(&mut self.skill.monitored_panel_attr_ids);
        self.skill
            .buff_counter_rules
            .sort_by_key(|rule| rule.rule_id);
        self.skill
            .buff_counter_rules
            .dedup_by_key(|rule| rule.rule_id);
        self.skill.season_cultivate_factor_templates = normalize_factor_templates(std::mem::take(
            &mut self.skill.season_cultivate_factor_templates,
        ));
        self.skill
            .season_cultivate_factor_templates
            .sort_by_key(|template| {
                (
                    template.item_ids.first().copied().unwrap_or_default(),
                    !template.sources.is_empty(),
                    !template.effect_slots.is_empty(),
                )
            });
        self.skill
            .season_cultivate_factor_templates
            .dedup_by_key(|template| {
                (
                    template.item_ids.first().copied().unwrap_or_default(),
                    !template.sources.is_empty(),
                    !template.effect_slots.is_empty(),
                )
            });

        if !self.skill.enabled {
            self.skill.monitored_skill_ids.clear();
            self.skill.monitored_buff_ids.clear();
            self.skill.monitor_all_buff = false;
            self.skill.monitored_panel_attr_ids.clear();
            self.skill.buff_counter_rules.clear();
            self.skill.season_cultivate_factor_templates.clear();
        }

        dedup_and_sort_i32(&mut self.monster.global_ids);
        dedup_and_sort_i32(&mut self.monster.self_applied_ids);
        if !self.monster.enabled {
            self.monster.global_ids.clear();
            self.monster.self_applied_ids.clear();
            self.monster.monitor_all_self_applied = false;
        }

        dedup_and_sort_i32(&mut self.teammate.any_source_ids);
        dedup_and_sort_i32(&mut self.teammate.local_player_source_ids);
        dedup_and_sort_i32(&mut self.teammate.target_self_source_ids);
        if !self.teammate.enabled {
            self.teammate.any_source_ids.clear();
            self.teammate.local_player_source_ids.clear();
            self.teammate.target_self_source_ids.clear();
            self.teammate.monitor_all = false;
        }

        Ok(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct I18nRuntimeSnapshot {
    pub locale: AppLocale,
}

impl Default for I18nRuntimeSnapshot {
    fn default() -> Self {
        Self {
            locale: AppLocale::default(),
        }
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
    pub season_cultivate_factor_templates: Vec<FactorCounterTemplate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MonsterRuntimeSnapshot {
    pub enabled: bool,
    pub global_ids: Vec<i32>,
    pub self_applied_ids: Vec<i32>,
    pub monitor_all_self_applied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TeammateRuntimeSnapshot {
    pub enabled: bool,
    pub any_source_ids: Vec<i32>,
    pub local_player_source_ids: Vec<i32>,
    pub target_self_source_ids: Vec<i32>,
    pub monitor_all: bool,
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
            last_err = Some(format!(
                "create_dir_all {}: {}",
                target_dir.display(),
                error
            ));
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
                    "saved monitor runtime snapshot to {} (locale={} event_update_rate_ms={} skill_enabled={} monitored_skills={} monitored_buffs={} panel_attrs={} counter_rules={} monster_enabled={} monster_global={} monster_self_applied={} teammate_enabled={} teammate_any={} teammate_local={} teammate_self={})",
                    path.display(),
                    snapshot.i18n.locale.as_str(),
                    snapshot.live.event_update_rate_ms,
                    snapshot.skill.enabled,
                    snapshot.skill.monitored_skill_ids.len(),
                    snapshot.skill.monitored_buff_ids.len(),
                    snapshot.skill.monitored_panel_attr_ids.len(),
                    snapshot.skill.buff_counter_rules.len(),
                    snapshot.monster.enabled,
                    snapshot.monster.global_ids.len(),
                    snapshot.monster.self_applied_ids.len(),
                    snapshot.teammate.enabled,
                    snapshot.teammate.any_source_ids.len(),
                    snapshot.teammate.local_player_source_ids.len(),
                    snapshot.teammate.target_self_source_ids.len()
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

pub(crate) fn load_monitor_runtime_snapshot(
    app_handle: &AppHandle,
) -> Option<MonitorRuntimeSnapshot> {
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
                    "loaded monitor runtime snapshot from {} (locale={} event_update_rate_ms={} skill_enabled={} monitored_skills={} monitored_buffs={} panel_attrs={} counter_rules={} monster_enabled={} monster_global={} monster_self_applied={} teammate_enabled={} teammate_any={} teammate_local={} teammate_self={})",
                    path.display(),
                    snapshot.i18n.locale.as_str(),
                    snapshot.live.event_update_rate_ms,
                    snapshot.skill.enabled,
                    snapshot.skill.monitored_skill_ids.len(),
                    snapshot.skill.monitored_buff_ids.len(),
                    snapshot.skill.monitored_panel_attr_ids.len(),
                    snapshot.skill.buff_counter_rules.len(),
                    snapshot.monster.enabled,
                    snapshot.monster.global_ids.len(),
                    snapshot.monster.self_applied_ids.len(),
                    snapshot.teammate.enabled,
                    snapshot.teammate.any_source_ids.len(),
                    snapshot.teammate.local_player_source_ids.len(),
                    snapshot.teammate.target_self_source_ids.len()
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
