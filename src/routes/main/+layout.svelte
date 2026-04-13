<script lang="ts">
  /**
   * @file This is the layout for the main application window (Toolbox).
   * It sets up the left sidebar with tool list and right content area.
   */
  import { setupShortcuts } from "./dps/settings/shortcuts";
  import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { goto } from "$app/navigation";
  import { SETTINGS } from '$lib/settings-store';
  import { applyCustomFonts } from "$lib/font-loader";
  import {
    buildMonitorRuntimeSnapshot,
    createMonitorRuntimeSnapshotSignature,
    saveAndApplyMonitorRuntimeSnapshot,
  } from "$lib/runtime-monitor-sync";
  import { onMount } from 'svelte';
  import ToolSidebar from "./tool-sidebar.svelte";
  import ChangelogModal from '$lib/components/ChangelogModal.svelte';
  import UpdateModal from '$lib/components/UpdateModal.svelte';
  import { getVersion } from "@tauri-apps/api/app";

  let { children } = $props();

  $effect.pre(() => {
    (async () => {
      await setupShortcuts();
    })();
  });

  let lastRuntimeSnapshotKey = "";
  let runtimeSnapshotInitialized = false;
  let lastOverlayVisibleState: boolean | null = null;
  let lastMonsterOverlayVisibleState: boolean | null = null;
  let runtimeSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let overlayVisibilityOverride: boolean | null = null;
  let lastSkillMonitorEnabled: boolean | null = null;

  $effect(() => {
    const runtimeSnapshot = buildMonitorRuntimeSnapshot();
    const runtimeSnapshotKey = createMonitorRuntimeSnapshotSignature(runtimeSnapshot);

    if (!runtimeSnapshotInitialized) {
      runtimeSnapshotInitialized = true;
      lastRuntimeSnapshotKey = runtimeSnapshotKey;
    } else if (runtimeSnapshotKey !== lastRuntimeSnapshotKey) {
      if (runtimeSyncTimer) {
        clearTimeout(runtimeSyncTimer);
      }
      runtimeSyncTimer = setTimeout(() => {
        void (async () => {
          try {
            lastRuntimeSnapshotKey = runtimeSnapshotKey;
            await saveAndApplyMonitorRuntimeSnapshot(runtimeSnapshot);
          } catch (error) {
            console.error("[runtime-monitor] failed to sync runtime snapshot", error);
          }
        })();
      }, 50);
    }

    const enabled = SETTINGS.skillMonitor.state.enabled;

    if (lastSkillMonitorEnabled !== enabled) {
      lastSkillMonitorEnabled = enabled;
      overlayVisibilityOverride = null;
    }

    const desiredOverlayVisible = overlayVisibilityOverride ?? enabled;

    void (async () => {
      try {
        const overlayWindow = await WebviewWindow.getByLabel("game-overlay");
        if (overlayWindow) {
          if (lastOverlayVisibleState !== desiredOverlayVisible) {
            lastOverlayVisibleState = desiredOverlayVisible;
            if (desiredOverlayVisible) {
              await overlayWindow.show();
              await overlayWindow.unminimize();
            } else {
              await overlayWindow.hide();
            }
          }
        }
      } catch (error) {
        console.error("[skill-monitor] failed to sync monitor state", error);
      }
    })();
  });

  $effect(() => {
    const enabled = SETTINGS.monsterMonitor.state.enabled;
    void (async () => {
      try {
        const monsterOverlayWindow = await WebviewWindow.getByLabel("monster-overlay");
        if (monsterOverlayWindow) {
          if (lastMonsterOverlayVisibleState !== enabled) {
            lastMonsterOverlayVisibleState = enabled;
            if (enabled) {
              await monsterOverlayWindow.show();
              await monsterOverlayWindow.unminimize();
            } else {
              await monsterOverlayWindow.hide();
            }
          }
        }
      } catch (error) {
        console.error("[monster-monitor] failed to sync monster monitor state", error);
      }
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

  // Navigation listener is set up in onMount and properly cleaned up
  let navigateUnlisten: (() => void) | null = null;

  let showChangelog = $state(false);
  let currentVersion = $state('');
  type UpdateInfo = {
    version: string;
    body: string;
    downloadUrl: string;
  };
  let updateInfo = $state<UpdateInfo | null>(null);
  let updateUnlisten: UnlistenFn | null = null;
  let overlayToggleUnlisten: UnlistenFn | null = null;
  let overlayChangedUnlisten: UnlistenFn | null = null;

  onMount(() => {
    // Set up navigation listener
    const appWebview = getCurrentWebviewWindow();
    appWebview.listen<string>("navigate", (event) => {
      const route = event.payload;
      goto(route);
    }).then((unlisten) => {
      navigateUnlisten = unlisten;
    });

    listen("game-overlay-visibility-toggle", async () => {
      try {
        const overlayWindow = await WebviewWindow.getByLabel("game-overlay");
        if (!overlayWindow) {
          console.warn("Game overlay window not found");
          return;
        }

        const nextVisible = !(await overlayWindow.isVisible());
        overlayVisibilityOverride = nextVisible;
        lastOverlayVisibleState = nextVisible;

        if (nextVisible) {
          await overlayWindow.show();
          await overlayWindow.unminimize();
          await overlayWindow.setFocus();
        } else {
          await overlayWindow.hide();
        }
      } catch (error) {
        console.error("[skill-monitor] failed to toggle overlay visibility", error);
      }
    }).then((unlisten) => {
      overlayToggleUnlisten = unlisten;
    }).catch((err) => {
      console.error("Failed to subscribe game-overlay-visibility-toggle event", err);
    });

    listen<{ visible: boolean }>("game-overlay-visibility-changed", (event) => {
      overlayVisibilityOverride = event.payload.visible;
      lastOverlayVisibleState = event.payload.visible;
    }).then((unlisten) => {
      overlayChangedUnlisten = unlisten;
    }).catch((err) => {
      console.error("Failed to subscribe game-overlay-visibility-changed event", err);
    });

    listen<UpdateInfo>("update-available", (event) => {
      updateInfo = event.payload;
    }).then((unlisten) => {
      updateUnlisten = unlisten;
    }).catch((err) => {
      console.error("Failed to subscribe update-available event", err);
    });

    // Get app version and check changelog
    getVersion().then((v) => {
      currentVersion = v;
      // Compare persisted last-seen version with current app version
      if ((SETTINGS.appVersion.state as any).value !== v) {
        showChangelog = true;
      }
    }).catch((err) => {
      console.error('Failed to get app version', err);
    });

    // Poll settings for background image
    const bgAndFontInterval = window.setInterval(() => {
      try {
        // Apply background image if enabled
        const bgImageEnabled = SETTINGS.accessibility.state.backgroundImageEnabled;
        const bgImage = SETTINGS.accessibility.state.backgroundImage;
        const bgMode = SETTINGS.accessibility.state.backgroundImageMode || 'cover';
        const bgContainColor = SETTINGS.accessibility.state.backgroundImageContainColor || 'rgba(0, 0, 0, 1)';

        if (bgImageEnabled && bgImage) {
          document.body.style.backgroundImage = `url('${bgImage}')`;
          document.body.style.backgroundSize = bgMode;
          document.body.style.backgroundPosition = 'center';
          document.body.style.backgroundRepeat = 'no-repeat';
          if (bgMode === 'contain') {
            document.body.style.backgroundColor = bgContainColor;
          } else {
            document.body.style.backgroundColor = '';
          }
        } else {
          // Clear any background image settings
          document.body.style.background = '';
          document.body.style.backgroundImage = '';
          document.body.style.backgroundColor = '';
        }
      } catch (e) {
        // ignore
      }
    }, 200);

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
      if (overlayToggleUnlisten) {
        overlayToggleUnlisten();
        overlayToggleUnlisten = null;
      }
      if (overlayChangedUnlisten) {
        overlayChangedUnlisten();
        overlayChangedUnlisten = null;
      }
      clearInterval(bgAndFontInterval);
    };
  });

  function handleClose() {
    // mark changelog as seen for this version
    try {
      (SETTINGS.appVersion.state as any).value = currentVersion;
    } catch (e) {
      console.error('Failed to set appVersion setting', e);
    }
    showChangelog = false;
  }
</script>

<div class="flex h-screen bg-background-main text-foreground font-sans">
  <!-- Left Sidebar - Tool List -->
  <ToolSidebar />

  <!-- Right Content Area -->
  <main class="flex-1 flex flex-col overflow-hidden">
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

<style>
  :global {
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
