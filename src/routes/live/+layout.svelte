<script lang="ts">
  /**
   * @file This is the layout for the live meter.
   * It sets up event listeners for live data, manages the pause state,
   * and handles scroll position restoration.
   *
   * It also displays the header, footer, boss health, and notification toasts.
   *
   * @packageDocumentation
   */
  import { onMount } from "svelte";
  import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
  import { SETTINGS } from "$lib/settings-store";
  import { resolveUiTranslation } from "$lib/i18n";
  import {
    onLiveData,
    onResetEncounter,
    onEncounterUpdate,
    onSceneChange,
    onPauseEncounter,
    onTrainingDummyUpdate,
    onDeathReplay,
  } from "$lib/api";
  import type { LiveDataPayload } from "$lib/api";
  import { applyCustomFonts } from "$lib/font-loader";
  import AppBackgroundLayer from "$lib/components/app-background-layer.svelte";
  import { writable } from "svelte/store";
  import { beforeNavigate, afterNavigate } from "$app/navigation";


  function t(key: string, fallback: string): string {
    return resolveUiTranslation(
      "ui/dps/live.json",
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  // Store for pause state
  export const isPaused = writable(false);

  // Store for scroll positions
  const scrollPositions = writable<Record<string, number>>({});

  import {
    setLiveData,
    setDeathRecords,
    setTrainingDummyState,
    clearMeterData,
    cleanupStores,
  } from "$lib/stores/live-meter-store.svelte";
  import HeaderCustom from "./header-custom.svelte";

  import NotificationToast from "./notification-toast.svelte";

  let { children } = $props();
  // let screenshotDiv: HTMLDivElement | undefined = $state();

  let notificationToast: NotificationToast;
  let rootElement: HTMLElement | undefined = undefined;
  let mainElement: HTMLElement | undefined = undefined;
  let unlisten: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let dynamicResizeFrame = 0;
  let lastDynamicHeight = 0;
  let dynamicWindowEnabled = $derived(SETTINGS.live.dynamicWindow.state.enabled === true);

  // Prevent concurrent setupEventListeners runs which can attach duplicate listeners
  let listenersSetupInProgress = false;
  let lastEventTime = Date.now();
  let hadAnyEvent = false; // becomes true after the first live event arrives
  // Persist last known pause state across listener reconnections so we don't
  // show a spurious "Encounter resumed" toast every time listeners are
  // re-attached (e.g. on window focus/visibility change).
  let lastPauseState: boolean | null = null;
  let reconnectInterval: ReturnType<typeof setInterval> | null = null;
  let isReconnecting = false;
  let reconnectDelay = 1000; // exponential backoff base
  const DISCONNECT_THRESHOLD = 5000;
  // Track if component is destroyed to prevent callbacks from firing after unmount
  let isDestroyed = false;
  let autoHideRecentlyDamaged = false;
  let autoHideLastObservedDamageTotal = 0;
  let autoHideHiddenByFeature = false;
  let autoHideOperation: Promise<void> = Promise.resolve();
  let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

  function damageNumber(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0;
  }

  function recordObservedDamageTotal(total: number): boolean {
    const currentTotal = Math.max(0, total);
    const hasNewDamage = currentTotal > autoHideLastObservedDamageTotal;
    autoHideLastObservedDamageTotal = currentTotal;
    return hasNewDamage;
  }

  function livePayloadDamageTotal(payload: LiveDataPayload): number {
    const payloadTotal = Math.max(
      damageNumber(payload.totalDmg),
      damageNumber(payload.totalDmgBossOnly),
    );
    if (payloadTotal > 0) return payloadTotal;

    return payload.entities.reduce(
      (sum, entity) =>
        sum +
        damageNumber(entity.damage?.total) +
        damageNumber(entity.damageBossOnly?.total) +
        damageNumber(entity.taken?.total),
      0,
    );
  }

  function livePayloadHasDamageEvent(payload: LiveDataPayload): boolean {
    return recordObservedDamageTotal(livePayloadDamageTotal(payload));
  }

  function headerHasDamageEvent(headerInfo: { totalDmg: number }): boolean {
    return recordObservedDamageTotal(damageNumber(headerInfo.totalDmg));
  }

  function clearAutoHideTimer(): void {
    if (!autoHideTimer) return;
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  function autoHideDelayMs(): number {
    const rawSeconds = Number(SETTINGS.live.general.state.autoHideLiveWindowDelaySeconds);
    const seconds = Number.isFinite(rawSeconds) ? rawSeconds : 5;
    return Math.max(0, Math.min(60, seconds)) * 1000;
  }

  async function hideLiveWindowForAutoHide(): Promise<void> {
    if (isDestroyed || autoHideHiddenByFeature) return;

    try {
      await getCurrentWindow().hide();
      autoHideHiddenByFeature = true;
    } catch (error) {
      console.warn("Failed to hide live window after auto-hide delay:", error);
    }
  }

  function queueAutoHideAfterDelay(): void {
    if (autoHideHiddenByFeature || autoHideTimer) return;

    const delayMs = autoHideDelayMs();
    if (delayMs <= 0) {
      autoHideOperation = autoHideOperation
        .catch(() => undefined)
        .then(() => hideLiveWindowForAutoHide());
      return;
    }

    autoHideTimer = setTimeout(() => {
      autoHideTimer = null;
      if (
        isDestroyed ||
        autoHideRecentlyDamaged ||
        SETTINGS.live.general.state.autoHideLiveWindow !== true
      ) {
        return;
      }

      autoHideOperation = autoHideOperation
        .catch(() => undefined)
        .then(() => hideLiveWindowForAutoHide());
    }, delayMs);
  }

  async function applyAutoHideLiveWindow(rescheduleDelay = false): Promise<void> {
    const hasDamage = autoHideRecentlyDamaged;

    if (isDestroyed || typeof window === "undefined") return;

    const autoHideEnabled = SETTINGS.live.general.state.autoHideLiveWindow === true;
    const liveWindow = getCurrentWindow();

    try {
      if (!autoHideEnabled) {
        clearAutoHideTimer();
        if (autoHideHiddenByFeature) {
          autoHideHiddenByFeature = false;
          await liveWindow.show();
          await liveWindow.unminimize();
        }
        return;
      }

      if (hasDamage) {
        clearAutoHideTimer();
        if (autoHideHiddenByFeature) {
          autoHideHiddenByFeature = false;
          await liveWindow.show();
          await liveWindow.unminimize();
        }
        return;
      }

      if (rescheduleDelay) {
        clearAutoHideTimer();
      }

      queueAutoHideAfterDelay();
    } catch (error) {
      console.warn("Failed to sync auto-hide live window state:", error);
    }
  }

  function syncAutoHideLiveWindow(
    hasDamage = autoHideRecentlyDamaged,
    rescheduleDelay = false,
  ): Promise<void> {
    autoHideRecentlyDamaged = hasDamage;
    autoHideOperation = autoHideOperation
      .catch(() => undefined)
      .then(() => applyAutoHideLiveWindow(rescheduleDelay));
    return autoHideOperation;
  }

  async function setupEventListeners() {
    if (isDestroyed || isReconnecting || listenersSetupInProgress) return;
    listenersSetupInProgress = true;

    // If listeners are already attached, skip setup to avoid duplicates.
    if (unlisten) {
      listenersSetupInProgress = false;
      return;
    }

    try {
      // Set up unified live-data listener
      const playersUnlisten = await onLiveData((event) => {
        if (isDestroyed) return;
        lastEventTime = Date.now();
        hadAnyEvent = true;
        void syncAutoHideLiveWindow(livePayloadHasDamageEvent(event.payload));
        if (event.payload.fightStartTimestampMs > 0) {
          setLiveData(event.payload);
        } else if (event.payload.totalDmg === 0 && event.payload.totalHeal === 0) {
          clearMeterData();
        }
      });

      if (isDestroyed) {
        playersUnlisten();
        listenersSetupInProgress = false;
        return;
      }

      // Set up reset encounter listener
      const resetUnlisten = await onResetEncounter(() => {
        if (isDestroyed) return;
        lastEventTime = Date.now();
        hadAnyEvent = true;
        autoHideLastObservedDamageTotal = 0;
        void syncAutoHideLiveWindow(false);
        clearMeterData();
        notificationToast?.showToast(
          "notice",
t("live.resetToast", "战斗记录已重置"),
        );
      });

      if (isDestroyed) {
        playersUnlisten();
        resetUnlisten();
        listenersSetupInProgress = false;
        return;
      }

      // Set up encounter update listener (pause/resume)
      const encounterUnlisten = await onEncounterUpdate((event) => {
        if (isDestroyed) return;
        // Treat encounter updates as keep-alive too so reconnect logic doesn't fire
        lastEventTime = Date.now();
        hadAnyEvent = true;
        const newPaused = event.payload.isPaused;
        const elapsedMs = event.payload.headerInfo.elapsedMs;
        void syncAutoHideLiveWindow(headerHasDamageEvent(event.payload.headerInfo));
        // update the store regardless
        isPaused.set(newPaused);
        if (
          event.payload.headerInfo.fightStartTimestampMs <= 0 &&
          event.payload.headerInfo.totalDmg === 0
        ) {
          clearMeterData();
        }
        // only show a toast if the pause state actually changed AND we've started receiving combat data
        // Note: do NOT show a toast on the initial listener attach (lastPauseState === null)
        // to avoid spurious "Encounter resumed" messages when reattaching listeners
        if (
          elapsedMs > 0 &&
          lastPauseState !== null &&
          lastPauseState !== newPaused
        ) {
          if (newPaused) {
            notificationToast?.showToast(
              "notice",
t("live.pauseToast", "战斗已暂停"),
            );
          } else {
            notificationToast?.showToast(
              "notice",
t("live.resumeToast", "战斗已继续"),
            );
          }
        }
        lastPauseState = newPaused;
      });

      if (isDestroyed) {
        playersUnlisten();
        resetUnlisten();
        encounterUnlisten();
        listenersSetupInProgress = false;
        return;
      }

      // Set up scene change listener
      const sceneChangeUnlisten = await onSceneChange(() => {
        if (isDestroyed) return;
        // Treat scene change as a keep-alive
        lastEventTime = Date.now();
        hadAnyEvent = true;
        if (SETTINGS.live.general.state.autoClearOnSceneChange !== false) {
          autoHideLastObservedDamageTotal = 0;
          void syncAutoHideLiveWindow(false);
        }
        // notificationToast?.showToast('notice', `Scene changed to ${event.payload.sceneName}`);
      });

      if (isDestroyed) {
        playersUnlisten();
        resetUnlisten();
        encounterUnlisten();
        sceneChangeUnlisten();
        listenersSetupInProgress = false;
        return;
      }

      const trainingDummyUnlisten = await onTrainingDummyUpdate((event) => {
        if (isDestroyed) return;
        lastEventTime = Date.now();
        hadAnyEvent = true;
        setTrainingDummyState(event.payload);
      });

      if (isDestroyed) {
        playersUnlisten();
        resetUnlisten();
        encounterUnlisten();
        sceneChangeUnlisten();
        trainingDummyUnlisten();
        listenersSetupInProgress = false;
        return;
      }

      const deathReplayUnlisten = await onDeathReplay((event) => {
        if (isDestroyed) return;
        lastEventTime = Date.now();
        hadAnyEvent = true;
        setDeathRecords(event.payload.records);
      });

      if (isDestroyed) {
        playersUnlisten();
        resetUnlisten();
        encounterUnlisten();
        sceneChangeUnlisten();
        trainingDummyUnlisten();
        deathReplayUnlisten();
        listenersSetupInProgress = false;
        return;
      }

      // Listen for explicit pause/resume events as a keep-alive as well
      const pauseUnlisten = await onPauseEncounter((event) => {
        if (isDestroyed) return;
        lastEventTime = Date.now();
        hadAnyEvent = true;
        isPaused.set(!!event.payload);
      });

      if (isDestroyed) {
        playersUnlisten();
        resetUnlisten();
        encounterUnlisten();
        sceneChangeUnlisten();
        trainingDummyUnlisten();
        deathReplayUnlisten();
        pauseUnlisten();
        listenersSetupInProgress = false;
        return;
      }

      // Combine all unlisten functions
      unlisten = () => {
        try {
          playersUnlisten();
        } catch {}
        try {
          resetUnlisten();
        } catch {}
        try {
          encounterUnlisten();
        } catch {}
        try {
          sceneChangeUnlisten();
        } catch {}
        try {
          trainingDummyUnlisten();
        } catch {}
        try {
          deathReplayUnlisten();
        } catch {}
        try {
          pauseUnlisten();
        } catch {}
      };

      listenersSetupInProgress = false;
    } catch (e) {
      console.error("Failed to set up event listeners:", e);
      listenersSetupInProgress = false;
      if (isDestroyed) return;
      isReconnecting = true;
      setTimeout(() => {
        isReconnecting = false;
        if (!isDestroyed) setupEventListeners();
      }, reconnectDelay);
      // increase backoff cap at ~10s
      reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
    }
  }

  function startReconnectCheck() {
    reconnectInterval = setInterval(() => {
      if (isDestroyed) return;
      const now = Date.now();
      if (hadAnyEvent && now - lastEventTime > DISCONNECT_THRESHOLD) {
        console.warn("Live event stream disconnected, attempting reconnection");
        if (unlisten) {
          unlisten();
          unlisten = null;
        }
        // reset timer to avoid tight loop spam
        lastEventTime = now;
        setupEventListeners();
        // backoff after each timer-triggered reconnect
        reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
      }
    }, 1000);
  }

  function scheduleDynamicResize() {
    if (!dynamicWindowEnabled || !rootElement || typeof window === "undefined") return;
    if (dynamicResizeFrame) cancelAnimationFrame(dynamicResizeFrame);

    dynamicResizeFrame = requestAnimationFrame(async () => {
      dynamicResizeFrame = 0;
      if (!dynamicWindowEnabled || !rootElement) return;

      const targetHeight = Math.max(80, Math.ceil(rootElement.scrollHeight));
      if (Math.abs(targetHeight - lastDynamicHeight) < 2) return;
      lastDynamicHeight = targetHeight;

      try {
        await getCurrentWindow().setSize(
          new LogicalSize(Math.ceil(window.innerWidth), targetHeight),
        );
      } catch (error) {
        console.warn("Failed to resize dynamic live window:", error);
      }
    });
  }

  // Save scroll position before navigating away
  beforeNavigate(({ from }) => {
    if (mainElement && from?.url.pathname) {
      scrollPositions.update((positions) => ({
        ...positions,
        [from.url.pathname]: mainElement!.scrollTop,
      }));
    }
  });

  // Restore scroll position after navigation
  afterNavigate(({ to }) => {
    if (mainElement && to?.url.pathname) {
      const savedPosition = $scrollPositions[to.url.pathname];
      if (savedPosition !== undefined) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          if (mainElement) {
            mainElement.scrollTop = savedPosition;
          }
        });
      }
    }
  });

  onMount(() => {
    isDestroyed = false;
    autoHideLastObservedDamageTotal = 0;
    void syncAutoHideLiveWindow(false);
    setupEventListeners();
    startReconnectCheck();
    resizeObserver = new ResizeObserver(() => scheduleDynamicResize());
    if (rootElement) resizeObserver.observe(rootElement);
    scheduleDynamicResize();

    return () => {
      isDestroyed = true;
      if (dynamicResizeFrame) cancelAnimationFrame(dynamicResizeFrame);
      clearAutoHideTimer();
      resizeObserver?.disconnect();
      if (reconnectInterval) clearInterval(reconnectInterval);
      if (unlisten) unlisten();
      cleanupStores();
    };
  });

  $effect(() => {
    SETTINGS.live.general.state.autoHideLiveWindow;
    SETTINGS.live.general.state.autoHideLiveWindowDelaySeconds;
    void syncAutoHideLiveWindow(autoHideRecentlyDamaged, true);
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
    SETTINGS.live.dynamicWindow.state.enabled;
    SETTINGS.live.dynamicWindow.state.maxPlayerRows;
    SETTINGS.live.tableCustomization.state.playerRowHeight;
    SETTINGS.live.tableCustomization.state.tableHeaderHeight;
    SETTINGS.live.headerCustomization.state.windowPadding;
    scheduleDynamicResize();
  });

</script>

<!-- flex flex-col min-h-screen → makes the page stretch full height and stack header, body, and footer. -->
<!-- flex-1 on <main> → makes the body expand to fill leftover space, pushing the footer down. -->
<div
  bind:this={rootElement}
  class="relative isolate {dynamicWindowEnabled ? 'min-h-0' : 'h-screen'} overflow-hidden rounded-xl text-[13px] text-foreground font-sans shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]"
  style="padding: {SETTINGS.live.headerCustomization.state.windowPadding}px"
  data-tauri-drag-region
>
  <AppBackgroundLayer
    enabled={SETTINGS.accessibility.state.backgroundImageEnabled}
    image={SETTINGS.accessibility.state.backgroundImage}
    mode={SETTINGS.accessibility.state.backgroundImageMode || "cover"}
    containColor={SETTINGS.accessibility.state.backgroundImageContainColor || "rgba(0, 0, 0, 0)"}
    opacity={SETTINGS.accessibility.state.backgroundImageOpacity ?? 100}
  />
  <div class="pointer-events-none absolute inset-0 z-10 bg-background-live"></div>

  <div class="relative z-20 flex {dynamicWindowEnabled ? 'h-auto' : 'h-full'} flex-col">
    <HeaderCustom />
    <main
      bind:this={mainElement}
      class="{dynamicWindowEnabled ? 'overflow-hidden' : 'flex-1 overflow-y-auto'} gap-4 rounded-lg bg-card/20"
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
