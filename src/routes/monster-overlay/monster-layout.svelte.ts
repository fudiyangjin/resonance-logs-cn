import { SETTINGS, ensureTeammatePanelStyle } from "$lib/settings-store";
import {
  createReferenceSession,
  disableSiblingReference,
  enableSiblingReference,
} from "$lib/overlay-reference";
import {
  DEFAULT_MONSTER_OVERLAY_POSITIONS,
  DEFAULT_MONSTER_OVERLAY_SIZES,
  DEFAULT_MONSTER_OVERLAY_VISIBILITY,
  MAX_MONSTER_PANEL_SCALE,
  MIN_MONSTER_PANEL_SCALE,
} from "./monster-constants";
import { monsterRuntime } from "./monster-runtime.svelte.js";
import type { MonsterDragTarget, MonsterResizeTarget } from "./monster-types";

const GAME_OVERLAY_LABEL = "game-overlay";
const GAME_OVERLAY_REFERENCE_EVENT = "game-overlay-reference-toggle";
// Active-role session: this overlay driving the game-overlay as its reference.
const referenceSession = createReferenceSession();

function patchMonsterMonitor(
  updater: (
    state: typeof SETTINGS.monsterMonitor.state,
  ) => Partial<typeof SETTINGS.monsterMonitor.state>,
) {
  Object.assign(
    SETTINGS.monsterMonitor.state,
    updater(SETTINGS.monsterMonitor.state),
  );
}

function clampPanelScale(value: number) {
  return Math.max(
    MIN_MONSTER_PANEL_SCALE,
    Math.min(MAX_MONSTER_PANEL_SCALE, value),
  );
}

export function setMonsterOverlayWindow(
  currentWindow: typeof monsterRuntime.currentWindow,
) {
  monsterRuntime.currentWindow = currentWindow;
}

export function getMonsterOverlayPositions() {
  return {
    ...DEFAULT_MONSTER_OVERLAY_POSITIONS,
    ...(SETTINGS.monsterMonitor.state.overlayPositions ?? {}),
  };
}

export function getMonsterOverlaySizes() {
  return {
    ...DEFAULT_MONSTER_OVERLAY_SIZES,
    ...(SETTINGS.monsterMonitor.state.overlaySizes ?? {}),
  };
}

export function getMonsterOverlayVisibility() {
  return {
    ...DEFAULT_MONSTER_OVERLAY_VISIBILITY,
    ...(SETTINGS.monsterMonitor.state.overlayVisibility ?? {}),
  };
}

export function getMonsterPanelPosition() {
  return getMonsterOverlayPositions().monsterBuffPanel;
}

export function getMonsterPanelScale() {
  return getMonsterOverlaySizes().monsterBuffPanelScale;
}

export function getTeammatePanelPosition() {
  return getMonsterOverlayPositions().teammateBuffPanel;
}

export function getTeammatePanelScale() {
  return getMonsterOverlaySizes().teammateBuffPanelScale;
}

export function getHatePanelPosition() {
  return getMonsterOverlayPositions().hatePanel;
}

export function getHatePanelScale() {
  return getMonsterOverlaySizes().hatePanelScale;
}

export function getFantasyPanelPosition() {
  return getMonsterOverlayPositions().fantasyPanel;
}

export function getFantasyPanelScale() {
  return getMonsterOverlaySizes().fantasyPanelScale;
}

export function getDbmPanelPosition() {
  return getMonsterOverlayPositions().bossDbmPanel;
}

export function getDbmPanelScale() {
  return getMonsterOverlaySizes().bossDbmPanelScale;
}

export function monsterPanelStyle() {
  return SETTINGS.monsterMonitor.state.panelStyle;
}

export function dbmPanelStyle() {
  return (
    SETTINGS.monsterMonitor.state.bossDbmPanelStyle ??
    SETTINGS.monsterMonitor.state.panelStyle
  );
}

export function hatePanelStyle() {
  return (
    SETTINGS.monsterMonitor.state.hatePanelStyle ??
    SETTINGS.monsterMonitor.state.panelStyle
  );
}

export function teammatePanelStyle() {
  return ensureTeammatePanelStyle(
    SETTINGS.monsterMonitor.state.teammatePanelStyle ??
      SETTINGS.monsterMonitor.state.panelStyle,
  );
}

export function fantasyPanelStyle() {
  return (
    SETTINGS.monsterMonitor.state.fantasyPanelStyle ??
    SETTINGS.monsterMonitor.state.panelStyle
  );
}

export function setMonsterPanelPosition(nextPos: { x: number; y: number }) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      monsterBuffPanel: nextPos,
    },
  }));
}

export function setMonsterPanelScale(value: number) {
  patchMonsterMonitor(() => ({
    overlaySizes: {
      ...getMonsterOverlaySizes(),
      monsterBuffPanelScale: clampPanelScale(value),
    },
  }));
}

export function setTeammatePanelPosition(nextPos: { x: number; y: number }) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      teammateBuffPanel: nextPos,
    },
  }));
}

export function setTeammatePanelScale(value: number) {
  patchMonsterMonitor(() => ({
    overlaySizes: {
      ...getMonsterOverlaySizes(),
      teammateBuffPanelScale: clampPanelScale(value),
    },
  }));
}

export function setHatePanelPosition(nextPos: { x: number; y: number }) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      hatePanel: nextPos,
    },
  }));
}

export function setHatePanelScale(value: number) {
  patchMonsterMonitor(() => ({
    overlaySizes: {
      ...getMonsterOverlaySizes(),
      hatePanelScale: clampPanelScale(value),
    },
  }));
}

export function setFantasyPanelPosition(nextPos: { x: number; y: number }) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      fantasyPanel: nextPos,
    },
  }));
}

export function setFantasyPanelScale(value: number) {
  patchMonsterMonitor(() => ({
    overlaySizes: {
      ...getMonsterOverlaySizes(),
      fantasyPanelScale: clampPanelScale(value),
    },
  }));
}

export function setDbmPanelPosition(nextPos: { x: number; y: number }) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      bossDbmPanel: nextPos,
    },
  }));
}

export function setDbmPanelScale(value: number) {
  patchMonsterMonitor(() => ({
    overlaySizes: {
      ...getMonsterOverlaySizes(),
      bossDbmPanelScale: clampPanelScale(value),
    },
  }));
}

export async function setMonsterEditMode(editing: boolean) {
  monsterRuntime.isEditing = editing;
  if (monsterRuntime.currentWindow) {
    await monsterRuntime.currentWindow.setIgnoreCursorEvents(!editing);
  }
  if (editing) {
    await enableSiblingReference({
      self: monsterRuntime.currentWindow,
      siblingLabel: GAME_OVERLAY_LABEL,
      referenceEvent: GAME_OVERLAY_REFERENCE_EVENT,
      session: referenceSession,
    });
  } else {
    await disableSiblingReference({
      siblingLabel: GAME_OVERLAY_LABEL,
      referenceEvent: GAME_OVERLAY_REFERENCE_EVENT,
      session: referenceSession,
    });
  }
}

// Passive role: this overlay is shown beneath the game-overlay as its reference
// layer. Only toggles the scaffold flag; does not touch cursor events.
export function setMonsterReferenceMode(enabled: boolean) {
  monsterRuntime.isReferenceMode = enabled;
}

export function startMonsterDrag(
  event: PointerEvent,
  target: MonsterDragTarget,
  startPos: { x: number; y: number },
) {
  if (!monsterRuntime.isEditing) return;
  event.preventDefault();
  event.stopPropagation();
  monsterRuntime.dragState = {
    target,
    startX: event.clientX,
    startY: event.clientY,
    startPos,
  };
}

export function startMonsterResize(
  event: PointerEvent,
  target: MonsterResizeTarget,
  startValue: number,
) {
  if (!monsterRuntime.isEditing) return;
  event.preventDefault();
  event.stopPropagation();
  monsterRuntime.resizeState = {
    target,
    startX: event.clientX,
    startY: event.clientY,
    startValue,
  };
}

export function onGlobalPointerMove(event: PointerEvent) {
  if (monsterRuntime.dragState) {
    const deltaX = event.clientX - monsterRuntime.dragState.startX;
    const deltaY = event.clientY - monsterRuntime.dragState.startY;
    const nextPos = {
      x: Math.max(0, Math.round(monsterRuntime.dragState.startPos.x + deltaX)),
      y: Math.max(0, Math.round(monsterRuntime.dragState.startPos.y + deltaY)),
    };
    if (monsterRuntime.dragState.target.kind === "buffPanel") {
      setMonsterPanelPosition(nextPos);
    } else if (monsterRuntime.dragState.target.kind === "teammatePanel") {
      setTeammatePanelPosition(nextPos);
    } else if (monsterRuntime.dragState.target.kind === "hatePanel") {
      setHatePanelPosition(nextPos);
    } else if (monsterRuntime.dragState.target.kind === "dbmPanel") {
      setDbmPanelPosition(nextPos);
    } else {
      setFantasyPanelPosition(nextPos);
    }
  }

  if (monsterRuntime.resizeState) {
    const deltaX = event.clientX - monsterRuntime.resizeState.startX;
    const deltaY = event.clientY - monsterRuntime.resizeState.startY;
    const delta = (deltaX + deltaY) / 300;
    if (monsterRuntime.resizeState.target.kind === "buffPanel") {
      setMonsterPanelScale(monsterRuntime.resizeState.startValue + delta);
    } else if (monsterRuntime.resizeState.target.kind === "teammatePanel") {
      setTeammatePanelScale(monsterRuntime.resizeState.startValue + delta);
    } else if (monsterRuntime.resizeState.target.kind === "hatePanel") {
      setHatePanelScale(monsterRuntime.resizeState.startValue + delta);
    } else if (monsterRuntime.resizeState.target.kind === "dbmPanel") {
      setDbmPanelScale(monsterRuntime.resizeState.startValue + delta);
    } else {
      setFantasyPanelScale(monsterRuntime.resizeState.startValue + delta);
    }
  }
}

export function onGlobalPointerUp() {
  monsterRuntime.dragState = null;
  monsterRuntime.resizeState = null;
}

export async function onWindowDragPointerDown(event: PointerEvent) {
  if (!monsterRuntime.currentWindow) return;
  event.preventDefault();
  await monsterRuntime.currentWindow.startDragging();
}

export function resetMonsterOverlayPositions() {
  patchMonsterMonitor(() => ({
    overlayPositions: { ...DEFAULT_MONSTER_OVERLAY_POSITIONS },
  }));
}

export function resetMonsterOverlaySizes() {
  patchMonsterMonitor(() => ({
    overlaySizes: { ...DEFAULT_MONSTER_OVERLAY_SIZES },
  }));
}
