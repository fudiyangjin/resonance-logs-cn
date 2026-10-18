//! `bptimer.hp.v1` wire frames (see `docs/HP_REPORT_PROTOCOL.md`) and the
//! `/v1/mobs` response the reportable mobs are read from.

use serde::ser::SerializeSeq;
use serde::{Deserialize, Serialize, Serializer};

use crate::live::hp_link::{HpContext, HpSample, MonsterId, TrackedMobs};

pub const SUBPROTOCOL: &str = "bptimer.hp.v1";
/// Server-side limit on tuples per `hp` frame.
pub const MAX_ENTRIES_PER_FRAME: usize = 64;

/// `[monster_id, hp]`, or `[monster_id, hp, x, z]` for mobs whose spawn point
/// matters.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HpTuple {
    pub monster_id: i32,
    pub hp: u8,
    pub position: Option<[i32; 2]>,
}

impl HpTuple {
    #[must_use]
    pub fn new(id: MonsterId, sample: &HpSample) -> Self {
        Self {
            monster_id: id.0,
            hp: sample.hp,
            position: sample.position,
        }
    }
}

impl Serialize for HpTuple {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let len = if self.position.is_some() { 4 } else { 2 };
        let mut tuple = serializer.serialize_seq(Some(len))?;
        tuple.serialize_element(&self.monster_id)?;
        tuple.serialize_element(&self.hp)?;
        if let Some([x, z]) = self.position {
            tuple.serialize_element(&x)?;
            tuple.serialize_element(&z)?;
        }
        tuple.end()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum ClientFrame {
    /// Where the following `hp` frames come from.
    Ctx {
        dist: &'static str,
        line: u32,
    },
    Hp {
        e: Vec<HpTuple>,
    },
}

impl ClientFrame {
    #[must_use]
    pub fn ctx(context: &HpContext) -> Self {
        Self::Ctx {
            dist: context.distribution.as_str(),
            line: context.line.0,
        }
    }

    #[must_use]
    pub fn encode(&self) -> String {
        serde_json::to_string(self).expect("client frames always serialize")
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum ServerFrame {
    Error { code: String },
}

/// The subset of `GET /v1/mobs` the client needs.
#[derive(Debug, Deserialize)]
pub struct MobsResponse {
    mobs: Vec<MobEntry>,
}

#[derive(Debug, Deserialize)]
struct MobEntry {
    monster_id: i32,
    #[serde(default)]
    has_locations: bool,
}

impl From<MobsResponse> for TrackedMobs {
    fn from(response: MobsResponse) -> Self {
        let mut tracked = Self::default();
        for mob in response.mobs {
            let id = MonsterId(mob.monster_id);
            tracked.ids.insert(id);
            if mob.has_locations {
                tracked.located.insert(id);
            }
        }
        tracked
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live::hp_link::{Distribution, LineId};
    use serde_json::{Value, json};

    fn fixtures() -> Value {
        serde_json::from_str(include_str!("../../../docs/hp-report-fixtures.json")).unwrap()
    }

    fn json_of(frame: &ClientFrame) -> Value {
        serde_json::from_str(&frame.encode()).unwrap()
    }

    #[test]
    fn client_frames_serialize_like_the_fixtures() {
        let f = fixtures();
        let ctx = ClientFrame::ctx(&HpContext {
            distribution: Distribution::Star,
            line: LineId(16),
        });
        assert_eq!(json_of(&ctx), f["client"][0]);

        let hp = ClientFrame::Hp {
            e: vec![
                HpTuple {
                    monster_id: 10_032,
                    hp: 85,
                    position: None,
                },
                HpTuple {
                    monster_id: 10_904,
                    hp: 40,
                    position: Some([-282, 86]),
                },
            ],
        };
        assert_eq!(json_of(&hp), f["client"][1]);
    }

    #[test]
    fn server_fixtures_parse() {
        for frame in fixtures()["server"].as_array().unwrap() {
            let parsed: ServerFrame = serde_json::from_value(frame.clone()).unwrap();
            let ServerFrame::Error { code } = parsed;
            assert_eq!(Value::String(code), frame["code"]);
        }
    }

    #[test]
    fn mobs_response_lists_tracked_and_located_mobs() {
        let response: MobsResponse = serde_json::from_value(json!({
            "regions": ["CN"],
            "mobs": [
                { "id": 1, "name": "Golden Juggernaut", "monster_id": 10032, "has_locations": false },
                { "id": 17, "name": "Loyal Boarlet", "monster_id": 10904, "has_locations": true }
            ]
        }))
        .unwrap();
        let tracked = TrackedMobs::from(response);
        assert!(tracked.ids.contains(&MonsterId(10_032)));
        assert!(tracked.located.contains(&MonsterId(10_904)));
        assert!(!tracked.located.contains(&MonsterId(10_032)));
    }
}
