import { commands } from "$lib/bindings";
import { toggleEventLoggerWindow } from "$lib/event-logger-window";
import {
  fireCustomTrigger,
  resetAllCustomTriggerRuntimeState,
  resetCustomTrigger,
  resetCustomTriggerGroup,
  stopCustomTrigger,
} from "$lib/custom-trigger-runtime.svelte";
import { SETTINGS } from "$lib/settings-store";
import { setClickthrough, toggleClickthrough } from "$lib/utils.svelte";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { register, unregister, unregisterAll } from "@tauri-apps/plugin-global-shortcut";

export type ShortcutOwner = {
  section: "general" | "customTriggers";
  id: string;
  shortcut: string;
  labelKey: string;
  fallbackLabel: string;
};

export const GENERAL_SHORTCUTS = [
  { id: "showLiveMeter", labelKey: "shortcuts.showLiveMeter", fallbackLabel: "Show live meter" },
  { id: "hideLiveMeter", labelKey: "shortcuts.hideLiveMeter", fallbackLabel: "Hide live meter" },
  { id: "toggleLiveMeter", labelKey: "shortcuts.toggleLiveMeter", fallbackLabel: "Toggle live meter" },
  { id: "enableClickthrough", labelKey: "shortcuts.enableClickthrough", fallbackLabel: "Enable clickthrough" },
  { id: "disableClickthrough", labelKey: "shortcuts.disableClickthrough", fallbackLabel: "Disable clickthrough" },
  { id: "toggleClickthrough", labelKey: "shortcuts.toggleClickthrough", fallbackLabel: "Toggle clickthrough" },
  { id: "resetEncounter", labelKey: "shortcuts.resetEncounter", fallbackLabel: "Reset encounter" },
  { id: "togglePauseEncounter", labelKey: "shortcuts.togglePauseEncounter", fallbackLabel: "Toggle pause encounter" },
  { id: "toggleBossHp", labelKey: "shortcuts.toggleBossHp", fallbackLabel: "Toggle boss HP display" },
  { id: "toggleOverlayEdit", labelKey: "shortcuts.toggleOverlayEdit", fallbackLabel: "Toggle overlay edit mode" },
  { id: "toggleOverlayWindow", labelKey: "shortcuts.toggleOverlayWindow", fallbackLabel: "Toggle overlay window" },
  { id: "toggleEventLogger", labelKey: "shortcuts.toggleEventLogger", fallbackLabel: "Toggle event logger" },
] as const;

export const CUSTOM_TRIGGER_SHORTCUTS = [
  { id: "fireSelectedTrigger", labelKey: "hotkeys.shortcuts.fireSelectedTrigger", fallbackLabel: "Fire selected trigger" },
  { id: "stopSelectedTrigger", labelKey: "hotkeys.shortcuts.stopSelectedTrigger", fallbackLabel: "Stop selected trigger" },
  { id: "resetSelectedTrigger", labelKey: "hotkeys.shortcuts.resetSelectedTrigger", fallbackLabel: "Reset selected trigger" },
  { id: "clearSelectedGroup", labelKey: "hotkeys.shortcuts.clearSelectedGroup", fallbackLabel: "Clear selected group" },
  { id: "resetAllRuntimeState", labelKey: "hotkeys.shortcuts.resetAllRuntimeState", fallbackLabel: "Reset all runtime state" },
] as const;

export function normalizeShortcut(shortcutKey: string): string {
  return shortcutKey
    .trim()
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("+");
}

export function getAllAssignedShortcuts(): ShortcutOwner[] {
  const general = GENERAL_SHORTCUTS.flatMap((shortcut) => {
    const value = SETTINGS.shortcuts.state[shortcut.id as keyof typeof SETTINGS.shortcuts.state];
    return value
      ? [{ section: "general" as const, id: shortcut.id, shortcut: value, labelKey: shortcut.labelKey, fallbackLabel: shortcut.fallbackLabel }]
      : [];
  });

  const custom = CUSTOM_TRIGGER_SHORTCUTS.flatMap((shortcut) => {
    const value = SETTINGS.customTriggers.state.hotkeys?.[shortcut.id as keyof typeof SETTINGS.customTriggers.state.hotkeys] ?? "";
    return value
      ? [{ section: "customTriggers" as const, id: shortcut.id, shortcut: value, labelKey: shortcut.labelKey, fallbackLabel: shortcut.fallbackLabel }]
      : [];
  });

  return [...general, ...custom];
}

export function findShortcutConflict(shortcutKey: string, exclude?: { section: ShortcutOwner["section"]; id: string }): ShortcutOwner | null {
  const normalized = normalizeShortcut(shortcutKey);
  if (!normalized) return null;
  return (
    getAllAssignedShortcuts().find((owner) => {
      if (exclude && owner.section === exclude.section && owner.id === exclude.id) {
        return false;
      }
      return normalizeShortcut(owner.shortcut) === normalized;
    }) ?? null
  );
}

export async function setupShortcuts() {
  await unregisterAll();

  for (const [cmdId, shortcutKey] of Object.entries(SETTINGS.shortcuts.state)) {
    await registerShortcut("general", cmdId, shortcutKey);
  }

  for (const [cmdId, shortcutKey] of Object.entries(SETTINGS.customTriggers.state.hotkeys ?? {})) {
    await registerShortcut("customTriggers", cmdId, shortcutKey as string);
  }
}

export async function registerShortcut(
  section: ShortcutOwner["section"],
  cmdId: string,
  shortcutKey: string,
) {
  if (!shortcutKey) return;

  if (section === "general") {
    switch (cmdId) {
      case "showLiveMeter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            const liveWindow = await WebviewWindow.getByLabel("live");
            await liveWindow?.show();
          }
        });
        return;

      case "hideLiveMeter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            const liveWindow = await WebviewWindow.getByLabel("live");
            await liveWindow?.hide();
          }
        });
        return;

      case "toggleLiveMeter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            const liveWindow = await WebviewWindow.getByLabel("live");
            const isVisible = await liveWindow?.isVisible();
            if (isVisible) {
              await liveWindow?.hide();
            } else {
              await liveWindow?.show();
            }
          }
        });
        return;

      case "toggleOverlayWindow":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            try {
              await commands.toggleGameOverlayWindow();
            } catch (error) {
              console.error("Failed to toggle overlay window hotkey", error);
            }
          }
        });
        return;

      case "enableClickthrough":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            setClickthrough(true);
          }
        });
        return;

      case "disableClickthrough":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            setClickthrough(false);
          }
        });
        return;

      case "toggleClickthrough":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            toggleClickthrough();
          }
        });
        return;

      case "resetEncounter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            commands.resetEncounter();
          }
        });
        return;

      case "toggleBossHp":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            const nextValue = !SETTINGS.live.headerCustomization.state.showBossHealth;
            SETTINGS.live.headerCustomization.state.showBossHealth = nextValue;
          }
        });
        return;

      case "togglePauseEncounter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            try {
              await commands.togglePauseEncounter();
            } catch (e) {
              console.error("Failed to toggle pause encounter", e);
            }
          }
        });
        return;

      case "toggleOverlayEdit":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            try {
              await commands.toggleGameOverlayEditMode();
            } catch (error) {
              console.error("Failed to toggle overlay edit mode hotkey", error);
            }
          }
        });
        return;

      case "toggleEventLogger":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            try {
              await toggleEventLoggerWindow();
            } catch (error) {
              console.error("Failed to toggle event logger hotkey", error);
            }
          }
        });
        return;

      default:
        return;
    }
  }

  switch (cmdId) {
    case "fireSelectedTrigger":
      await register(shortcutKey, async (event) => {
        if (event.state === "Pressed") {
          const triggerId = SETTINGS.customTriggers.state.selectedHotkeyTriggerId?.trim();
          if (triggerId) await fireCustomTrigger(triggerId);
        }
      });
      return;

    case "stopSelectedTrigger":
      await register(shortcutKey, async (event) => {
        if (event.state === "Pressed") {
          const triggerId = SETTINGS.customTriggers.state.selectedHotkeyTriggerId?.trim();
          if (triggerId) await stopCustomTrigger(triggerId);
        }
      });
      return;

    case "resetSelectedTrigger":
      await register(shortcutKey, async (event) => {
        if (event.state === "Pressed") {
          const triggerId = SETTINGS.customTriggers.state.selectedHotkeyTriggerId?.trim();
          if (triggerId) await resetCustomTrigger(triggerId);
        }
      });
      return;

    case "clearSelectedGroup":
      await register(shortcutKey, async (event) => {
        if (event.state === "Pressed") {
          const groupId = SETTINGS.customTriggers.state.selectedHotkeyGroupId?.trim();
          if (groupId) await resetCustomTriggerGroup(groupId);
        }
      });
      return;

    case "resetAllRuntimeState":
      await register(shortcutKey, async (event) => {
        if (event.state === "Pressed") {
          await resetAllCustomTriggerRuntimeState();
        }
      });
      return;

    default:
      return;
  }
}

export async function clearRegisteredShortcut(section: ShortcutOwner["section"], id: string) {
  const current =
    section === "general"
      ? SETTINGS.shortcuts.state[id as keyof typeof SETTINGS.shortcuts.state]
      : SETTINGS.customTriggers.state.hotkeys?.[id as keyof typeof SETTINGS.customTriggers.state.hotkeys] ?? "";
  if (current) {
    await unregister(current);
  }
  if (section === "general") {
    SETTINGS.shortcuts.state[id as keyof typeof SETTINGS.shortcuts.state] = "";
  } else if (SETTINGS.customTriggers.state.hotkeys) {
    SETTINGS.customTriggers.state.hotkeys[id as keyof typeof SETTINGS.customTriggers.state.hotkeys] = "";
  }
}
