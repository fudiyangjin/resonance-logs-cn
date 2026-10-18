import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getAvailableBuffDefinitions } from "$lib/config/buff-name-table";
import {
  HUD_EDIT_REQUEST_EVENT,
  HUD_OVERLAY_LABEL,
  HUD_READY_EVENT,
  HUD_STATE_SYNC_EVENT,
  type HudStateSyncEvent,
} from "$lib/hud-overlay";
import { emitLivePullGate, listenLivePullGate } from "$lib/live-pull-gate";
import {
  hudOverlaySession,
  type HudInterests,
} from "$lib/stores/live-window-sessions.svelte";
import {
  clearHudProjectionDeadline,
  setHudProjectionDeadline,
  setOverlayClockActive,
} from "$lib/hud-temporal.svelte.js";
import {
  ensureBuffGroups,
  ensureCustomPanelGroups,
  ensureIndividualMonitorAllGroup,
  ensureOverlayPositions,
  ensureOverlaySizes,
  ensureOverlayVisibility,
  ensureTextBuffPanelStyle,
} from "../game-overlay/overlay-utils";
import {
  activeProfile,
  updateActiveProfile,
} from "../game-overlay/overlay-profile.svelte.js";
import { overlayRuntime } from "../game-overlay/overlay-runtime.svelte.js";
import {
  GAME_PROJECTION_DEADLINE_SOURCE,
  nextOverlayProjectionDeadline,
} from "../game-overlay/overlay-display.svelte.js";
import {
  onGlobalPointerMove as onGamePointerMove,
  onGlobalPointerUp as onGamePointerUp,
} from "../game-overlay/overlay-layout.svelte.js";
import {
  clearMonsterProjectionDeadlines,
  resetMonsterTeammateDisplayStabilizer,
  syncMonsterProjectionDeadlines,
  updateMonsterDisplay,
} from "../monster-overlay/monster-display.svelte.js";
import {
  onGlobalPointerMove as onMonsterPointerMove,
  onGlobalPointerUp as onMonsterPointerUp,
} from "../monster-overlay/monster-layout.svelte.js";
import { monsterRuntime } from "../monster-overlay/monster-runtime.svelte.js";
import {
  clearMinimapLayerState,
  handleHudMinimapFrame,
} from "../minimap-overlay/minimap-frame";
import { minimapRuntime } from "../minimap-overlay/minimap-runtime.svelte.js";
import {
  applyHudEditingState,
  attachHudWindow,
  detachHudWindow,
  hasVisibleHudDomain,
  hudRuntime,
  hudVisibility,
  isHudDomainVisible,
  isHudEditing,
  setHudDomainVisible,
} from "./hud-runtime.svelte.js";
import { migrateLegacyHudLayout } from "./hud-layout-migration";
import { beginHudEditSession, endHudEditSession } from "./hud-edit-session";

const HUD_READY_RETRY_MS = 500;
let hudLayoutReady: Promise<void> | null = null;
let desiredHudEditing = false;
let hudEditTransition = Promise.resolve();

export function initHudOverlay(): () => void {
  if (hudRuntime.cleanup) return hudRuntime.cleanup;
  if (typeof window === "undefined") return () => {};

  const currentWindow = getCurrentWindow();
  attachHudWindow(currentWindow);
  overlayRuntime.isMounted = true;
  overlayRuntime.isInitialized = true;
  monsterRuntime.isMounted = true;
  monsterRuntime.isInitialized = true;
  minimapRuntime.isMounted = true;
  minimapRuntime.isInitialized = true;

  document.documentElement.style.setProperty(
    "background",
    "transparent",
    "important",
  );
  document.body.style.setProperty("background", "transparent", "important");

  ensureActiveProfileDefaults();
  loadAvailableBuffs();
  applyHudEditingState(false);
  desiredHudEditing = false;
  const clickThroughReady = currentWindow
    .setIgnoreCursorEvents(true)
    .catch((error) => {
      console.error("[hud-overlay] failed to initialize click-through", error);
    });
  hudLayoutReady = migrateLegacyHudLayout().catch((error) => {
    console.error("[hud-overlay] layout migration failed", error);
  });

  hudOverlaySession.setMinimapFrameHandler(handleHudMinimapFrame);
  hudOverlaySession.start();

  let visibilitySynchronized = false;
  let readyRetryTimer: ReturnType<typeof setInterval> | null = null;
  const unlistenStateSync = listen<HudStateSyncEvent>(
    HUD_STATE_SYNC_EVENT,
    (event) => {
      void hudLayoutReady?.then(async () => {
        const { visibility, editing } = event.payload;
        setHudDomainVisible("game", visibility.game);
        setHudDomainVisible("monster", visibility.monster);
        setHudDomainVisible("minimap", visibility.minimap);
        await setHudEditMode(editing);
        visibilitySynchronized = true;
        if (readyRetryTimer !== null) {
          clearInterval(readyRetryTimer);
          readyRetryTimer = null;
        }
      });
    },
  );
  const unlistenPullGate = listenLivePullGate(
    HUD_OVERLAY_LABEL,
    hudOverlaySession,
  );
  void Promise.all([
    unlistenStateSync,
    unlistenPullGate,
    clickThroughReady,
    hudLayoutReady,
  ]).then(() => {
    if (hudRuntime.cleanup === null) return;
    const announceReady = () => {
      if (!visibilitySynchronized) void emit(HUD_READY_EVENT);
    };
    announceReady();
    readyRetryTimer = setInterval(announceReady, HUD_READY_RETRY_MS);
  });

  let minimapWasInterested = false;
  const stopInterests = $effect.root(() => {
    $effect(() => {
      const interests = currentHudInterests();
      hudOverlaySession.setInterests(interests);
      if (minimapWasInterested && !interests.minimap) {
        clearMinimapLayerState();
      }
      minimapWasInterested = interests.minimap;
    });
  });

  const stopClockLifecycle = $effect.root(() => {
    $effect(() => {
      setOverlayClockActive(
        hudOverlaySession.active && (isHudEditing() || hasVisibleHudDomain()),
      );
    });
    return () => setOverlayClockActive(false);
  });

  const stopGameProjection = $effect.root(() => {
    $effect(() => {
      if (
        !hudOverlaySession.active ||
        (!isHudEditing() && !isHudDomainVisible("game"))
      ) {
        clearHudProjectionDeadline(GAME_PROJECTION_DEADLINE_SOURCE);
        return;
      }
      setHudProjectionDeadline(
        GAME_PROJECTION_DEADLINE_SOURCE,
        nextOverlayProjectionDeadline(),
      );
    });
    return () => clearHudProjectionDeadline(GAME_PROJECTION_DEADLINE_SOURCE);
  });

  const stopMonsterProjection = $effect.root(() => {
    $effect(() => {
      if (
        !hudOverlaySession.active ||
        (!isHudEditing() && !isHudDomainVisible("monster"))
      ) {
        clearMonsterDisplay();
        clearMonsterProjectionDeadlines();
        return;
      }
      updateMonsterDisplay();
      syncMonsterProjectionDeadlines();
    });
  });

  const handlePointerMove = (event: PointerEvent) => {
    onGamePointerMove(event);
    onMonsterPointerMove(event);
  };
  const handlePointerUp = () => {
    onGamePointerUp();
    onMonsterPointerUp();
  };
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);

  hudRuntime.cleanup = () => {
    stopInterests();
    stopGameProjection();
    stopMonsterProjection();
    stopClockLifecycle();
    clearMonsterProjectionDeadlines();
    if (readyRetryTimer !== null) clearInterval(readyRetryTimer);
    void unlistenStateSync.then((unlisten) => unlisten());
    void unlistenPullGate.then((unlisten) => unlisten());
    hudOverlaySession.setMinimapFrameHandler(null);
    hudOverlaySession.stop();
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    clearMonsterDisplay();
    clearMinimapLayerState();
    overlayRuntime.isMounted = false;
    overlayRuntime.isInitialized = false;
    monsterRuntime.isMounted = false;
    monsterRuntime.isInitialized = false;
    minimapRuntime.isMounted = false;
    minimapRuntime.isInitialized = false;
    applyHudEditingState(false);
    endHudEditSession();
    detachHudWindow();
    hudLayoutReady = null;
    hudRuntime.cleanup = null;
  };

  return hudRuntime.cleanup;
}

export async function setHudEditMode(editing: boolean): Promise<void> {
  desiredHudEditing = editing;
  const transition = hudEditTransition.then(() =>
    applyHudEditMode(desiredHudEditing),
  );
  hudEditTransition = transition.catch((error) => {
    console.error("[hud-overlay] failed to switch edit mode", error);
  });
  return transition;
}

export async function finishHudEditing(): Promise<void> {
  await setHudEditMode(false);
  await emit(HUD_EDIT_REQUEST_EVENT, { editing: false });
}

async function applyHudEditMode(editing: boolean): Promise<void> {
  await hudLayoutReady;
  if (hudRuntime.editing === editing) return;

  const currentWindow = hudRuntime.currentWindow;
  if (editing) await beginHudEditSession(currentWindow);
  if (currentWindow) {
    // Click-through is the latency-sensitive side effect when editing ends.
    // Apply it before any reactive projection or cross-window notification.
    await currentWindow.setIgnoreCursorEvents(!editing);
  }
  applyHudEditingState(editing);
  if (!editing) endHudEditSession();
  if (!currentWindow) return;

  if (editing) {
    await currentWindow.show();
    await currentWindow.unminimize();
    await emitLivePullGate(currentWindow, true);
    await currentWindow.setFocus();
    return;
  }

  if (!hasVisibleHudDomain()) {
    await emitLivePullGate(currentWindow, false);
    await currentWindow.hide();
  }
}

export function onHudCanvasPointerDown(event: PointerEvent): void {
  if (!hudRuntime.editing || event.button !== 0 || !hudRuntime.currentWindow) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (
    target?.closest(
      ".overlay-group,.edit-banner,.window-drag-bar,button,a,input,textarea,select",
    )
  ) {
    return;
  }
  event.preventDefault();
  void hudRuntime.currentWindow.startDragging();
}

export function startHudWindowDrag(event: PointerEvent): void {
  if (!hudRuntime.editing || event.button !== 0 || !hudRuntime.currentWindow) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  void hudRuntime.currentWindow.startDragging();
}

function currentHudInterests(): HudInterests {
  const editing = isHudEditing();
  const visibility = hudVisibility();
  return {
    game: editing || visibility.game,
    monster: editing || visibility.monster,
    minimap: editing || visibility.minimap,
  };
}

function loadAvailableBuffs(): void {
  overlayRuntime.buffDefinitions = new Map(
    getAvailableBuffDefinitions().map((buff) => [buff.baseId, buff]),
  );
}

function ensureActiveProfileDefaults(): void {
  const profile = activeProfile();
  if (
    !profile ||
    (profile.overlayPositions &&
      profile.overlaySizes &&
      profile.overlayVisibility &&
      profile.buffDisplayMode &&
      profile.buffGroups &&
      profile.customPanelGroups &&
      !profile.customPanelGroups.some((group) => !group.style || !group.kind) &&
      profile.textBuffPanelStyle &&
      profile.textBuffMaxVisible)
  ) {
    return;
  }

  updateActiveProfile((current) => ({
    ...current,
    overlayPositions: ensureOverlayPositions(current),
    overlaySizes: ensureOverlaySizes(current),
    overlayVisibility: ensureOverlayVisibility(current),
    buffDisplayMode: current.buffDisplayMode ?? "individual",
    buffGroups: ensureBuffGroups(current),
    individualMonitorAllGroup: ensureIndividualMonitorAllGroup(current),
    customPanelGroups: ensureCustomPanelGroups(current),
    inlineBuffEntries: [],
    textBuffPanelStyle: ensureTextBuffPanelStyle(current),
    textBuffMaxVisible: Math.max(
      1,
      Math.min(20, current.textBuffMaxVisible ?? 10),
    ),
  }));
}

function clearMonsterDisplay(): void {
  resetMonsterTeammateDisplayStabilizer();
  monsterRuntime.bossSections = [];
  monsterRuntime.teammateColumns = [];
  monsterRuntime.teammateRows = [];
  monsterRuntime.hateSections = [];
  monsterRuntime.stunSections = [];
  monsterRuntime.hpSections = [];
  monsterRuntime.fantasyRows = [];
  monsterRuntime.dbmRows = [];
  monsterRuntime.entityDurationRows = [];
  monsterRuntime.monsterSkillRows = [];
}
