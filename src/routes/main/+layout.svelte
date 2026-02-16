<script lang="ts">
  /**
   * @file This is the layout for the main application window (Toolbox).
   * It sets up the left sidebar with tool list and right content area.
   */
  import { setupShortcuts } from "./dps/settings/shortcuts";
  import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { goto } from "$app/navigation";
  import { SETTINGS } from '$lib/settings-store';
  import { commands } from "$lib/bindings";
  import { getDefaultMonitoredBuffIds } from "$lib/skill-mappings";
  import { onMount } from 'svelte';
  import ToolSidebar from "./tool-sidebar.svelte";
  import ChangelogModal from '$lib/components/ChangelogModal.svelte';
  import { getVersion } from "@tauri-apps/api/app";

  let { children } = $props();

  $effect.pre(() => {
    (async () => {
      await setupShortcuts();
    })();
  });

  function getActiveSkillMonitorProfile() {
    const profiles = SETTINGS.skillMonitor.state.profiles;
    if (profiles.length === 0) return null;
    const index = Math.min(
      Math.max(SETTINGS.skillMonitor.state.activeProfileIndex, 0),
      profiles.length - 1,
    );
    return profiles[index];
  }

  let lastMonitorSyncKey = "";
  let lastOverlayVisibleState: boolean | null = null;

  $effect(() => {
    const enabled = SETTINGS.skillMonitor.state.enabled;
    const activeProfile = getActiveSkillMonitorProfile();
    const selectedClass = activeProfile?.selectedClass ?? "wind_knight";
    const monitoredSkillIds = activeProfile?.monitoredSkillIds ?? [];
    const monitoredBuffIds = activeProfile?.monitoredBuffIds ?? [];
    const buffPriorityIds = activeProfile?.buffPriorityIds ?? [];
    const buffDisplayMode = activeProfile?.buffDisplayMode ?? "individual";
    const buffGroups = activeProfile?.buffGroups ?? [];
    const anyGroupMonitorAll =
      buffDisplayMode === "grouped" && buffGroups.some((group) => group.monitorAll);
    const groupBuffIds =
      buffDisplayMode === "grouped"
        ? buffGroups.flatMap((group) => (group.monitorAll ? [] : group.buffIds))
        : [];
    const mergedBuffIds = Array.from(
      new Set([
        ...monitoredBuffIds,
        ...groupBuffIds,
        ...getDefaultMonitoredBuffIds(selectedClass),
      ]),
    );
    const mergedPriorityIds = Array.from(
      new Set([
        ...buffPriorityIds,
        ...buffGroups.flatMap((group) => group.priorityBuffIds ?? []),
      ]),
    );
    const monitorSyncKey = JSON.stringify({
      enabled,
      monitoredSkillIds,
      mergedBuffIds,
      mergedPriorityIds,
      anyGroupMonitorAll,
    });

    void (async () => {
      try {
        // Avoid spamming backend monitor commands when only overlay layout changes.
        if (monitorSyncKey !== lastMonitorSyncKey) {
          lastMonitorSyncKey = monitorSyncKey;
          if (enabled) {
            await commands.setMonitorAllBuff(anyGroupMonitorAll);
            await commands.setMonitoredSkills(monitoredSkillIds);
            await commands.setMonitoredBuffs(mergedBuffIds);
            await commands.setBuffPriority(mergedPriorityIds);
          } else {
            await commands.setMonitorAllBuff(false);
            await commands.setMonitoredSkills([]);
            await commands.setMonitoredBuffs([]);
            await commands.setBuffPriority([]);
          }
        }

        const overlayWindow = await WebviewWindow.getByLabel("game-overlay");
        if (overlayWindow) {
          if (lastOverlayVisibleState !== enabled) {
            lastOverlayVisibleState = enabled;
            if (enabled) {
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

  // Navigation listener is set up in onMount and properly cleaned up
  let navigateUnlisten: (() => void) | null = null;

  let showChangelog = $state(false);
  let currentVersion = $state('');

  onMount(() => {
    // Set up navigation listener
    const appWebview = getCurrentWebviewWindow();
    appWebview.listen<string>("navigate", (event) => {
      const route = event.payload;
      goto(route);
    }).then((unlisten) => {
      navigateUnlisten = unlisten;
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

    // Poll settings for background image and custom fonts
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
        // Apply custom fonts if enabled
        const sansEnabled = SETTINGS.accessibility.state.customFontSansEnabled;
        const sansName = SETTINGS.accessibility.state.customFontSansName;
        const sansUrl = SETTINGS.accessibility.state.customFontSansUrl;
        const monoEnabled = SETTINGS.accessibility.state.customFontMonoEnabled;
        const monoName = SETTINGS.accessibility.state.customFontMonoName;
        const monoUrl = SETTINGS.accessibility.state.customFontMonoUrl;

        // Load custom fonts if URLs are set
        if (sansEnabled && sansName && sansUrl) {
          if (!document.fonts.check(`12px "${sansName}"`)) {
            const fontFace = new FontFace(sansName, `url(${sansUrl})`);
            fontFace.load().then((loadedFace) => {
              document.fonts.add(loadedFace);
            }).catch(() => {});
          }
          document.documentElement.style.setProperty('--font-sans', `"${sansName}", sans-serif`);
        } else {
          document.documentElement.style.setProperty('--font-sans', '"Inter Variable", sans-serif');
        }

        if (monoEnabled && monoName && monoUrl) {
          if (!document.fonts.check(`12px "${monoName}"`)) {
            const fontFace = new FontFace(monoName, `url(${monoUrl})`);
            fontFace.load().then((loadedFace) => {
              document.fonts.add(loadedFace);
            }).catch(() => {});
          }
          document.documentElement.style.setProperty('--font-mono', `"${monoName}", monospace`);
        } else {
          document.documentElement.style.setProperty('--font-mono', '"Geist Mono Variable", monospace');
        }
      } catch (e) {
        // ignore
      }
    }, 200);

    // Cleanup on unmount
    return () => {
      if (navigateUnlisten) {
        navigateUnlisten();
        navigateUnlisten = null;
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

<div class="flex h-screen bg-background-main text-foreground">
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
