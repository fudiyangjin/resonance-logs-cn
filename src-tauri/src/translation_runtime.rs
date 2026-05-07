use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

const GENERATED_RUNTIME_FILES: &[&str] = &[
    "BuffName.json",
    "class-labels.json",
    "DamageAttrIdName.json",
    "EffectSources.json",
    "itemnames.json",
    "monsternames.json",
    "Notes.json",
    "RecountTable.json",
    "scenenames.json",
    "SeasonPhantomFactors.json",
    "skill_aoyi_icons.json",
    "SkillBreakdownDetails.json",
    "skillnames.json",
];

fn looks_like_locales_dir(path: &Path) -> bool {
    path.join("manifest.json").exists()
}

fn source_locales_candidates(app_handle: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let mut candidates = Vec::new();

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/lib/locales");
    candidates.push(dev_path);

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        candidates.push(resource_dir.join("locales"));
        candidates.push(resource_dir.join("src/lib/locales"));
        candidates.push(resource_dir.join("resources/locales"));
        if let Some(parent) = resource_dir.parent() {
            candidates.push(parent.join("locales"));
            candidates.push(parent.join("Resources/locales"));
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("locales"));
            candidates.push(exe_dir.join("resources/locales"));
            candidates.push(exe_dir.join("Resources/locales"));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join("locales"));
                candidates.push(parent.join("resources/locales"));
                candidates.push(parent.join("Resources/locales"));
            }
        }
    }

    let mut unique = Vec::new();
    for candidate in candidates {
        if !unique
            .iter()
            .any(|existing: &PathBuf| existing == &candidate)
        {
            unique.push(candidate);
        }
    }

    Ok(unique)
}

fn find_locales_dir_under(root: &Path, max_depth: usize) -> Option<PathBuf> {
    fn walk(path: &Path, depth: usize, max_depth: usize) -> Option<PathBuf> {
        if depth > max_depth {
            return None;
        }
        if looks_like_locales_dir(path) {
            return Some(path.to_path_buf());
        }
        let entries = fs::read_dir(path).ok()?;
        for entry in entries.flatten() {
            let child = entry.path();
            if child.is_dir() {
                if let Some(found) = walk(&child, depth + 1, max_depth) {
                    return Some(found);
                }
            }
        }
        None
    }

    if !root.exists() {
        return None;
    }

    walk(root, 0, max_depth)
}

fn source_locales_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let candidates = source_locales_candidates(app_handle)?;
    for candidate in &candidates {
        if looks_like_locales_dir(candidate) {
            return Ok(candidate.clone());
        }
    }

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        if let Some(found) = find_locales_dir_under(&resource_dir, 4) {
            return Ok(found);
        }
    }

    let checked = candidates
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    Err(format!(
        "Could not locate bundled locales directory (checked: {checked})"
    ))
}

fn runtime_locales_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let base = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    Ok(base.join("locales"))
}

fn runtime_generated_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let base = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    Ok(base.join("generated"))
}

fn normalize_relative_path(relative_path: &str) -> String {
    relative_path
        .replace('\\', "/")
        .trim_start_matches('/')
        .trim()
        .to_string()
}

fn generated_file_name(relative_path: &str) -> Option<String> {
    let normalized = normalize_relative_path(relative_path);
    let file_name = normalized.strip_prefix("generated/")?;
    if file_name.contains('/') || file_name.contains('\\') || !file_name.ends_with(".json") {
        return None;
    }
    Some(file_name.to_string())
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
        if category != "ui" {
            continue;
        }
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
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create {}: {e}", dst.display()))?;
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
                format!(
                    "Failed to copy {} -> {}: {e}",
                    path.display(),
                    target.display()
                )
            })?;
        }
    }
    Ok(())
}

fn copy_file_with_parents(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    fs::copy(src, dst)
        .map_err(|e| format!("Failed to copy {} -> {}: {e}", src.display(), dst.display()))?;
    Ok(())
}

fn deep_fill_missing(target: &mut Value, source: &Value) -> usize {
    match (target, source) {
        (Value::Object(target_map), Value::Object(source_map)) => {
            let mut inserted = 0usize;
            for (key, source_value) in source_map {
                if let Some(existing_value) = target_map.get_mut(key) {
                    inserted += deep_fill_missing(existing_value, source_value);
                } else {
                    target_map.insert(key.clone(), source_value.clone());
                    inserted += 1;
                }
            }
            inserted
        }
        (Value::String(target_value), Value::String(source_value)) => {
            if target_value.trim().is_empty() && !source_value.trim().is_empty() {
                *target_value = source_value.clone();
                1
            } else {
                0
            }
        }
        _ => 0,
    }
}

fn remove_obsolete_runtime_locale_files(
    runtime_dir: &Path,
    locales: &[String],
) -> Result<usize, String> {
    const OBSOLETE_FILES: &[&str] = &[
        "BuffName.json",
        "buffname.json",
        "class-labels.json",
        "MonsterName.json",
        "monstername.json",
        "SceneName.json",
        "scenename.json",
        "SkillName.json",
        "skillname.json",
        "skillnames.json",
        "parser/BuffName.json",
        "parser/buffname.json",
        "parser/class-labels.json",
        "parser/MonsterName.json",
        "parser/monstername.json",
        "parser/SceneName.json",
        "parser/scenename.json",
        "parser/SkillName.json",
        "parser/skillname.json",
        "parser/skillnames.json",
        "ui/monster-monitor.json",
    ];
    const OBSOLETE_DIRS: &[&str] = &["parser", "ui/skill-monitor"];

    let mut removed = 0usize;
    for locale in locales {
        let locale_dir = runtime_dir.join(locale);
        for relative_path in OBSOLETE_FILES {
            let path = locale_dir.join(Path::new(relative_path));
            if path.is_file() {
                fs::remove_file(&path)
                    .map_err(|e| format!("Failed to remove obsolete {}: {e}", path.display()))?;
                removed += 1;
            }
        }

        for relative_path in OBSOLETE_DIRS {
            let path = locale_dir.join(Path::new(relative_path));
            if path.is_dir() {
                fs::remove_dir_all(&path)
                    .map_err(|e| format!("Failed to remove obsolete {}: {e}", path.display()))?;
                removed += 1;
            }
        }
    }

    Ok(removed)
}

fn repair_runtime_locales_folder(
    app_handle: &AppHandle,
) -> Result<(PathBuf, usize, usize, usize, usize), String> {
    let source_dir = source_locales_dir(app_handle)?;
    let runtime_dir = ensure_runtime_locales_seeded(app_handle)?;

    let source_manifest_path = source_dir.join("manifest.json");
    let runtime_manifest_path = runtime_dir.join("manifest.json");
    if source_manifest_path.exists() {
        copy_file_with_parents(&source_manifest_path, &runtime_manifest_path)?;
    }

    let locales = read_manifest_locales(&source_dir)?;
    let virtual_paths = read_manifest_virtual_paths(&source_dir)?;
    let removed_obsolete = remove_obsolete_runtime_locale_files(&runtime_dir, &locales)?;

    let mut created_files = 0usize;
    let mut repaired_files = 0usize;
    let mut inserted_keys = 0usize;

    for locale in &locales {
        let locale_dir = runtime_dir.join(locale);
        fs::create_dir_all(&locale_dir)
            .map_err(|e| format!("Failed to create {}: {e}", locale_dir.display()))?;

        for relative_path in &virtual_paths {
            let source_path = locale_dir_from_base(&source_dir, locale).join(relative_path);
            let runtime_path = locale_dir_from_base(&runtime_dir, locale).join(relative_path);

            if !runtime_path.exists() {
                if source_path.exists() {
                    copy_file_with_parents(&source_path, &runtime_path)?;
                } else {
                    write_json_file(&runtime_path, &Value::Object(Map::new()))?;
                }
                created_files += 1;
                continue;
            }

            if !source_path.exists() {
                continue;
            }

            let mut runtime_value = read_json_or_empty(&runtime_path)?;
            let source_value = read_json_or_empty(&source_path)?;
            let added = deep_fill_missing(&mut runtime_value, &source_value);
            if added > 0 {
                write_json_file(&runtime_path, &runtime_value)?;
                repaired_files += 1;
                inserted_keys += added;
            }
        }
    }

    Ok((
        runtime_dir,
        created_files,
        repaired_files,
        inserted_keys,
        removed_obsolete,
    ))
}

fn locale_dir_from_base(base: &Path, locale: &str) -> PathBuf {
    base.join(locale)
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

fn ensure_runtime_generated_seeded(app_handle: &AppHandle) -> Result<(PathBuf, usize), String> {
    let runtime_dir = runtime_generated_dir(app_handle)?;
    fs::create_dir_all(&runtime_dir)
        .map_err(|e| format!("Failed to create {}: {e}", runtime_dir.display()))?;

    let mut created_files = 0usize;
    for file_name in GENERATED_RUNTIME_FILES {
        let target = runtime_dir.join(file_name);
        if target.exists() {
            continue;
        }

        if *file_name == "Notes.json" {
            write_json_file(&target, &Value::Object(Map::new()))?;
            created_files += 1;
            continue;
        }

        let source = crate::parser_data::locate_file(Path::new("generated").join(file_name))
            .ok_or_else(|| format!("Generated parser data file missing: generated/{file_name}"))?;
        copy_file_with_parents(&source, &target)?;
        created_files += 1;
    }

    Ok((runtime_dir, created_files))
}

fn notes_file_path(generated_dir: &Path) -> PathBuf {
    generated_dir.join("Notes.json")
}

fn read_generated_notes(generated_dir: &Path) -> Result<Map<String, Value>, String> {
    Ok(ensure_object(read_json_or_empty(&notes_file_path(
        generated_dir,
    ))?))
}

fn generated_entry_id(entry: &Map<String, Value>) -> Option<String> {
    entry
        .get("Id")
        .or_else(|| entry.get("id"))
        .and_then(|value| match value {
            Value::Number(number) => Some(number.to_string()),
            Value::String(text) if !text.trim().is_empty() => Some(text.trim().to_string()),
            _ => None,
        })
}

fn overlay_user_notes(relative_path: &str, value: &mut Value, notes_root: &Map<String, Value>) {
    let Some(file_notes) = notes_root.get(relative_path).and_then(Value::as_object) else {
        return;
    };

    match value {
        Value::Object(root) => {
            for (id, entry) in root {
                let Some(note) = file_notes.get(id).and_then(Value::as_str) else {
                    continue;
                };
                if let Value::Object(entry_map) = entry {
                    entry_map.insert("UserNote".to_string(), Value::String(note.to_string()));
                }
            }
        }
        Value::Array(entries) => {
            for entry in entries {
                let Value::Object(entry_map) = entry else {
                    continue;
                };
                let Some(id) = generated_entry_id(entry_map) else {
                    continue;
                };
                let Some(note) = file_notes.get(&id).and_then(Value::as_str) else {
                    continue;
                };
                entry_map.insert("UserNote".to_string(), Value::String(note.to_string()));
            }
        }
        _ => {}
    }
}

fn strip_user_notes_to_notes_file(
    relative_path: &str,
    value: &mut Value,
    generated_dir: &Path,
) -> Result<(), String> {
    if relative_path == "generated/Notes.json" {
        return Ok(());
    }

    let mut notes_root = read_generated_notes(generated_dir)?;
    let file_notes_entry = notes_root
        .entry(relative_path.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let file_notes = match file_notes_entry {
        Value::Object(map) => map,
        other => {
            *other = Value::Object(Map::new());
            other.as_object_mut().expect("notes entry reset to object")
        }
    };

    match value {
        Value::Object(root) => {
            for (id, entry) in root {
                let Value::Object(entry_map) = entry else {
                    continue;
                };
                if let Some(note) = entry_map.remove("UserNote").and_then(|value| {
                    value
                        .as_str()
                        .map(str::trim)
                        .filter(|text| !text.is_empty())
                        .map(ToOwned::to_owned)
                }) {
                    file_notes.insert(id.clone(), Value::String(note));
                } else {
                    file_notes.remove(id);
                }
            }
        }
        Value::Array(entries) => {
            for entry in entries {
                let Value::Object(entry_map) = entry else {
                    continue;
                };
                let Some(id) = generated_entry_id(entry_map) else {
                    continue;
                };
                if let Some(note) = entry_map.remove("UserNote").and_then(|value| {
                    value
                        .as_str()
                        .map(str::trim)
                        .filter(|text| !text.is_empty())
                        .map(ToOwned::to_owned)
                }) {
                    file_notes.insert(id, Value::String(note));
                } else {
                    file_notes.remove(&id);
                }
            }
        }
        _ => {}
    }

    if file_notes.is_empty() {
        notes_root.remove(relative_path);
    }
    write_json_file(&notes_file_path(generated_dir), &Value::Object(notes_root))
}

fn read_json_or_empty(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let raw =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {e}", path.display()))
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

fn combine_generic_string_tables(
    locales_dir: &Path,
    locales: &[String],
    relative_path: &str,
) -> Result<Value, String> {
    let mut combined = Map::new();
    for locale in locales {
        let path = locales_dir.join(locale).join(relative_path);
        let data = ensure_object(read_json_or_empty(&path)?);
        for (key, value) in data {
            let text = value.as_str().unwrap_or("").to_string();
            let entry = combined
                .entry(key)
                .or_insert_with(|| Value::Object(Map::new()));
            if let Value::Object(map) = entry {
                map.insert(locale.clone(), Value::String(text));
            }
        }
    }
    Ok(Value::Object(combined))
}

fn combine_virtual_file(
    locales_dir: &Path,
    locales: &[String],
    relative_path: &str,
) -> Result<Value, String> {
    if relative_path.starts_with("ui/") {
        return combine_generic_string_tables(locales_dir, locales, relative_path);
    }

    Err(format!("Unknown virtual translation file: {relative_path}"))
}

fn split_generic_string_table(
    contents: &Value,
    locales: &[String],
) -> Result<Vec<(String, Value)>, String> {
    let root = contents
        .as_object()
        .ok_or_else(|| "Expected root object".to_string())?;
    let mut outputs: Vec<(String, Value)> = locales
        .iter()
        .map(|locale| (locale.clone(), Value::Object(Map::new())))
        .collect();
    for (key, value) in root {
        let locale_map = value
            .as_object()
            .ok_or_else(|| format!("Expected locale map for key {key}"))?;
        for (locale, out) in outputs.iter_mut() {
            let text = locale_map
                .get(locale)
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if let Value::Object(map) = out {
                map.insert(key.clone(), Value::String(text));
            }
        }
    }
    Ok(outputs)
}

fn split_virtual_file(
    relative_path: &str,
    contents: &Value,
    locales: &[String],
) -> Result<Vec<(String, String, Value)>, String> {
    let split: Vec<(String, Value)> = if relative_path.starts_with("ui/") {
        split_generic_string_table(contents, locales)?
    } else {
        return Err(format!("Unknown virtual translation file: {relative_path}"));
    };
    Ok(split
        .into_iter()
        .map(|(locale, value)| (locale, relative_path.to_string(), value))
        .collect())
}

fn write_runtime_virtual_file(
    locales_dir: &Path,
    locales: &[String],
    relative_path: &str,
    contents: &str,
) -> Result<(), String> {
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

fn write_runtime_virtual_file_for_locale(
    locales_dir: &Path,
    locales: &[String],
    relative_path: &str,
    locale: &str,
    contents: &str,
) -> Result<(), String> {
    let normalized = normalize_relative_path(relative_path);

    if !locales.iter().any(|candidate| candidate == locale) {
        return Err(format!("Unsupported locale for runtime write: {locale}"));
    }

    let parsed: Value = serde_json::from_str(contents)
        .map_err(|e| format!("Failed to parse JSON for {normalized}: {e}"))?;

    let split_outputs = split_virtual_file(&normalized, &parsed, &[locale.to_string()])?;
    let Some((_, rel, value)) = split_outputs.into_iter().next() else {
        return Err(format!(
            "Failed to build locale output for {normalized} ({locale})"
        ));
    };

    let target = locales_dir.join(locale).join(&rel);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    fs::write(&target, pretty_json(&value)?)
        .map_err(|e| format!("Failed to write {}: {e}", target.display()))?;

    Ok(())
}

fn is_generic_virtual_file(relative_path: &str) -> bool {
    relative_path.starts_with("ui/")
}

fn patch_text(entry: &Map<String, Value>, key: &str) -> Option<String> {
    entry
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn apply_locale_patch_entry(
    relative_path: &str,
    root: &mut Map<String, Value>,
    id: &str,
    entry: &Map<String, Value>,
) -> Result<(), String> {
    if !is_generic_virtual_file(relative_path) {
        return Err(format!("Unknown virtual translation file: {relative_path}"));
    }

    let value = patch_text(entry, "value").unwrap_or_default();
    root.insert(id.to_string(), Value::String(value));
    Ok(())
}

fn write_runtime_locale_patch(
    locales_dir: &Path,
    locales: &[String],
    relative_path: &str,
    locale: &str,
    patch_contents: &str,
) -> Result<usize, String> {
    let normalized = normalize_relative_path(relative_path);

    if !locales.iter().any(|candidate| candidate == locale) {
        return Err(format!("Unsupported locale for runtime write: {locale}"));
    }

    let patch: Value = serde_json::from_str(patch_contents)
        .map_err(|e| format!("Failed to parse locale patch for {normalized}: {e}"))?;
    let patch_root = patch
        .as_object()
        .ok_or_else(|| "Expected locale patch root object".to_string())?;

    let target = locale_file_path(locales_dir, locale, &normalized);
    let mut current = read_json_or_empty(&target)?;
    let current_root = current
        .as_object_mut()
        .ok_or_else(|| format!("Expected root object in {}", target.display()))?;

    for (id, entry) in patch_root {
        let Some(entry) = entry.as_object() else {
            continue;
        };
        apply_locale_patch_entry(&normalized, current_root, id, entry)?;
    }

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    fs::write(&target, pretty_json(&current)?)
        .map_err(|e| format!("Failed to write {}: {e}", target.display()))?;

    Ok(patch_root.len())
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

fn generated_ui_string_source(
    app_handle: &AppHandle,
    relative_path: &str,
) -> Result<BTreeMap<String, String>, String> {
    source_ui_string_source_for_locale(app_handle, "zh-CN", relative_path)
}

fn source_ui_string_source_for_locale(
    app_handle: &AppHandle,
    locale: &str,
    relative_path: &str,
) -> Result<BTreeMap<String, String>, String> {
    let normalized = normalize_relative_path(relative_path);
    if !normalized.starts_with("ui/") {
        return Err(format!(
            "UI generator only supports ui/* paths, got {normalized}"
        ));
    }

    let source_dir = source_locales_dir(app_handle)?;
    let preferred_path = source_dir.join(locale).join(&normalized);
    let source_path = if preferred_path.exists() {
        preferred_path
    } else {
        source_dir.join("zh-CN").join(&normalized)
    };
    let raw = ensure_object(read_json_or_empty(&source_path)?);
    let mut out = BTreeMap::new();

    for (key, value) in raw {
        out.insert(key, value.as_str().unwrap_or("").to_string());
    }

    Ok(out)
}

fn merge_generated_string_locale_file(
    generated: &BTreeMap<String, String>,
    existing: Map<String, Value>,
    _locale: &str,
) -> Value {
    let mut existing = existing;
    let mut out = Map::new();

    for (id, source_value) in generated {
        let value = existing
            .remove(id)
            .and_then(|value| value.as_str().map(ToOwned::to_owned))
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| source_value.clone());
        out.insert(id.clone(), Value::String(value));
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

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslationRuntimeStatus {
    pub runtime_dir: String,
    pub runtime_exists: bool,
    pub runtime_manifest_exists: bool,
    pub source_dir: Option<String>,
    pub source_exists: bool,
    pub source_manifest_exists: bool,
    pub source_candidates: Vec<String>,
    pub source_error: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn get_translation_runtime_status(
    app_handle: tauri::AppHandle,
) -> Result<TranslationRuntimeStatus, String> {
    let runtime_dir = runtime_locales_dir(&app_handle)?;
    let runtime_manifest_path = runtime_dir.join("manifest.json");
    let source_candidates = source_locales_candidates(&app_handle)?
        .into_iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();

    let source_result = source_locales_dir(&app_handle);
    let (source_dir, source_exists, source_manifest_exists, source_error) = match source_result {
        Ok(path) => {
            let manifest_exists = path.join("manifest.json").exists();
            (
                Some(path.display().to_string()),
                path.exists(),
                manifest_exists,
                None,
            )
        }
        Err(error) => (None, false, false, Some(error)),
    };

    Ok(TranslationRuntimeStatus {
        runtime_dir: runtime_dir.display().to_string(),
        runtime_exists: runtime_dir.exists(),
        runtime_manifest_exists: runtime_manifest_path.exists(),
        source_dir,
        source_exists,
        source_manifest_exists,
        source_candidates,
        source_error,
    })
}

#[tauri::command]
#[specta::specta]
pub fn initialize_translation_runtime_files(
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let (runtime_dir, created_files, repaired_files, inserted_keys, removed_obsolete) =
        repair_runtime_locales_folder(&app_handle)?;
    let (generated_dir, created_generated_files) = ensure_runtime_generated_seeded(&app_handle)?;
    Ok(format!(
        "Initialized runtime locale files at {} (created {} files, backfilled {} files, inserted {} missing keys, removed {} obsolete files/folders); generated data at {} (created {} files)",
        runtime_dir.display(),
        created_files,
        repaired_files,
        inserted_keys,
        removed_obsolete,
        generated_dir.display(),
        created_generated_files
    ))
}

#[tauri::command]
#[specta::specta]
pub fn repair_runtime_locale_folder(app_handle: tauri::AppHandle) -> Result<String, String> {
    let (runtime_dir, created_files, repaired_files, inserted_keys, removed_obsolete) =
        repair_runtime_locales_folder(&app_handle)?;
    let (generated_dir, created_generated_files) = ensure_runtime_generated_seeded(&app_handle)?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    app_handle
        .emit(
            "translation-data-refreshed",
            serde_json::json!({
                "dir": runtime_dir,
                "createdCount": created_files,
                "repairedCount": repaired_files,
                "insertedKeyCount": inserted_keys,
                "removedObsoleteCount": removed_obsolete,
                "generatedDir": generated_dir,
                "createdGeneratedCount": created_generated_files,
                "timestamp": timestamp,
            }),
        )
        .map_err(|e| format!("Failed to emit refresh event: {e}"))?;

    Ok(format!(
        "Repaired runtime locale folder at {} (created {} files, backfilled {} files, inserted {} missing keys, removed {} obsolete files/folders); generated data at {} (created {} files)",
        runtime_dir.display(),
        created_files,
        repaired_files,
        inserted_keys,
        removed_obsolete,
        generated_dir.display(),
        created_generated_files
    ))
}

#[tauri::command]
#[specta::specta]
pub fn open_translation_data_dir(app_handle: tauri::AppHandle) -> Result<(), String> {
    let runtime_dir = runtime_locales_dir(&app_handle)?;
    fs::create_dir_all(&runtime_dir).map_err(|e| {
        format!(
            "Failed to create translation dir {}: {e}",
            runtime_dir.display()
        )
    })?;
    let _ = ensure_runtime_locales_seeded(&app_handle);
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
    let (generated_dir, _) = ensure_runtime_generated_seeded(&app_handle)?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    app_handle
        .emit(
            "translation-data-refreshed",
            serde_json::json!({
                "dir": runtime_dir,
                "generatedDir": generated_dir,
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
    let (_, _) = ensure_runtime_generated_seeded(&app_handle)?;
    let mut out = read_manifest_virtual_paths(&runtime_dir)?;
    out.extend(
        GENERATED_RUNTIME_FILES
            .iter()
            .map(|file_name| format!("generated/{file_name}")),
    );
    out.sort();
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub fn read_translation_runtime_file(
    app_handle: tauri::AppHandle,
    relative_path: String,
) -> Result<String, String> {
    if let Some(file_name) = generated_file_name(&relative_path) {
        let (generated_dir, _) = ensure_runtime_generated_seeded(&app_handle)?;
        let path = generated_dir.join(&file_name);
        let raw = fs::read_to_string(&path).map_err(|e| {
            format!(
                "Failed to read generated runtime file {}: {e}",
                path.display()
            )
        })?;
        if file_name == "Notes.json" {
            return Ok(raw);
        }
        let mut parsed: Value = serde_json::from_str(&raw).map_err(|e| {
            format!(
                "Failed to parse generated runtime file {}: {e}",
                path.display()
            )
        })?;
        let notes = read_generated_notes(&generated_dir)?;
        overlay_user_notes(&format!("generated/{file_name}"), &mut parsed, &notes);
        return pretty_json(&parsed);
    }

    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let normalized = normalize_relative_path(&relative_path);
    let combined = combine_virtual_file(&runtime_dir, &locales, &normalized)?;
    pretty_json(&combined)
}

#[tauri::command]
#[specta::specta]
pub fn write_translation_runtime_file(
    app_handle: tauri::AppHandle,
    relative_path: String,
    contents: String,
) -> Result<String, String> {
    if let Some(file_name) = generated_file_name(&relative_path) {
        let (generated_dir, _) = ensure_runtime_generated_seeded(&app_handle)?;
        let mut parsed: Value = serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse JSON for generated/{file_name}: {e}"))?;
        let normalized = format!("generated/{file_name}");
        strip_user_notes_to_notes_file(&normalized, &mut parsed, &generated_dir)?;
        let target = generated_dir.join(&file_name);
        write_json_file(&target, &parsed)?;
        let timestamp = chrono::Utc::now().to_rfc3339();
        let _ = app_handle.emit(
            "translation-data-refreshed",
            serde_json::json!({
                "generatedDir": generated_dir,
                "relativePath": normalized,
                "timestamp": timestamp,
            }),
        );
        return Ok(format!("Saved {normalized}"));
    }

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
pub fn write_translation_runtime_locale_file(
    app_handle: tauri::AppHandle,
    relative_path: String,
    locale: String,
    contents: String,
) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let normalized = normalize_relative_path(&relative_path);
    write_runtime_virtual_file_for_locale(&runtime_dir, &locales, &normalized, &locale, &contents)?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    let _ = app_handle.emit(
        "translation-data-refreshed",
        serde_json::json!({
            "dir": runtime_dir,
            "relativePath": normalized,
            "locale": locale,
            "timestamp": timestamp,
        }),
    );
    Ok(format!("Saved {normalized} ({locale})"))
}

#[tauri::command]
#[specta::specta]
pub fn write_translation_runtime_locale_patch(
    app_handle: tauri::AppHandle,
    relative_path: String,
    locale: String,
    patch_contents: String,
) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let normalized = normalize_relative_path(&relative_path);
    let patched_count = write_runtime_locale_patch(
        &runtime_dir,
        &locales,
        &normalized,
        &locale,
        &patch_contents,
    )?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    let _ = app_handle.emit(
        "translation-data-refreshed",
        serde_json::json!({
            "dir": runtime_dir,
            "relativePath": normalized,
            "locale": locale,
            "patchedCount": patched_count,
            "timestamp": timestamp,
        }),
    );
    Ok(format!(
        "Saved {patched_count} entries in {normalized} ({locale})"
    ))
}

#[tauri::command]
#[specta::specta]
pub fn generate_ui_translation_scaffold(
    app_handle: tauri::AppHandle,
    relative_path: String,
) -> Result<String, String> {
    let runtime_dir = ensure_runtime_locales_seeded(&app_handle)?;
    let locales = read_manifest_locales(&runtime_dir)?;
    let normalized = normalize_relative_path(&relative_path);
    let generated = generated_ui_string_source(&app_handle, &normalized)?;
    let entry_count = generated.len();
    generate_locale_file_for_all_locales(
        &runtime_dir,
        &locales,
        &normalized,
        |locale, existing| {
            let localized_source =
                source_ui_string_source_for_locale(&app_handle, locale, &normalized)?;
            Ok(merge_generated_string_locale_file(
                &localized_source,
                existing,
                locale,
            ))
        },
    )?;
    let _ = refresh_translation_runtime_data(app_handle.clone())?;
    Ok(format!(
        "Generated {normalized} for {} locales ({} keys)",
        locales.len(),
        entry_count
    ))
}

#[tauri::command]
#[specta::specta]
pub fn generate_all_ui_translation_scaffolds(
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
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
        generate_locale_file_for_all_locales(
            &runtime_dir,
            &locales,
            relative_path,
            |locale, existing| {
                let localized_source =
                    source_ui_string_source_for_locale(&app_handle, locale, relative_path)?;
                Ok(merge_generated_string_locale_file(
                    &localized_source,
                    existing,
                    locale,
                ))
            },
        )?;
    }

    let _ = refresh_translation_runtime_data(app_handle.clone())?;
    Ok(format!(
        "Generated {} UI files for {} locales ({} keys)",
        ui_paths.len(),
        locales.len(),
        total_keys
    ))
}
