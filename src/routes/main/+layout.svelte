<script lang="ts">
  /**
   * @file This is the layout for the main application window (Toolbox).
   * It sets up the left sidebar with tool list and right content area.
   */
  import { setupShortcuts } from "./dps/settings/shortcuts";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { goto } from "$app/navigation";
  import { onSceneChange } from "$lib/api";
  import {
    isDailyScene,
    isSupportedMinimapScene,
  } from "$lib/config/daily-scene-blacklist";
  import { SETTINGS } from "$lib/settings-store";
  import { applyCustomFonts } from "$lib/font-loader";
  import { applyLiveClickthrough } from "$lib/utils.svelte";
  import {
    isOverlayWindowVisible,
    refreshOverlayWindowVisibility,
    setOverlayWindowVisible,
  } from "$lib/overlay-window-visibility.svelte";
  import {
    buildMonitorRuntimeSnapshot,
    createMonitorRuntimeSnapshotSignature,
    saveAndApplyMonitorRuntimeSnapshot,
  } from "$lib/runtime-monitor-sync";
  import { onMount, untrack } from "svelte";
  import {
    ensureVoiceListeners,
    refreshVoiceStatus,
  } from "$lib/stores/voice-store.svelte";
  import ToolSidebar from "./tool-sidebar.svelte";
  import ChangelogModal from "$lib/components/ChangelogModal.svelte";
  import UpdateModal from "$lib/components/UpdateModal.svelte";
  import { getVersion } from "@tauri-apps/api/app";
  import AppBackgroundLayer from "$lib/components/app-background-layer.svelte";

  let { children } = $props();

  $effect.pre(() => {
    (async () => {
      await setupShortcuts();
    })();
  });

  let lastRuntimeSnapshotKey = "";
  let runtimeSnapshotInitialized = false;
  let runtimeSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let currentSceneId = $state<number | null>(null);

  function queueRuntimeSnapshotSync(
    runtimeSnapshot: ReturnType<typeof buildMonitorRuntimeSnapshot>,
    runtimeSnapshotKey: string,
  ) {
    if (runtimeSyncTimer) {
      clearTimeout(runtimeSyncTimer);
    }
    runtimeSyncTimer = setTimeout(() => {
      void (async () => {
        try {
          lastRuntimeSnapshotKey = runtimeSnapshotKey;
          await saveAndApplyMonitorRuntimeSnapshot(runtimeSnapshot);
        } catch (error) {
          console.error(
            "[runtime-monitor] failed to sync runtime snapshot",
            error,
          );
        }
      })();
    }, 50);
  }

  $effect(() => {
    const runtimeSnapshot = buildMonitorRuntimeSnapshot();
    const runtimeSnapshotKey =
      createMonitorRuntimeSnapshotSignature(runtimeSnapshot);

    if (!runtimeSnapshotInitialized) {
      runtimeSnapshotInitialized = true;
      lastRuntimeSnapshotKey = runtimeSnapshotKey;
      queueRuntimeSnapshotSync(runtimeSnapshot, runtimeSnapshotKey);
    } else if (runtimeSnapshotKey !== lastRuntimeSnapshotKey) {
      queueRuntimeSnapshotSync(runtimeSnapshot, runtimeSnapshotKey);
    }
  });

  $effect(() => {
    const enabled = SETTINGS.skillMonitor.state.enabled;
    const autoHideInDailyScenes =
      SETTINGS.skillMonitor.state.autoHideInDailyScenes ?? false;
    const shouldShow =
      enabled && !(autoHideInDailyScenes && isDailyScene(currentSceneId));

    void (async () => {
      // Read via untrack() so this effect only reacts to setting/scene changes,
      // not to visibility changes it (or the toggle buttons) makes itself -
      // otherwise a manual toggle would immediately be "corrected" back.
      if (untrack(() => isOverlayWindowVisible("game-overlay")) === shouldShow)
        return;
      await setOverlayWindowVisible("game-overlay", shouldShow);
    })();
  });

  $effect(() => {
    const enabled = SETTINGS.monsterMonitor.state.enabled;
    const autoHideInDailyScenes =
      SETTINGS.monsterMonitor.state.autoHideInDailyScenes ?? false;
    const shouldShow =
      enabled && !(autoHideInDailyScenes && isDailyScene(currentSceneId));

    void (async () => {
      if (
        untrack(() => isOverlayWindowVisible("monster-overlay")) === shouldShow
      )
        return;
      await setOverlayWindowVisible("monster-overlay", shouldShow);
    })();
  });

  $effect(() => {
    const autoHideInDailyScenes =
      SETTINGS.minimap.state.autoHideInDailyScenes ?? false;
    const shouldControl = autoHideInDailyScenes && currentSceneId !== null;
    const shouldShow =
      shouldControl &&
      !isDailyScene(currentSceneId) &&
      isSupportedMinimapScene(currentSceneId);

    void (async () => {
      if (!shouldControl) return;
      if (
        untrack(() => isOverlayWindowVisible("minimap-overlay")) === shouldShow
      )
        return;
      await setOverlayWindowVisible("minimap-overlay", shouldShow);
    })();
  });

  $effect(() => {
    applyCustomFonts({
      sansEnabled: SETTINGS.accessibility.state.customFontSansEnabled,
      sansName: SETTINGS.accessibility.state.customFontSansName,
      sansUrl: SETTINGS.accessibility.state.customFontSansUrl,
      monoEnabled: SETTINGS.accessibility.state.customFontMonoEnabled,
      monoName: SETTINGS.accessibility.state.customFontMonoName,
      monoUrl: SETTINGS.accessibility.state.customFontMonoUrl,
    });
  });

  $effect(() => {
    const enabled = SETTINGS.accessibility.state.clickthrough;
    void (async () => {
      try {
        await applyLiveClickthrough(enabled);
      } catch (error) {
        console.error("[clickthrough] failed to sync live window state", error);
      }
    })();
  });

  // Navigation listener is set up in onMount and properly cleaned up
  let navigateUnlisten: (() => void) | null = null;

  let showChangelog = $state(false);
  let currentVersion = $state("");
  type UpdateInfo = {
    version: string;
    body: string;
    downloadUrl: string;
  };
  let updateInfo = $state<UpdateInfo | null>(null);
  let updateUnlisten: UnlistenFn | null = null;
  let clickthroughUnlisten: UnlistenFn | null = null;
  let sceneChangeUnlisten: UnlistenFn | null = null;

  async function revealMainWindowForNotice() {
    try {
      const appWebview = getCurrentWebviewWindow();

      if (!(await appWebview.isVisible())) {
        await appWebview.show();
      }

      await appWebview.unminimize();
      await appWebview.setFocus();
    } catch (err) {
      console.error("Failed to reveal main window for notice", err);
    }
  }

  onMount(() => {
    // "live" has no auto-hide effect to seed its initial visibility (unlike the
    // other overlays, which sync above), so refresh it explicitly.
    void refreshOverlayWindowVisibility("live");

    // The inline voice-binding controls (buff monitor / counter editor / DBM
    // table) need the phrase catalog for their "短语库引用" picker, so load
    // it app-wide instead of only when the user visits the voice page.
    void (async () => {
      await ensureVoiceListeners();
      await refreshVoiceStatus();
    })();

    // Set up navigation listener
    const appWebview = getCurrentWebviewWindow();
    appWebview
      .listen<string>("navigate", (event) => {
        const route = event.payload;
        goto(route);
      })
      .then((unlisten) => {
        navigateUnlisten = unlisten;
      });

    listen<UpdateInfo>("update-available", (event) => {
      updateInfo = event.payload;
      void revealMainWindowForNotice();
    })
      .then((unlisten) => {
        updateUnlisten = unlisten;
      })
      .catch((err) => {
        console.error("Failed to subscribe update-available event", err);
      });

    listen<boolean>("live-clickthrough-changed", (event) => {
      SETTINGS.accessibility.state.clickthrough = event.payload;
    })
      .then((unlisten) => {
        clickthroughUnlisten = unlisten;
      })
      .catch((err) => {
        console.error(
          "Failed to subscribe live-clickthrough-changed event",
          err,
        );
      });

    onSceneChange((event) => {
      currentSceneId = event.payload.sceneId;
    })
      .then((unlisten) => {
        sceneChangeUnlisten = unlisten;
      })
      .catch((err) => {
        console.error("Failed to subscribe scene-change event", err);
      });

    // Get app version and check changelog
    getVersion()
      .then((v) => {
        currentVersion = v;
        // Compare persisted last-seen version with current app version
        if ((SETTINGS.appVersion.state as any).value !== v) {
          showChangelog = true;
          void revealMainWindowForNotice();
        }
      })
      .catch((err) => {
        console.error("Failed to get app version", err);
      });

    // Cleanup on unmount
    return () => {
      if (runtimeSyncTimer) {
        clearTimeout(runtimeSyncTimer);
        runtimeSyncTimer = null;
      }
      if (navigateUnlisten) {
        navigateUnlisten();
        navigateUnlisten = null;
      }
      if (updateUnlisten) {
        updateUnlisten();
        updateUnlisten = null;
      }
      if (clickthroughUnlisten) {
        clickthroughUnlisten();
        clickthroughUnlisten = null;
      }
      if (sceneChangeUnlisten) {
        sceneChangeUnlisten();
        sceneChangeUnlisten = null;
      }
    };
  });

  function handleClose() {
    // mark changelog as seen for this version
    try {
      (SETTINGS.appVersion.state as any).value = currentVersion;
    } catch (e) {
      console.error("Failed to set appVersion setting", e);
    }
    showChangelog = false;
  }
</script>

<div
  class="text-foreground relative isolate h-screen overflow-hidden font-sans"
>
  <AppBackgroundLayer
    enabled={SETTINGS.accessibility.state.backgroundImageEnabled}
    image={SETTINGS.accessibility.state.backgroundImage}
    mode={SETTINGS.accessibility.state.backgroundImageMode}
    containColor={SETTINGS.accessibility.state.backgroundImageContainColor}
    opacity={SETTINGS.accessibility.state.backgroundImageOpacity ?? 100}
  />
  <div
    class="bg-background-main pointer-events-none absolute inset-0 z-10"
  ></div>
  <div class="relative z-20 flex h-full">
    <!-- Left Sidebar - Tool List -->
    <ToolSidebar />

    <!-- Right Content Area -->
    <main class="flex flex-1 flex-col overflow-hidden">
      <div class="flex-1 overflow-y-auto p-6">
        {@render children()}
      </div>
    </main>

    {#if showChangelog}
      <ChangelogModal onclose={handleClose} />
    {/if}

    {#if !showChangelog && updateInfo}
      <UpdateModal
        info={updateInfo}
        {currentVersion}
        onclose={() => {
          updateInfo = null;
        }}
      />
    {/if}
  </div>
</div>

<style>
  :global {
    html,
    body {
      background: transparent;
    }

    /* Hide scrollbars globally but keep scrolling functional */
    * {
      -ms-overflow-style: none; /* IE and Edge */
      scrollbar-width: none; /* Firefox */
    }
    *::-webkit-scrollbar {
      display: none; /* Chrome, Safari, Edge */
    }
  }
</style>
