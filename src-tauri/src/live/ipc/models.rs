use crate::live::projections::combat::accumulator::CombatSourceStats;
use crate::live::projections::combat::stats::{CombatStats, HitExtrema, Skill};
use std::collections::HashMap;

/// Wall-clock anchors for the live header timer. Interpolation happens in
/// the UI; this DTO is never the DPS / history duration clock.
#[derive(
    specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, Copy, PartialEq, Eq,
)]
#[serde(rename_all = "camelCase")]
pub struct LiveDisplayClock {
    pub started_at_wall_ms: i64,
    pub accumulated_paused_ms: u64,
    pub paused_at_wall_ms: Option<i64>,
    pub ended_at_wall_ms: Option<i64>,
}

impl LiveDisplayClock {
    /// Stops the display clock at `ended_at_wall_ms`, folding an in-flight
    /// pause into `accumulated_paused_ms` so the frontend can ignore `now`.
    pub fn freeze(&mut self, ended_at_wall_ms: i64) {
        if let Some(paused_at) = self.paused_at_wall_ms.take() {
            let current_pause = ended_at_wall_ms.saturating_sub(paused_at).max(0);
            self.accumulated_paused_ms = self
                .accumulated_paused_ms
                .saturating_add(u64::try_from(current_pause).unwrap_or(0));
        }
        self.ended_at_wall_ms = Some(ended_at_wall_ms);
    }
}

/// Combat / segment topic for the live meter window (`live-combat`).
/// `scene_id`/`dungeon_difficulty` live only on the nested `combat` payload;
/// they were duplicated at this level, but every consumer already reads them
/// from `combat.sceneId`/`combat.dungeonDifficulty`.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveCombatPayload {
    pub revision: u64,
    pub active_segment_id: Option<u64>,
    pub displayed_segment_id: Option<u64>,
    pub combat: Option<LiveDataPayload>,
    pub display_clock: Option<LiveDisplayClock>,
    pub training: TrainingDummyState,
}

/// Player death replays (`live-deaths`), 50ms throttle. Dirty only when a
/// record is appended or the segment resets, so it never rides the combat
/// publication cadence.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveDeathsPayload {
    pub revision: u64,
    pub deaths: Vec<DeathRecord>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveScenePayload {
    pub revision: u64,
    pub scene_id: Option<i32>,
    pub dungeon_difficulty: Option<i32>,
    pub local_class_id: Option<i32>,
    pub local_talent_stage_cfg_id: Option<i32>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LivePullWindow {
    Live,
    HudOverlay,
}

/// Payload for the `live-pull-gate` lifecycle event.
///
/// The target window is named explicitly because JS `listen()` registers with
/// an `Any` event target, which Tauri matches regardless of how the emit is
/// addressed. Receivers compare `window` against their own label and ignore
/// gates meant for the other window.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct LivePullGatePayload {
    pub window: LivePullWindow,
    pub active: bool,
}

impl LivePullWindow {
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Live => crate::WINDOW_LIVE_LABEL,
            Self::HudOverlay => crate::WINDOW_HUD_OVERLAY_LABEL,
        }
    }

    #[must_use]
    pub fn from_label(label: &str) -> Option<Self> {
        match label {
            crate::WINDOW_LIVE_LABEL => Some(Self::Live),
            crate::WINDOW_HUD_OVERLAY_LABEL => Some(Self::HudOverlay),
            _ => None,
        }
    }
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveWindowFrameRequest {
    pub epoch: Option<u64>,
    pub combat_revision: Option<u64>,
    pub fantasy_revision: Option<u64>,
    pub deaths_revision: Option<u64>,
    pub include_deaths: bool,
}

#[derive(specta::Type, serde::Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveWindowFrame {
    pub active: bool,
    pub epoch: u64,
    pub combat: Option<LiveCombatPayload>,
    pub fantasy: Option<LiveFantasyPayload>,
    pub deaths: Option<LiveDeathsPayload>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HudFrameRequest {
    pub epoch: Option<u64>,
    pub status_revision: Option<u64>,
    pub buffs_revision: Option<u64>,
    pub monster_revision: Option<u64>,
    pub fantasy_revision: Option<u64>,
    pub snapshot_revision: Option<u64>,
    pub skill_cast_cursor: Option<u64>,
    pub game_interest: bool,
    pub monster_interest: bool,
    pub minimap_interest: bool,
}

#[derive(specta::Type, serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MinimapSnapshotUpdate {
    pub revision: u64,
    pub snapshot: Option<MinimapSnapshot>,
}

#[derive(specta::Type, serde::Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HudFrame {
    pub active: bool,
    pub epoch: u64,
    pub status: Option<LiveStatusPayload>,
    pub buffs: Option<LiveBuffsPayload>,
    pub monster: Option<LiveMonsterPayload>,
    pub fantasy: Option<LiveFantasyPayload>,
    pub snapshot: Option<MinimapSnapshotUpdate>,
    pub skill_casts: Vec<MinimapSkillCast>,
    pub skill_cast_cursor: u64,
    pub casts_reset: bool,
}

/// Skill CD / panel attrs / fight resource / shields / counters
/// (`live-status`). Published on the same 50ms cadence as the other overlay
/// pull topics when dirty. Overlay windows still read this through invoke
/// pull; it is not emitted as a WebView event.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveStatusPayload {
    pub revision: u64,
    pub counters: Vec<CounterUpdateState>,
    pub factor_counters: Vec<CounterUpdateState>,
    pub factor_source_item_ids: Vec<i32>,
    pub factor_slot_item_ids: Vec<i32>,
    /// Highest deep-sleep (800522) `seasonId` resolved from the last
    /// container sync/patch; `0` before any season data has been observed.
    pub season_id: i32,
    pub season_active_template_ids: Vec<i32>,
    pub skill_cds: Vec<SkillCdState>,
    pub panel_attrs: Vec<PanelAttrState>,
    pub shield_current_hp: i64,
    pub shield_max_hp: i64,
    pub shield_entries: Vec<ShieldDetailEntry>,
    pub fight_resource: Option<FightResourceState>,
}

/// Live coverage of one watched buff on the local player. `covered_ms` and
/// `active_ms` follow the shared active-window rule; the frontend only
/// divides and formats.
#[derive(
    specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, PartialEq, Eq,
)]
#[serde(rename_all = "camelCase")]
pub struct BuffCoverageEntry {
    pub base_id: i32,
    pub covered_ms: u64,
    pub active_ms: u64,
    pub active_now: bool,
    pub layer: i32,
    pub count: u32,
}

/// Local player buff list (`live-buffs`), 50ms throttle.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveBuffsPayload {
    pub revision: u64,
    pub local_buffs: Vec<BuffUpdateState>,
    /// Coverage rows for the configured watch list, in configured order.
    #[serde(default)]
    pub coverage: Vec<BuffCoverageEntry>,
}

/// Monster overlay topic (`live-monster`), 50ms throttle.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveMonsterPayload {
    pub revision: u64,
    pub boss_buffs: HashMap<String, Vec<BuffUpdateState>>,
    pub teammate_buffs: HashMap<String, Vec<BuffUpdateState>>,
    pub boss_mechanics: Vec<BossDbmEvent>,
    pub hate_lists: HashMap<String, Vec<HateEntry>>,
    pub stun: Vec<StunEntry>,
    pub hp: Vec<HpEntry>,
    pub player_names: HashMap<String, String>,
    pub monster_ids: HashMap<String, i32>,
}

/// Fantasy cast icons shared by live + monster overlay (`live-fantasy`).
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveFantasyPayload {
    pub revision: u64,
    pub teammate_fantasies: Vec<TeammateFantasyState>,
}

/// Represents the health of a boss.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BossHealth {
    /// The unique entity UUID of the boss, serialized as a string for JS safety.
    pub entity_uuid: String,
    /// Monster template ID used by the frontend to resolve the display name.
    pub monster_id: Option<i32>,
    /// The current HP of the boss.
    pub current_hp: Option<i64>,
    /// The maximum HP of the boss.
    pub max_hp: Option<i64>,
    /// Whether the boss is in ActorStateDead.
    pub is_dead: bool,
}

/// Represents a raw
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LiveDataPayload {
    pub elapsed_ms: String,
    pub damage_elapsed_ms: String,
    pub active_combat_time_ms: String,
    pub fight_start_timestamp_ms: String,
    pub total_dmg: String,
    pub total_dmg_boss_only: String,
    pub total_heal: String,
    pub total_effective_heal: String,
    pub local_player_uuid: String,
    pub scene_id: Option<i32>,
    pub dungeon_difficulty: Option<i32>,
    pub is_paused: bool,
    pub bosses: Vec<BossHealth>,
    pub entities: Vec<RawEntityData>,
}

impl Default for LiveDataPayload {
    fn default() -> Self {
        Self {
            elapsed_ms: zero_decimal(),
            damage_elapsed_ms: zero_decimal(),
            active_combat_time_ms: zero_decimal(),
            fight_start_timestamp_ms: zero_decimal(),
            total_dmg: zero_decimal(),
            total_dmg_boss_only: zero_decimal(),
            total_heal: zero_decimal(),
            total_effective_heal: zero_decimal(),
            local_player_uuid: String::new(),
            scene_id: None,
            dungeon_difficulty: None,
            is_paused: false,
            bosses: Vec::new(),
            entities: Vec::new(),
        }
    }
}

#[derive(
    specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, Copy, PartialEq, Eq,
)]
#[serde(rename_all = "camelCase")]
pub enum TrainingDummyPhase {
    #[default]
    Idle,
    Armed,
    Running,
    Finished,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrainingDummyState {
    pub phase: TrainingDummyPhase,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawEntityData {
    pub entity_uuid: String,
    pub display_uid: i64,
    pub name: String,
    pub class_id: i32,
    pub class_spec: i32,
    pub class_name: String,
    pub class_spec_name: String,
    pub ability_score: i32,
    pub season_strength: i32,
    pub damage: RawCombatStats,
    pub damage_boss_only: RawCombatStats,
    pub healing: RawCombatStats,
    pub taken: RawCombatStats,
    pub dmg_skills: HashMap<i64, RawSkillStats>,
    pub heal_skills: HashMap<i64, RawSkillStats>,
    pub taken_skills: HashMap<i64, RawSkillStats>,
    pub taken_per_source: Vec<PerSourceStats>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawCombatStats {
    pub total: String,
    pub effective_total: String,
    pub hits: String,
    pub crit_hits: String,
    pub crit_total: String,
    pub lucky_hits: String,
    pub lucky_total: String,
    pub trigger_hits: String,
    pub block_hits: String,
    pub lucky_block_hits: String,
}

impl Default for RawCombatStats {
    fn default() -> Self {
        Self {
            total: zero_decimal(),
            effective_total: zero_decimal(),
            hits: zero_decimal(),
            crit_hits: zero_decimal(),
            crit_total: zero_decimal(),
            lucky_hits: zero_decimal(),
            lucky_total: zero_decimal(),
            trigger_hits: zero_decimal(),
            block_hits: zero_decimal(),
            lucky_block_hits: zero_decimal(),
        }
    }
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RawHitExtrema {
    pub min: String,
    pub max: String,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawSkillStats {
    pub total_value: String,
    pub effective_total_value: String,
    pub hits: String,
    pub crit_hits: String,
    pub crit_total_value: String,
    pub lucky_hits: String,
    pub lucky_total_value: String,
    pub property: Option<i32>,
    pub damage_mode: Option<i32>,
    pub trigger_hits: String,
    pub block_hits: String,
    pub lucky_block_hits: String,
    #[serde(default)]
    pub extrema: Option<RawHitExtrema>,
}

impl Default for RawSkillStats {
    fn default() -> Self {
        Self {
            total_value: zero_decimal(),
            effective_total_value: zero_decimal(),
            hits: zero_decimal(),
            crit_hits: zero_decimal(),
            crit_total_value: zero_decimal(),
            lucky_hits: zero_decimal(),
            lucky_total_value: zero_decimal(),
            property: None,
            damage_mode: None,
            trigger_hits: zero_decimal(),
            block_hits: zero_decimal(),
            lucky_block_hits: zero_decimal(),
            extrema: None,
        }
    }
}

/// Damage taken by a defender, aggregated by the attacking monster's template.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PerSourceStats {
    /// Monster template id of the attacker. None when the source was unknown.
    pub source_monster_id: Option<i32>,
    pub total_value: String,
    pub taken: RawCombatStats,
    pub skills: HashMap<i64, RawSkillStats>,
}

impl Default for PerSourceStats {
    fn default() -> Self {
        Self {
            source_monster_id: None,
            total_value: zero_decimal(),
            taken: RawCombatStats::default(),
            skills: HashMap::new(),
        }
    }
}

fn zero_decimal() -> String {
    "0".to_string()
}

pub fn to_raw_combat_stats(stats: &CombatStats) -> RawCombatStats {
    RawCombatStats {
        total: stats.total.to_string(),
        effective_total: stats.effective_total.to_string(),
        hits: stats.hits.to_string(),
        crit_hits: stats.crit_hits.to_string(),
        crit_total: stats.crit_total.to_string(),
        lucky_hits: stats.lucky_hits.to_string(),
        lucky_total: stats.lucky_total.to_string(),
        trigger_hits: stats.trigger_hits.to_string(),
        block_hits: stats.block_hits.to_string(),
        lucky_block_hits: stats.lucky_block_hits.to_string(),
    }
}

pub fn to_raw_hit_extrema(extrema: Option<HitExtrema>) -> Option<RawHitExtrema> {
    extrema.map(|extrema| RawHitExtrema {
        min: extrema.min.to_string(),
        max: extrema.max.to_string(),
    })
}

pub fn to_raw_skill_stats(skill: &Skill) -> RawSkillStats {
    RawSkillStats {
        total_value: skill.total_value.to_string(),
        effective_total_value: skill.effective_total_value.to_string(),
        hits: skill.hits.to_string(),
        crit_hits: skill.crit_hits.to_string(),
        crit_total_value: skill.crit_total_value.to_string(),
        lucky_hits: skill.lucky_hits.to_string(),
        lucky_total_value: skill.lucky_total_value.to_string(),
        property: skill.property,
        damage_mode: skill.damage_mode,
        trigger_hits: skill.trigger_hits.to_string(),
        block_hits: skill.block_hits.to_string(),
        lucky_block_hits: skill.lucky_block_hits.to_string(),
        extrema: to_raw_hit_extrema(skill.extrema),
    }
}

/// Map the incrementally maintained taken-source projection to the live DTO.
pub fn build_taken_per_source(
    sources: &HashMap<Option<i32>, CombatSourceStats>,
) -> Vec<PerSourceStats> {
    let mut rows = sources.iter().collect::<Vec<_>>();
    rows.sort_unstable_by(|left, right| right.1.stats.total.cmp(&left.1.stats.total));
    rows.into_iter()
        .map(|(source_monster_id, source)| PerSourceStats {
            source_monster_id: *source_monster_id,
            total_value: source.stats.total.to_string(),
            taken: to_raw_combat_stats(&source.stats),
            skills: source
                .skills
                .iter()
                .map(|(skill_id, skill)| (*skill_id, to_raw_skill_stats(skill)))
                .collect(),
        })
        .collect()
}

/// Represents a skill cooldown state.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillCdState {
    /// The skill level ID.
    pub skill_level_id: i32,
    /// The cooldown begin timestamp
    pub begin_time: i64,
    /// The total duration of the cooldown in milliseconds.
    /// -1 indicates a charge/resource style entry.
    pub duration: i32,
    /// The cooldown type enum value
    pub skill_cd_type: i32,
    /// The server-reported valid cooldown time in milliseconds.
    pub valid_cd_time: i32,
    /// Local timestamp when this cooldown state was received
    pub received_at: i64,
    /// Cooldown duration after applying AttrSkillCD/AttrSkillCDPCT and TempAttr rules.
    pub calculated_duration: i32,
    /// Cooldown accelerate rate for this skill
    pub cd_accelerate_rate: f32,
}

/// Represents a buff update state.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuffUpdateState {
    pub base_id: i32,
    pub layer: i32,
    pub duration_ms: i32,
    pub create_time_ms: i64,
    pub source_remodel_level: Option<i64>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BossDbmEvent {
    pub skill_effect_id: i32,
    pub base_skill_id: i32,
    pub duration_ms: i32,
    pub create_time_ms: i64,
    pub insertion: i32,
    pub server_timestamp_ms: Option<i64>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TeammateFantasyState {
    pub summon_uuid: String,
    pub summoner_uuid: String,
    pub summoner_name: Option<String>,
    pub monster_id: i32,
    /// Normalized resonance skill id that summoned this fantasy, when known.
    pub resonance_skill_id: Option<i32>,
    pub remodel_level: i64,
    pub detected_at_ms: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HateEntry {
    pub entity_uuid: String,
    pub hate_val: u32,
}

/// Classification of an entity rendered on the minimap.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MinimapEntityKind {
    /// The local player.
    Local,
    /// A teammate (party member that is not the local player).
    Teammate,
    /// A boss-tier monster.
    Boss,
    /// Any other monster.
    Monster,
    /// A non-monster dummy/mechanic helper entity.
    Dummy,
    /// Other renderable non-character entities.
    Other,
}

/// Raw entity type exposed to the minimap as a reusable fact.
#[derive(
    specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default,
)]
#[serde(rename_all = "camelCase")]
pub enum MinimapEntityType {
    #[default]
    Unknown,
    Monster,
    Npc,
    SceneObject,
    Zone,
    Bullet,
    ClientBullet,
    Pet,
    Char,
    Dummy,
    Drop,
    Field,
    Trap,
    Collection,
    StaticObject,
    Vehicle,
    Toy,
    CommunityHouse,
    HouseItem,
    Other,
}

/// A single active buff fact currently known to the minimap.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MinimapBuffFact {
    /// Entity UUID carrying this buff.
    pub target_entity_uuid: String,
    /// Runtime buff instance id.
    pub buff_uuid: i32,
    /// Buff template id.
    pub base_id: i32,
    /// Current stack/layer.
    pub layer: i32,
    /// Buff creation time in the local time domain (server_clock_offset applied).
    pub create_time_ms: i64,
    /// Buff duration in milliseconds (0 if unknown/permanent).
    pub duration_ms: i32,
    /// Runtime source/caster entity when the server includes it.
    pub fire_uuid: Option<String>,
    /// Skill/buff config id that caused this buff, when available.
    pub source_config_id: Option<i32>,
    /// `PlayEffect` effect ids from the buff's logic_effects, in wire order.
    pub effect_ids: Vec<i32>,
}

/// A single entity fact rendered/interpreted by the 2D minimap overlay.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MinimapEntity {
    /// Entity UUID as string (avoids JS bigint truncation, matching existing convention).
    pub entity_uuid: String,
    /// Raw entity type normalized for frontend use.
    pub entity_type: MinimapEntityType,
    /// What the entity is, used by the frontend to pick color/size.
    pub kind: MinimapEntityKind,
    /// Horizontal map coordinate.
    pub x: f32,
    /// Vertical game coordinate.
    pub y: f32,
    /// Depth map coordinate (game `z`, not vertical height).
    pub z: f32,
    /// Display name when known.
    pub name: Option<String>,
    /// Monster template id when the entity is a monster.
    pub monster_id: Option<i32>,
    /// Yaw facing in degrees when known (attr 0x32, stored as centidegrees).
    pub facing: Option<f32>,
    /// Whether the entity is currently in the dead actor state.
    pub is_dead: bool,
    /// Top-level summoner/owner UUID when present.
    pub top_summoner_id: Option<String>,
}

/// One monster skill cast event observed from `ATTR_SKILL_ID` (attribute 100).
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MinimapSkillCast {
    /// Entity UUID that emitted the skill cast.
    pub entity_uuid: String,
    /// Skill template id.
    pub skill_id: i32,
    /// Local receive time in milliseconds.
    pub time_ms: i64,
    /// World X position of the caster at cast time, when known.
    pub x: Option<f32>,
    /// World Z position of the caster at cast time, when known.
    pub z: Option<f32>,
    /// Yaw facing in degrees at cast time, when known.
    pub facing: Option<f32>,
}

/// One in-game player marker to render on the minimap.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MinimapMarker {
    /// Displayed marker number 1..=6, derived as `skill_id - MARKER_SKILL_ID_BASE`.
    pub marker: i32,
    pub skill_id: i32,
    pub x: Option<f32>,
    pub z: Option<f32>,
}

/// One frame of minimap data for a single scene.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MinimapSnapshot {
    /// Current scene id.
    pub scene_id: i32,
    /// Local player UUID for frontend grouping and display.
    pub local_player_uuid: String,
    /// All tracked entities that currently have a known position.
    pub entities: Vec<MinimapEntity>,
    /// Active buff facts selected by the scene/mechanic extraction config.
    pub buffs: Vec<MinimapBuffFact>,
    /// Active in-game player markers
    pub markers: Vec<MinimapMarker>,
}

/// Internal publication payload archived by the minimap pull cache.
#[derive(Debug, Clone)]
pub struct MinimapUpdatePayload {
    pub snapshot: Option<MinimapSnapshot>,
    pub skill_casts: Vec<MinimapSkillCast>,
}

/// Stamina/resilience snapshot for a single monster target.
/// `current` depletes from `max` as the monster is staggered; reaching 0
/// means the stagger threshold has been hit.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StunEntry {
    pub boss_entity_uuid: String,
    pub monster_id: i32,
    pub current: i64,
    pub max: i64,
}

/// Health snapshot for the current monster target.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HpEntry {
    pub boss_entity_uuid: String,
    pub monster_id: i32,
    pub current: i64,
    pub max: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CounterUpdateState {
    pub rule_id: i32,
    pub slots: Vec<SlotUpdateState>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SlotUpdateState {
    pub slot_id: i32,
    pub current_count: u32,
    pub threshold: Option<u32>,
    pub effective_threshold: Option<u32>,
    pub is_counting: bool,
    pub reset_buff_active: bool,
    pub freeze_until_ms: Option<i64>,
    pub freeze_duration_ms: Option<u64>,
    pub effective_freeze_duration_ms: Option<u64>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PanelAttrState {
    pub attr_id: i32,
    pub value: i32,
}

/// A single shield entry parsed from attr 60050.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShieldDetailEntry {
    pub buff_uuid: i64,
    pub display_type: i32,
    /// Current shield value (field 3)
    pub current: i64,
    /// Initial shield value when the buff was applied (field 4)
    pub initial_shield: i64,
    /// Max shield value (field 5)
    pub max_shield: i64,
    /// Base ID of the buff (from buff monitor lookup), 0 if unknown
    pub base_id: i32,
    /// Local-clock expiry timestamp in ms, 0 if unknown or permanent
    pub expire_time_ms: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FightResourceEntry {
    pub id: i32,
    pub value: i64,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FightResourceState {
    /// The full list of fight resource id/value pairs
    pub entries: Vec<FightResourceEntry>,
    /// Local timestamp when this state was received
    pub received_at: i64,
}

/// A single damage event recorded in the 2s sliding window used for death replay.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DamageSnapshot {
    /// Absolute timestamp in milliseconds since UNIX epoch.
    pub timestamp_ms: String,
    /// Attacker entity UUID, serialized as a string for JS safety. None for unknown sources.
    pub attacker_entity_uuid: Option<String>,
    /// Monster type id of the attacker, if the attacker is a monster. None otherwise.
    pub attacker_monster_type_id: Option<i32>,
    /// Skill key produced by `damage_id::compute_damage_id`.
    pub skill_key: i64,
    /// Raw damage value.
    pub value: String,
    /// Element/property id from the hit packet. None when the packet omitted it.
    #[serde(default)]
    pub property: Option<i32>,
    /// Physical/magical mode from the hit packet. None when the packet omitted it.
    #[serde(default)]
    pub damage_mode: Option<i32>,
}

/// A single active buff copied at the moment a death replay record is created.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeathBuffSnapshot {
    pub base_id: i32,
    pub buff_uuid: i32,
    pub layer: i32,
    pub duration_ms: i32,
    pub create_time_ms: i64,
    pub source_entity_uuid: Option<String>,
    pub source_config_id: Option<i32>,
}

/// Active buffs for one attacker that contributed to a death replay window.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeathParticipantBuffSnapshot {
    /// Attacker entity UUID, serialized as a string for JS safety. None for unknown sources.
    pub entity_uuid: Option<String>,
    /// Monster type id of the attacker, if the attacker is a monster. None otherwise.
    pub monster_type_id: Option<i32>,
    #[serde(default)]
    pub buffs: Vec<DeathBuffSnapshot>,
}

/// A death replay record, capturing the damage taken within the window leading up to a death.
#[derive(specta::Type, serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeathRecord {
    pub victim_entity_uuid: String,
    pub death_timestamp_ms: String,
    /// Damage snapshots in chronological order (oldest first).
    #[serde(default)]
    pub recent_damages: Vec<DamageSnapshot>,
    #[serde(default)]
    pub victim_buffs: Vec<DeathBuffSnapshot>,
    #[serde(default)]
    pub participant_buffs: Vec<DeathParticipantBuffSnapshot>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pull_window_labels_only_accept_live_and_hud() {
        assert_eq!(
            LivePullWindow::from_label(crate::WINDOW_LIVE_LABEL),
            Some(LivePullWindow::Live)
        );
        assert_eq!(
            LivePullWindow::from_label(crate::WINDOW_HUD_OVERLAY_LABEL),
            Some(LivePullWindow::HudOverlay)
        );
        for retired in ["game-overlay", "monster-overlay", "minimap-overlay"] {
            assert_eq!(LivePullWindow::from_label(retired), None);
        }
    }

    #[test]
    fn combat_totals_serialize_as_exact_decimal_strings() {
        let stats = CombatStats {
            total: u128::MAX,
            effective_total: u128::MAX - 1,
            hits: u128::MAX - 2,
            ..Default::default()
        };
        let dto = to_raw_combat_stats(&stats);
        assert_eq!(dto.total, u128::MAX.to_string());
        assert_eq!(dto.effective_total, (u128::MAX - 1).to_string());
        assert_eq!(dto.hits, (u128::MAX - 2).to_string());

        let json = serde_json::to_value(dto).expect("serialize combat DTO");
        assert_eq!(json["total"], u128::MAX.to_string());
        assert!(json["total"].is_string());
    }

    #[test]
    fn decimal_dto_defaults_are_zero_not_empty() {
        let live = LiveDataPayload::default();
        assert_eq!(live.elapsed_ms, "0");
        assert_eq!(live.damage_elapsed_ms, "0");
        assert_eq!(live.total_dmg, "0");
        assert_eq!(live.total_effective_heal, "0");

        let combat = RawCombatStats::default();
        assert_eq!(combat.total, "0");
        assert_eq!(combat.lucky_block_hits, "0");
        let skill = RawSkillStats::default();
        assert_eq!(skill.total_value, "0");
        assert_eq!(skill.trigger_hits, "0");
    }

    #[test]
    fn death_snapshot_preserves_u128_max_without_json_number() {
        let dto = DamageSnapshot {
            timestamp_ms: u128::MAX.to_string(),
            attacker_entity_uuid: None,
            attacker_monster_type_id: None,
            skill_key: 7,
            value: u128::MAX.to_string(),
            property: Some(3),
            damage_mode: Some(2),
        };
        assert_eq!(dto.timestamp_ms, u128::MAX.to_string());
        assert_eq!(dto.value, u128::MAX.to_string());

        let json = serde_json::to_value(dto).expect("serialize damage DTO");
        assert!(json["timestampMs"].is_string());
        assert!(json["value"].is_string());
    }

    #[test]
    fn display_clock_freeze_folds_an_open_pause() {
        let mut clock = LiveDisplayClock {
            started_at_wall_ms: 1_000,
            accumulated_paused_ms: 200,
            paused_at_wall_ms: Some(5_000),
            ended_at_wall_ms: None,
        };
        clock.freeze(8_000);
        assert_eq!(
            clock,
            LiveDisplayClock {
                started_at_wall_ms: 1_000,
                accumulated_paused_ms: 3_200,
                paused_at_wall_ms: None,
                ended_at_wall_ms: Some(8_000),
            }
        );
    }

    #[test]
    fn display_clock_freeze_without_pause_only_stamps_the_end() {
        let mut clock = LiveDisplayClock {
            started_at_wall_ms: 1_000,
            accumulated_paused_ms: 0,
            paused_at_wall_ms: None,
            ended_at_wall_ms: None,
        };
        clock.freeze(4_000);
        assert_eq!(clock.ended_at_wall_ms, Some(4_000));
        assert_eq!(clock.accumulated_paused_ms, 0);
        assert_eq!(clock.paused_at_wall_ms, None);
    }
}
