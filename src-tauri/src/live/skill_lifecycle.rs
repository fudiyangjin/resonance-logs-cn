use std::collections::VecDeque;

// These skills can be used while another main cast is active and do not emit
// reliable server-side skill end packets, so they complete on client cast.
const IMMEDIATE_COMPLETE_SKILL_IDS: &[i32] = &[1215, 1238, 1237];

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
pub enum SkillLifecycleOutput {
    CastStarted(SkillId),
    DurationStarted(SkillId),
    DurationEnded(SkillId),
    CastCompleted(SkillId),
}

#[derive(Debug, Default)]
pub struct SkillLifecycleRuntime {
    pending_main_casts: VecDeque<SkillId>,
    duration_skill_id: Option<SkillId>,
}

impl SkillLifecycleRuntime {
    pub fn on_client_skill_cast(&mut self, event: ClientSkillCast) -> Vec<SkillLifecycleOutput> {
        let mut outputs = Vec::with_capacity(2);
        let skill_id = event.skill_id;
        outputs.push(SkillLifecycleOutput::CastStarted(skill_id));

        if is_immediate_complete_skill(skill_id) {
            outputs.push(SkillLifecycleOutput::CastCompleted(skill_id));
            return outputs;
        }

        self.pending_main_casts.push_back(skill_id);
        if self.duration_skill_id.is_none() {
            self.start_duration(skill_id, &mut outputs);
        }

        outputs
    }

    pub fn on_server_skill_end(&mut self, event: ServerSkillEnd) -> Vec<SkillLifecycleOutput> {
        let skill_id = event.skill_id;
        let Some(index) = self
            .pending_main_casts
            .iter()
            .position(|&active_skill_id| active_skill_id == skill_id)
        else {
            return Vec::new();
        };
        let was_front = index == 0;
        self.pending_main_casts.remove(index);

        let mut outputs = Vec::with_capacity(3);
        if was_front {
            self.end_duration(skill_id, &mut outputs);
            if self.duration_skill_id.is_none() {
                if let Some(&next_skill_id) = self.pending_main_casts.front() {
                    self.start_duration(next_skill_id, &mut outputs);
                }
            }
        }
        outputs.push(SkillLifecycleOutput::CastCompleted(skill_id));
        outputs
    }

    pub fn reset(&mut self) {
        self.pending_main_casts.clear();
        self.duration_skill_id = None;
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

fn is_immediate_complete_skill(skill_id: SkillId) -> bool {
    IMMEDIATE_COMPLETE_SKILL_IDS.contains(&skill_id.get())
}
