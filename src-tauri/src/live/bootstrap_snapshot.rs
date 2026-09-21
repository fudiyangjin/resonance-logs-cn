use crate::live::counter::engine::CounterRule;
use crate::live::counter::season_cultivate::{FactorCounterTemplate, normalize_factor_templates};
use crate::live::runtime::segment::{TRAINING_WINDOW_MS, TrainingLockPolicy};
use crate::live::store_file::{load_store_json, save_store_json};
use crate::voice::models::EntityOwnerScope;
use log::{info, warn};
use serde::{Deserialize, Deserializer, Serialize};
use tauri::AppHandle;

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
        self.live.training_window_ms = self.live.training_window_ms.clamp(30_000, 600_000);

        dedup_and_sort_i32(&mut self.skill.monitored_skill_ids);
        if self.skill.monitored_skill_ids.len() > 10 {
            return Err("最多监控10个技能".to_string());
        }
        dedup_and_sort_i32(&mut self.skill.monitored_buff_ids);
        if self.skill.buff_timeline_ids.iter().any(|id| *id <= 0) {
            return Err("buff覆盖率ID必须为正整数".to_string());
        }
        dedup_and_sort_i32(&mut self.skill.buff_timeline_ids);
        if self.skill.buff_timeline_ids.len() > MAX_BUFF_COVERAGE_ENTRIES {
            return Err(format!("buff覆盖率最多监控{MAX_BUFF_COVERAGE_ENTRIES}项"));
        }
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
            self.skill.buff_timeline_ids.clear();
            self.skill.monitor_all_buff = false;
            self.skill.monitored_panel_attr_ids.clear();
            self.skill.buff_counter_rules.clear();
            self.skill.season_cultivate_factor_templates.clear();
        }

        dedup_and_sort_i32(&mut self.monster.global_ids);
        dedup_and_sort_i32(&mut self.monster.self_applied_ids);
        self.monster
            .watched_entities
            .retain(|spec| spec.monster_id > 0);
        for spec in &mut self.monster.watched_entities {
            spec.duration_ms = spec.duration_ms.filter(|duration| *duration > 0);
        }
        // Same (monster_id, scope) with different durations is a frontend
        // contradiction; keep the first so the outcome is deterministic.
        self.monster
            .watched_entities
            .sort_by_key(|spec| (spec.monster_id, spec.scope));
        self.monster
            .watched_entities
            .dedup_by_key(|spec| (spec.monster_id, spec.scope));
        if !self.monster.enabled {
            self.monster.global_ids.clear();
            self.monster.self_applied_ids.clear();
            self.monster.monitor_all_self_applied = false;
            self.monster.watched_entities.clear();
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

pub const MAX_BUFF_COVERAGE_ENTRIES: usize = 32;

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
    pub training_window_ms: u64,
    pub training_lock_policy: TrainingLockPolicy,
}

impl Default for LiveRuntimeSnapshot {
    fn default() -> Self {
        Self {
            event_update_rate_ms: 200,
            training_window_ms: TRAINING_WINDOW_MS,
            training_lock_policy: TrainingLockPolicy::EliteDummies,
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
    /// Coverage watch list: these buff ids are tracked for live coverage on
    /// the local player and persisted as timeline edges for all players.
    pub buff_timeline_ids: Vec<i32>,
}

/// One entity-duration watch entry. `monster_id` decides which entities are
/// tracked; `duration_ms` (the configured lifetime) and `scope` are only
/// consumed by the voice projection to time "expiring" cues, mirroring the
/// HUD which filters by scope and counts down from detection on its own.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WatchedEntitySpec {
    pub monster_id: i32,
    #[serde(default)]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub scope: EntityOwnerScope,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MonsterRuntimeSnapshot {
    pub enabled: bool,
    pub global_ids: Vec<i32>,
    pub self_applied_ids: Vec<i32>,
    pub monitor_all_self_applied: bool,
    pub watched_entities: Vec<WatchedEntitySpec>,
}

impl MonsterRuntimeSnapshot {
    /// Distinct monster ids across all watch entries (admission set).
    pub fn watched_monster_ids(&self) -> impl Iterator<Item = i32> + '_ {
        let mut seen = std::collections::HashSet::new();
        self.watched_entities
            .iter()
            .map(|spec| spec.monster_id)
            .filter(move |id| seen.insert(*id))
    }
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

fn describe_snapshot(snapshot: &MonitorRuntimeSnapshot) -> String {
    format!(
        "locale={} event_update_rate_ms={} skill_enabled={} monitored_skills={} monitored_buffs={} panel_attrs={} counter_rules={} monster_enabled={} monster_global={} monster_self_applied={} monster_watched_entities={} teammate_enabled={} teammate_any={} teammate_local={} teammate_self={}",
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
        snapshot.monster.watched_entities.len(),
        snapshot.teammate.enabled,
        snapshot.teammate.any_source_ids.len(),
        snapshot.teammate.local_player_source_ids.len(),
        snapshot.teammate.target_self_source_ids.len()
    )
}

pub(crate) fn save_monitor_runtime_snapshot(
    app_handle: &AppHandle,
    snapshot: &MonitorRuntimeSnapshot,
) -> Result<(), String> {
    let path = save_store_json(app_handle, SNAPSHOT_FILE_NAME, snapshot)?;
    info!(
        target: "app::startup",
        "saved monitor runtime snapshot to {} ({})",
        path.display(),
        describe_snapshot(snapshot)
    );
    Ok(())
}

pub(crate) fn load_monitor_runtime_snapshot(
    app_handle: &AppHandle,
) -> Option<MonitorRuntimeSnapshot> {
    let (path, snapshot) =
        load_store_json::<MonitorRuntimeSnapshot>(app_handle, SNAPSHOT_FILE_NAME)?;
    match snapshot.normalize() {
        Ok(snapshot) => {
            info!(
                target: "app::startup",
                "loaded monitor runtime snapshot from {} ({})",
                path.display(),
                describe_snapshot(&snapshot)
            );
            Some(snapshot)
        }
        Err(error) => {
            warn!(
                target: "app::startup",
                "invalid monitor runtime snapshot {}: {}",
                path.display(),
                error
            );
            None
        }
    }
}

fn dedup_and_sort_i32(values: &mut Vec<i32>) {
    values.sort_unstable();
    values.dedup();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(
        monster_id: i32,
        duration_ms: Option<u64>,
        scope: EntityOwnerScope,
    ) -> WatchedEntitySpec {
        WatchedEntitySpec {
            monster_id,
            duration_ms,
            scope,
        }
    }

    #[test]
    fn watched_entities_are_deduplicated_by_id_and_scope_and_cleared_when_monster_disabled() {
        let mut snapshot = MonitorRuntimeSnapshot::default();
        snapshot.monster.enabled = true;
        snapshot.monster.watched_entities = vec![
            spec(179_901, Some(15_000), EntityOwnerScope::Any),
            spec(0, None, EntityOwnerScope::Any),
            spec(-5, None, EntityOwnerScope::Any),
            spec(42, Some(0), EntityOwnerScope::LocalPlayer),
            // Same id, other scope: a distinct voice subject, kept.
            spec(179_901, Some(20_000), EntityOwnerScope::LocalPlayer),
            // Exact duplicate key: first wins.
            spec(179_901, Some(99_000), EntityOwnerScope::Any),
        ];
        let normalized = snapshot
            .clone()
            .normalize()
            .expect("watched specs snapshot is valid");
        assert_eq!(
            normalized.monster.watched_entities,
            vec![
                spec(42, None, EntityOwnerScope::LocalPlayer),
                spec(179_901, Some(20_000), EntityOwnerScope::LocalPlayer),
                spec(179_901, Some(15_000), EntityOwnerScope::Any),
            ]
        );
        assert_eq!(
            normalized.monster.watched_monster_ids().collect::<Vec<_>>(),
            vec![42, 179_901]
        );

        snapshot.monster.enabled = false;
        let disabled = snapshot.normalize().expect("disabled snapshot is valid");
        assert!(disabled.monster.watched_entities.is_empty());
    }

    #[test]
    fn legacy_monster_snapshot_with_watched_ids_deserializes_to_empty_specs() {
        let monster: MonsterRuntimeSnapshot = serde_json::from_str(
            r#"{"enabled":true,"globalIds":[1],"selfAppliedIds":[],"watchedEntityIds":[7]}"#,
        )
        .expect("legacy monster snapshot parses");
        assert!(monster.watched_entities.is_empty());

        let spec: WatchedEntitySpec =
            serde_json::from_str(r#"{"monsterId":7,"durationMs":15000,"scope":"self"}"#)
                .expect("spec parses");
        assert_eq!(
            spec,
            WatchedEntitySpec {
                monster_id: 7,
                duration_ms: Some(15_000),
                scope: EntityOwnerScope::LocalPlayer,
            }
        );
    }

    #[test]
    fn normalize_defaults_training_window_to_183s() {
        let snapshot = MonitorRuntimeSnapshot::default()
            .normalize()
            .expect("default snapshot is valid");
        assert_eq!(snapshot.live.training_window_ms, TRAINING_WINDOW_MS);
        assert_eq!(snapshot.live.training_window_ms, 183_000);
    }

    #[test]
    fn normalize_clamps_training_window() {
        let mut low = MonitorRuntimeSnapshot::default();
        low.live.training_window_ms = 1_000;
        assert_eq!(
            low.normalize()
                .expect("clamped snapshot is valid")
                .live
                .training_window_ms,
            30_000
        );

        let mut high = MonitorRuntimeSnapshot::default();
        high.live.training_window_ms = 999_000;
        assert_eq!(
            high.normalize()
                .expect("clamped snapshot is valid")
                .live
                .training_window_ms,
            600_000
        );
    }

    #[test]
    fn missing_training_window_deserializes_to_default() {
        let live: LiveRuntimeSnapshot = serde_json::from_str(r#"{"eventUpdateRateMs":200}"#)
            .expect("legacy live snapshot deserializes");
        assert_eq!(live.training_window_ms, TRAINING_WINDOW_MS);
        assert_eq!(live.training_lock_policy, TrainingLockPolicy::EliteDummies);
    }

    #[test]
    fn missing_training_lock_policy_deserializes_to_elite_dummies() {
        let live: LiveRuntimeSnapshot =
            serde_json::from_str(r#"{"eventUpdateRateMs":200,"trainingWindowMs":183000}"#)
                .expect("legacy live snapshot deserializes");
        assert_eq!(live.training_lock_policy, TrainingLockPolicy::EliteDummies);
    }

    #[test]
    fn coverage_ids_are_deduplicated_and_bounded() {
        let mut snapshot = MonitorRuntimeSnapshot::default();
        snapshot.skill.enabled = true;
        snapshot.skill.buff_timeline_ids = vec![3, 1, 3, 2];
        let normalized = snapshot.normalize().expect("coverage ids are valid");
        assert_eq!(normalized.skill.buff_timeline_ids, vec![1, 2, 3]);

        let mut too_many = MonitorRuntimeSnapshot::default();
        too_many.skill.enabled = true;
        too_many.skill.buff_timeline_ids = (1..=33).collect();
        assert!(too_many.normalize().is_err());

        let mut invalid = MonitorRuntimeSnapshot::default();
        invalid.skill.enabled = true;
        invalid.skill.buff_timeline_ids = vec![0];
        assert!(invalid.normalize().is_err());
    }

    #[test]
    fn buff_publication_and_timeline_ids_remain_independent() {
        let mut snapshot = MonitorRuntimeSnapshot::default();
        snapshot.skill.enabled = true;
        snapshot.skill.monitored_buff_ids = vec![9];
        snapshot.skill.buff_timeline_ids = vec![8];

        let normalized = snapshot.normalize().expect("buff ids are valid");

        assert_eq!(normalized.skill.monitored_buff_ids, vec![9]);
        assert_eq!(normalized.skill.buff_timeline_ids, vec![8]);
    }
}
