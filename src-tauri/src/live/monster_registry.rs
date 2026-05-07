use crate::parser_data;
use anyhow::{Context, Result};
use log::warn;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum MonsterType {
    Normal = 0,
    Elite = 1,
    Boss = 2,
}

#[derive(Debug, Clone)]
pub struct MonsterInfo {
    pub name: String,
    pub monster_type: MonsterType,
}

const MONSTER_ID_NAME_TYPE_RELATIVE: &str = "generated/monsternames.json";
const EXTRA_BUFF_MONITORED_MONSTERS_RELATIVE: &str = "logic/ExtraBuffMonitoredMonsters.json";

static MONSTER_REGISTRY: LazyLock<HashMap<i32, MonsterInfo>> = LazyLock::new(|| {
    #[derive(Deserialize)]
    struct RawMonsterInfo {
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "MonsterType")]
        monster_type: u8,
    }

    let data = parser_data::read_to_string(MONSTER_ID_NAME_TYPE_RELATIVE).unwrap_or_else(|err| {
        warn!(
            "[monster-registry] failed to load {}: {}",
            MONSTER_ID_NAME_TYPE_RELATIVE, err
        );
        String::new()
    });
    let raw: HashMap<String, RawMonsterInfo> = serde_json::from_str(&data).unwrap_or_else(|err| {
        warn!(
            "[monster-registry] failed to parse {}: {}",
            MONSTER_ID_NAME_TYPE_RELATIVE, err
        );
        HashMap::new()
    });

    let mut registry = HashMap::with_capacity(raw.len());
    for (key, info) in raw {
        if let Ok(id) = key.parse::<i32>() {
            let monster_type = match info.monster_type {
                1 => MonsterType::Elite,
                2 => MonsterType::Boss,
                _ => MonsterType::Normal,
            };

            registry.insert(
                id,
                MonsterInfo {
                    name: info.name,
                    monster_type,
                },
            );
        }
    }

    registry
});

static EXTRA_BUFF_MONITORED_MONSTER_IDS: LazyLock<HashSet<i32>> = LazyLock::new(|| {
    load_extra_buff_monitored_monster_ids().unwrap_or_else(|err| {
        warn!(
            "[monster-registry] failed to load {}: {}",
            EXTRA_BUFF_MONITORED_MONSTERS_RELATIVE, err
        );
        HashSet::new()
    })
});

#[derive(Debug, Deserialize)]
struct RawExtraBuffMonitoredMonsters {
    #[serde(rename = "monsterIds")]
    monster_ids: Vec<i32>,
}

fn parse_extra_buff_monitored_monster_ids(
    contents: &str,
) -> Result<HashSet<i32>, serde_json::Error> {
    let raw: RawExtraBuffMonitoredMonsters = serde_json::from_str(contents)?;
    Ok(raw.monster_ids.into_iter().filter(|id| *id > 0).collect())
}

fn load_extra_buff_monitored_monster_ids() -> Result<HashSet<i32>> {
    let contents = parser_data::read_to_string(EXTRA_BUFF_MONITORED_MONSTERS_RELATIVE)
        .with_context(|| format!("failed to read {}", EXTRA_BUFF_MONITORED_MONSTERS_RELATIVE))?;
    parse_extra_buff_monitored_monster_ids(&contents)
        .with_context(|| format!("failed to parse {}", EXTRA_BUFF_MONITORED_MONSTERS_RELATIVE))
}

pub fn monster_name(id: i32) -> Option<&'static str> {
    MONSTER_REGISTRY.get(&id).map(|info| info.name.as_str())
}

pub fn monster_type(id: i32) -> Option<MonsterType> {
    MONSTER_REGISTRY.get(&id).map(|info| info.monster_type)
}

pub fn is_extra_buff_monitored_monster(id: i32) -> bool {
    EXTRA_BUFF_MONITORED_MONSTER_IDS.contains(&id)
}
