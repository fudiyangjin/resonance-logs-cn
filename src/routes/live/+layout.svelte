<script lang="ts">
  import { onMount } from "svelte";
  import { SETTINGS } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { applyCustomFonts } from "$lib/font-loader";
  import { ipcNumber } from "$lib/ipc-decimal";
  import { liveCombatStore } from "$lib/stores/live-topics.svelte";
  import { initLiveDisplayClock } from "$lib/live-display-clock.svelte";
  import { liveWindowSession } from "$lib/stores/live-window-sessions.svelte";
  import { liveView } from "$lib/stores/live-view-source.svelte";
  import { listenLivePullGate } from "$lib/live-pull-gate";
  import { applyLiveClickthrough } from "$lib/utils.svelte";
  import { writable } from "svelte/store";
  import { beforeNavigate, afterNavigate } from "$app/navigation";
  import AppBackgroundLayer from "$lib/components/app-background-layer.svelte";
  import HeaderCustom from "./header-custom.svelte";
  import HistoryBanner from "./history-banner.svelte";
  import NotificationToast from "./notification-toast.svelte";

  const scrollPositions = writable<Record<string, number>>({});
  let { children } = $props();
  let notificationToast: NotificationToast;
  let mainElement: HTMLElement | undefined = undefined;
  let clickthroughUnlisten: UnlistenFn | null = null;
  let lastPauseState: boolean | null = null;
  let lastDisplayedSegmentId: number | null | undefined;

  beforeNavigate(({ from }) => {
    if (mainElement && from?.url.pathname) {
      scrollPositions.update((positions) => ({
        ...positions,
        [from.url.pathname]: mainElement!.scrollTop,
      }));
    }
  });

  afterNavigate(({ to }) => {
    if (to?.url.pathname) liveView.rememberTab(to.url.pathname);
    if (mainElement && to?.url.pathname) {
      const savedPosition = $scrollPositions[to.url.pathname];
      if (savedPosition !== undefined) {
        requestAnimationFrame(() => {
          if (mainElement) {
            mainElement.scrollTop = savedPosition;
          }
        });
      }
    }
  });

  onMount(() => {
    const stopDisplayClock = initLiveDisplayClock();
    const unlistenPullGate = listenLivePullGate("live", liveWindowSession);
    liveWindowSession.start();

    listen<boolean>("live-clickthrough-changed", (event) => {
      SETTINGS.accessibility.state.clickthrough = event.payload;
    })
      .then((unlisten) => {
        clickthroughUnlisten = unlisten;
      })
      .catch((error) => {
        console.error(
          "Failed to subscribe live-clickthrough-changed event",
          error,
        );
      });

    return () => {
      stopDisplayClock();
      void unlistenPullGate.then((unlisten) => unlisten());
      liveWindowSession.stop();
      if (clickthroughUnlisten) {
        clickthroughUnlisten();
        clickthroughUnlisten = null;
      }
    };
  });

  $effect(() => {
    const snapshot = liveCombatStore.data;
    if (!snapshot) return;

    const paused = snapshot.combat?.isPaused ?? false;
    const elapsedMs = ipcNumber(snapshot.combat?.elapsedMs);
    if (elapsedMs > 0 && lastPauseState !== null && lastPauseState !== paused) {
      notificationToast?.showToast(
        "notice",
        t(
          paused
            ? "live.notifications.encounterPaused"
            : "live.notifications.encounterResumed",
        ),
      );
    }

    if (
      lastDisplayedSegmentId !== undefined &&
      lastDisplayedSegmentId !== null &&
      snapshot.displayedSegmentId === null
    ) {
      notificationToast?.showToast(
        "notice",
        t("live.notifications.encounterReset"),
      );
    }

    lastPauseState = paused;
    lastDisplayedSegmentId = snapshot.displayedSegmentId;
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
</script>

<!-- flex flex-col min-h-screen ??makes the page stretch full height and stack header, body, and footer. -->
<!-- flex-1 on <main> ??makes the body expand to fill leftover space, pushing the footer down. -->
<div
  class="text-foreground relative isolate h-screen overflow-hidden rounded-xl font-sans text-[13px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]"
  style="padding: {SETTINGS.live.headerCustomization.state.windowPadding}px"
  data-tauri-drag-region
>
  <AppBackgroundLayer
    enabled={SETTINGS.accessibility.state.backgroundImageEnabled}
    image={SETTINGS.accessibility.state.backgroundImage}
    mode={SETTINGS.accessibility.state.backgroundImageMode}
    containColor={SETTINGS.accessibility.state.backgroundImageContainColor}
    opacity={SETTINGS.accessibility.state.backgroundImageOpacity ?? 100}
  />
  <div
    class="bg-background-live pointer-events-none absolute inset-0 z-10"
  ></div>
  <div class="relative z-20 flex h-full flex-col">
    <HeaderCustom />
    <HistoryBanner />
    <main
      bind:this={mainElement}
      class="bg-card/20 flex-1 gap-4 overflow-y-auto rounded-lg"
    >
      {@render children()}
    </main>
    <!-- Footer removed; navigation and version moved into Header -->
    <NotificationToast bind:this={notificationToast} />
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
