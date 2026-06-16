use super::super::scene::SceneConfig;

const SCENE_IDS: &[i32] = &[13021, 13022, 13023];

const MECHANIC_BUFF_IDS: &[i32] = &[
    829104, 829105, 829106, 829115, 829116, 829214, 829215, 829217, 829226, 829227, 829228, 829245,
    829304, 829305, 829306, 829307, 829308, 829309, 829316, 829318, 829323, 829324, 829326,
    829327, 829328, 829329, 829330, 829331, 829332, 829372, 829373, 829374,
];

// Entity template ids (attr `10`) worth pushing on top of team members: the
// boss and its adds. Mechanic decoration monsters (3000xxx/3100002/210107) are
// intentionally excluded as visual noise.
const RELEVANT_MONSTER_IDS: &[i32] = &[
    103106, 103301, 103302, 103303, 103309, 103310, 103311,
];

pub(crate) const CONFIG: SceneConfig = SceneConfig {
    scene_ids: SCENE_IDS,
    mechanic_buff_ids: MECHANIC_BUFF_IDS,
    relevant_monster_ids: RELEVANT_MONSTER_IDS,
};
