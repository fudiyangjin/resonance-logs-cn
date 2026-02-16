use crate::WINDOW_LIVE_LABEL;
use crate::database::{DbTask, enqueue, now_ms};
use crate::live::commands_models::SkillCdState;
use crate::live::dungeon_log::{self, DungeonLogRuntime};
use crate::live::state::{AppStateManager, StateEvent};
use log::{info, trace, warn};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use window_vibrancy::{apply_blur, clear_blur};
// request_restart is not needed in this module at present
use crate::live::event_manager; // for generate_skills_window_*

fn safe_emit<S: Serialize + Clone>(app_handle: &AppHandle, event: &str, payload: S) -> bool {
    // First check if the live window exists and is valid
    let live_window = app_handle.get_webview_window(crate::WINDOW_LIVE_LABEL);
    let main_window = app_handle.get_webview_window(crate::WINDOW_MAIN_LABEL);

    // If no windows are available, skip emitting
    if live_window.is_none() && main_window.is_none() {
        trace!("Skipping emit for '{}': no windows available", event);
        return false;
    }

    match app_handle.emit(event, payload) {
        Ok(_) => true,
        Err(e) => {
            let error_str = format!("{:?}", e);
            if error_str.contains("0x8007139F") || error_str.contains("not in the correct state") {
                // Expected when windows are minimized/hidden - don't spam logs
                trace!(
                    "WebView2 not ready for '{}' (window may be minimized/hidden)",
                    event
                );
            } else {
                warn!("Failed to emit '{}': {}", event, e);
            }
            false
        }
    }
}

/// Prettifies a player's name.
///
/// # Arguments
///
/// * `player_uid` - The UID of the player.
/// * `local_player_uid` - The UID of the local player.
/// * `player_name` - The name of the player.
///
/// # Returns
///
/// * `String` - The prettified name.
#[allow(dead_code)]
fn prettify_name(player_uid: i64, local_player_uid: i64, player_name: &String) -> String {
    // If entity name is empty, try to get it from the database
    let effective_name = if player_name.is_empty() {
        crate::live::player_names::PlayerNames::get_name_by_uid(player_uid)
            .unwrap_or_else(|| String::new())
    } else {
        player_name.clone()
    };

    if player_uid == local_player_uid && effective_name.is_empty() {
        String::from("You")
    } else if player_uid == local_player_uid && !effective_name.is_empty() {
        format!("{effective_name} (You)")
    } else if effective_name.is_empty() {
        format!("#{player_uid}")
    } else {
        effective_name
    }
}

/// Returns 0.0 if the value is NaN or infinite.
///
/// # Arguments
///
/// * `value` - The value to check.
///
/// # Returns
///
/// * `f64` - 0.0 if the value is NaN or infinite, otherwise the value.
#[allow(dead_code)]
fn nan_is_zero(value: f64) -> f64 {
    if value.is_nan() || value.is_infinite() {
        0.0
    } else {
        value
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
        .update_skill_subscriptions(|subs| {
            subs.insert((uid, skill_type.clone()));
        })
        .await;

    // Compute and return initial window directly from Encounter
    state_manager
        .with_state(|state| {
            let boss_only = state.boss_only_dps;
            let segment_elapsed_ms = if state.dungeon_segments_enabled {
                dungeon_log::snapshot(&state.dungeon_log).and_then(|log| {
                    log.segments
                        .iter()
                        .rev()
                        .find(|s| s.ended_at_ms.is_none())
                        .map(|segment| {
                            let start_ms = segment.started_at_ms.max(0) as u128;
                            let end_ms = segment
                                .ended_at_ms
                                .map(|t| t.max(0) as u128)
                                .unwrap_or(state.encounter.time_last_combat_packet_ms);
                            end_ms.saturating_sub(start_ms)
                        })
                })
            } else {
                None
            };

            match skill_type.as_str() {
                "dps" => event_manager::generate_skills_window_dps(
                    &state.encounter,
                    uid,
                    boss_only,
                    segment_elapsed_ms,
                )
                .ok_or_else(|| format!("No DPS skills found for player {}", uid)),
                "heal" => event_manager::generate_skills_window_heal(
                    &state.encounter,
                    uid,
                    segment_elapsed_ms,
                )
                .ok_or_else(|| format!("No heal skills found for player {}", uid)),
                "tanked" => event_manager::generate_skills_window_tanked(
                    &state.encounter,
                    uid,
                    segment_elapsed_ms,
                )
                .ok_or_else(|| format!("No tanked skills found for player {}", uid)),
                _ => Err(format!("Invalid skill type: {}", skill_type)),
            }
        })
        .await
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
        .update_skill_subscriptions(|subs| {
            subs.remove(&(uid, skill_type));
        })
        .await;
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
    state_manager
        .with_state(|state| {
            let boss_only = state.boss_only_dps;
            let segment_elapsed_ms = if state.dungeon_segments_enabled {
                dungeon_log::snapshot(&state.dungeon_log).and_then(|log| {
                    log.segments
                        .iter()
                        .rev()
                        .find(|s| s.ended_at_ms.is_none())
                        .map(|segment| {
                            let start_ms = segment.started_at_ms.max(0) as u128;
                            let end_ms = segment
                                .ended_at_ms
                                .map(|t| t.max(0) as u128)
                                .unwrap_or(state.encounter.time_last_combat_packet_ms);
                            end_ms.saturating_sub(start_ms)
                        })
                })
            } else {
                None
            };
            match skill_type.as_str() {
                "dps" => event_manager::generate_skills_window_dps(
                    &state.encounter,
                    uid,
                    boss_only,
                    segment_elapsed_ms,
                )
                .ok_or_else(|| format!("No DPS skills found for player {}", uid)),
                "heal" => event_manager::generate_skills_window_heal(
                    &state.encounter,
                    uid,
                    segment_elapsed_ms,
                )
                .ok_or_else(|| format!("No heal skills found for player {}", uid)),
                "tanked" => event_manager::generate_skills_window_tanked(
                    &state.encounter,
                    uid,
                    segment_elapsed_ms,
                )
                .ok_or_else(|| format!("No tanked skills found for player {}", uid)),
                _ => Err(format!("Invalid skill type: {}", skill_type)),
            }
        })
        .await
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
    state_manager
        .with_state_mut(|state| {
            state.boss_only_dps = enabled;
        })
        .await;
    // Recompute and emit updates immediately
    state_manager.update_and_emit_events().await;
    Ok(())
}

/// Enables or disables dungeon segment tracking.
#[tauri::command]
#[specta::specta]
pub async fn set_dungeon_segments_enabled(
    enabled: bool,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    let runtime = state_manager
        .with_state_mut(|state| {
            state.dungeon_segments_enabled = enabled;
            DungeonLogRuntime::new(state.dungeon_log.clone(), state.app_handle.clone())
        })
        .await;

    let snapshot = runtime.snapshot();
    dungeon_log::emit_if_changed(&runtime.app_handle, snapshot);
    Ok(())
}

/// Returns the current dungeon log snapshot for the frontend.
#[tauri::command]
#[specta::specta]
pub async fn get_dungeon_log(
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<dungeon_log::DungeonLog, String> {
    let shared_log = state_manager
        .with_state(|state| state.dungeon_log.clone())
        .await;

    dungeon_log::snapshot(&shared_log).ok_or_else(|| "Failed to read dungeon log state".to_string())
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

/// Copies the sync container data to the clipboard.
///
/// # Arguments
///
/// * `app` - A handle to the Tauri application instance.
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn copy_sync_container_data(
    app: tauri::AppHandle,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    let encounter = state_manager.get_encounter().await;
    let json = serde_json::to_string_pretty(&encounter.local_player)
        .map_err(|e| format!("Failed to serialize data: {}", e))?;
    app.clipboard()
        .write_text(json)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))?;
    Ok(())
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
    let state_manager = state_manager.inner().clone();

    // Perform the reset under the lock, but collect payloads to emit afterward.
    let (app_handle_opt, should_emit, was_paused, cleared_header) = state_manager
        .with_state_mut(|state| {
            // legacy code, kept for maybe future use
            if state.dungeon_segments_enabled {
                dungeon_log::persist_segments(&state.dungeon_log, true);
            }

            // End any active encounter in DB. Drain any detected dead boss names for persistence.
            let defeated = state.event_manager.take_dead_bosses();
            let encounter_data = state.last_encounter_snapshot.take();

            enqueue(DbTask::EndEncounter {
                ended_at_ms: now_ms(),
                defeated_bosses: if defeated.is_empty() {
                    None
                } else {
                    Some(defeated)
                },
                is_manually_reset: true,
                encounter_data,
            });

            // Reset live combat state
            state.encounter.reset_combat_state();
            state.last_encounter_snapshot = None;
            state.skill_subscriptions.clear();
            state.low_hp_bosses.clear();

            let should_emit = state.event_manager.should_emit_events();
            let app_handle_opt = state.event_manager.get_app_handle();
            let was_paused = state.encounter.is_encounter_paused;

            let cleared_header = crate::live::commands_models::HeaderInfo {
                total_dps: 0.0,
                total_dmg: 0,
                elapsed_ms: 0,
                fight_start_timestamp_ms: 0,
                bosses: vec![],
                scene_id: state.encounter.current_scene_id,
                scene_name: state.encounter.current_scene_name.clone(),
                current_segment_type: None,
                current_segment_name: None,
            };

            (app_handle_opt, should_emit, was_paused, cleared_header)
        })
        .await;

    // Emit events after the lock is released.
    if should_emit {
        if let Some(app_handle) = app_handle_opt {
            let _ = safe_emit(&app_handle, "reset-encounter", "");
            let payload = crate::live::event_manager::EncounterUpdatePayload {
                header_info: cleared_header,
                is_paused: was_paused,
            };
            let _ = safe_emit(&app_handle, "encounter-update", payload);
        }
    }

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
        // Read current paused state and delegate to centralized handler which
        // will update the state and emit events as appropriate.
        let is_paused = state_manager
            .with_state(|state| state.encounter.is_encounter_paused)
            .await;
        state_manager
            .handle_event(StateEvent::PauseEncounter(!is_paused))
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
    // no emitting events while holding the AppState write lock.
    let state_manager = state_manager.inner().clone();

    let (app_handle_opt, should_emit, active_segment_name, cleared_header, is_paused) =
        state_manager
            .with_state_mut(|state| {
                // Store the original fight start time before reset
                let original_fight_start_ms = state.encounter.time_fight_start_ms;

                // more segments legacy code
                let active_segment_name =
                    dungeon_log::snapshot(&state.dungeon_log).and_then(|log| {
                        log.segments
                            .iter()
                            .rev()
                            .find(|s| s.ended_at_ms.is_none())
                            .and_then(|s| s.boss_name.clone())
                    });

                // Reset combat state (player metrics only)
                state.encounter.reset_combat_state();
                state.skill_subscriptions.clear();

                // Restore the original fight start time to preserve total encounter duration
                state.encounter.time_fight_start_ms = original_fight_start_ms;

                let should_emit = state.event_manager.should_emit_events();
                let app_handle_opt = state.event_manager.get_app_handle();
                let is_paused = state.encounter.is_encounter_paused;

                // Emit an encounter update with cleared player data but preserve encounter context
                let cleared_header = crate::live::commands_models::HeaderInfo {
                    total_dps: 0.0,
                    total_dmg: 0,
                    elapsed_ms: 0,
                    fight_start_timestamp_ms: state.encounter.time_fight_start_ms,
                    bosses: vec![],
                    scene_id: state.encounter.current_scene_id,
                    scene_name: state.encounter.current_scene_name.clone(),
                    current_segment_type: None,
                    current_segment_name: None,
                };

                (
                    app_handle_opt,
                    should_emit,
                    active_segment_name,
                    cleared_header,
                    is_paused,
                )
            })
            .await;

    if should_emit {
        if let Some(app_handle) = app_handle_opt {
            let payload = crate::live::event_manager::PlayerMetricsResetPayload {
                segment_name: active_segment_name,
            };
            let _ = safe_emit(&app_handle, "reset-player-metrics", payload);

            let payload = crate::live::event_manager::EncounterUpdatePayload {
                header_info: cleared_header,
                is_paused,
            };
            let _ = safe_emit(&app_handle, "encounter-update", payload);
        }
    }

    info!("Player metrics reset for segment transition");
    Ok(())
}

/// Sets whether wipe detection is enabled.
///
/// # Arguments
///
/// * `enabled` - Whether to enable wipe detection.
/// * `state_manager` - The state manager.
///
/// # Returns
///
/// * `Result<(), String>` - An empty result.
#[tauri::command]
#[specta::specta]
pub async fn set_wipe_detection_enabled(
    enabled: bool,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    state_manager
        .with_state_mut(|state| {
            state.attempt_config.enable_wipe_detection = enabled;
        })
        .await;
    info!("Wipe detection enabled: {}", enabled);
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
    state_manager
        .with_state_mut(|state| {
            state.event_update_rate_ms = clamped;
        })
        .await;
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
    state_manager
        .with_state_mut(|state| {
            state.monitored_buff_ids = buff_base_ids;
        })
        .await;
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

    state_manager
        .with_state_mut(|state| {
            state.monitored_skill_ids = skill_level_ids;
            state.skill_cd_map.retain(|skill_level_id, _| {
                state.monitored_skill_ids.contains(&(skill_level_id / 100))
            });
        })
        .await;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_monitor_all_buff(
    monitor_all_buff: bool,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    info!("[monitor-buff] set monitorAllBuff: {:?}", monitor_all_buff);
    state_manager
        .with_state_mut(|state| {
            state.monitor_all_buff = monitor_all_buff;
        })
        .await;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_buff_priority(
    priority_buff_ids: Vec<i32>,
    state_manager: tauri::State<'_, AppStateManager>,
) -> Result<(), String> {
    info!("[monitor-buff] set buff priority: {:?}", priority_buff_ids);
    state_manager
        .with_state_mut(|state| {
            state.priority_buff_ids = priority_buff_ids;
            state.buff_order_dirty = true;
        })
        .await;
    Ok(())
}
