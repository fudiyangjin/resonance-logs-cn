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
    pub teammate_cd: TeammateCdRuntimeSnapshot,
    pub buff_composites: Vec<BuffCompositeSpec>,
}

impl Default for MonitorRuntimeSnapshot {
    fn default() -> Self {
        Self {
            buff_composites: Vec::new(),
            i18n: I18nRuntimeSnapshot::default(),
            live: LiveRuntimeSnapshot::default(),
            skill: SkillRuntimeSnapshot::default(),
            monster: MonsterRuntimeSnapshot::default(),
            teammate: TeammateRuntimeSnapshot::default(),
            teammate_cd: TeammateCdRuntimeSnapshot::default(),
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
        self.teammate_cd.normalize();
        normalize_buff_composites(&mut self.buff_composites)?;
        // Negative ids name composites; one that is no longer defined is
        // dropped rather than failing the whole snapshot.
        let composites = &self.buff_composites;
        let is_known_buff = |id: &i32| {
            *id > 0
                || composites
                    .binary_search_by_key(id, |composite| composite.id)
                    .is_ok()
        };
        self.skill.monitored_buff_ids.retain(is_known_buff);
        dedup_and_sort_i32(&mut self.skill.monitored_buff_ids);
        if self.skill.buff_timeline_ids.contains(&0) {
            return Err("buff覆盖率ID无效".to_string());
        }
        self.skill.buff_timeline_ids.retain(is_known_buff);
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
        // The watch list survives a disabled monster monitor: entity voice
        // cues do not follow the HUD toggle, and the entity monitor hides the
        // tracks from the HUD payload on its own.
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

pub const MAX_BUFF_COVERAGE_ENTRIES: usize = 32;
/// Most composite buffs one configuration may define.
pub const MAX_BUFF_COMPOSITES: usize = 64;
/// Most member buffs one composite may combine.
pub const MAX_BUFF_COMPOSITE_MEMBERS: usize = 8;

/// A composite buff: present on an entity while at least `min_active` of its
/// member buffs are (every member when unset), then published and tracked
/// under its own negative `id` like any other buff (see
/// [`crate::live::projections::buff_presence`]).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BuffCompositeSpec {
    pub id: i32,
    pub member_ids: Vec<i32>,
    #[serde(default)]
    pub min_active: Option<u32>,
}

/// Validates composite definitions and sorts them by id, so lookups can
/// binary-search. A threshold that requires every member is dropped, so
/// "all members" has a single spelling.
fn normalize_buff_composites(composites: &mut [BuffCompositeSpec]) -> Result<(), String> {
    if composites.len() > MAX_BUFF_COMPOSITES {
        return Err(format!("组合buff最多{MAX_BUFF_COMPOSITES}个"));
    }
    for composite in composites.iter_mut() {
        dedup_and_sort_i32(&mut composite.member_ids);
        let member_count = composite.member_ids.len();
        let valid_members = (2..=MAX_BUFF_COMPOSITE_MEMBERS).contains(&member_count)
            && composite.member_ids.iter().all(|id| *id > 0);
        if composite.id >= 0 || !valid_members {
            return Err(format!(
                "组合buff需为负数ID且包含2~{MAX_BUFF_COMPOSITE_MEMBERS}个有效成员"
            ));
        }
        if let Some(min_active) = composite.min_active {
            let min_active = usize::try_from(min_active).unwrap_or(usize::MAX);
            if !(1..=member_count).contains(&min_active) {
                return Err("组合buff生效数量需在1到成员数之间".to_string());
            }
            if min_active == member_count {
                composite.min_active = None;
            }
        }
    }
    composites.sort_unstable_by_key(|composite| composite.id);
    if composites.windows(2).any(|pair| pair[0].id == pair[1].id) {
        return Err("组合buff ID重复".to_string());
    }
    Ok(())
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
/// tracked; `scope` and `merge` decide how they fold into display tracks,
/// and `duration_ms` (the configured lifetime) times their countdowns. The
/// HUD payload and the voice projection both read those tracks (see
/// `projections::entity_duration`).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WatchedEntitySpec {
    pub monster_id: i32,
    #[serde(default)]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub scope: EntityOwnerScope,
    #[serde(default)]
    pub merge: bool,
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

/// Maximum skills shown per profession in the teammate cooldown panel.
pub const TEAMMATE_CD_MAX_SKILLS_PER_CLASS: usize = 32;

/// Teammate skills the team-cooldown panel shows. Teammates share every
/// cooldown; this selection is applied locally before publication.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct TeammateCdRuntimeSnapshot {
    pub enabled: bool,
    pub classes: Vec<TeammateCdClassSkills>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct TeammateCdClassSkills {
    /// Profession id (`EntityIdentity::profession_id`).
    pub class_id: i32,
    /// Base skill ids (`skill_level_id / 100`) in display order.
    pub skill_ids: Vec<i32>,
}

impl TeammateCdRuntimeSnapshot {
    /// Drops duplicate classes and skills (first wins) and caps each class.
    fn normalize(&mut self) {
        let mut seen_classes = std::collections::HashSet::new();
        self.classes
            .retain(|class| seen_classes.insert(class.class_id));
        for class in &mut self.classes {
            let mut seen = std::collections::HashSet::new();
            class.skill_ids.retain(|id| *id > 0 && seen.insert(*id));
            class.skill_ids.truncate(TEAMMATE_CD_MAX_SKILLS_PER_CLASS);
        }
        self.classes.retain(|class| !class.skill_ids.is_empty());
    }

    #[must_use]
    pub fn skills_for(&self, class_id: i32) -> &[i32] {
        self.classes
            .iter()
            .find(|class| class.class_id == class_id)
            .map_or(&[], |class| class.skill_ids.as_slice())
    }
}

fn describe_snapshot(snapshot: &MonitorRuntimeSnapshot) -> String {
    format!(
        "locale={} event_update_rate_ms={} skill_enabled={} monitored_skills={} monitored_buffs={} panel_attrs={} counter_rules={} monster_enabled={} monster_global={} monster_self_applied={} monster_watched_entities={} teammate_enabled={} teammate_any={} teammate_local={} teammate_self={} buff_composites={}",
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
        snapshot.teammate.target_self_source_ids.len(),
        snapshot.buff_composites.len()
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
            merge: false,
        }
    }

    #[test]
    fn watched_entities_are_deduplicated_by_id_and_scope_and_kept_when_monster_disabled() {
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

        // Voice cues keep working with the monster monitor switched off.
        snapshot.monster.enabled = false;
        let disabled = snapshot.normalize().expect("disabled snapshot is valid");
        assert_eq!(
            disabled.monster.watched_entities,
            normalized.monster.watched_entities
        );
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
                merge: false,
            }
        );
        let merged: WatchedEntitySpec =
            serde_json::from_str(r#"{"monsterId":7,"scope":"any","merge":true}"#)
                .expect("merged spec parses");
        assert!(merged.merge);
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

    fn composite(id: i32, member_ids: Vec<i32>) -> BuffCompositeSpec {
        BuffCompositeSpec {
            id,
            member_ids,
            min_active: None,
        }
    }

    fn threshold(id: i32, member_ids: Vec<i32>, min_active: u32) -> BuffCompositeSpec {
        BuffCompositeSpec {
            min_active: Some(min_active),
            ..composite(id, member_ids)
        }
    }

    #[test]
    fn composite_thresholds_stay_within_the_member_count() {
        let snapshot = with_composites(vec![
            threshold(-1, vec![1, 2, 3], 2),
            threshold(-2, vec![1, 2, 3], 3),
        ]);
        let normalized = snapshot.normalize().expect("thresholds are valid");
        // Requiring every member is spelled without a threshold.
        assert_eq!(
            normalized.buff_composites,
            vec![
                composite(-2, vec![1, 2, 3]),
                threshold(-1, vec![1, 2, 3], 2)
            ]
        );

        for invalid in [threshold(-1, vec![1, 2], 0), threshold(-1, vec![1, 2], 3)] {
            assert!(with_composites(vec![invalid]).normalize().is_err());
        }
    }

    #[test]
    fn composite_threshold_deserializes_as_optional() {
        let spec: BuffCompositeSpec = serde_json::from_str(r#"{"id":-1,"memberIds":[1,2]}"#)
            .expect("specs without a threshold still deserialize");
        assert_eq!(spec.min_active, None);
    }

    fn with_composites(buff_composites: Vec<BuffCompositeSpec>) -> MonitorRuntimeSnapshot {
        MonitorRuntimeSnapshot {
            buff_composites,
            ..MonitorRuntimeSnapshot::default()
        }
    }

    #[test]
    fn composites_are_validated_and_sorted_by_id() {
        let snapshot = with_composites(vec![
            composite(-1, vec![3, 1, 3]),
            composite(-9, vec![5, 6]),
        ]);
        let normalized = snapshot.normalize().expect("composites are valid");
        assert_eq!(
            normalized.buff_composites,
            vec![composite(-9, vec![5, 6]), composite(-1, vec![1, 3])]
        );

        for invalid in [
            vec![composite(1, vec![1, 2])],
            vec![composite(-1, vec![1, 1])],
            vec![composite(-1, vec![1, -2])],
            vec![composite(-1, (1..=9).collect())],
            vec![composite(-1, vec![1, 2]), composite(-1, vec![3, 4])],
        ] {
            assert!(with_composites(invalid).normalize().is_err());
        }
    }

    #[test]
    fn composite_ids_pass_only_while_defined() {
        let mut snapshot = with_composites(vec![composite(-1, vec![1, 2])]);
        snapshot.skill.enabled = true;
        snapshot.skill.monitored_buff_ids = vec![5, -2, -1];
        snapshot.skill.buff_timeline_ids = vec![-3, -1];

        let normalized = snapshot.normalize().expect("composite ids are valid");

        assert_eq!(normalized.skill.monitored_buff_ids, vec![-1, 5]);
        assert_eq!(normalized.skill.buff_timeline_ids, vec![-1]);
    }

    #[test]
    fn composites_survive_a_disabled_skill_monitor() {
        let snapshot = with_composites(vec![composite(-1, vec![1, 2])]);

        let normalized = snapshot.normalize().expect("composites are valid");

        assert_eq!(normalized.buff_composites.len(), 1);
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
