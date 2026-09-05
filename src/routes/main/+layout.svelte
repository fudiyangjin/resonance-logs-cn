<script lang="ts">
  /**
   * @file This is the layout for the main application window (Toolbox).
   * It sets up the left sidebar with tool list and right content area.
   */
  import { setupShortcuts } from "./dps/settings/shortcuts";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { goto } from "$app/navigation";
  import { liveSceneStore } from "$lib/stores/live-topics.svelte";
  import { readHudDomainRules } from "$lib/hud-domain-rules.svelte";
  import {
    domainRequiresSupportedScene,
    resolveSceneVisibility,
  } from "$lib/hud-scene-visibility";
  import type { HudDomain } from "$lib/hud-domain";
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
  import { initBuffIconDir } from "$lib/buff-icon-dir.svelte";
  import {
    ensureVoiceListeners,
    refreshVoiceStatus,
  } from "$lib/stores/voice-store.svelte";
  import ToolSidebar from "./tool-sidebar.svelte";
  import ChangelogModal from "$lib/components/ChangelogModal.svelte";
  import FirstRunLoadoutModal from "$lib/components/FirstRunLoadoutModal.svelte";
  import UpdateModal from "$lib/components/UpdateModal.svelte";
  import {
    dismissFirstRunPrompt,
    findLoadout,
    shouldShowFirstRunPrompt,
    switchLoadout,
  } from "$lib/loadouts.svelte.js";
  import { resolveAutoSwitchTarget } from "$lib/loadout-auto-switch";
  import { t } from "$lib/i18n/index.svelte";
  import { getVersion } from "@tauri-apps/api/app";
  import AppBackgroundLayer from "$lib/components/app-background-layer.svelte";
  import { Toaster, toast } from "svelte-sonner";

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

  // The three HUD domains share one physical overlay window, so their
  // visibility is resolved by one shared rule instead of three hand-rolled
  // effects. `enabled` (flipped by the toggle buttons and the settings
  // switches alike) is the only intent input; everything else is derived.
  const gameVisible = $derived(
    resolveSceneVisibility({
      ...readHudDomainRules("game"),
      sceneId: currentSceneId,
      requiresSupportedScene: domainRequiresSupportedScene("game"),
    }),
  );
  const monsterVisible = $derived(
    resolveSceneVisibility({
      ...readHudDomainRules("monster"),
      sceneId: currentSceneId,
      requiresSupportedScene: domainRequiresSupportedScene("monster"),
    }),
  );
  const minimapVisible = $derived(
    resolveSceneVisibility({
      ...readHudDomainRules("minimap"),
      sceneId: currentSceneId,
      requiresSupportedScene: domainRequiresSupportedScene("minimap"),
    }),
  );

  function syncHudDomain(domain: HudDomain, shouldShow: boolean) {
    // untrack() the current visibility so this only reacts to the resolved
    // value, never to the window state it writes itself.
    if (untrack(() => isOverlayWindowVisible(domain)) === shouldShow) return;
    void setOverlayWindowVisible(domain, shouldShow);
  }

  $effect(() => syncHudDomain("game", gameVisible));
  $effect(() => syncHudDomain("monster", monsterVisible));
  $effect(() => syncHudDomain("minimap", minimapVisible));

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
  let showFirstRunPrompt = $state(false);
  let currentVersion = $state("");
  type UpdateInfo = {
    version: string;
    body: string;
    downloadUrl: string;
  };
  let updateInfo = $state<UpdateInfo | null>(null);
  let updateUnlisten: UnlistenFn | null = null;
  let clickthroughUnlisten: UnlistenFn | null = null;

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
    let disposed = false;
    // Only the current scene id is needed here (to drive the daily-scene
    // auto-hide logic for the overlay windows below), so `main` subscribes
    // to the dedicated low-frequency `live-scene` topic instead of the much
    // heavier `live-combat` cadence.
    let disconnectSnapshot: (() => void) | null = null;
    void liveSceneStore
      .connect()
      .then((disconnect) => {
        if (disposed) disconnect();
        else disconnectSnapshot = disconnect;
      })
      .catch((error) => {
        console.error("Failed to connect live scene stream", error);
      });

    showFirstRunPrompt = shouldShowFirstRunPrompt();

    // Resolve the buff-icon directory once so settings previews can render
    // player-customized icons via the asset protocol.
    void initBuffIconDir();

    // "live" has no auto-hide effect to seed its initial visibility (unlike the
    // other overlays, which sync above), so refresh it explicitly.
    void refreshOverlayWindowVisibility("live");

    // The inline voice-binding controls (buff monitor / counter editor / DBM
    // table) need the phrase catalog for their voice picker, so load
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

    // Get app version and check changelog
    getVersion()
      .then((v) => {
        currentVersion = v;
        // Compare persisted last-seen version with current app version
        if (SETTINGS.appVersion.state.value !== v) {
          showChangelog = true;
          void revealMainWindowForNotice();
        }
      })
      .catch((err) => {
        console.error("Failed to get app version", err);
      });

    // Cleanup on unmount
    return () => {
      disposed = true;
      disconnectSnapshot?.();
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
    };
  });

  $effect(() => {
    const snapshot = liveSceneStore.data;
    if (snapshot) currentSceneId = snapshot.sceneId;
  });

  // Subscribe to a single primitive: `$derived` dedupes identical numbers,
  // so scene changes and other scene-topic revisions never re-run the effect.
  const localTalentStageCfgId = $derived(
    liveSceneStore.data?.localTalentStageCfgId ?? null,
  );

  $effect(() => {
    const stageId = localTalentStageCfgId;
    if (stageId === null) return;
    // Settings are read untracked: a manual loadout switch must not be
    // reverted by this effect — only an actual spec change may trigger it.
    untrack(() => {
      const state = SETTINGS.loadouts.state;
      if (!state.autoSwitchBySpec) return;
      const targetId = resolveAutoSwitchTarget(state.items, state.activeId, stageId);
      if (!targetId) return;
      switchLoadout(targetId);
      toast.info(
        t("loadout.autoSwitch.switched", {
          name: findLoadout(targetId)?.name ?? "",
        }),
      );
    });
  });

  function handleClose() {
    // mark changelog as seen for this version
    try {
      SETTINGS.appVersion.state.value = currentVersion;
    } catch (e) {
      console.error("Failed to set appVersion setting", e);
    }
    showChangelog = false;
  }
</script>

<div
  class="text-foreground relative isolate h-screen overflow-hidden font-sans"
>
  <!-- Global toast outlet: svelte-sonner renders nothing without this.
       Colors track the active custom theme via CSS variables. -->
  <Toaster
    position="bottom-right"
    toastOptions={{
      style:
        "background: var(--popover); color: var(--popover-foreground); border-color: var(--border); box-shadow: var(--toast-shadow);",
    }}
  />
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

    {#if !showChangelog && !updateInfo && showFirstRunPrompt}
      <FirstRunLoadoutModal
        onclose={() => {
          dismissFirstRunPrompt();
          showFirstRunPrompt = false;
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
