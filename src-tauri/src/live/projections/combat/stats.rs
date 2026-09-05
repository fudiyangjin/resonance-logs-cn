//! Pure combat aggregation models shared by live and history reducers.

use serde::{Deserialize, Serialize};

pub mod damage_type_flag {
    pub const CRIT: i32 = 0b0001;
    pub const BLOCK: i32 = 0b0010;
    pub const ATTACKER_LUCK: i32 = 0b0100;
    pub const ATTACKED_LUCK: i32 = 0b1000;
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CombatStats {
    pub total: u128,
    pub effective_total: u128,
    pub crit_total: u128,
    pub crit_hits: u128,
    pub lucky_total: u128,
    pub lucky_hits: u128,
    pub hits: u128,
    #[serde(default)]
    pub trigger_hits: u128,
    #[serde(default)]
    pub block_hits: u128,
    #[serde(default)]
    pub lucky_block_hits: u128,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillTargetStats {
    pub hits: u128,
    pub total_value: u128,
    pub effective_total_value: u128,
    pub crit_hits: u128,
    pub lucky_hits: u128,
    pub crit_total: u128,
    pub lucky_total: u128,
    pub hp_loss_total: u128,
    pub shield_loss_total: u128,
    pub target_monster_id: Option<i32>,
    #[serde(default)]
    pub trigger_hits: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct HitExtrema {
    pub min: u128,
    pub max: u128,
}

impl HitExtrema {
    #[must_use]
    pub const fn single(value: u128) -> Self {
        Self {
            min: value,
            max: value,
        }
    }

    pub fn observe(&mut self, value: u128) {
        self.min = self.min.min(value);
        self.max = self.max.max(value);
    }

    #[must_use]
    pub fn merged(self, other: Self) -> Self {
        Self {
            min: self.min.min(other.min),
            max: self.max.max(other.max),
        }
    }
}

pub fn observe_extrema(extrema: &mut Option<HitExtrema>, value: u128) {
    match extrema {
        Some(current) => current.observe(value),
        None => *extrema = Some(HitExtrema::single(value)),
    }
}

pub fn merge_extrema(target: &mut Option<HitExtrema>, other: Option<HitExtrema>) {
    let Some(other) = other else {
        return;
    };
    *target = Some(match *target {
        Some(current) => current.merged(other),
        None => other,
    });
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Skill {
    pub total_value: u128,
    pub effective_total_value: u128,
    pub crit_total_value: u128,
    pub crit_hits: u128,
    pub lucky_total_value: u128,
    pub lucky_hits: u128,
    pub hits: u128,
    #[serde(default)]
    pub property: Option<i32>,
    #[serde(default)]
    pub damage_mode: Option<i32>,
    #[serde(default)]
    pub trigger_hits: u128,
    #[serde(default)]
    pub block_hits: u128,
    #[serde(default)]
    pub lucky_block_hits: u128,
    #[serde(default)]
    pub extrema: Option<HitExtrema>,
}

pub mod class {
    pub const UNKNOWN: i32 = 0;
    pub const STORMBLADE: i32 = 1;
    pub const FROST_MAGE: i32 = 2;
    pub const FLAME_BERSERKER: i32 = 3;
    pub const WIND_KNIGHT: i32 = 4;
    pub const VERDANT_ORACLE: i32 = 5;
    pub const HEAVY_GUARDIAN: i32 = 9;
    pub const MARKSMAN: i32 = 11;
    pub const SHIELD_KNIGHT: i32 = 12;
    pub const BEAT_PERFORMER: i32 = 13;

    pub fn get_class_name(id: i32) -> String {
        String::from(match id {
            STORMBLADE => "Stormblade",
            FROST_MAGE => "Frost Mage",
            FLAME_BERSERKER => "Flame Berserker",
            WIND_KNIGHT => "Wind Knight",
            VERDANT_ORACLE => "Verdant Oracle",
            HEAVY_GUARDIAN => "Heavy Guardian",
            MARKSMAN => "Marksman",
            SHIELD_KNIGHT => "Shield Knight",
            BEAT_PERFORMER => "Beat Performer",
            _ => "",
        })
    }

    #[derive(Debug, Default, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
    pub enum ClassSpec {
        #[default]
        Unknown,
        Iaido,
        Moonstrike,
        Icicle,
        Frostbeam,
        Voidflame,
        Blazecrimson,
        Vanguard,
        Skyward,
        Smite,
        Lifebind,
        Earthfort,
        Block,
        Wildpack,
        Falconry,
        Recovery,
        Shield,
        Dissonance,
        Concerto,
    }

    impl ClassSpec {
        /// Recover the enum from a stored discriminant (`spec as i32`), e.g.
        /// the `class_spec` column persisted in encounter projections.
        /// Unrecognized values map to [`ClassSpec::Unknown`].
        #[must_use]
        pub const fn from_i32(value: i32) -> Self {
            match value {
                1 => ClassSpec::Iaido,
                2 => ClassSpec::Moonstrike,
                3 => ClassSpec::Icicle,
                4 => ClassSpec::Frostbeam,
                5 => ClassSpec::Voidflame,
                6 => ClassSpec::Blazecrimson,
                7 => ClassSpec::Vanguard,
                8 => ClassSpec::Skyward,
                9 => ClassSpec::Smite,
                10 => ClassSpec::Lifebind,
                11 => ClassSpec::Earthfort,
                12 => ClassSpec::Block,
                13 => ClassSpec::Wildpack,
                14 => ClassSpec::Falconry,
                15 => ClassSpec::Recovery,
                16 => ClassSpec::Shield,
                17 => ClassSpec::Dissonance,
                18 => ClassSpec::Concerto,
                _ => ClassSpec::Unknown,
            }
        }
    }

    pub fn get_class_spec_from_skill_id(skill_id: i32) -> ClassSpec {
        match skill_id {
            1714 => ClassSpec::Iaido,
            1737 => ClassSpec::Moonstrike,
            120902 => ClassSpec::Icicle,
            1241 => ClassSpec::Frostbeam,
            1605 => ClassSpec::Voidflame,
            1606 => ClassSpec::Blazecrimson,
            1405 | 1418 => ClassSpec::Vanguard,
            1419 => ClassSpec::Skyward,
            1518 | 1541 | 21402 => ClassSpec::Smite,
            20301 => ClassSpec::Lifebind,
            1922 => ClassSpec::Earthfort,
            1930 => ClassSpec::Block,
            220112 | 2203622 => ClassSpec::Falconry,
            2292 | 1700820 | 1700825 | 1700827 => ClassSpec::Wildpack,
            2406 => ClassSpec::Shield,
            2405 => ClassSpec::Recovery,
            2306 => ClassSpec::Dissonance,
            2307 | 2361 | 55302 => ClassSpec::Concerto,
            _ => ClassSpec::Unknown,
        }
    }

    pub const fn get_class_id_from_spec(class_spec: ClassSpec) -> i32 {
        match class_spec {
            ClassSpec::Iaido | ClassSpec::Moonstrike => STORMBLADE,
            ClassSpec::Icicle | ClassSpec::Frostbeam => FROST_MAGE,
            ClassSpec::Voidflame | ClassSpec::Blazecrimson => FLAME_BERSERKER,
            ClassSpec::Vanguard | ClassSpec::Skyward => WIND_KNIGHT,
            ClassSpec::Smite | ClassSpec::Lifebind => VERDANT_ORACLE,
            ClassSpec::Earthfort | ClassSpec::Block => HEAVY_GUARDIAN,
            ClassSpec::Wildpack | ClassSpec::Falconry => MARKSMAN,
            ClassSpec::Recovery | ClassSpec::Shield => SHIELD_KNIGHT,
            ClassSpec::Dissonance | ClassSpec::Concerto => BEAT_PERFORMER,
            ClassSpec::Unknown => UNKNOWN,
        }
    }

    pub fn get_class_spec(class_spec: ClassSpec) -> String {
        String::from(match class_spec {
            ClassSpec::Unknown => "",
            ClassSpec::Iaido => "Iaido",
            ClassSpec::Moonstrike => "Moonstrike",
            ClassSpec::Icicle => "Icicle",
            ClassSpec::Frostbeam => "Frostbeam",
            ClassSpec::Voidflame => "Voidflame",
            ClassSpec::Blazecrimson => "Blazecrimson",
            ClassSpec::Vanguard => "Vanguard",
            ClassSpec::Skyward => "Skyward",
            ClassSpec::Smite => "Smite",
            ClassSpec::Lifebind => "Lifebind",
            ClassSpec::Earthfort => "Earthfort",
            ClassSpec::Block => "Block",
            ClassSpec::Wildpack => "Wildpack",
            ClassSpec::Falconry => "Falconry",
            ClassSpec::Recovery => "Recovery",
            ClassSpec::Shield => "Shield",
            ClassSpec::Dissonance => "Dissonance",
            ClassSpec::Concerto => "Concerto",
        })
    }
}

#[cfg(test)]
mod tests {
    use super::class::ClassSpec;
    use super::{HitExtrema, merge_extrema, observe_extrema};

    #[test]
    fn class_spec_from_i32_roundtrips_all_discriminants() {
        const ALL: [ClassSpec; 19] = [
            ClassSpec::Unknown,
            ClassSpec::Iaido,
            ClassSpec::Moonstrike,
            ClassSpec::Icicle,
            ClassSpec::Frostbeam,
            ClassSpec::Voidflame,
            ClassSpec::Blazecrimson,
            ClassSpec::Vanguard,
            ClassSpec::Skyward,
            ClassSpec::Smite,
            ClassSpec::Lifebind,
            ClassSpec::Earthfort,
            ClassSpec::Block,
            ClassSpec::Wildpack,
            ClassSpec::Falconry,
            ClassSpec::Recovery,
            ClassSpec::Shield,
            ClassSpec::Dissonance,
            ClassSpec::Concerto,
        ];
        // Discriminants are persisted in encounter projections; reordering the
        // enum is a data-format break this test is meant to catch.
        for (index, spec) in ALL.into_iter().enumerate() {
            assert_eq!(spec as i32, index as i32);
            assert_eq!(ClassSpec::from_i32(index as i32), spec);
        }
        assert_eq!(ClassSpec::from_i32(-1), ClassSpec::Unknown);
        assert_eq!(ClassSpec::from_i32(19), ClassSpec::Unknown);
    }

    #[test]
    fn hit_extrema_observe_and_merge_are_monotonic() {
        let mut extrema = HitExtrema::single(50);
        extrema.observe(10);
        extrema.observe(80);
        extrema.observe(80);
        assert_eq!(extrema, HitExtrema { min: 10, max: 80 });
        assert_eq!(
            extrema.merged(HitExtrema::single(5)),
            HitExtrema { min: 5, max: 80 }
        );
        assert_eq!(
            extrema.merged(HitExtrema::single(90)),
            HitExtrema { min: 10, max: 90 }
        );

        let mut observed = None;
        observe_extrema(&mut observed, 40);
        observe_extrema(&mut observed, 12);
        merge_extrema(&mut observed, Some(HitExtrema::single(99)));
        merge_extrema(&mut observed, None);
        assert_eq!(observed, Some(HitExtrema { min: 12, max: 99 }));
    }
}
