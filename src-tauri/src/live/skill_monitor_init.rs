use crate::live::state::AppStateManager;
use log::{info, warn};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager as _};

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SkillMonitorSettings {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    active_profile_index: usize,
    #[serde(default)]
    profiles: Vec<SkillMonitorProfile>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SkillMonitorProfile {
    #[serde(default)]
    selected_class: String,
    #[serde(default)]
    monitored_skill_ids: Vec<i32>,
    #[serde(default)]
    monitored_buff_ids: Vec<i32>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClassSkillConfig {
    #[serde(default)]
    default_monitored_buff_ids: Vec<i32>,
}

fn get_skill_monitor_settings_path(app: &AppHandle) -> Option<PathBuf> {
    let app_config_dir = app.path().app_config_dir().ok()?;
    Some(
        app_config_dir
            .join("tauri-plugin-svelte")
            .join("skillMonitor.json"),
    )
}

fn read_skill_monitor_settings(path: PathBuf) -> Option<SkillMonitorSettings> {
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn class_skill_configs() -> &'static HashMap<String, ClassSkillConfig> {
    static CACHE: OnceLock<HashMap<String, ClassSkillConfig>> = OnceLock::new();
    CACHE.get_or_init(|| {
        let raw = include_str!("../../../src/lib/config/class_skill_configs.json");
        serde_json::from_str(raw).unwrap_or_default()
    })
}

fn get_default_monitored_buff_ids(class_key: &str) -> Vec<i32> {
    class_skill_configs()
        .get(class_key)
        .map(|cfg| cfg.default_monitored_buff_ids.clone())
        .unwrap_or_default()
}

fn merge_buff_ids(user_ids: &[i32], default_ids: &[i32]) -> Vec<i32> {
    let mut merged = Vec::with_capacity(user_ids.len() + default_ids.len());
    let mut seen = HashSet::new();

    for id in user_ids {
        if seen.insert(*id) {
            merged.push(*id);
        }
    }

    for id in default_ids {
        if seen.insert(*id) {
            merged.push(*id);
        }
    }

    merged
}

fn resolve_active_profile(settings: &SkillMonitorSettings) -> Option<&SkillMonitorProfile> {
    if settings.profiles.is_empty() {
        return None;
    }
    let idx = settings
        .active_profile_index
        .min(settings.profiles.len().saturating_sub(1));
    settings.profiles.get(idx)
}

pub fn init_skill_monitor_from_settings(app: &AppHandle, state_manager: &AppStateManager) {
    let Some(path) = get_skill_monitor_settings_path(app) else {
        warn!("[skill-monitor] failed to resolve skillMonitor.json path");
        return;
    };

    let Some(settings) = read_skill_monitor_settings(path.clone()) else {
        info!(
            "[skill-monitor] skillMonitor settings not found or invalid at {}",
            path.display()
        );
        return;
    };

    if !settings.enabled {
        info!("[skill-monitor] startup init skipped (disabled)");
        return;
    }

    let Some(profile) = resolve_active_profile(&settings) else {
        info!("[skill-monitor] startup init skipped (no profiles)");
        return;
    };

    let class_key = if profile.selected_class.trim().is_empty() {
        "wind_knight"
    } else {
        profile.selected_class.as_str()
    };
    let default_buff_ids = get_default_monitored_buff_ids(class_key);
    let merged_buff_ids = merge_buff_ids(&profile.monitored_buff_ids, &default_buff_ids);
    let monitored_skill_ids = profile.monitored_skill_ids.clone();
    let skills_count = monitored_skill_ids.len();
    let buffs_count = merged_buff_ids.len();

    let _ = tauri::async_runtime::block_on(
        state_manager.apply_skill_monitor_startup(monitored_skill_ids, merged_buff_ids),
    );

    info!(
        "[skill-monitor] startup init applied: class={}, skills={}, buffs={}",
        class_key,
        skills_count,
        buffs_count
    );
}
