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
  import { SETTINGS } from "$lib/settings-store";
  import { resolveNavigationTranslation } from "$lib/i18n";
  import {
    onLiveData,
    onResetEncounter,
    onEncounterUpdate,
    onSceneChange,
    onPauseEncounter,
  } from "$lib/api";
  import { applyCustomFonts } from "$lib/font-loader";
  import { writable } from "svelte/store";
  import { beforeNavigate, afterNavigate } from "$app/navigation";


  function ui(zh: string, en: string, ja = ""): string {
    const language = SETTINGS.live.general.state.language;
    if (language === "en") return en || zh;
    if (language === "ja") return ja || en || zh;
    return zh;
  }

  function t(key: string, zh: string, en: string, ja = ""): string {
    return resolveNavigationTranslation(
      key,
      SETTINGS.live.general.state.language,
      ui(zh, en, ja),
    );
  }

  // Store for pause state
  export const isPaused = writable(false);

  // Store for scroll positions
  const scrollPositions = writable<Record<string, number>>({});

  import {
    setLiveData,
    clearMeterData,
    cleanupStores,
  } from "$lib/stores/live-meter-store.svelte";
  import HeaderCustom from "./header-custom.svelte";

  import NotificationToast from "./notification-toast.svelte";

  let { children } = $props();
  // let screenshotDiv: HTMLDivElement | undefined = $state();

  let notificationToast: NotificationToast;
  let mainElement: HTMLElement | undefined = undefined;
  let unlisten: (() => void) | null = null;

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
        setLiveData(event.payload);
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
        clearMeterData();
        notificationToast?.showToast(
          "notice",
          t(
            "dps.live.resetToast",
            "战斗记录已重置",
            "Encounter reset",
            "戦闘記録をリセットしました",
          ),
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
        // update the store regardless
        isPaused.set(newPaused);
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
              t(
                "dps.live.pauseToast",
                "战斗已暂停",
                "Encounter paused",
                "戦闘を一時停止しました",
              ),
            );
          } else {
            notificationToast?.showToast(
              "notice",
              t(
                "dps.live.resumeToast",
                "战斗已继续",
                "Encounter resumed",
                "戦闘を再開しました",
              ),
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
      const sceneChangeUnlisten = await onSceneChange((event) => {
        if (isDestroyed) return;
        // Treat scene change as a keep-alive
        lastEventTime = Date.now();
        hadAnyEvent = true;
        console.log("Scene change event received:", event.payload);
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
        pauseUnlisten();
        listenersSetupInProgress = false;
        return;
      }

      console.log("Scene change listener set up");

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
          pauseUnlisten();
        } catch {}
      };

      console.log("Event listeners set up for live meter data");

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
    setupEventListeners();
    startReconnectCheck();

    return () => {
      isDestroyed = true;
      if (reconnectInterval) clearInterval(reconnectInterval);
      if (unlisten) unlisten();
      cleanupStores();
    };
  });

  // Reactive background image effect
  $effect(() => {
    if (typeof document === "undefined") return;

    const bgImageEnabled = SETTINGS.accessibility.state.backgroundImageEnabled;
    const bgImage = SETTINGS.accessibility.state.backgroundImage;
    const bgMode = SETTINGS.accessibility.state.backgroundImageMode || "cover";
    const bgContainColor =
      SETTINGS.accessibility.state.backgroundImageContainColor ||
      "rgba(0, 0, 0, 1)";

    if (bgImageEnabled && bgImage) {
      document.body.style.backgroundImage = `url('${bgImage}')`;
      document.body.style.backgroundSize = bgMode;
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundRepeat = "no-repeat";
      if (bgMode === "contain") {
        document.body.style.setProperty(
          "background-color",
          bgContainColor,
          "important",
        );
      } else {
        document.body.style.setProperty(
          "background-color",
          "transparent",
          "important",
        );
      }
    } else {
      // Just clear the background image, keep body transparent
      document.body.style.backgroundImage = "";
      document.body.style.backgroundSize = "";
      document.body.style.backgroundPosition = "";
      document.body.style.backgroundRepeat = "";
      document.body.style.setProperty(
        "background-color",
        "transparent",
        "important",
      );
    }
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

</script>

<!-- flex flex-col min-h-screen → makes the page stretch full height and stack header, body, and footer. -->
<!-- flex-1 on <main> → makes the body expand to fill leftover space, pushing the footer down. -->
<div
  class="flex h-screen flex-col bg-background-live text-[13px] text-foreground font-sans rounded-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]"
  style="padding: {SETTINGS.live.headerCustomization.state.windowPadding}px"
  data-tauri-drag-region
>
  <HeaderCustom />
  <main
    bind:this={mainElement}
    class="flex-1 overflow-y-auto gap-4 rounded-lg bg-card/20"
  >
    {@render children()}
  </main>
  <!-- Footer removed; navigation and version moved into Header -->
  <NotificationToast bind:this={notificationToast} />
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
