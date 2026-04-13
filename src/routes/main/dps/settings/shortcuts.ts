import { commands } from "$lib/bindings";
import { SETTINGS } from "$lib/settings-store";
import { setClickthrough, toggleClickthrough } from "$lib/utils.svelte";
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
            const liveWindow = await WebviewWindow.getByLabel("live");
            await liveWindow?.show();
          }
        });
        break;

      case "hideLiveMeter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            const liveWindow = await WebviewWindow.getByLabel("live");
            await liveWindow?.hide();
          }
        });
        break;

      case "toggleLiveMeter":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            const liveWindow = await WebviewWindow.getByLabel("live");
            const isVisible = await liveWindow?.isVisible();
            if (isVisible) {
              await liveWindow?.hide();
            } else {
              await liveWindow?.show();
            }
          }
        });
        break;

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
        break;

      case "enableClickthrough":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            setClickthrough(true);
          }
        });
        break;

      case "disableClickthrough":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            setClickthrough(false);
          }
        });
        break;

      case "toggleClickthrough":
        await register(shortcutKey, async (event) => {
          if (event.state === "Pressed") {
            console.log(`Triggered ${cmdId}`);
            toggleClickthrough();
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
