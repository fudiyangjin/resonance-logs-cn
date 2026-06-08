use crate::live::entity_attr_store::EntityAttrStore;
use crate::live::opcodes_models::{AttrType, AttrValue};
use blueprotobuf_lib::blueprotobuf::EActorState;
use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct SkillId(i32);

impl SkillId {
    pub fn new(value: i32) -> Option<Self> {
        (value > 0).then_some(Self(value))
    }

    pub fn get(self) -> i32 {
        self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClientSkillCast {
    pub skill_id: SkillId,
    pub slot_id: Option<i32>,
    pub begin_time_ms: Option<i64>,
    pub target_uuid: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ServerSkillEnd {
    pub skill_id: SkillId,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ActiveSkillCast {
    pub skill_id: SkillId,
    observed_actor_state_skill: bool,
}

impl ActiveSkillCast {
    fn new(skill_id: SkillId) -> Self {
        Self {
            skill_id,
            observed_actor_state_skill: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkillLifecycleOutput {
    CastStarted(SkillId),
    DurationStarted(SkillId),
    DurationEnded(SkillId),
    CastCompleted(SkillId),
}

#[derive(Debug, Default)]
pub struct SkillLifecycleRuntime {
    pending_main_casts: VecDeque<ActiveSkillCast>,
    duration_skill_id: Option<SkillId>,
}

impl SkillLifecycleRuntime {
    pub fn on_client_skill_cast(&mut self, event: ClientSkillCast) -> Vec<SkillLifecycleOutput> {
        let mut outputs = Vec::with_capacity(2);
        let skill_id = event.skill_id;
        outputs.push(SkillLifecycleOutput::CastStarted(skill_id));

        match self
            .pending_main_casts
            .front()
            .map(|active| active.skill_id)
        {
            Some(active_skill_id) if active_skill_id != skill_id => {
                outputs.push(SkillLifecycleOutput::CastCompleted(skill_id));
            }
            Some(_) => {
                self.pending_main_casts
                    .push_back(ActiveSkillCast::new(skill_id));
            }
            None => {
                self.pending_main_casts
                    .push_back(ActiveSkillCast::new(skill_id));
                self.start_duration(skill_id, &mut outputs);
            }
        }

        outputs
    }

    pub fn on_server_skill_end(&mut self, event: ServerSkillEnd) -> Vec<SkillLifecycleOutput> {
        self.complete_matching_cast(event.skill_id)
    }

    pub fn on_actor_state_sample(
        &mut self,
        attr_store: &EntityAttrStore,
        local_player_uuid: i64,
    ) -> Vec<SkillLifecycleOutput> {
        let Some(is_skill_state) = actor_state_skill_state(attr_store, local_player_uuid) else {
            return Vec::new();
        };

        let should_complete_front = if let Some(active) = self.pending_main_casts.front_mut() {
            if is_skill_state {
                active.observed_actor_state_skill = true;
                false
            } else {
                active.observed_actor_state_skill
            }
        } else {
            false
        };

        if should_complete_front {
            self.complete_front_cast()
        } else {
            Vec::new()
        }
    }

    pub fn reset(&mut self) {
        self.pending_main_casts.clear();
        self.duration_skill_id = None;
    }

    fn complete_matching_cast(&mut self, skill_id: SkillId) -> Vec<SkillLifecycleOutput> {
        let Some(index) = self
            .pending_main_casts
            .iter()
            .position(|active| active.skill_id == skill_id)
        else {
            return Vec::new();
        };
        let was_front = index == 0;
        let Some(active) = self.pending_main_casts.remove(index) else {
            return Vec::new();
        };

        self.complete_cast(active.skill_id, was_front, true)
    }

    fn complete_front_cast(&mut self) -> Vec<SkillLifecycleOutput> {
        let Some(active) = self.pending_main_casts.pop_front() else {
            return Vec::new();
        };

        self.complete_cast(active.skill_id, true, false)
    }

    fn complete_cast(
        &mut self,
        skill_id: SkillId,
        was_front: bool,
        start_next_duration: bool,
    ) -> Vec<SkillLifecycleOutput> {
        let mut outputs = Vec::with_capacity(2);
        if was_front {
            self.end_duration(skill_id, &mut outputs);
            if start_next_duration && self.duration_skill_id.is_none() {
                if let Some(next) = self.pending_main_casts.front() {
                    self.start_duration(next.skill_id, &mut outputs);
                }
            }
        }
        outputs.push(SkillLifecycleOutput::CastCompleted(skill_id));
        outputs
    }

    fn start_duration(&mut self, skill_id: SkillId, outputs: &mut Vec<SkillLifecycleOutput>) {
        if self.duration_skill_id == Some(skill_id) {
            return;
        }
        self.duration_skill_id = Some(skill_id);
        outputs.push(SkillLifecycleOutput::DurationStarted(skill_id));
    }

    fn end_duration(&mut self, skill_id: SkillId, outputs: &mut Vec<SkillLifecycleOutput>) {
        if self.duration_skill_id != Some(skill_id) {
            return;
        }
        self.duration_skill_id = None;
        outputs.push(SkillLifecycleOutput::DurationEnded(skill_id));
    }
}

fn actor_state_skill_state(attr_store: &EntityAttrStore, local_player_uuid: i64) -> Option<bool> {
    attr_store
        .attr(local_player_uuid, AttrType::ActorState)
        .and_then(AttrValue::as_int)
        .map(|value| value == i64::from(EActorState::ActorStateSkill as i32))
}
