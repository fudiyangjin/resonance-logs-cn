use crate::parser_data;
use log::warn;
use parking_lot::RwLock;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::LazyLock;

const SCENE_NAME_RELATIVE: &str = "generated/scenenames.json";

/// Stores cached scene names to minimize JSON reloads.
#[derive(Default)]
struct SceneNameCache {
    names: HashMap<i32, String>,
}

static SCENE_NAME_CACHE: LazyLock<RwLock<SceneNameCache>> = LazyLock::new(|| {
    let cache = load_scene_names();
    RwLock::new(cache)
});

/// Returns the name for the given scene id, or a default string if not found.
pub fn lookup(scene_id: i32) -> String {
    let cache = SCENE_NAME_CACHE.read();
    cache
        .names
        .get(&scene_id)
        .cloned()
        .unwrap_or_else(|| format!("Unknown Scene {}", scene_id))
}

/// Returns the scene name with optional dungeon difficulty suffix.
pub fn lookup_with_difficulty(scene_id: i32, difficulty: Option<i32>) -> String {
    let base_name = lookup(scene_id);
    match difficulty {
        Some(v) => format!("{}-{}", base_name, v),
        None => base_name,
    }
}

/// Returns true if a scene id exists in the loaded scene map.
#[allow(dead_code)]
pub fn contains(scene_id: i32) -> bool {
    let cache = SCENE_NAME_CACHE.read();
    cache.names.contains_key(&scene_id)
}

/// Loads the scene names JSON file and builds a lookup map from id to display name.
fn load_scene_names() -> SceneNameCache {
    let mut names = HashMap::new();

    match parser_data::read_to_string(SCENE_NAME_RELATIVE) {
        Ok(data) => match serde_json::from_str::<Value>(&data) {
            Ok(Value::Object(root)) => {
                for (id_str, name_value) in root {
                    if let Ok(scene_id) = id_str.parse::<i32>() {
                        if let Some(name) = name_value.as_str() {
                            names.insert(scene_id, name.to_string());
                        } else if let Some(name) = name_value
                            .as_object()
                            .and_then(|entry| entry.get("Name"))
                            .and_then(Value::as_str)
                        {
                            names.insert(scene_id, name.to_string());
                        }
                    }
                }
            }
            Ok(_) => {
                warn!(
                    "Scene names JSON is not an object at {}",
                    SCENE_NAME_RELATIVE
                );
            }
            Err(err) => {
                warn!(
                    "Failed to parse scene names JSON at {}: {}",
                    SCENE_NAME_RELATIVE, err
                );
            }
        },
        Err(err) => {
            warn!(
                "Failed to read scene names JSON at {}: {}",
                SCENE_NAME_RELATIVE, err
            );
        }
    }

    SceneNameCache { names }
}
