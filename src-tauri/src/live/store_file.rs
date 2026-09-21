//! Shared persistence helpers for the small JSON "store" files the runtime
//! reads at startup and the frontend rewrites on every settings change
//! (`monitorRuntime.json`, `voiceRuntime.json`, ...).

use std::path::{Path, PathBuf};

use log::warn;
use serde::Serialize;
use serde::de::DeserializeOwned;
use tauri::{AppHandle, Manager};

/// Directories a store file may live in, most preferred first. Older
/// installs wrote directly into the data dir instead of `stores/`.
fn store_dir_candidates(app_handle: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::with_capacity(4);
    if let Ok(dir) = app_handle.path().app_data_dir() {
        candidates.push(dir.join("stores"));
        candidates.push(dir);
    }
    if let Ok(dir) = app_handle.path().app_local_data_dir() {
        candidates.push(dir.join("stores"));
        candidates.push(dir);
    }
    candidates
}

pub(crate) fn store_file_candidates(app_handle: &AppHandle, file_name: &str) -> Vec<PathBuf> {
    store_dir_candidates(app_handle)
        .into_iter()
        .map(|dir| dir.join(file_name))
        .collect()
}

/// Directories new store files are written to (`<data dir>/stores`).
fn store_write_dirs(app_handle: &AppHandle) -> Vec<PathBuf> {
    [
        app_handle.path().app_data_dir(),
        app_handle.path().app_local_data_dir(),
    ]
    .into_iter()
    .flatten()
    .map(|dir| dir.join("stores"))
    .collect()
}

/// Writes to a sibling temp file and renames it over the target, so a
/// reader can only ever observe the complete previous or complete next
/// version — never the half-written file a plain truncate-then-write leaves
/// behind while the updater check or the next launch is reading it.
///
/// `std::fs::rename` maps to `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` on
/// Windows and to `rename(2)` (already atomic) on POSIX, so a plain rename is
/// sufficient here. The temp file is created in the destination directory
/// because a rename is only atomic within one volume.
pub(crate) fn write_file_atomically(
    target_dir: &Path,
    path: &Path,
    bytes: &[u8],
) -> std::io::Result<()> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("store");
    let temporary = target_dir.join(format!("{file_name}.tmp.{}", std::process::id()));
    if let Err(error) = std::fs::write(&temporary, bytes) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    if let Err(error) = std::fs::rename(&temporary, path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    Ok(())
}

/// Serializes `value` as pretty JSON into the first writable `stores/`
/// directory and returns the path written.
pub(crate) fn save_store_json<T: Serialize>(
    app_handle: &AppHandle,
    file_name: &str,
    value: &T,
) -> Result<PathBuf, String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    let mut last_err = None;
    for target_dir in store_write_dirs(app_handle) {
        if let Err(error) = std::fs::create_dir_all(&target_dir) {
            last_err = Some(format!(
                "create_dir_all {}: {}",
                target_dir.display(),
                error
            ));
            continue;
        }
        let path = target_dir.join(file_name);
        match write_file_atomically(&target_dir, &path, &bytes) {
            Ok(()) => return Ok(path),
            Err(error) => last_err = Some(format!("write {}: {}", path.display(), error)),
        }
    }
    Err(last_err.unwrap_or_else(|| format!("no writable location for {file_name}")))
}

/// Loads the first candidate that exists and parses. Unreadable or corrupt
/// files are logged and skipped so a bad copy in one location cannot mask a
/// good one in another.
pub(crate) fn load_store_json<T: DeserializeOwned>(
    app_handle: &AppHandle,
    file_name: &str,
) -> Option<(PathBuf, T)> {
    for path in store_file_candidates(app_handle, file_name) {
        if !path.exists() {
            continue;
        }
        let file = match std::fs::File::open(&path) {
            Ok(file) => file,
            Err(error) => {
                warn!(target: "app::startup", "failed to open {}: {}", path.display(), error);
                continue;
            }
        };
        match serde_json::from_reader::<_, T>(file) {
            Ok(value) => return Some((path, value)),
            Err(error) => {
                warn!(target: "app::startup", "failed to parse {}: {}", path.display(), error);
            }
        }
    }
    None
}
