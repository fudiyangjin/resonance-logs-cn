use super::super::scene::SceneConfig;

const SCENE_IDS: &[i32] = &[6563, 6564, 6565];

const MECHANIC_BUFF_IDS: &[i32] = &[
    883707, 883708, 883709, 883710, 883714, 883601, 883602, 883603, 883605, 883631,
];

// Entity template ids worth pushing on top of team members: Nabo, its sound
// devices, matrix runes, wave preview dummies, and the boss-phase ice ball
// (4604) / water bubble (4605) orbs whose positions players must track.
const RELEVANT_MONSTER_IDS: &[i32] = &[
    4601, 4603, 4604, 4605, 4639, 3340219, 3340220, 3340227, 3340228,
];

pub(crate) const CONFIG: SceneConfig = SceneConfig {
    scene_ids: SCENE_IDS,
    mechanic_buff_ids: MECHANIC_BUFF_IDS,
    relevant_monster_ids: RELEVANT_MONSTER_IDS,
};
