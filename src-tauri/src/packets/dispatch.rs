use crate::packets::opcodes::{FragmentType, Pkt};
use crate::packets::parser::{
    CHIT_CHAT_NTF_SERVICE_ID, GRPC_TEAM_NTF_SERVICE_ID, MATCH_NTF_SERVICE_ID,
    SOCIAL_NTF_SERVICE_ID, UNION_NTF_SERVICE_ID, WORLD_NTF_SERVICE_ID,
};

#[derive(Clone, Copy, Debug)]
pub struct DispatchLabel {
    pub fragment_label: &'static str,
    pub service_name: &'static str,
    pub method_name: Option<&'static str>,
    pub category: &'static str,
    pub action: &'static str,
}

pub fn label(fragment_type: FragmentType, service_id: u64, method_id: u32) -> DispatchLabel {
    DispatchLabel {
        fragment_label: fragment_label(fragment_type),
        service_name: service_name(service_id),
        method_name: method_name(service_id, method_id),
        category: category(fragment_type, service_id),
        action: action(fragment_type),
    }
}

pub fn service_name(service_id: u64) -> &'static str {
    match service_id {
        WORLD_NTF_SERVICE_ID => "WorldNtf",
        CHIT_CHAT_NTF_SERVICE_ID => "ChitChatNtf",
        GRPC_TEAM_NTF_SERVICE_ID => "GrpcTeamNtf",
        SOCIAL_NTF_SERVICE_ID if SOCIAL_NTF_SERVICE_ID != 0 => "SocialNtf",
        UNION_NTF_SERVICE_ID if UNION_NTF_SERVICE_ID != 0 => "UnionNtf",
        MATCH_NTF_SERVICE_ID if MATCH_NTF_SERVICE_ID != 0 => "MatchNtf",
        _ => "UnknownService",
    }
}

pub fn method_name(service_id: u64, method_id: u32) -> Option<&'static str> {
    match service_id {
        WORLD_NTF_SERVICE_ID => world_method_name(method_id),
        CHIT_CHAT_NTF_SERVICE_ID => chat_method_name(method_id),
        GRPC_TEAM_NTF_SERVICE_ID => team_method_name(method_id),
        MATCH_NTF_SERVICE_ID if MATCH_NTF_SERVICE_ID != 0 => match_method_name(method_id),
        _ => None,
    }
}

pub fn should_emit_shadow_probe(
    fragment_type: FragmentType,
    service_id: u64,
    recognized_world_packet: bool,
) -> bool {
    if !matches!(
        fragment_type,
        FragmentType::Notify | FragmentType::Call | FragmentType::Return | FragmentType::Echo
    ) {
        return false;
    }

    if service_id == WORLD_NTF_SERVICE_ID && recognized_world_packet {
        return false;
    }

    matches!(
        service_id,
        CHIT_CHAT_NTF_SERVICE_ID | GRPC_TEAM_NTF_SERVICE_ID | WORLD_NTF_SERVICE_ID
    )
}

fn fragment_label(fragment_type: FragmentType) -> &'static str {
    match fragment_type {
        FragmentType::None => "None",
        FragmentType::Call => "Call",
        FragmentType::Notify => "Notify",
        FragmentType::Return => "Return",
        FragmentType::Echo => "Echo",
        FragmentType::FrameUp => "FrameUp",
        FragmentType::FrameDown => "FrameDown",
    }
}

fn category(fragment_type: FragmentType, service_id: u64) -> &'static str {
    match service_id {
        CHIT_CHAT_NTF_SERVICE_ID | SOCIAL_NTF_SERVICE_ID | UNION_NTF_SERVICE_ID => "chat_probe",
        GRPC_TEAM_NTF_SERVICE_ID | MATCH_NTF_SERVICE_ID => "dungeon_probe",
        _ if matches!(
            fragment_type,
            FragmentType::Call | FragmentType::Return | FragmentType::Echo
        ) =>
        {
            "service_probe"
        }
        _ => "raw_service_probe",
    }
}

fn action(fragment_type: FragmentType) -> &'static str {
    match fragment_type {
        FragmentType::Call => "call",
        FragmentType::Notify => "notify",
        FragmentType::Return => "return",
        FragmentType::Echo => "echo",
        FragmentType::FrameUp => "frame_up",
        FragmentType::FrameDown => "frame_down",
        FragmentType::None => "unknown",
    }
}

fn world_method_name(method_id: u32) -> Option<&'static str> {
    match Pkt::try_from(method_id).ok()? {
        Pkt::ServerChangeInfo => Some("ServerChangeInfo"),
        Pkt::SyncSubSceneAttrs => Some("SyncSubSceneAttrs"),
        Pkt::NotifySwitchSceneEnd => Some("NotifySwitchSceneEnd"),
        Pkt::EnterScene => Some("EnterScene"),
        Pkt::NotifyLoadSceneEnd => Some("NotifyLoadSceneEnd"),
        Pkt::Teleport => Some("Teleport"),
        Pkt::SyncNearEntities => Some("SyncNearEntities"),
        Pkt::SyncSceneAttrs => Some("SyncSceneAttrs"),
        Pkt::SyncSceneEvents => Some("SyncSceneEvents"),
        Pkt::SyncEntityBehaviorTree => Some("SyncEntityBehaviorTree"),
        Pkt::SyncPlayCameraAnimation => Some("SyncPlayCameraAnimation"),
        Pkt::SyncFieldOfView => Some("SyncFieldOfView"),
        Pkt::SyncLog => Some("SyncLog"),
        Pkt::SyncPathNode => Some("SyncPathNode"),
        Pkt::SyncServerData => Some("SyncServerData"),
        Pkt::ForcedPullBack => Some("ForcedPullBack"),
        Pkt::LineDrawing => Some("LineDrawing"),
        Pkt::EnterGame => Some("EnterGame"),
        Pkt::SyncContainerData => Some("SyncContainerData"),
        Pkt::SyncContainerDirtyData => Some("SyncContainerDirtyData"),
        Pkt::SyncDungeonData => Some("SyncDungeonData"),
        Pkt::SyncDungeonDirtyData => Some("SyncDungeonDirtyData"),
        Pkt::SyncPersonalObject => Some("SyncPersonalObject"),
        Pkt::PersonalObjectUpdate => Some("PersonalObjectUpdate"),
        Pkt::NotifyReviveUser => Some("NotifyReviveUser"),
        Pkt::SyncServerTime => Some("SyncServerTime"),
        Pkt::SyncNearDeltaInfo => Some("SyncNearDeltaInfo"),
        Pkt::SyncToMeDeltaInfo => Some("SyncToMeDeltaInfo"),
        Pkt::NotifyClientKickOff => Some("NotifyClientKickOff"),
        Pkt::PersonalGroupObjectUpdate => Some("PersonalGroupObjectUpdate"),
        Pkt::NotifyUserCloseFunction => Some("NotifyUserCloseFunction"),
        Pkt::NotifyServerCloseFunction => Some("NotifyServerCloseFunction"),
        Pkt::BuffInfoSync => Some("BuffInfoSync"),
        Pkt::BounceJump => Some("BounceJump"),
        Pkt::SyncClientUseSkill => Some("SyncClientUseSkill"),
        Pkt::SyncAllServerStateObject => Some("SyncAllServerStateObject"),
        Pkt::NotifyTimerList => Some("NotifyTimerList"),
        Pkt::NotifyTimerUpdate => Some("NotifyTimerUpdate"),
    }
}

fn chat_method_name(method_id: u32) -> Option<&'static str> {
    match method_id {
        0x1 => Some("NotifyNewestChitChatMsgs"),
        0x0A920808 => Some("ChatDomainCandidate"),
        _ => None,
    }
}

fn team_method_name(method_id: u32) -> Option<&'static str> {
    match method_id {
        0x01 => Some("TeamInfo"),
        0x02 => Some("NoticeUpdateTeamMemberInfo"),
        0x03 => Some("JoinTeam"),
        0x0E => Some("TeamActivityState"),
        0x0F => Some("TeamActivityResult"),
        0x11 => Some("TeamActivityVoteResult"),
        0x16 => Some("TeamMemberCall"),
        0x17 => Some("TeamMemberCallResult"),
        0x1E => Some("DungeonInvite"),
        _ => None,
    }
}

fn match_method_name(method_id: u32) -> Option<&'static str> {
    match method_id {
        0x04 => Some("MatchEnterResult"),
        0x06 => Some("MatchReadyStatus"),
        _ => None,
    }
}
