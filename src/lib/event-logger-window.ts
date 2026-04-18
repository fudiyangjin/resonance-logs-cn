import { invoke } from "@tauri-apps/api/core";

import { SETTINGS } from "$lib/settings-store";

const EVENT_LOGGER_LABEL = "event-logger";

export async function getEventLoggerWindow(): Promise<null> {
  return null;
}

export async function setEventLoggerAlwaysOnTop(nextValue: boolean): Promise<void> {
  SETTINGS.customTriggers.state.loggerAlwaysOnTop = nextValue;
  try {
    await invoke("set_event_logger_window_always_on_top", {
      alwaysOnTop: nextValue,
    });
  } catch (error) {
    console.warn(`[${EVENT_LOGGER_LABEL}] failed to update always-on-top`, error);
  }
}

export async function showEventLoggerWindow(): Promise<void> {
  try {
    await invoke("show_event_logger_window", {
      alwaysOnTop: SETTINGS.customTriggers.state.loggerAlwaysOnTop,
    });
  } catch (error) {
    console.warn(`[${EVENT_LOGGER_LABEL}] failed to show window`, error);
  }
}

export async function hideEventLoggerWindow(): Promise<void> {
  try {
    await invoke("hide_event_logger_window");
  } catch (error) {
    console.warn(`[${EVENT_LOGGER_LABEL}] failed to hide window`, error);
  }
}

export async function toggleEventLoggerWindow(): Promise<void> {
  try {
    await invoke("toggle_event_logger_window", {
      alwaysOnTop: SETTINGS.customTriggers.state.loggerAlwaysOnTop,
    });
  } catch (error) {
    console.warn(`[${EVENT_LOGGER_LABEL}] failed to toggle window`, error);
  }
}
