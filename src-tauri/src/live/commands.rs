use crate::WINDOW_LIVE_LABEL;
use crate::live::dungeon_log;
use crate::live::state::{AppStateManager, LiveStateSnapshot, StateEvent};
use log::info;
use tauri::Manager;
use window_vibrancy::{apply_blur, clear_blur};
// request_restart is not needed in this module at present
use crate::live::event_manager; // for generate_skills_window_*

fn skills_window_from_snapshot(
    snapshot: &LiveStateSnapshot,
    uid: i64,
    skill_type: &str,
) -> Result<crate::live::commands_models::SkillsWindow, String> {
    let empty_cache = std::collections::HashMap::new();
    match skill_type {
        "dps" => event_manager::generate_skills_window_dps(
            &snapshot.encounter,
            &empty_cache,
            uid,
            snapshot.boss_only_dps,
            snapshot.active_segment_elapsed_ms,
        )
        .ok_or_else(|| format!("No DPS skills found for player {}", uid)),
        "heal" => event_manager::generate_skills_window_heal(
            &snapshot.encounter,
            &empty_cache,
            uid,
            snapshot.active_segment_elapsed_ms,
        )
        .ok_or_else(|| format!("No heal skills found for player {}", uid)),
        "tanked" => event_manager::generate_skills_window_tanked(
            &snapshot.encounter,
            &empty_cache,
            uid,
            snapshot.active_segment_elapsed_ms,
        )
        .ok_or_else(|| format!("No tanked skills found for player {}", uid)),
        _ => Err(format!("Invalid skill type: {}", skill_type)),
    }
}

/// Subscribes to a player's skills.
///
/// # Arguments
///
/// * `uid` - The UID of the player.
/// * `skill_type` - The type of skill to subscribe to.
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<crate::live::commands_models::SkillsWindow, String>` - The skills window.
#[tauri::command]
#[specta::specta]
pub async fn subscribe_player_skills(
    uid: i64,
    skill_type: String,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<crate::live::commands_models::SkillsWindow, String> {
    // Register subscription
    state_manager
        .subscribe_player_skill(uid, skill_type.clone())
        .await?;

    let snapshot = state_manager.latest_snapshot();
    skills_window_from_snapshot(&snapshot, uid, &skill_type)
}

/// Unsubscribes from a player's skills.
///
/// # Arguments
///
/// * `uid` - The UID of the player.
/// * `skill_type` - The type of skill to unsubscribe from.
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
pub async fn unsubscribe_player_skills(
    uid: i64,
    skill_type: String,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    state_manager
        .unsubscribe_player_skill(uid, skill_type)
        .await?;
    Ok(())
}

/// Gets a player's skills.
///
/// # Arguments
///
/// * `uid` - The UID of the player.
/// * `skill_type` - The type of skill to get.
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<crate::live::commands_models::SkillsWindow, String>` - The skills window.
#[tauri::command]
#[specta::specta]
pub async fn get_player_skills(
    uid: i64,
    skill_type: String,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<crate::live::commands_models::SkillsWindow, String> {
    let snapshot = state_manager.latest_snapshot();
    skills_window_from_snapshot(&snapshot, uid, &skill_type)
}

/// Sets whether to only show boss DPS.
///
/// # Arguments
///
/// * `enabled` - Whether to enable boss-only DPS.
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
pub async fn set_boss_only_dps(
    enabled: bool,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    state_manager.set_boss_only_dps(enabled).await?;
    Ok(())
}

/// Enables or disables dungeon segment tracking.
#[tauri::command]
#[specta::specta]
pub async fn set_dungeon_segments_enabled(
    enabled: bool,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    state_manager.set_dungeon_segments_enabled(enabled).await?;
    Ok(())
}

/// Returns the current dungeon log snapshot for the frontend.
#[tauri::command]
#[specta::specta]
pub async fn get_dungeon_log(
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<dungeon_log::DungeonLog, String> {
    state_manager
        .latest_snapshot()
        .dungeon_log
        .clone()
        .ok_or_else(|| "Failed to read dungeon log state".to_string())
}

/// Enables blur on the live meter window.
///
/// # Arguments
///
/// * `app` - A handle to the Tauri application instance.
#[tauri::command]
#[specta::specta]
pub fn enable_blur(app: tauri::AppHandle) {
    if let Some(meter_window) = app.get_webview_window(WINDOW_LIVE_LABEL) {
        apply_blur(&meter_window, Some((10, 10, 10, 50))).ok();
    }
}

/// Disables blur on the live meter window.
///
/// # Arguments
///
/// * `app` - A handle to the Tauri application instance.
#[tauri::command]
#[specta::specta]
pub fn disable_blur(app: tauri::AppHandle) {
    if let Some(meter_window) = app.get_webview_window(WINDOW_LIVE_LABEL) {
        clear_blur(&meter_window).ok();
    }
}

// #[tauri::command]
// #[specta::specta]
// pub fn get_header_info(state: tauri::State<'_, EncounterMutex>) -> Result<HeaderInfo, String> {
//     let encounter = state.lock().unwrap();

//     if encounter.total_dmg == 0 {
//         return Err("No damage found".to_string());
//     }

//     let time_elapsed_ms = encounter
//         .time_last_combat_packet_ms
//         .saturating_sub(encounter.time_fight_start_ms);
//     #[allow(clippy::cast_precision_loss)]
//     let time_elapsed_secs = time_elapsed_ms as f64 / 1000.0;

//     #[allow(clippy::cast_precision_loss)]
//     Ok(HeaderInfo {
//         total_dps: nan_is_zero(encounter.total_dmg as f64 / time_elapsed_secs),
//         total_dmg: encounter.total_dmg,
//         elapsed_ms: time_elapsed_ms,
//     })
// }

// #[tauri::command]
// #[specta::specta]
// pub fn hard_reset(state: tauri::State<'_, EncounterMutex>) {
//     let mut encounter = state.lock().unwrap();
//     encounter.clone_from(&Encounter::default());
//     request_restart();
//     info!("Hard Reset");
// }

/// Resets the encounter.
///
/// # Arguments
///
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
pub async fn reset_encounter(
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    state_manager
        .inner()
        .send_state_event(StateEvent::ResetEncounter { is_manual: true })
        .await?;
    info!("encounter reset via command");
    Ok(())
}

/// Toggles pausing the encounter.
///
/// # Arguments
///
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
pub async fn toggle_pause_encounter(
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    let state_manager = state_manager.inner().clone();
    tauri::async_runtime::spawn(async move {
        let is_paused = state_manager.latest_snapshot().encounter.is_encounter_paused;
        let _ = state_manager
            .send_state_event(StateEvent::PauseEncounter(!is_paused))
            .await;
    });
    Ok(())
}

/// Resets player metrics for the live meter without ending the encounter.
/// This is used for segment transitions to clear UI data.
///
/// # Arguments
///
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
pub async fn reset_player_metrics(
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    state_manager
        .reset_player_metrics_for_segment()
        .await?;
    info!("Player metrics reset for segment transition");
    Ok(())
}

/// Sets the event update rate in milliseconds.
///
/// # Arguments
///
/// * `rate_ms` - The update rate in milliseconds (clamped to 50-2000ms range).
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
pub async fn set_event_update_rate_ms(
    rate_ms: u64,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    // Clamp to reasonable range: 50ms to 2000ms
    let clamped = rate_ms.clamp(50, 2000);
    state_manager.set_event_update_rate_ms(clamped).await?;
    info!("Event update rate set to: {}ms", clamped);
    Ok(())
}

/// Sets the monitored buff list for buff updates.
#[tauri::command]
#[specta::specta]
pub async fn set_monitored_buffs(
    buff_base_ids: Vec<i32>,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    info!("[buff] set monitored buffs: {:?}", buff_base_ids);
    state_manager.set_monitored_buffs(buff_base_ids).await?;
    Ok(())
}

/// Returns all buffs that have a sprite image available.
#[tauri::command]
#[specta::specta]
pub async fn get_available_buffs(
    _state_manager: tauri::State<'_, AppStateManager>,
) -> Result<Vec<crate::live::commands_models::BuffDefinition>, String> {
    use crate::live::buff_names;
    use crate::live::commands_models::BuffDefinition;

    let buffs = buff_names::get_buffs_with_sprites()
        .into_iter()
        .map(|entry| {
            let mut search_keywords = vec![entry.name.clone()];
            if let Some(talent_name) = entry.talent_name.clone() {
                if !talent_name.is_empty() {
                    search_keywords.push(talent_name);
                }
            }
            BuffDefinition {
                base_id: entry.base_id,
                name: entry.name,
                sprite_file: entry.sprite_file,
                talent_name: entry.talent_name,
                talent_sprite_file: entry.talent_sprite_file,
                search_keywords,
            }
        })
        .collect();
    Ok(buffs)
}

/// Returns display names for requested buff ids, including buffs without sprite images.
#[tauri::command]
#[specta::specta]
pub async fn get_buff_names(
    base_ids: Vec<i32>,
    _state_manager: tauri::State<'_, AppStateManager>,
) -> Result<Vec<crate::live::commands_models::BuffNameInfo>, String> {
    use crate::live::buff_names;
    use crate::live::commands_models::BuffNameInfo;
    use std::collections::BTreeSet;

    let mut uniq_ids = BTreeSet::new();
    for id in base_ids {
        uniq_ids.insert(id);
    }

    let mut result = Vec::new();
    for id in uniq_ids {
        let name = buff_names::lookup_name(id).unwrap_or_else(|| format!("#{id}"));
        let has_sprite_file = buff_names::lookup_sprite(id).is_some();
        result.push(BuffNameInfo {
            base_id: id,
            name,
            has_sprite_file,
        });
    }

    Ok(result)
}

/// Searches buffs by name and returns matching entries, including no-icon buffs.
#[tauri::command]
#[specta::specta]
pub async fn search_buffs_by_name(
    keyword: String,
    limit: Option<usize>,
    _state_manager: tauri::State<'_, AppStateManager>,
) -> Result<Vec<crate::live::commands_models::BuffNameInfo>, String> {
    use crate::live::buff_names;
    use crate::live::commands_models::BuffNameInfo;

    let trimmed = keyword.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let max_limit = limit.unwrap_or(80).clamp(1, 300);
    let result = buff_names::search_buffs_by_name(trimmed, max_limit)
        .into_iter()
        .map(|(base_id, entry)| BuffNameInfo {
            base_id,
            name: entry.name,
            has_sprite_file: entry.sprite_file.is_some(),
        })
        .collect();
    Ok(result)
}

/// Sets the monitored skill list for skill CD updates.
#[tauri::command]
#[specta::specta]
pub async fn set_monitored_skills(
    skill_level_ids: Vec<i32>,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    if skill_level_ids.len() > 10 {
        return Err("最多监控10个技能".to_string());
    }

    info!("[skill-cd] set monitored skills: {:?}", skill_level_ids);

    state_manager.set_monitored_skills(skill_level_ids).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_monitor_all_buff(
    monitor_all_buff: bool,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    info!("[monitor-buff] set monitorAllBuff: {:?}", monitor_all_buff);
    state_manager.set_monitor_all_buff(monitor_all_buff).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_buff_priority(
    priority_buff_ids: Vec<i32>,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    info!("[monitor-buff] set buff priority: {:?}", priority_buff_ids);
    state_manager.set_buff_priority(priority_buff_ids).await?;
    Ok(())
}
