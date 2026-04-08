use crate::database::now_ms;
use crate::live::commands_models::BuffUpdateState;
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
}

#[derive(Debug, Default)]
pub struct BuffProcessResult {
    pub update_payload: Option<Vec<BuffUpdateState>>,
    pub changes: Vec<BuffChangeEvent>,
}

#[derive(Debug, Default)]
pub struct BuffMonitor {
    /// Monitored buff base IDs.
    pub monitored_buff_ids: HashSet<i32>,
    /// Self-applied buff base IDs.
    pub self_applied_buff_ids: HashSet<i32>,
    /// Active buffs keyed by buff UUID.
    pub active_buffs: HashMap<i32, ActiveBuff>,
    /// Monitor all buffs.
    pub monitor_all_buff: bool,
}

impl BuffMonitor {
    pub(crate) fn new() -> Self {
        Self {
            monitored_buff_ids: HashSet::new(),
            self_applied_buff_ids: HashSet::new(),
            active_buffs: HashMap::new(),
            monitor_all_buff: false,
        }
    }

    pub(crate) fn process_buff_effect_bytes(
        &mut self,
        raw_bytes: &[u8],
        server_clock_offset: &mut i64,
        local_player_uid: i64,
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
                        let fire_uid = buff_info.fire_uuid.unwrap_or(0) >> 16;
                        let in_self_list = self.self_applied_buff_ids.contains(&base_id);
                        if in_self_list && fire_uid != local_player_uid {
                            continue;
                        }
                        let layer = buff_info.layer.unwrap_or(1);
                        let duration = buff_info.duration.unwrap_or(0);
                        let create_time = buff_info.create_time.unwrap_or(now);
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
                            },
                        );
                        changes.push(BuffChangeEvent {
                            base_id,
                            buff_uuid,
                            change_type: BuffChangeType::Added,
                            create_time_ms: Some(now),
                            duration_ms: Some(duration),
                        });
                    }
                } else if effect_type == EBuffEffectLogicPbType::BuffEffectBuffChange as i32 {
                    if let Ok(change_info) = BuffChange::decode(raw.as_slice()) {
                        if let Some(entry) = self.active_buffs.get_mut(&buff_uuid) {
                            let base_id = entry.base_id;
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
                    });
                }
            }
        }

        let update_payload = self.build_update_payload(*server_clock_offset);
        BuffProcessResult {
            update_payload,
            changes,
        }
    }

    fn build_update_payload(&self, server_clock_offset: i64) -> Option<Vec<BuffUpdateState>> {
        if self.monitored_buff_ids.is_empty()
            && self.self_applied_buff_ids.is_empty()
            && !self.monitor_all_buff
        {
            return None;
        }

        Some(
            self.active_buffs
                .values()
                .filter(|buff| {
                    self.monitor_all_buff
                        || self.monitored_buff_ids.contains(&buff.base_id)
                        || self.self_applied_buff_ids.contains(&buff.base_id)
                })
                .map(|buff| BuffUpdateState {
                    base_id: buff.base_id,
                    layer: buff.layer,
                    duration_ms: buff.duration,
                    create_time_ms: buff.create_time.saturating_add(server_clock_offset),
                })
                .collect(),
        )
    }
}

#[derive(Debug, Default)]
pub struct BossBuffMonitors {
    pub monitors: HashMap<i64, BuffMonitor>,
    pub monitored_buff_ids: HashSet<i32>,
    pub self_applied_buff_ids: HashSet<i32>,
}

impl BossBuffMonitors {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn clear(&mut self) {
        self.monitors.clear();
    }

    pub(crate) fn set_config(&mut self, global_ids: Vec<i32>, self_applied_ids: Vec<i32>) {
        self.monitored_buff_ids = global_ids.into_iter().collect();
        self.self_applied_buff_ids = self_applied_ids.into_iter().collect();

        for monitor in self.monitors.values_mut() {
            monitor.monitored_buff_ids = self.monitored_buff_ids.clone();
            monitor.self_applied_buff_ids = self.self_applied_buff_ids.clone();
        }
    }

    pub(crate) fn monitor_for(&mut self, boss_uid: i64) -> &mut BuffMonitor {
        let monitored_buff_ids = self.monitored_buff_ids.clone();
        let self_applied_buff_ids = self.self_applied_buff_ids.clone();

        self.monitors.entry(boss_uid).or_insert_with(|| {
            let mut monitor = BuffMonitor::new();
            monitor.monitored_buff_ids = monitored_buff_ids;
            monitor.self_applied_buff_ids = self_applied_buff_ids;
            monitor
        })
    }

    pub(crate) fn build_all_buff_snapshots(
        &self,
        server_clock_offset: i64,
    ) -> HashMap<i64, Vec<BuffUpdateState>> {
        let mut snapshots = HashMap::with_capacity(self.monitors.len());

        for (&boss_uid, monitor) in &self.monitors {
            let Some(buffs) = monitor.build_update_payload(server_clock_offset) else {
                continue;
            };
            if !buffs.is_empty() {
                snapshots.insert(boss_uid, buffs);
            }
        }

        snapshots
    }
}
