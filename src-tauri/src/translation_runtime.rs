use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

fn source_locales_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/lib/locales");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource dir: {e}"))?;
    let bundled_path = resource_dir.join("locales");
    if bundled_path.exists() {
        return Ok(bundled_path);
    }

    Err(format!(
        "Could not locate bundled locales directory (checked {} and {})",
        dev_path.display(),
        bundled_path.display()
    ))
}

fn runtime_locales_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let base = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    Ok(base.join("locales"))
}

fn normalize_relative_path(relative_path: &str) -> String {
    relative_path.replace('\\', "/").trim_start_matches('/').trim().to_string()
}

fn read_manifest(locales_dir: &Path) -> Result<Value, String> {
    let path = locales_dir.join("manifest.json");
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read manifest {}: {e}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse manifest {}: {e}", path.display()))
}

fn read_manifest_locales(locales_dir: &Path) -> Result<Vec<String>, String> {
    let manifest = read_manifest(locales_dir)?;
    let locales = manifest
        .get("locales")
        .and_then(Value::as_array)
        .ok_or_else(|| "Manifest missing locales array".to_string())?;
    Ok(locales
        .iter()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect())
}

fn read_manifest_virtual_paths(locales_dir: &Path) -> Result<Vec<String>, String> {
    let manifest = read_manifest(locales_dir)?;
    let categories = manifest
        .get("categories")
        .and_then(Value::as_object)
        .ok_or_else(|| "Manifest missing categories object".to_string())?;
    let mut out = Vec::new();
    for (category, files) in categories {
        if let Some(files) = files.as_array() {
            for file in files.iter().filter_map(Value::as_str) {
                out.push(format!("{category}/{file}"));
            }
        }
    }
    out.sort();
    Ok(out)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create {}: {e}", dst.display()))?;
    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read {}: {e}", src.display()))? {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {e}"))?;
        let path = entry.path();
        let name = entry.file_name();
        let target = dst.join(name);
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
            }
            fs::copy(&path, &target).map_err(|e| {
                format!("Failed to copy {} -> {}: {e}", path.display(), target.display())
            })?;
        }
    }
    Ok(())
}

fn ensure_runtime_locales_seeded(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let runtime_dir = runtime_locales_dir(app_handle)?;
    let manifest_path = runtime_dir.join("manifest.json");
    if !manifest_path.exists() {
        let source_dir = source_locales_dir(app_handle)?;
        copy_dir_recursive(&source_dir, &runtime_dir)?;
    }
    Ok(runtime_dir)
}

fn read_json_or_empty(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

fn pretty_json(value: &Value) -> Result<String, String> {
    serde_json::to_string_pretty(value).map_err(|e| format!("Failed to serialize JSON: {e}"))
}

fn ensure_object(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(map) => map,
        _ => Map::new(),
    }
}

fn set_locale_string(target: &mut Map<String, Value>, field: &str, locale: &str, value: String) {
    let entry = target
        .entry(field.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let map = match entry {
        Value::Object(map) => map,
        _ => {
            *entry = Value::Object(Map::new());
            match entry {
                Value::Object(map) => map,
                _ => unreachable!(),
            }
        }
    };
    map.insert(locale.to_string(), Value::String(value));
}

fn set_locale_array(target: &mut Map<String, Value>, field: &str, locale: &str, value: Vec<Value>) {
    let entry = target
        .entry(field.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let map = match entry {
        Value::Object(map) => map,
        _ => {
            *entry = Value::Object(Map::new());
            match entry {
                Value::Object(map) => map,
                _ => unreachable!(),
            }
        }
    };
    map.insert(locale.to_string(), Value::Array(value));
}

fn combine_generic_string_tables(locales_dir: &Path, locales: &[String], relative_path: &str) -> Result<Value, String> {
    let mut combined = Map::new();
    for locale in locales {
        let path = locales_dir.join(locale).join(relative_path);
        let data = ensure_object(read_json_or_empty(&path)?);
        for (key, value) in data {
            let text = value.as_str().unwrap_or("").to_string();
            let entry = combined.entry(key).or_insert_with(|| Value::Object(Map::new()));
            if let Value::Object(map) = entry {
                map.insert(locale.clone(), Value::String(text));
            }
        }
    }
    Ok(Value::Object(combined))
}

fn combine_skillnames(locales_dir: &Path, locales: &[String]) -> Result<Value, String> {
    let mut combined = Map::new();
    for locale in locales {
        let path = locales_dir.join(locale).join("parser").join("skillnames.json");
        let data = ensure_object(read_json_or_empty(&path)?);
        for (id, value) in data {
            let entry = ensure_object(value);
            let target = combined.entry(id).or_insert_with(|| Value::Object(Map::new()));
            if let Value::Object(target_obj) = target {
                let name = entry.get("name").and_then(Value::as_str).unwrap_or("").to_string();
                let note = entry.get("note").and_then(Value::as_str).unwrap_or("").to_string();
                set_locale_string(target_obj, "name", locale, name);
                set_locale_string(target_obj, "note", locale, note);
            }
        }
    }
    Ok(Value::Object(combined))
}

fn combine_buff_name(locales_dir: &Path, locales: &[String]) -> Result<Value, String> {
    let mut combined = Map::new();
    for locale in locales {
        let path = locales_dir.join(locale).join("parser").join("BuffName.json");
        let data = ensure_object(read_json_or_empty(&path)?);
        for (id, value) in data {
            let entry = ensure_object(value);
            let target = combined.entry(id).or_insert_with(|| Value::Object(Map::new()));
            if let Value::Object(target_obj) = target {
                for (k, v) in entry {
                    if k == "NameDesign" {
                        set_locale_string(target_obj, "NameDesign", locale, v.as_str().unwrap_or("").to_string());
                    } else {
                        target_obj.entry(k).or_insert(v);
                    }
                }
            }
        }
    }
    Ok(Value::Object(combined))
}

fn combine_search_table(locales_dir: &Path, locales: &[String], file_name: &str) -> Result<Value, String> {
    let mut combined = Map::new();
    for locale in locales {
        let path = locales_dir.join(locale).join("search").join(file_name);
        let data = ensure_object(read_json_or_empty(&path)?);
        for (id, value) in data {
            let entry = ensure_object(value);
            let target = combined.entry(id).or_insert_with(|| Value::Object(Map::new()));
            if let Value::Object(target_obj) = target {
                for (k, v) in entry {
                    match k.as_str() {
                        "name" | "notes" => set_locale_string(target_obj, &k, locale, v.as_str().unwrap_or("").to_string()),
                        "keywords" => set_locale_array(target_obj, &k, locale, v.as_array().cloned().unwrap_or_default()),
                        _ => {
                            target_obj.entry(k).or_insert(v);
                        }
                    }
                }
            }
        }
    }
    Ok(Value::Object(combined))
}

fn combine_virtual_file(locales_dir: &Path, locales: &[String], relative_path: &str) -> Result<Value, String> {
    if relative_path.starts_with("ui/")
        || matches!(
            relative_path,
            "parser/class-labels.json" | "parser/MonsterName.json" | "parser/SceneName.json"
        )
    {
        return combine_generic_string_tables(locales_dir, locales, relative_path);
    }

    match relative_path {
        "parser/skillnames.json" => combine_skillnames(locales_dir, locales),
        "parser/BuffName.json" => combine_buff_name(locales_dir, locales),
        "search/BuffNameSearch.json" => combine_search_table(locales_dir, locales, "BuffNameSearch.json"),
        "search/resonance-skill-search.json" => combine_search_table(locales_dir, locales, "resonance-skill-search.json"),
        _ => Err(format!("Unknown virtual translation file: {relative_path}")),
    }
}

fn split_generic_string_table(contents: &Value, locales: &[String]) -> Result<Vec<(String, Value)>, String> {
    let root = contents.as_object().ok_or_else(|| "Expected root object".to_string())?;
    let mut outputs: Vec<(String, Value)> = locales
        .iter()
        .map(|locale| (locale.clone(), Value::Object(Map::new())))
        .collect();
    for (key, value) in root {
        let locale_map = value.as_object().ok_or_else(|| format!("Expected locale map for key {key}"))?;
        for (locale, out) in outputs.iter_mut() {
            let text = locale_map.get(locale).and_then(Value::as_str).unwrap_or("").to_string();
            if let Value::Object(map) = out {
                map.insert(key.clone(), Value::String(text));
            }
        }
    }
    Ok(outputs)
}

fn split_skillnames(contents: &Value, locales: &[String]) -> Result<Vec<(String, Value)>, String> {
    let root = contents.as_object().ok_or_else(|| "Expected root object".to_string())?;
    let mut outputs: Vec<(String, Map<String, Value>)> = locales.iter().map(|l| (l.clone(), Map::new())).collect();
    for (id, value) in root {
        let entry = value.as_object().ok_or_else(|| format!("Expected object entry for id {id}"))?;
        let name_map = entry.get("name").and_then(Value::as_object).cloned().unwrap_or_default();
        let note_map = entry.get("note").and_then(Value::as_object).cloned().unwrap_or_default();
        for (locale, out) in outputs.iter_mut() {
            let mut local_entry = Map::new();
            local_entry.insert("name".to_string(), Value::String(name_map.get(locale).and_then(Value::as_str).unwrap_or("").to_string()));
            local_entry.insert("note".to_string(), Value::String(note_map.get(locale).and_then(Value::as_str).unwrap_or("").to_string()));
            out.insert(id.clone(), Value::Object(local_entry));
        }
    }
    Ok(outputs.into_iter().map(|(l, m)| (l, Value::Object(m))).collect())
}

fn split_buff_name(contents: &Value, locales: &[String]) -> Result<Vec<(String, Value)>, String> {
    let root = contents.as_object().ok_or_else(|| "Expected root object".to_string())?;
    let mut outputs: Vec<(String, Map<String, Value>)> = locales.iter().map(|l| (l.clone(), Map::new())).collect();
    for (id, value) in root {
        let entry = value.as_object().ok_or_else(|| format!("Expected object entry for id {id}"))?;
        let name_map = entry.get("NameDesign").and_then(Value::as_object).cloned().unwrap_or_default();
        for (locale, out) in outputs.iter_mut() {
            let mut local_entry = Map::new();
            for (k, v) in entry {
                if k == "NameDesign" {
                    local_entry.insert(k.clone(), Value::String(name_map.get(locale).and_then(Value::as_str).unwrap_or("").to_string()));
                } else {
                    local_entry.insert(k.clone(), v.clone());
                }
            }
            out.insert(id.clone(), Value::Object(local_entry));
        }
    }
    Ok(outputs.into_iter().map(|(l, m)| (l, Value::Object(m))).collect())
}

fn split_search_table(contents: &Value, locales: &[String]) -> Result<Vec<(String, Value)>, String> {
    let root = contents.as_object().ok_or_else(|| "Expected root object".to_string())?;
    let mut outputs: Vec<(String, Map<String, Value>)> = locales.iter().map(|l| (l.clone(), Map::new())).collect();
    for (id, value) in root {
        let entry = value.as_object().ok_or_else(|| format!("Expected object entry for id {id}"))?;
        let name_map = entry.get("name").and_then(Value::as_object).cloned().unwrap_or_default();
        let notes_map = entry.get("notes").and_then(Value::as_object).cloned().unwrap_or_default();
        let keywords_map = entry.get("keywords").and_then(Value::as_object).cloned().unwrap_or_default();
        for (locale, out) in outputs.iter_mut() {
            let mut local_entry = Map::new();
            for (k, v) in entry {
                match k.as_str() {
                    "name" => { local_entry.insert(k.clone(), Value::String(name_map.get(locale).and_then(Value::as_str).unwrap_or("").to_string())); },
                    "notes" => { local_entry.insert(k.clone(), Value::String(notes_map.get(locale).and_then(Value::as_str).unwrap_or("").to_string())); },
                    "keywords" => { local_entry.insert(k.clone(), Value::Array(keywords_map.get(locale).and_then(Value::as_array).cloned().unwrap_or_default())); },
                    _ => { local_entry.insert(k.clone(), v.clone()); },
                }
            }
            out.insert(id.clone(), Value::Object(local_entry));
        }
    }
    Ok(outputs.into_iter().map(|(l, m)| (l, Value::Object(m))).collect())
}

fn split_virtual_file(relative_path: &str, contents: &Value, locales: &[String]) -> Result<Vec<(String, String, Value)>, String> {
    let split: Vec<(String, Value)> = if relative_path.starts_with("ui/")
        || matches!(
            relative_path,
            "parser/class-labels.json" | "parser/MonsterName.json" | "parser/SceneName.json"
        )
    {
        split_generic_string_table(contents, locales)?
    } else {
        match relative_path {
            "parser/skillnames.json" => split_skillnames(contents, locales)?,
            "parser/BuffName.json" => split_buff_name(contents, locales)?,
            "search/BuffNameSearch.json" | "search/resonance-skill-search.json" => split_search_table(contents, locales)?,
            _ => return Err(format!("Unknown virtual translation file: {relative_path}")),
        }
    };
    Ok(split
        .into_iter()
        .map(|(locale, value)| (locale, relative_path.to_string(), value))
        .collect())
}

fn write_runtime_virtual_file(locales_dir: &Path, locales: &[String], relative_path: &str, contents: &str) -> Result<(), String> {
    let normalized = normalize_relative_path(relative_path);
    let parsed: Value = serde_json::from_str(contents)
        .map_err(|e| format!("Failed to parse JSON for {normalized}: {e}"))?;
    let split_outputs = split_virtual_file(&normalized, &parsed, locales)?;
    for (locale, rel, value) in split_outputs {
        let target = locales_dir.join(locale).join(&rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
        }
        fs::write(&target, pretty_json(&value)?)
            .map_err(|e| format!("Failed to write {}: {e}", target.display()))?;
    }
    Ok(())
}

fn source_config_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/lib/config")
}

fn source_meter_data_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("meter-data")
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    fs::write(path, pretty_json(value)?)
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

fn locale_file_path(locales_dir: &Path, locale: &str, relative_path: &str) -> PathBuf {
    locales_dir.join(locale).join(relative_path)
}

fn string_id_from_value(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn generated_buff_name_source() -> Result<BTreeMap<String, Map<String, Value>>, String> {
    let path = source_config_dir().join("BuffName.json");
    let raw = read_json_or_empty(&path)?;
    let entries = raw
        .as_array()
        .ok_or_else(|| format!("Expected array in {}", path.display()))?;

    let mut out = BTreeMap::new();
    for item in entries {
        let obj = item
            .as_object()
            .ok_or_else(|| format!("Expected object entry in {}", path.display()))?;
        let Some(id) = obj.get("Id").and_then(string_id_from_value) else {
            continue;
        };
        let mut entry = Map::new();
        entry.insert(
            "Id".to_string(),
            obj.get("Id").cloned().unwrap_or(Value::String(id.clone())),
        );
        entry.insert(
            "Icon".to_string(),
            obj.get("Icon").cloned().unwrap_or_else(|| Value::String(String::new())),
        );
        entry.insert(
            "SpriteFile".to_string(),
            obj.get("SpriteFile").cloned().unwrap_or(Value::Null),
        );
        entry.insert(
            "NameDesign".to_string(),
            Value::String(
                obj.get("NameDesign")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
            ),
        );
        out.insert(id, entry);
    }

    Ok(out)
}

fn generated_scene_source() -> Result<BTreeMap<String, String>, String> {
    let path = source_meter_data_dir().join("SceneName.json");
    let raw = ensure_object(read_json_or_empty(&path)?);
    let mut out = BTreeMap::new();
    for (id, value) in raw {
        out.insert(id, value.as_str().unwrap_or("").to_string());
    }
    Ok(out)
}

fn generated_monster_source() -> Result<BTreeMap<String, String>, String> {
    let path = source_meter_data_dir().join("MonsterIdNameType.json");
    let raw = ensure_object(read_json_or_empty(&path)?);
    let mut out = BTreeMap::new();
    for (id, value) in raw {
        let name = value
            .as_object()
            .and_then(|entry| entry.get("Name"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        out.insert(id, name);
    }
    Ok(out)
}

fn generated_ui_string_source(app_handle: &AppHandle, relative_path: &str) -> Result<BTreeMap<String, String>, String> {
    let normalized = normalize_relative_path(relative_path);
    if !normalized.starts_with("ui/") {
        return Err(format!("UI generator only supports ui/* paths, got {normalized}"));
    }

    let source_dir = source_locales_dir(app_handle)?;
    let source_path = source_dir.join("zh-CN").join(&normalized);
    let raw = ensure_object(read_json_or_empty(&source_path)?);
    let mut out = BTreeMap::new();

    for (key, value) in raw {
        out.insert(key, value.as_str().unwrap_or("").to_string());
    }

    Ok(out)
}

fn insert_generated_skill(
    target: &mut BTreeMap<String, (String, String)>,
    id: String,
    name: String,
    note: String,
) {
    if name.trim().is_empty() && note.trim().is_empty() {
        return;
    }
    target.entry(id).or_insert((name, note));
}

fn generated_skillnames_source() -> Result<BTreeMap<String, (String, String)>, String> {
    let mut out = BTreeMap::new();

    let recount_path = source_config_dir().join("RecountTable.json");
    let recount = ensure_object(read_json_or_empty(&recount_path)?);
    for (id, value) in recount {
        let name = value
            .as_object()
            .and_then(|entry| entry.get("RecountName"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        insert_generated_skill(&mut out, id, name, String::new());
    }

    let damage_attr_path = source_config_dir().join("DamageAttrIdName.json");
    let damage_attr = ensure_object(read_json_or_empty(&damage_attr_path)?);
    for (id, value) in damage_attr {
        insert_generated_skill(
            &mut out,
            id,
            value.as_str().unwrap_or("").to_string(),
            String::new(),
        );
    }

    let skill_effect_path = source_meter_data_dir().join("SkillEffectTable.json");
    let skill_effect = ensure_object(read_json_or_empty(&skill_effect_path)?);
    for (id, value) in skill_effect {
        let name = value
            .as_object()
            .and_then(|entry| entry.get("Name"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        insert_generated_skill(&mut out, id, name, String::new());
    }

    let skill_fight_path = source_meter_data_dir().join("SkillFightLevelTable.json");
    let skill_fight = ensure_object(read_json_or_empty(&skill_fight_path)?);
    for (id, value) in skill_fight {
        let name = value
            .as_object()
            .and_then(|entry| entry.get("Name"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        insert_generated_skill(&mut out, id, name, String::new());
    }

    let temp_attr_path = source_meter_data_dir().join("TempAttrTable.json");
    let temp_attr = ensure_object(read_json_or_empty(&temp_attr_path)?);
    for (id, value) in temp_attr {
        let name = value
            .as_object()
            .and_then(|entry| entry.get("Name"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let note = value
            .as_object()
            .and_then(|entry| entry.get("Desc"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        insert_generated_skill(&mut out, id, name, note);
    }

    Ok(out)
}

fn generated_buff_name_search_source() -> Result<BTreeMap<String, Map<String, Value>>, String> {
    let buff_source = generated_buff_name_source()?;
    let mut out = BTreeMap::new();

    for (id, entry) in buff_source {
        let name = entry
            .get("NameDesign")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let sprite_file = entry.get("SpriteFile").cloned().unwrap_or(Value::Null);
        let icon = entry.get("Icon").and_then(Value::as_str).unwrap_or("").to_string();
        let mut next = Map::new();
        next.insert("categories".to_string(), Value::Array(Vec::new()));
        let has_sprite_file = sprite_file
            .as_str()
            .map(|value| !value.is_empty())
            .unwrap_or(false);
        next.insert(
            "hasSpriteFile".to_string(),
            Value::Bool(has_sprite_file),
        );
        next.insert(
            "iconKey".to_string(),
            if icon.is_empty() { Value::Null } else { Value::String(icon) },
        );
        next.insert("name".to_string(), Value::String(name.clone()));
        next.insert("notes".to_string(), Value::String(String::new()));
        next.insert(
            "keywords".to_string(),
            if name.is_empty() { Value::Array(Vec::new()) } else { Value::Array(vec![Value::String(name)]) },
        );
        next.insert("spriteFile".to_string(), sprite_file);
        out.insert(id, next);
    }

    Ok(out)
}

fn merge_generated_string_locale_file(
    generated: &BTreeMap<String, String>,
    existing: Map<String, Value>,
    locale: &str,
) -> Value {
    let mut existing = existing;
    let mut out = Map::new();

    for (id, zh_value) in generated {
        let value = if locale == "zh-CN" {
            zh_value.clone()
        } else {
            existing
                .remove(id)
                .and_then(|value| value.as_str().map(ToOwned::to_owned))
                .unwrap_or_default()
        };
        out.insert(id.clone(), Value::String(value));
    }

    for (id, value) in existing {
        out.entry(id).or_insert(value);
    }

    Value::Object(out)
}

fn merge_generated_skillnames_locale_file(
    generated: &BTreeMap<String, (String, String)>,
    existing: Map<String, Value>,
    locale: &str,
) -> Value {
    let mut existing = existing;
    let mut out = Map::new();

    for (id, (zh_name, zh_note)) in generated {
        let existing_entry = existing.remove(id).map(ensure_object).unwrap_or_default();
        let mut next_entry = Map::new();

        let name = if locale == "zh-CN" {
            zh_name.clone()
        } else {
            existing_entry
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string()
        };

        let note = if locale == "zh-CN" {
            zh_note.clone()
        } else {
            existing_entry
                .get("note")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string()
        };

        next_entry.insert("name".to_string(), Value::String(name));
        next_entry.insert("note".to_string(), Value::String(note));

        for (key, value) in existing_entry {
            if key != "name" && key != "note" {
                next_entry.entry(key).or_insert(value);
            }
        }

        out.insert(id.clone(), Value::Object(next_entry));
    }

    for (id, value) in existing {
        out.entry(id).or_insert(value);
    }

    Value::Object(out)
}

fn merge_generated_buff_name_locale_file(
    generated: &BTreeMap<String, Map<String, Value>>,
    existing: Map<String, Value>,
    locale: &str,
) -> Value {
    let mut existing = existing;
    let mut out = Map::new();

    for (id, source_entry) in generated {
        let existing_entry = existing.remove(id).map(ensure_object).unwrap_or_default();
        let mut next_entry = Map::new();

        for (key, value) in source_entry {
            if key == "NameDesign" {
                let localized = if locale == "zh-CN" {
                    value.as_str().unwrap_or("").to_string()
                } else {
                    existing_entry
                        .get("NameDesign")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string()
                };
                next_entry.insert(key.clone(), Value::String(localized));
            } else {
                next_entry.insert(key.clone(), value.clone());
            }
        }

        for (key, value) in existing_entry {
            next_entry.entry(key).or_insert(value);
        }

        out.insert(id.clone(), Value::Object(next_entry));
    }

    for (id, value) in existing {
        out.entry(id).or_insert(value);
    }

    Value::Object(out)
}

fn merge_generated_search_locale_file(
    generated: &BTreeMap<String, Map<String, Value>>,
    existing: Map<String, Value>,
    locale: &str,
) -> Value {
    let mut existing = existing;
    let mut out = Map::new();

    for (id, source_entry) in generated {
        let existing_entry = existing.remove(id).map(ensure_object).unwrap_or_default();
        let mut next_entry = Map::new();

        for (key, value) in source_entry {
            match key.as_str() {
                "name" => {
                    let localized = if locale == "zh-CN" {
                        value.as_str().unwrap_or("").to_string()
                    } else {
                        existing_entry
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string()
                    };
                    next_entry.insert(key.clone(), Value::String(localized));
                }
                "notes" => {
                    let localized = existing_entry
                        .get("notes")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    next_entry.insert(key.clone(), Value::String(localized));
                }
                "keywords" => {
                    let localized = if locale == "zh-CN" {
                        value.as_array().cloned().unwrap_or_default()
                    } else {
                        existing_entry
                            .get("keywords")
                            .and_then(Value::as_array)
                            .cloned()
                            .unwrap_or_default()
                    };
                    next_entry.insert(key.clone(), Value::Array(localized));
                }
                _ => {
                    next_entry.insert(key.clone(), value.clone());
                }
            }
        }

        for (key, value) in existing_entry {
            next_entry.entry(key).or_insert(value);
        }

        out.insert(id.clone(), Value::Object(next_entry));
    }

    for (id, value) in existing {
        out.entry(id).or_insert(value);
    }

    Value::Object(out)
}

fn generate_locale_file_for_all_locales<F>(
    locales_dir: &Path,
    locales: &[String],
    relative_path: &str,
    mut build_value: F,
) -> Result<(), String>
where
    F: FnMut(&str, Map<String, Value>) -> Result<Value, String>,
{
    for locale in locales {
        let path = locale_file_path(locales_dir, locale, relative_path);
        let existing = ensure_object(read_json_or_empty(&path)?);
        let next_value = build_value(locale, existing)?;
        write_json_file(&path, &next_value)?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn initialize_translation_runtime_files(app_handle: tauri::AppHandle) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    Ok(format!("Initialized runtime locale files at {}", runtime_dir.display()))
}

#[tauri::command]
#[specta::specta]
pub fn open_translation_data_dir(app_handle: tauri::AppHandle) -> Result<(), String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&runtime_dir)
            .spawn()
            .map_err(|e| format!("Failed to open translation dir: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(&runtime_dir)
            .spawn()
            .map_err(|e| format!("Failed to open translation dir: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn refresh_translation_runtime_data(app_handle: tauri::AppHandle) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    app_handle
        .emit(
            "translation-data-refreshed",
            serde_json::json!({
                "dir": runtime_dir,
                "timestamp": timestamp,
            }),
        )
        .map_err(|e| format!("Failed to emit refresh event: {e}"))?;
    Ok("Translation runtime data refreshed".to_string())
}

#[tauri::command]
#[specta::specta]
pub fn list_translation_runtime_files(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    read_manifest_virtual_paths(&runtime_dir)
}

#[tauri::command]
#[specta::specta]
pub fn read_translation_runtime_file(app_handle: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let normalized = normalize_relative_path(&relative_path);
    let combined = combine_virtual_file(&runtime_dir, &locales, &normalized)?;
    pretty_json(&combined)
}

#[tauri::command]
#[specta::specta]
pub fn write_translation_runtime_file(app_handle: tauri::AppHandle, relative_path: String, contents: String) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let normalized = normalize_relative_path(&relative_path);
    write_runtime_virtual_file(&runtime_dir, &locales, &normalized, &contents)?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    let _ = app_handle.emit(
        "translation-data-refreshed",
        serde_json::json!({
            "dir": runtime_dir,
            "relativePath": normalized,
            "timestamp": timestamp,
        }),
    );
    Ok(format!("Saved {normalized}"))
}

#[tauri::command]
#[specta::specta]
pub fn generate_ui_translation_scaffold(app_handle: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let normalized = normalize_relative_path(&relative_path);
    let generated = generated_ui_string_source(&app_handle, &normalized)?;
    let entry_count = generated.len();
    generate_locale_file_for_all_locales(&runtime_dir, &locales, &normalized, |locale, existing| {
        Ok(merge_generated_string_locale_file(&generated, existing, locale))
    })?;
    let _ = refresh_translation_runtime_data(app_handle.clone())?;
    Ok(format!(
        "Generated {normalized} for {} locales ({} keys)",
        locales.len(),
        entry_count
    ))
}

#[tauri::command]
#[specta::specta]
pub fn generate_all_ui_translation_scaffolds(app_handle: tauri::AppHandle) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let virtual_paths = read_manifest_virtual_paths(&runtime_dir)?;

    let ui_paths: Vec<String> = virtual_paths
        .into_iter()
        .filter(|path| path.starts_with("ui/"))
        .collect();

    let mut total_keys = 0usize;
    for relative_path in &ui_paths {
        let generated = generated_ui_string_source(&app_handle, relative_path)?;
        total_keys += generated.len();
        generate_locale_file_for_all_locales(&runtime_dir, &locales, relative_path, |locale, existing| {
            Ok(merge_generated_string_locale_file(&generated, existing, locale))
        })?;
    }

    let _ = refresh_translation_runtime_data(app_handle.clone())?;
    Ok(format!(
        "Generated {} UI files for {} locales ({} keys)",
        ui_paths.len(),
        locales.len(),
        total_keys
    ))
}

#[tauri::command]
#[specta::specta]
pub fn generate_buff_name_search_scaffold(app_handle: tauri::AppHandle) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let generated = generated_buff_name_search_source()?;
    let entry_count = generated.len();
    generate_locale_file_for_all_locales(&runtime_dir, &locales, "search/BuffNameSearch.json", |locale, existing| {
        Ok(merge_generated_search_locale_file(&generated, existing, locale))
    })?;
    let _ = refresh_translation_runtime_data(app_handle.clone())?;
    Ok(format!("Generated search/BuffNameSearch.json for {} locales ({} entries)", locales.len(), entry_count))
}

#[tauri::command]
#[specta::specta]
pub fn generate_buff_name_translation_scaffold(app_handle: tauri::AppHandle) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let generated = generated_buff_name_source()?;
    let entry_count = generated.len();
    generate_locale_file_for_all_locales(&runtime_dir, &locales, "parser/BuffName.json", |locale, existing| {
        Ok(merge_generated_buff_name_locale_file(&generated, existing, locale))
    })?;
    let _ = refresh_translation_runtime_data(app_handle.clone())?;
    Ok(format!("Generated parser/BuffName.json for {} locales ({} entries)", locales.len(), entry_count))
}

#[tauri::command]
#[specta::specta]
pub fn generate_scene_name_translation_scaffold(app_handle: tauri::AppHandle) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let generated = generated_scene_source()?;
    let entry_count = generated.len();
    generate_locale_file_for_all_locales(&runtime_dir, &locales, "parser/SceneName.json", |locale, existing| {
        Ok(merge_generated_string_locale_file(&generated, existing, locale))
    })?;
    let _ = refresh_translation_runtime_data(app_handle.clone())?;
    Ok(format!("Generated parser/SceneName.json for {} locales ({} entries)", locales.len(), entry_count))
}

#[tauri::command]
#[specta::specta]
pub fn generate_monster_name_translation_scaffold(app_handle: tauri::AppHandle) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let generated = generated_monster_source()?;
    let entry_count = generated.len();
    generate_locale_file_for_all_locales(&runtime_dir, &locales, "parser/MonsterName.json", |locale, existing| {
        Ok(merge_generated_string_locale_file(&generated, existing, locale))
    })?;
    let _ = refresh_translation_runtime_data(app_handle.clone())?;
    Ok(format!("Generated parser/MonsterName.json for {} locales ({} entries)", locales.len(), entry_count))
}

#[tauri::command]
#[specta::specta]
pub fn generate_skill_name_translation_scaffold(app_handle: tauri::AppHandle) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let generated = generated_skillnames_source()?;
    let entry_count = generated.len();
    generate_locale_file_for_all_locales(&runtime_dir, &locales, "parser/skillnames.json", |locale, existing| {
        Ok(merge_generated_skillnames_locale_file(&generated, existing, locale))
    })?;
    let _ = refresh_translation_runtime_data(app_handle.clone())?;
    Ok(format!("Generated parser/skillnames.json for {} locales ({} entries)", locales.len(), entry_count))
}
