use bytes::Bytes;

#[derive(Debug)]
pub struct ParseError;

pub const WORLD_NTF_SERVICE_ID: u64 = 1_664_308_034;
pub const WORLD_CALL_SERVICE_ID: u64 = 103_198_054;
pub const GRPC_TEAM_NTF_SERVICE_ID: u64 = 966_773_353;

pub mod world_call_method {
    pub const USE_SLOT: u32 = 0x3d002;
}

pub mod grpc_team_method {
    pub const NOTICE_UPDATE_TEAM_INFO: u32 = 0x1;
    pub const NOTICE_UPDATE_TEAM_MEMBER_INFO: u32 = 0x2;
    pub const NOTIFY_JOIN_TEAM: u32 = 0x3;
    pub const NOTIFY_LEAVE_TEAM: u32 = 0x4;
    pub const NOTIFY_BE_TRANSFER_LEADER: u32 = 0x0b;
    pub const NOTICE_TEAM_DISSOLVE: u32 = 0x0d;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NotifyKey {
    pub service_id: u64,
    pub method_id: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CallKey {
    pub service_id: u64,
    pub call_id: u32,
    pub method_id: u32,
}

#[derive(Debug)]
pub enum CaptureEvent {
    Notify { key: NotifyKey, payload: Bytes },
    Call { key: CallKey, payload: Bytes },
}

#[non_exhaustive]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pkt {
    // TODO: change all these names
    SyncSubSceneAttrs = 0x00000001,
    NotifySwitchSceneEnd = 0x00000002,
    EnterScene = 0x00000003,
    NotifyLoadSceneEnd = 0x00000004,
    Teleport = 0x00000005,
    SyncNearEntities = 0x00000006, // NPCNearbyNotify SyncNearEntities
    SyncSceneAttrs = 0x00000007,
    SyncSceneEvents = 0x00000008,
    SyncEntityBehaviorTree = 0x00000009,
    SyncPlayCameraAnimation = 0x0000000a,
    SyncFieldOfView = 0x0000000b,
    SyncLog = 0x0000000c,
    SyncPathNode = 0x0000000d,
    // 0x0e skipped
    SyncServerData = 0x0000000f,
    ForcedPullBack = 0x00000010,
    LineDrawing = 0x00000011,
    // 0x12-0x13 skipped
    EnterGame = 0x00000014,
    SyncContainerData = 0x00000015, // Container DataNotifySyncContainerData - similar to DirtyData, but has detailed like level, curr hp, max hp
    SyncContainerDirtyData = 0x00000016, // DirtyDataNotify SyncContainerDirtyData - Name, AP, Class, SubClass
    SyncDungeonData = 0x00000017,
    SyncDungeonDirtyData = 0x00000018,
    // 0x19-0x21 skipped
    SyncPersonalObject = 0x00000022,
    PersonalObjectUpdate = 0x00000023,
    // 0x24-0x26 skipped
    NotifyReviveUser = 0x00000027,
    // 0x28-0x2a skipped
    SyncServerTime = 0x0000002b, // ServerTimeNotify SyncServerTime
    // 0x2c skipped
    SyncNearDeltaInfo = 0x0000002d, // PlayerNearbyNotify SyncNearDeltaInfo
    SyncToMeDeltaInfo = 0x0000002e, // PlayerSelfNotify SyncToMeDeltaInfo
    // 0x2f-0x30 skipped
    NotifyClientKickOff = 0x00000031,
    // 0x32-0x3b skipped
    PersonalGroupObjectUpdate = 0x0000003c,
    // 0x3d skipped
    NotifyUserCloseFunction = 0x0000003e,
    NotifyServerCloseFunction = 0x0000003f,
    BuffInfoSync = 0x00000040,
    // 0x41 skipped
    BounceJump = 0x00000042,
    SyncClientUseSkill = 0x00000043,
    SyncAllServerStateObject = 0x00000044,
    // 0x45-0x47 skipped
    NotifyTimerList = 0x00000048,
    NotifyTimerUpdate = 0x00000049,
    SyncServerSkillEnd = 0x00003005,
}

impl TryFrom<u32> for Pkt {
    type Error = ParseError;

    fn try_from(pkt: u32) -> Result<Self, Self::Error> {
        match pkt {
            0x00000001 => Ok(Pkt::SyncSubSceneAttrs),
            0x00000002 => Ok(Pkt::NotifySwitchSceneEnd),
            0x00000003 => Ok(Pkt::EnterScene),
            0x00000004 => Ok(Pkt::NotifyLoadSceneEnd),
            0x00000005 => Ok(Pkt::Teleport),
            0x00000006 => Ok(Pkt::SyncNearEntities),
            0x00000007 => Ok(Pkt::SyncSceneAttrs),
            0x00000008 => Ok(Pkt::SyncSceneEvents),
            0x00000009 => Ok(Pkt::SyncEntityBehaviorTree),
            0x0000000a => Ok(Pkt::SyncPlayCameraAnimation),
            0x0000000b => Ok(Pkt::SyncFieldOfView),
            0x0000000c => Ok(Pkt::SyncLog),
            0x0000000d => Ok(Pkt::SyncPathNode),
            0x0000000f => Ok(Pkt::SyncServerData),
            0x00000010 => Ok(Pkt::ForcedPullBack),
            0x00000011 => Ok(Pkt::LineDrawing),
            0x00000014 => Ok(Pkt::EnterGame),
            0x00000015 => Ok(Pkt::SyncContainerData),
            0x00000016 => Ok(Pkt::SyncContainerDirtyData),
            0x00000017 => Ok(Pkt::SyncDungeonData),
            0x00000018 => Ok(Pkt::SyncDungeonDirtyData),
            0x00000022 => Ok(Pkt::SyncPersonalObject),
            0x00000023 => Ok(Pkt::PersonalObjectUpdate),
            0x00000027 => Ok(Pkt::NotifyReviveUser),
            0x0000002b => Ok(Pkt::SyncServerTime),
            0x0000002d => Ok(Pkt::SyncNearDeltaInfo),
            0x0000002e => Ok(Pkt::SyncToMeDeltaInfo),
            0x00000031 => Ok(Pkt::NotifyClientKickOff),
            0x0000003c => Ok(Pkt::PersonalGroupObjectUpdate),
            0x0000003e => Ok(Pkt::NotifyUserCloseFunction),
            0x0000003f => Ok(Pkt::NotifyServerCloseFunction),
            0x00000040 => Ok(Pkt::BuffInfoSync),
            0x00000042 => Ok(Pkt::BounceJump),
            0x00000043 => Ok(Pkt::SyncClientUseSkill),
            0x00000044 => Ok(Pkt::SyncAllServerStateObject),
            0x00000048 => Ok(Pkt::NotifyTimerList),
            0x00000049 => Ok(Pkt::NotifyTimerUpdate),
            0x00003005 => Ok(Pkt::SyncServerSkillEnd),
            _ => Err(ParseError),
        }
    }
}

#[repr(u16)] // ensures the enum is stored as an u16
#[non_exhaustive]
#[derive(Debug)]
pub enum FragmentType {
    None = 0,
    Call = 1,
    Notify = 2,
    Return = 3,
    Echo = 4,
    FrameUp = 5,
    FrameDown = 6,
}

impl From<u16> for FragmentType {
    fn from(fragment_type: u16) -> Self {
        match fragment_type {
            0 => FragmentType::None,
            1 => FragmentType::Call,
            2 => FragmentType::Notify,
            3 => FragmentType::Return,
            4 => FragmentType::Echo,
            5 => FragmentType::FrameUp,
            6 => FragmentType::FrameDown,
            _ => FragmentType::None,
        }
    }
}

/*
Pkt::DeathNotify
Pkt::IdentityGaugeChangeNotify
Pkt::IdentityStanceChangeNotify
Pkt::InitEnv
Pkt::InitPC
Pkt::InitItem
Pkt::MigrationExecute
Pkt::NewPC
Pkt::NewVehicle
Pkt::NewNpc
Pkt::NewNpcSummon
Pkt::NewProjectile
Pkt::NewTrap
Pkt::ParalyzationStateNotify
Pkt::RaidBegin
Pkt::RaidBossKillNotify
Pkt::RaidResult
Pkt::RemoveObject
Pkt::SkillCastNotify
Pkt::SkillCooldownNotify
Pkt::SkillStartNotify
Pkt::SkillStageNotify
Pkt::SkillDamageAbnormalMoveNotify
Pkt::SkillDamageNotify
Pkt::PartyInfo
Pkt::PartyLeaveResult
Pkt::PartyStatusEffectAddNotify
Pkt::PartyStatusEffectRemoveNotify
Pkt::PartyStatusEffectResultNotify
Pkt::StatusEffectAddNotify
Pkt::StatusEffectDurationNotify
Pkt::StatusEffectRemoveNotify
Pkt::TriggerBossBattleStatus
Pkt::TriggerStartNotify
Pkt::ZoneMemberLoadStatusNotify
Pkt::ZoneObjectUnpublishNotify
Pkt::StatusEffectSyncDataNotify
Pkt::TroopMemberUpdateMinNotify
Pkt::NewTransit
 */
