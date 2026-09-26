//! Static minimap scene filters, independent from runtime state.

pub struct MinimapSceneConfig {
    pub scene_ids: &'static [i32],
    pub mechanic_buff_ids: &'static [i32],
    pub relevant_monster_ids: &'static [i32],
}

const SCENES: &[&MinimapSceneConfig] = &[
    &super::scenes::s3_cursed_tomb::CONFIG,
    &super::scenes::s3_giant_tower::CONFIG,
    &super::scenes::s3_raid::CONFIG,
    &super::scenes::s3_sea_ringed_reef::CONFIG,
    &super::scenes::s3_tina_mindrealm::CONFIG,
    &super::scenes::s4_wasteland_court::CONFIG,
    &super::scenes::s4_sky_end_raid::CONFIG,
];

#[must_use]
pub fn scene_config(scene_id: i32) -> Option<&'static MinimapSceneConfig> {
    SCENES
        .iter()
        .copied()
        .find(|config| config.scene_ids.contains(&scene_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_registered_scenes_have_minimap_filters() {
        assert!(scene_config(6563).is_some());
        assert!(scene_config(13023).is_some());
        assert!(scene_config(6615).is_some());
        assert!(std::ptr::eq(
            scene_config(13031).unwrap(),
            scene_config(13032).unwrap()
        ));
        assert!(std::ptr::eq(
            scene_config(13032).unwrap(),
            scene_config(13033).unwrap()
        ));
        assert!(scene_config(6613).is_none());
        assert!(scene_config(0).is_none());
    }
}
