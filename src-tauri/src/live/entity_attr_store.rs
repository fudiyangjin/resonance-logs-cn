use crate::live::commands_models::{HateEntry, PanelAttrState, ShieldDetailEntry};
use crate::live::opcodes_models::{AttrType, AttrValue, Entity};
use blueprotobuf_lib::blueprotobuf::EActorState;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct DeathEvent {
    pub uid: i64,
    pub timestamp_ms: u128,
}

#[derive(Debug, Default)]
pub struct EntityAttrStore {
    attrs: HashMap<i64, HashMap<AttrType, AttrValue>>,
    hate_lists: HashMap<i64, Vec<HateEntry>>,
    fight_resource_ids: HashMap<i64, Vec<i32>>,
    temp_attrs: HashMap<i32, i32>,
    local_player_uid: i64,
    panel_attr_values: HashMap<i32, i32>,
    cd_dirty: bool,
    panel_dirty_attrs: Vec<PanelAttrState>,
    shield_detail_entries: Vec<ShieldDetailEntry>,
    shield_detail_dirty: bool,
    death_events: Vec<DeathEvent>,
}

#[derive(Debug, Default)]
pub struct AttrChanges {
    pub cd_dirty: bool,
    pub panel_dirty_attrs: Vec<PanelAttrState>,
    pub shield_detail_dirty: bool,
    pub shield_detail_entries: Vec<ShieldDetailEntry>,
    pub death_events: Vec<DeathEvent>,
}

impl EntityAttrStore {
    pub fn with_capacity(attr_entries: usize) -> Self {
        Self {
            attrs: HashMap::with_capacity(attr_entries),
            hate_lists: HashMap::new(),
            fight_resource_ids: HashMap::new(),
            temp_attrs: HashMap::new(),
            local_player_uid: 0,
            panel_attr_values: HashMap::new(),
            cd_dirty: false,
            panel_dirty_attrs: Vec::with_capacity(8),
            shield_detail_entries: Vec::new(),
            shield_detail_dirty: false,
            death_events: Vec::new(),
        }
    }

    pub fn set_local_uid(&mut self, uid: i64) {
        self.local_player_uid = uid;
    }

    pub fn local_player_uid(&self) -> i64 {
        self.local_player_uid
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
        if uid == self.local_player_uid
            && matches!(
                attr_type,
                AttrType::SkillCd | AttrType::SkillCdPct | AttrType::CdAcceleratePct
            )
        {
            self.cd_dirty = true;
        }

        if matches!(attr_type, AttrType::ActorState) {
            let is_dead_now = self.is_dead(uid);
            if !was_dead && is_dead_now {
                let timestamp_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();
                self.death_events.push(DeathEvent { uid, timestamp_ms });
            }
        }

        true
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
        let uid = self.local_player_uid;
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
        self.death_events.clear();
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
        }
    }
}
