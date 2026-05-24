use crate::database::now_ms;
use crate::live::commands_models::BuffUpdateState;
use crate::live::entity_id::{EntityUuid, entity_uuid_string};
use blueprotobuf_lib::blueprotobuf::{
    BuffChange, BuffEffectSync, BuffInfo, EBuffEffectLogicPbType, EBuffEventType,
};
use prost::Message;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
pub struct ActiveBuff {
    pub base_id: i32,
    pub layer: i32,
    pub duration: i32,
    pub create_time: i64,
    pub received_time_ms: i64,
    pub fire_uuid: Option<EntityUuid>,
    pub source_config_id: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuffTargetKind {
    LocalPlayer,
    Monster,
    Teammate,
}

#[derive(Debug, Clone, Default)]
pub struct BuffWatchProfile {
    pub enabled: bool,
    pub any_source_ids: HashSet<i32>,
    pub local_player_source_ids: HashSet<i32>,
    pub target_self_source_ids: HashSet<i32>,
    pub monitor_all: bool,
}

impl BuffWatchProfile {
    pub(crate) fn from_any_source_ids(ids: Vec<i32>, monitor_all: bool) -> Self {
        let enabled = monitor_all || !ids.is_empty();
        Self {
            enabled,
            any_source_ids: ids.into_iter().collect(),
            local_player_source_ids: HashSet::new(),
            target_self_source_ids: HashSet::new(),
            monitor_all,
        }
    }

    pub(crate) fn from_any_and_local_player_source_ids(
        any_source_ids: Vec<i32>,
        local_player_source_ids: Vec<i32>,
    ) -> Self {
        let enabled = !any_source_ids.is_empty() || !local_player_source_ids.is_empty();
        Self {
            enabled,
            any_source_ids: any_source_ids.into_iter().collect(),
            local_player_source_ids: local_player_source_ids.into_iter().collect(),
            target_self_source_ids: HashSet::new(),
            monitor_all: false,
        }
    }

    pub(crate) fn from_all_sources(
        any_source_ids: Vec<i32>,
        local_player_source_ids: Vec<i32>,
        target_self_source_ids: Vec<i32>,
        monitor_all: bool,
    ) -> Self {
        let enabled = monitor_all
            || !any_source_ids.is_empty()
            || !local_player_source_ids.is_empty()
            || !target_self_source_ids.is_empty();
        Self {
            enabled,
            any_source_ids: any_source_ids.into_iter().collect(),
            local_player_source_ids: local_player_source_ids.into_iter().collect(),
            target_self_source_ids: target_self_source_ids.into_iter().collect(),
            monitor_all,
        }
    }

    pub(crate) fn matches(
        &self,
        target_uuid: EntityUuid,
        local_player_uuid: EntityUuid,
        buff: &ActiveBuff,
    ) -> bool {
        if !self.enabled {
            return false;
        }
        if self.monitor_all || self.any_source_ids.contains(&buff.base_id) {
            return true;
        }
        if self.local_player_source_ids.contains(&buff.base_id)
            && buff.fire_uuid == Some(local_player_uuid)
        {
            return true;
        }
        self.target_self_source_ids.contains(&buff.base_id)
            && buff.fire_uuid == Some(target_uuid)
    }
}

#[derive(Debug, Clone, Default)]
pub struct EntityBuffMonitorConfig {
    pub local_player: BuffWatchProfile,
    pub monster: BuffWatchProfile,
    pub teammate: BuffWatchProfile,
}

impl EntityBuffMonitorConfig {
    pub(crate) fn profile_for(&self, kind: BuffTargetKind) -> &BuffWatchProfile {
        match kind {
            BuffTargetKind::LocalPlayer => &self.local_player,
            BuffTargetKind::Monster => &self.monster,
            BuffTargetKind::Teammate => &self.teammate,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BuffChangeType {
    Added,
    Changed,
    Removed,
}

#[derive(Debug, Clone)]
pub struct BuffChangeEvent {
    pub base_id: i32,
    pub buff_uuid: i32,
    pub change_type: BuffChangeType,
    /// Local packet receive time used by counter tick logic.
    pub create_time_ms: Option<i64>,
    pub duration_ms: Option<i32>,
    pub source_config_id: Option<i32>,
}

#[derive(Debug, Default)]
pub struct BuffProcessResult {
    pub changes: Vec<BuffChangeEvent>,
}

#[derive(Debug, Default)]
pub struct BuffMonitor {
    /// Active buffs keyed by buff UUID.
    pub active_buffs: HashMap<i32, ActiveBuff>,
}

impl BuffMonitor {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn process_buff_effect_bytes(
        &mut self,
        raw_bytes: &[u8],
        server_clock_offset: &mut i64,
    ) -> BuffProcessResult {
        let mut changes = Vec::new();
        let Ok(buff_effect_sync) = BuffEffectSync::decode(raw_bytes) else {
            return BuffProcessResult::default();
        };
        let now = now_ms();

        for buff_effect in buff_effect_sync.buff_effects {
            let buff_uuid = match buff_effect.buff_uuid {
                Some(id) => id,
                None => continue,
            };

            for logic_effect in buff_effect.logic_effect {
                let Some(effect_type) = logic_effect.effect_type else {
                    continue;
                };
                let Some(raw) = logic_effect.raw_data else {
                    continue;
                };

                if effect_type == EBuffEffectLogicPbType::BuffEffectAddBuff as i32 {
                    if let Ok(buff_info) = BuffInfo::decode(raw.as_slice()) {
                        let Some(base_id) = buff_info.base_id else {
                            continue;
                        };
                        let fire_uuid = buff_info.fire_uuid.filter(|id| *id != 0);
                        let layer = buff_info.layer.unwrap_or(1);
                        let duration = buff_info.duration.unwrap_or(0);
                        let create_time = buff_info.create_time.unwrap_or(now);
                        let source_config_id = buff_info
                            .fight_source_info
                            .as_ref()
                            .and_then(|info| info.source_config_id);
                        if buff_info.create_time.is_some() {
                            *server_clock_offset = now - create_time;
                        }

                        self.active_buffs.insert(
                            buff_uuid,
                            ActiveBuff {
                                base_id,
                                layer,
                                duration,
                                create_time,
                                received_time_ms: now,
                                fire_uuid,
                                source_config_id,
                            },
                        );
                        changes.push(BuffChangeEvent {
                            base_id,
                            buff_uuid,
                            change_type: BuffChangeType::Added,
                            create_time_ms: Some(now),
                            duration_ms: Some(duration),
                            source_config_id,
                        });
                    }
                } else if effect_type == EBuffEffectLogicPbType::BuffEffectBuffChange as i32 {
                    if let Ok(change_info) = BuffChange::decode(raw.as_slice()) {
                        if let Some(entry) = self.active_buffs.get_mut(&buff_uuid) {
                            let base_id = entry.base_id;
                            let source_config_id = entry.source_config_id;
                            if let Some(layer) = change_info.layer {
                                entry.layer = layer;
                            }
                            if let Some(duration) = change_info.duration {
                                entry.duration = duration;
                            }
                            if let Some(create_time) = change_info.create_time {
                                entry.create_time = create_time;
                            }
                            changes.push(BuffChangeEvent {
                                base_id,
                                buff_uuid,
                                change_type: BuffChangeType::Changed,
                                create_time_ms: Some(entry.received_time_ms),
                                duration_ms: Some(entry.duration),
                                source_config_id,
                            });
                        }
                    }
                }
            }

            if buff_effect.r#type == Some(EBuffEventType::BuffEventRemove as i32) {
                let removed_buff = self.active_buffs.remove(&buff_uuid);
                if let Some(removed_buff) = removed_buff {
                    changes.push(BuffChangeEvent {
                        base_id: removed_buff.base_id,
                        buff_uuid,
                        change_type: BuffChangeType::Removed,
                        create_time_ms: Some(removed_buff.received_time_ms),
                        duration_ms: Some(removed_buff.duration),
                        source_config_id: removed_buff.source_config_id,
                    });
                }
            }
        }

        BuffProcessResult { changes }
    }

    pub(crate) fn build_update_payload(
        &self,
        target_uuid: EntityUuid,
        local_player_uuid: EntityUuid,
        profile: &BuffWatchProfile,
        server_clock_offset: i64,
    ) -> Vec<BuffUpdateState> {
        self.active_buffs
            .values()
            .filter(|buff| profile.matches(target_uuid, local_player_uuid, buff))
            .map(|buff| BuffUpdateState {
                base_id: buff.base_id,
                layer: buff.layer,
                duration_ms: buff.duration,
                create_time_ms: buff.create_time.saturating_add(server_clock_offset),
            })
            .collect()
    }
}

#[derive(Debug, Default)]
pub struct EntityBuffMonitors {
    pub monitors: HashMap<EntityUuid, BuffMonitor>,
}

impl EntityBuffMonitors {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn clear(&mut self) {
        self.monitors.clear();
    }

    pub(crate) fn monitor_for(&mut self, entity_uuid: EntityUuid) -> &mut BuffMonitor {
        self.monitors
            .entry(entity_uuid)
            .or_insert_with(BuffMonitor::new)
    }

    pub(crate) fn build_snapshots_for_kind<F>(
        &self,
        kind: BuffTargetKind,
        config: &EntityBuffMonitorConfig,
        local_player_uuid: EntityUuid,
        server_clock_offset: i64,
        mut classify: F,
    ) -> HashMap<String, Vec<BuffUpdateState>>
    where
        F: FnMut(EntityUuid) -> Option<BuffTargetKind>,
    {
        let profile = config.profile_for(kind);
        if !profile.enabled {
            return HashMap::new();
        }

        let mut snapshots = HashMap::with_capacity(self.monitors.len());

        for (&entity_uuid, monitor) in &self.monitors {
            if classify(entity_uuid) != Some(kind) {
                continue;
            }

            let buffs = monitor.build_update_payload(
                entity_uuid,
                local_player_uuid,
                profile,
                server_clock_offset,
            );
            if !buffs.is_empty() {
                snapshots.insert(entity_uuid_string(entity_uuid), buffs);
            }
        }

        snapshots
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn active_buff(base_id: i32, fire_uuid: Option<EntityUuid>) -> ActiveBuff {
        ActiveBuff {
            base_id,
            layer: 1,
            duration: 1000,
            create_time: 10,
            received_time_ms: 20,
            fire_uuid,
            source_config_id: None,
        }
    }

    #[test]
    fn profile_matches_independent_source_lists() {
        let local_player_uuid = 100;
        let target_uuid = 200;
        let profile = BuffWatchProfile::from_all_sources(
            vec![1],
            vec![2],
            vec![3],
            false,
        );

        assert!(profile.matches(
            target_uuid,
            local_player_uuid,
            &active_buff(1, Some(999))
        ));
        assert!(profile.matches(
            target_uuid,
            local_player_uuid,
            &active_buff(2, Some(local_player_uuid))
        ));
        assert!(!profile.matches(
            target_uuid,
            local_player_uuid,
            &active_buff(2, Some(999))
        ));
        assert!(profile.matches(
            target_uuid,
            local_player_uuid,
            &active_buff(3, Some(target_uuid))
        ));
        assert!(!profile.matches(
            target_uuid,
            local_player_uuid,
            &active_buff(4, Some(target_uuid))
        ));
    }

    #[test]
    fn entity_snapshots_use_target_kind_profile() {
        let mut monitors = EntityBuffMonitors::new();
        monitors.monitor_for(10).active_buffs.insert(1, active_buff(1, None));
        monitors.monitor_for(20).active_buffs.insert(1, active_buff(2, None));

        let config = EntityBuffMonitorConfig {
            local_player: BuffWatchProfile::from_any_source_ids(vec![1], false),
            monster: BuffWatchProfile::from_any_source_ids(vec![2], false),
            teammate: BuffWatchProfile::default(),
        };

        let monster_snapshot = monitors.build_snapshots_for_kind(
            BuffTargetKind::Monster,
            &config,
            10,
            0,
            |uuid| {
                if uuid == 20 {
                    Some(BuffTargetKind::Monster)
                } else {
                    Some(BuffTargetKind::LocalPlayer)
                }
            },
        );

        assert_eq!(monster_snapshot.len(), 1);
        assert!(monster_snapshot.contains_key("20"));
    }
}
