import { commands } from "$lib/bindings";
import { SETTINGS } from "$lib/settings-store";
import {
  setClickthroughPreference,
  toggleClickthroughPreference,
} from "$lib/utils.svelte";
import {
  setOverlayWindowVisible,
  toggleOverlayWindow,
} from "$lib/overlay-window-visibility.svelte";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";

export async function setupShortcuts() {
  await unregisterAll();
  for (const [cmdId, shortcutKey] of Object.entries(SETTINGS.shortcuts.state)) {
    registerShortcut(cmdId, shortcutKey);
  }
}

export async function registerShortcut(cmdId: string, shortcutKey: string) {
  if (shortcutKey) {
    switch (cmdId) {
      case "showLiveMeter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            await setOverlayWindowVisible("live", true);
          }
        });
        break;

      case "hideLiveMeter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            await setOverlayWindowVisible("live", false);
          }
        });
        break;

      case "toggleLiveMeter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            await toggleOverlayWindow("live");
          }
        });
        break;

      case "toggleOverlayWindow":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            await toggleOverlayWindow("game-overlay");
          }
        });
        break;

      case "enableClickthrough":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            setClickthroughPreference(true);
          }
        });
        break;

      case "disableClickthrough":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            setClickthroughPreference(false);
          }
        });
        break;

      case "toggleClickthrough":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            toggleClickthroughPreference();
          }
        });
        break;

      case "resetEncounter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            commands.resetEncounter();
          }
        });
        break;

      case "toggleBossHp":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            const nextValue =
              !SETTINGS.live.headerCustomization.state.showBossHealth;
            SETTINGS.live.headerCustomization.state.showBossHealth = nextValue;
          }
        });
        break;

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
        break;

      case "toggleOverlayEdit":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            const overlayWindow = await WebviewWindow.getByLabel("game-overlay");
            if (overlayWindow) {
              await emit("overlay-edit-toggle");
            }
          }
        });
        break;

      default:
        console.log("Unknown command");
    }
  }
}
