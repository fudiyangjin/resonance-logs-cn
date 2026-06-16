pub(crate) struct SceneConfig {
    pub(crate) scene_ids: &'static [i32],
    pub(crate) mechanic_buff_ids: &'static [i32],
    /// Entity template ids (attr `10` / `ATTR_ID`) worth pushing to the minimap
    /// overlay for this scene, on top of team members. Matched across all entity
    /// types since `monster_id_of` reads attr `10` for every entity.
    pub(crate) relevant_monster_ids: &'static [i32],
}

const SCENES: &[&SceneConfig] = &[&super::scenes::s3_raid::CONFIG];

#[inline]
#[must_use]
pub(crate) fn scene_config_for(scene_id: i32) -> Option<&'static SceneConfig> {
    SCENES
        .iter()
        .copied()
        .find(|config| config.scene_ids.contains(&scene_id))
}

#[inline]
#[must_use]
pub(crate) fn is_minimap_scene(scene_id: i32) -> bool {
    scene_config_for(scene_id).is_some()
}
