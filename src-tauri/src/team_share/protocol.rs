//! `bptimer.team.v1` wire frames (see `docs/TEAM_SHARE_PROTOCOL.md`) and their
//! mapping to the live runtime's [`team_link`](crate::live::team_link) types.

use std::fmt;

use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::live::team_link::{
    CdSample, CharId, ShareIdentity, TeamLinkEvent, TeammateProfile, TeammateSnapshot,
};

pub const SUBPROTOCOL: &str = "bptimer.team.v1";
/// Server-side limit on tuples per `cd` frame.
pub const MAX_ENTRIES_PER_FRAME: usize = 128;

/// A positive 64-bit id sent as a decimal string.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WireId(pub i64);

impl fmt::Display for WireId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl Serialize for WireId {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for WireId {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        raw.parse::<i64>()
            .ok()
            .filter(|id| *id > 0)
            .map(Self)
            .ok_or_else(|| D::Error::custom("expected a positive decimal id"))
    }
}

/// `[skill_level_id, duration, cd_type, valid_cd_time, calculated_duration, accelerate_rate, anchor_ms]`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CdTuple(
    pub i32,
    pub i32,
    pub i32,
    pub i32,
    pub i32,
    pub f32,
    pub i64,
);

impl From<&CdSample> for CdTuple {
    fn from(sample: &CdSample) -> Self {
        Self(
            sample.skill_level_id,
            sample.duration,
            sample.cd_type,
            sample.valid_cd_time,
            sample.calculated_duration,
            sample.accelerate_rate,
            sample.anchor_server_ms,
        )
    }
}

impl From<CdTuple> for CdSample {
    fn from(t: CdTuple) -> Self {
        Self {
            skill_level_id: t.0,
            duration: t.1,
            cd_type: t.2,
            valid_cd_time: t.3,
            calculated_duration: t.4,
            accelerate_rate: t.5,
            anchor_server_ms: t.6,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum ClientFrame {
    Join {
        dist: String,
        team: WireId,
        #[serde(rename = "char")]
        char_id: WireId,
        roster: Vec<WireId>,
        name: String,
        #[serde(rename = "class")]
        class_id: i32,
    },
    Cd {
        e: Vec<CdTuple>,
    },
    Clear,
    Leave,
}

impl ClientFrame {
    #[must_use]
    pub fn join(identity: &ShareIdentity) -> Self {
        Self::Join {
            dist: identity.distribution.as_str().to_string(),
            team: WireId(identity.team_id.0),
            char_id: WireId(identity.char_id.0),
            roster: identity.roster.iter().map(|id| WireId(id.0)).collect(),
            name: identity.name.chars().take(32).collect(),
            class_id: identity.class_id,
        }
    }

    #[must_use]
    pub fn encode(&self) -> String {
        serde_json::to_string(self).expect("client frames always serialize")
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireMember {
    #[serde(rename = "char")]
    pub char_id: WireId,
    pub name: String,
    #[serde(rename = "class")]
    pub class_id: i32,
    pub e: Vec<CdTuple>,
}

/// Decoded through [`RawServerFrame`]: serde's internally tagged enums buffer
/// their content first, and that buffer cannot hold numbers under the
/// `arbitrary_precision` feature this crate enables for `serde_json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "snake_case", try_from = "RawServerFrame")]
pub enum ServerFrame {
    Snapshot {
        members: Vec<WireMember>,
    },
    Member {
        #[serde(rename = "char")]
        char_id: WireId,
        name: String,
        #[serde(rename = "class")]
        class_id: i32,
    },
    Cd {
        #[serde(rename = "char")]
        char_id: WireId,
        e: Vec<CdTuple>,
    },
    Clear {
        #[serde(rename = "char")]
        char_id: WireId,
    },
    Left {
        #[serde(rename = "char")]
        char_id: WireId,
    },
    Error {
        code: String,
    },
}

/// Every server frame's fields, flat.
#[derive(Deserialize)]
struct RawServerFrame {
    t: String,
    #[serde(default)]
    members: Option<Vec<WireMember>>,
    #[serde(rename = "char", default)]
    char_id: Option<WireId>,
    #[serde(default)]
    name: Option<String>,
    #[serde(rename = "class", default)]
    class_id: Option<i32>,
    #[serde(default)]
    e: Option<Vec<CdTuple>>,
    #[serde(default)]
    code: Option<String>,
}

impl TryFrom<RawServerFrame> for ServerFrame {
    type Error = String;

    fn try_from(raw: RawServerFrame) -> Result<Self, String> {
        let kind = raw.t;
        let need = |field: &str| format!("`{kind}` frame without `{field}`");
        let char_id = raw.char_id.ok_or_else(|| need("char"));
        Ok(match kind.as_str() {
            "snapshot" => Self::Snapshot {
                members: raw.members.ok_or_else(|| need("members"))?,
            },
            "member" => Self::Member {
                char_id: char_id?,
                name: raw.name.unwrap_or_default(),
                class_id: raw.class_id.unwrap_or_default(),
            },
            "cd" => Self::Cd {
                char_id: char_id?,
                e: raw.e.ok_or_else(|| need("e"))?,
            },
            "clear" => Self::Clear { char_id: char_id? },
            "left" => Self::Left { char_id: char_id? },
            "error" => Self::Error {
                code: raw.code.unwrap_or_default(),
            },
            _ => return Err(format!("unknown frame type `{kind}`")),
        })
    }
}

impl ServerFrame {
    /// The live-runtime update this frame carries; `None` for `error`.
    #[must_use]
    pub fn into_event(self) -> Option<TeamLinkEvent> {
        let char_id = |id: WireId| CharId(id.0);
        Some(match self {
            Self::Snapshot { members } => TeamLinkEvent::Snapshot(
                members
                    .into_iter()
                    .map(|member| TeammateSnapshot {
                        char_id: char_id(member.char_id),
                        profile: TeammateProfile {
                            name: member.name,
                            class_id: member.class_id,
                        },
                        samples: member.e.into_iter().map(CdSample::from).collect(),
                    })
                    .collect(),
            ),
            Self::Member {
                char_id: id,
                name,
                class_id,
            } => TeamLinkEvent::Member {
                char_id: char_id(id),
                profile: TeammateProfile { name, class_id },
            },
            Self::Cd { char_id: id, e } => TeamLinkEvent::Cd {
                char_id: char_id(id),
                samples: e.into_iter().map(CdSample::from).collect(),
            },
            Self::Clear { char_id: id } => TeamLinkEvent::Clear {
                char_id: char_id(id),
            },
            Self::Left { char_id: id } => TeamLinkEvent::Left {
                char_id: char_id(id),
            },
            Self::Error { .. } => return None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn fixtures() -> Value {
        serde_json::from_str(include_str!("../../../docs/team-share-fixtures.json")).unwrap()
    }

    /// Through text, like the wire: `f32` fields must print exactly as sent.
    fn reencode<T: Serialize>(value: &T) -> Value {
        serde_json::from_str(&serde_json::to_string(value).unwrap()).unwrap()
    }

    #[test]
    fn client_frames_serialize_like_the_fixtures() {
        use crate::live::team_link::{Distribution, TeamId};
        let f = fixtures();
        assert_eq!(f["protocol"], SUBPROTOCOL);
        let identity = ShareIdentity {
            distribution: Distribution::Star,
            team_id: TeamId(7_000_000_000_000_000_123),
            char_id: CharId(123_456_789),
            roster: vec![CharId(123_456_789), CharId(987_654_321)],
            name: "Alice".into(),
            class_id: 4,
        };
        let generated = [
            ClientFrame::join(&identity),
            ClientFrame::Cd {
                e: vec![
                    CdTuple(142_001, 30_000, 1, 5_522, 30_000, 0.0, 1_790_300_898_228),
                    CdTuple(150_101, -1, 1, 4_000, -1, 0.0, 1_790_300_898_228),
                ],
            },
            ClientFrame::Clear,
            ClientFrame::Leave,
        ];
        let expected = f["client"].as_array().unwrap();
        assert_eq!(generated.len(), expected.len());
        for (frame, fixture) in generated.iter().zip(expected) {
            assert_eq!(&reencode(frame), fixture);
        }
    }

    #[test]
    fn server_fixtures_round_trip() {
        for frame in fixtures()["server"].as_array().unwrap() {
            let parsed: ServerFrame = serde_json::from_str(&frame.to_string()).unwrap();
            assert_eq!(&reencode(&parsed), frame);
        }
    }

    #[test]
    fn server_frames_map_to_events() {
        let frame: ServerFrame = serde_json::from_str(
            r#"{"t":"cd","char":"987654321","e":[[220101,60000,0,0,54000,0.1,1790300899001]]}"#,
        )
        .unwrap();
        let Some(TeamLinkEvent::Cd { char_id, samples }) = frame.into_event() else {
            panic!("cd event expected");
        };
        assert_eq!(char_id, CharId(987_654_321));
        assert_eq!(samples[0].skill_id(), 2201);
        assert_eq!(samples[0].anchor_server_ms, 1_790_300_899_001);

        let error: ServerFrame =
            serde_json::from_str(r#"{"t":"error","code":"conflict"}"#).unwrap();
        assert!(error.into_event().is_none());
    }

    #[test]
    fn rejects_non_positive_ids() {
        assert!(serde_json::from_str::<ServerFrame>(r#"{"t":"left","char":"0"}"#).is_err());
        assert!(serde_json::from_str::<ServerFrame>(r#"{"t":"left","char":7}"#).is_err());
    }
}
