use serde::Deserialize;
use std::collections::HashMap;
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

static MONSTER_REGISTRY: LazyLock<HashMap<i32, MonsterInfo>> = LazyLock::new(|| {
    #[derive(Deserialize)]
    struct RawMonsterInfo {
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "MonsterType")]
        monster_type: u8,
    }

    let data = include_str!("../../meter-data/MonsterIdNameType.json");
    let raw: HashMap<String, RawMonsterInfo> =
        serde_json::from_str(data).expect("invalid MonsterIdNameType.json");

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

pub fn monster_name(id: i32) -> Option<&'static str> {
    MONSTER_REGISTRY.get(&id).map(|info| info.name.as_str())
}

pub fn monster_type(id: i32) -> Option<MonsterType> {
    MONSTER_REGISTRY.get(&id).map(|info| info.monster_type)
}
