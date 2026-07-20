use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use crate::live::entity_id::EntityUuid;

const FANTASY_MONSTER_SKILL_MAP_JSON: &str =
    include_str!("../../meter-data/FantasyMonsterSkillMap.json");

static FANTASY_SKILL_BY_MONSTER_ID: LazyLock<HashMap<i32, i32>> = LazyLock::new(|| {
    serde_json::from_str(FANTASY_MONSTER_SKILL_MAP_JSON)
        .expect("fantasy monster skill map must be valid JSON")
});

static KNOWN_FANTASY_SKILL_IDS: LazyLock<HashSet<i32>> =
    LazyLock::new(|| FANTASY_SKILL_BY_MONSTER_ID.values().copied().collect());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FantasySourceInfo {
    remodel_level: i64,
}

/// Resolves fantasy-applied buffs whether the packet attributes the source to
/// the summoned entity or directly to the character that cast the fantasy.
#[derive(Debug, Default)]
pub struct FantasyRegistry {
    by_summon_uuid: HashMap<EntityUuid, FantasySourceInfo>,
    by_summoner_and_skill: HashMap<(EntityUuid, i32), FantasySourceInfo>,
}

impl FantasyRegistry {
    pub(crate) fn register_summon(
        &mut self,
        summon_uuid: EntityUuid,
        summoner_uuid: EntityUuid,
        monster_id: i32,
        remodel_level: i64,
        marker_source_config_id: Option<i32>,
    ) {
        let resonance_skill_id = marker_source_config_id
            .and_then(normalize_fantasy_skill_id)
            .or_else(|| FANTASY_SKILL_BY_MONSTER_ID.get(&monster_id).copied());
        let info = FantasySourceInfo { remodel_level };

        self.by_summon_uuid.insert(summon_uuid, info);
        if let Some(skill_id) = resonance_skill_id {
            self.by_summoner_and_skill
                .insert((summoner_uuid, skill_id), info);
        }
    }

    pub(crate) fn resolve_remodel_level(
        &self,
        fire_uuid: Option<EntityUuid>,
        source_config_id: Option<i32>,
    ) -> Option<i64> {
        let fire_uuid = fire_uuid?;
        if let Some(info) = self.by_summon_uuid.get(&fire_uuid) {
            return Some(info.remodel_level);
        }

        let skill_id = source_config_id.and_then(normalize_fantasy_skill_id)?;
        self.by_summoner_and_skill
            .get(&(fire_uuid, skill_id))
            .map(|info| info.remodel_level)
    }

    pub(crate) fn clear(&mut self) {
        self.by_summon_uuid.clear();
        self.by_summoner_and_skill.clear();
    }
}

fn normalize_fantasy_skill_id(source_config_id: i32) -> Option<i32> {
    if KNOWN_FANTASY_SKILL_IDS.contains(&source_config_id) {
        return Some(source_config_id);
    }

    let base_skill_id = source_config_id.checked_div(100)?;
    KNOWN_FANTASY_SKILL_IDS
        .contains(&base_skill_id)
        .then_some(base_skill_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_summoned_entity_source_without_skill_config() {
        let mut registry = FantasyRegistry::default();
        registry.register_summon(100, 1, 3_000_038, 5, None);

        assert_eq!(registry.resolve_remodel_level(Some(100), None), Some(5));
    }

    #[test]
    fn resolves_character_source_by_fantasy_skill() {
        let mut registry = FantasyRegistry::default();
        registry.register_summon(100, 1, 3_000_038, 5, None);

        assert_eq!(
            registry.resolve_remodel_level(Some(1), Some(3_944)),
            Some(5)
        );
    }

    #[test]
    fn normalizes_skill_effect_source_config_id() {
        let mut registry = FantasyRegistry::default();
        registry.register_summon(100, 1, 9_999_999, 4, Some(394_401));

        assert_eq!(
            registry.resolve_remodel_level(Some(1), Some(394_401)),
            Some(4)
        );
        assert_eq!(
            registry.resolve_remodel_level(Some(1), Some(3_944)),
            Some(4)
        );
    }

    #[test]
    fn selects_the_matching_skill_for_the_same_summoner() {
        let mut registry = FantasyRegistry::default();
        registry.register_summon(100, 1, 3_000_038, 5, None);
        registry.register_summon(200, 1, 3_000_036, 2, None);

        assert_eq!(
            registry.resolve_remodel_level(Some(1), Some(3_944)),
            Some(5)
        );
        assert_eq!(
            registry.resolve_remodel_level(Some(1), Some(3_945)),
            Some(2)
        );
    }

    #[test]
    fn leaves_unknown_character_source_unresolved() {
        let mut registry = FantasyRegistry::default();
        registry.register_summon(100, 1, 3_000_038, 5, None);

        assert_eq!(registry.resolve_remodel_level(Some(1), Some(999_999)), None);
        assert_eq!(registry.resolve_remodel_level(Some(2), Some(3_944)), None);
    }
}
