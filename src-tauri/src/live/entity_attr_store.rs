use crate::live::commands_models::{HateEntry, PanelAttrState, ShieldDetailEntry};
use crate::live::opcodes_models::{AttrType, AttrValue, Entity, PositionAttr};
use blueprotobuf_lib::blueprotobuf::EActorState;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct DeathEvent {
    pub entity_uuid: i64,
    pub timestamp_ms: u128,
}

#[derive(Debug, Clone)]
pub struct SkillCastEvent {
    pub entity_uuid: i64,
    pub skill_id: i32,
    pub timestamp_ms: i64,
}

/// View-state attributes that become stale once a stat-bearing entity leaves
/// view. They are re-synced when the entity re-appears, so they are dropped on
/// disappear while identity/stat attributes are preserved.
const TRANSIENT_VIEW_ATTRS: &[AttrType] = &[
    AttrType::CurrentHp,
    AttrType::MaxHp,
    AttrType::MaxStunned,
    AttrType::CurrentStunned,
    AttrType::Position,
];

#[derive(Debug, Default)]
pub struct EntityAttrStore {
    attrs: HashMap<i64, HashMap<AttrType, AttrValue>>,
    hate_lists: HashMap<i64, Vec<HateEntry>>,
    fight_resource_ids: HashMap<i64, Vec<i32>>,
    temp_attrs: HashMap<i32, i32>,
    local_player_uuid: i64,
    panel_attr_values: HashMap<i32, i32>,
    cd_dirty: bool,
    panel_dirty_attrs: Vec<PanelAttrState>,
    shield_detail_entries: Vec<ShieldDetailEntry>,
    shield_detail_dirty: bool,
    death_events: Vec<DeathEvent>,
    skill_cast_events: Vec<SkillCastEvent>,
    /// Whether monster skill casts should be recorded at all. Driven by the active
    /// scene: only minimap scenes need them, so normal combat records nothing.
    record_skill_casts: bool,
}

#[derive(Debug, Default)]
pub struct AttrChanges {
    pub cd_dirty: bool,
    pub panel_dirty_attrs: Vec<PanelAttrState>,
    pub shield_detail_dirty: bool,
    pub shield_detail_entries: Vec<ShieldDetailEntry>,
    pub death_events: Vec<DeathEvent>,
    pub skill_cast_events: Vec<SkillCastEvent>,
}

impl EntityAttrStore {
    pub fn with_capacity(attr_entries: usize) -> Self {
        Self {
            attrs: HashMap::with_capacity(attr_entries),
            hate_lists: HashMap::new(),
            fight_resource_ids: HashMap::new(),
            temp_attrs: HashMap::new(),
            local_player_uuid: 0,
            panel_attr_values: HashMap::new(),
            cd_dirty: false,
            panel_dirty_attrs: Vec::with_capacity(8),
            shield_detail_entries: Vec::new(),
            shield_detail_dirty: false,
            death_events: Vec::new(),
            skill_cast_events: Vec::new(),
            record_skill_casts: false,
        }
    }

    pub fn set_local_uuid(&mut self, entity_uuid: i64) {
        self.local_player_uuid = entity_uuid;
    }

    pub fn local_player_uuid(&self) -> i64 {
        self.local_player_uuid
    }

    pub fn set_attr(&mut self, uid: i64, attr_type: AttrType, value: AttrValue) -> bool {
        // Snapshot previous ActorState dead flag before mutating so we can detect a
        // non-Dead -> Dead edge after the write.
        let was_dead = matches!(attr_type, AttrType::ActorState) && self.is_dead(uid);

        let changed = self
            .attrs
            .entry(uid)
            .or_default()
            .get(&attr_type)
            .is_none_or(|prev| *prev != value);
        if !changed {
            return false;
        }
        self.attrs.entry(uid).or_default().insert(attr_type, value);
        if uid == self.local_player_uuid
            && matches!(
                attr_type,
                AttrType::SkillCd | AttrType::SkillCdPct | AttrType::CdAcceleratePct
            )
        {
            self.cd_dirty = true;
        }
        if uid == self.local_player_uuid
            && matches!(attr_type, AttrType::CurrentHp | AttrType::MaxHp)
        {
            self.shield_detail_dirty = true;
        }

        if matches!(attr_type, AttrType::ActorState) {
            let is_dead_now = self.is_dead(uid);
            if !was_dead && is_dead_now {
                let timestamp_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();
                self.death_events.push(DeathEvent {
                    entity_uuid: uid,
                    timestamp_ms,
                });
            }
        }

        true
    }

    /// Toggle skill-cast recording. Enabled only while inside a minimap scene so
    /// ordinary combat never buffers monster skill events.
    pub fn set_skill_cast_recording(&mut self, enabled: bool) {
        self.record_skill_casts = enabled;
        if !enabled {
            self.skill_cast_events.clear();
        }
    }

    pub fn push_skill_cast(&mut self, entity_uuid: i64, skill_id: i32) {
        if !self.record_skill_casts || skill_id <= 0 {
            return;
        }
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(i64::MAX as u128) as i64;
        self.skill_cast_events.push(SkillCastEvent {
            entity_uuid,
            skill_id,
            timestamp_ms,
        });
    }

    pub fn set_panel_attr(&mut self, attr_id: i32, value: i32) -> bool {
        let prev = self.panel_attr_values.insert(attr_id, value);
        if prev == Some(value) {
            return false;
        }
        self.panel_dirty_attrs
            .push(PanelAttrState { attr_id, value });
        true
    }

    pub fn panel_attr_value(&self, attr_id: i32) -> Option<i32> {
        self.panel_attr_values.get(&attr_id).copied()
    }

    pub fn set_fight_resource_ids(&mut self, uid: i64, ids: Vec<i32>) -> bool {
        let changed = self
            .fight_resource_ids
            .get(&uid)
            .is_none_or(|prev| prev.as_slice() != ids.as_slice());
        if !changed {
            return false;
        }
        self.fight_resource_ids.insert(uid, ids);
        true
    }

    pub fn fight_resource_ids(&self, uid: i64) -> &[i32] {
        self.fight_resource_ids
            .get(&uid)
            .map_or(&[], std::vec::Vec::as_slice)
    }

    pub fn set_temp_attr(&mut self, attr_id: i32, value: i32) -> bool {
        let prev = self.temp_attrs.insert(attr_id, value);
        if prev == Some(value) {
            return false;
        }
        self.cd_dirty = true;
        true
    }

    pub fn attr(&self, uid: i64, attr_type: AttrType) -> Option<&AttrValue> {
        self.attrs
            .get(&uid)
            .and_then(|entity_attrs| entity_attrs.get(&attr_type))
    }

    pub fn attr_int_by_id(&self, uid: i64, attr_id: i32) -> Option<i64> {
        let entity_attrs = self.attrs.get(&uid)?;
        let attr_type = AttrType::from_id(attr_id).unwrap_or(AttrType::Unknown(attr_id));
        entity_attrs.get(&attr_type).and_then(AttrValue::as_int)
    }

    pub fn attr_position_by_id(&self, uid: i64, attr_id: i32) -> Option<PositionAttr> {
        let entity_attrs = self.attrs.get(&uid)?;
        let attr_type = AttrType::from_id(attr_id).unwrap_or(AttrType::Unknown(attr_id));
        entity_attrs
            .get(&attr_type)
            .and_then(AttrValue::as_position)
    }

    pub fn hate_list_mut(&mut self, uid: i64) -> &mut Vec<HateEntry> {
        self.hate_lists
            .entry(uid)
            .or_insert_with(|| Vec::with_capacity(8))
    }

    pub fn hate_lists(&self) -> &HashMap<i64, Vec<HateEntry>> {
        &self.hate_lists
    }

    pub fn is_dead(&self, uid: i64) -> bool {
        self.attr(uid, AttrType::ActorState)
            .and_then(AttrValue::as_int)
            .is_some_and(|value| value == i64::from(EActorState::ActorStateDead as i32))
    }

    pub fn hydrate_entity(&self, uid: i64, entity: &mut Entity) {
        if let Some(name) = self
            .attr(uid, AttrType::Name)
            .and_then(AttrValue::as_string)
        {
            if !name.is_empty() {
                entity.name = name.to_string();
            }
        }
        if let Some(value) = self
            .attr(uid, AttrType::ProfessionId)
            .and_then(AttrValue::as_int)
        {
            entity.class_id = value as i32;
        }
        if let Some(value) = self
            .attr(uid, AttrType::FightPoint)
            .and_then(AttrValue::as_int)
        {
            entity.ability_score = value as i32;
        }
        if let Some(value) = self.attr(uid, AttrType::Level).and_then(AttrValue::as_int) {
            entity.level = value as i32;
        }
        if let Some(value) = self
            .attr(uid, AttrType::SeasonStrength)
            .and_then(AttrValue::as_int)
        {
            entity.season_strength = value as i32;
        }
    }

    pub fn temp_attrs(&self) -> &HashMap<i32, i32> {
        &self.temp_attrs
    }

    pub fn cd_inputs(&self) -> (f32, f32, f32) {
        let uid = self.local_player_uuid;
        let attr_skill_cd = self
            .attr(uid, AttrType::SkillCd)
            .and_then(AttrValue::as_int)
            .unwrap_or(0) as f32;
        let attr_skill_cd_pct = self
            .attr(uid, AttrType::SkillCdPct)
            .and_then(AttrValue::as_int)
            .unwrap_or(0) as f32;
        let attr_cd_accelerate_pct = self
            .attr(uid, AttrType::CdAcceleratePct)
            .and_then(AttrValue::as_int)
            .unwrap_or(0) as f32;
        (attr_skill_cd, attr_skill_cd_pct, attr_cd_accelerate_pct)
    }

    pub fn mark_cd_dirty(&mut self) {
        self.cd_dirty = true;
    }

    pub fn set_shield_detail(&mut self, entries: Vec<ShieldDetailEntry>) {
        self.shield_detail_entries = entries;
        self.shield_detail_dirty = true;
    }

    pub fn clear_all_entities(&mut self) {
        self.attrs.clear();
        self.hate_lists.clear();
        self.fight_resource_ids.clear();
        self.temp_attrs.clear();
        self.panel_dirty_attrs
            .extend(self.panel_attr_values.keys().map(|attr_id| PanelAttrState {
                attr_id: *attr_id,
                value: 0,
            }));
        self.panel_attr_values.clear();
        self.shield_detail_entries.clear();
        self.shield_detail_dirty = true;
        self.death_events.clear();
        self.skill_cast_events.clear();
    }

    pub fn remove_entity(&mut self, uid: i64) {
        self.attrs.remove(&uid);
        self.hate_lists.remove(&uid);
        self.fight_resource_ids.remove(&uid);
    }

    /// Drop transient view attributes (HP, position) and the hate list for a
    /// stat-bearing entity (char/monster) that left view, while keeping its
    /// identity and accumulated combat stats for settlement. The dropped values
    /// are re-synced when the entity re-appears.
    pub fn clear_transient_attrs(&mut self, uid: i64) {
        if let Some(entity_attrs) = self.attrs.get_mut(&uid) {
            for attr_type in TRANSIENT_VIEW_ATTRS {
                entity_attrs.remove(attr_type);
            }
        }
        self.hate_lists.remove(&uid);
    }

    pub fn drain_changes(&mut self) -> AttrChanges {
        let shield_dirty = std::mem::take(&mut self.shield_detail_dirty);
        let shield_entries = if shield_dirty {
            self.shield_detail_entries.clone()
        } else {
            Vec::new()
        };
        AttrChanges {
            cd_dirty: std::mem::take(&mut self.cd_dirty),
            panel_dirty_attrs: std::mem::take(&mut self.panel_dirty_attrs),
            shield_detail_dirty: shield_dirty,
            shield_detail_entries: shield_entries,
            death_events: std::mem::take(&mut self.death_events),
            skill_cast_events: std::mem::take(&mut self.skill_cast_events),
        }
    }
}
