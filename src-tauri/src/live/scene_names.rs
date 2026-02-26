use log::warn;
use parking_lot::RwLock;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::LazyLock;

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
pub fn contains(scene_id: i32) -> bool {
    let cache = SCENE_NAME_CACHE.read();
    cache.names.contains_key(&scene_id)
}

/// Loads the scene names JSON file and builds a lookup map from id to display name.
fn load_scene_names() -> SceneNameCache {
    // Try to find the SceneName.json file in meter-data folder
    let mut path = PathBuf::from("meter-data/SceneName.json");

    // If not found, try from src-tauri directory (development)
    if !path.exists() {
        path = PathBuf::from("src-tauri/meter-data/SceneName.json");
    }

    // If still not found, try from current exe directory (production)
    if !path.exists() {
        if let Ok(mut exe_dir) = std::env::current_exe() {
            exe_dir.pop();
            exe_dir.push("meter-data");
            exe_dir.push("SceneName.json");
            path = exe_dir;
        }
    }

    let mut names = HashMap::new();

    match fs::read_to_string(&path) {
        Ok(data) => match serde_json::from_str::<Value>(&data) {
            Ok(Value::Object(root)) => {
                for (id_str, name_value) in root {
                    if let Ok(scene_id) = id_str.parse::<i32>() {
                        if let Some(name) = name_value.as_str() {
                            names.insert(scene_id, name.to_string());
                        }
                    }
                }
            }
            Ok(_) => {
                warn!("Scene names JSON is not an object at {}", path.display());
            }
            Err(err) => {
                warn!(
                    "Failed to parse scene names JSON at {}: {}",
                    path.display(),
                    err
                );
            }
        },
        Err(err) => {
            warn!(
                "Failed to read scene names JSON at {}: {}",
                path.display(),
                err
            );
        }
    }

    SceneNameCache { names }
}
