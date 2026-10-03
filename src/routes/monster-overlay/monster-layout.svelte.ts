import {
  SETTINGS,
  ensureTeammateCdPanelStyle,
  ensureTeammatePanelStyle,
  type MonsterOverlayPositions,
  type TeammateCdSlotKind,
} from "$lib/settings-store";
import { normalizeCustomPanelStyle } from "$lib/skill-monitor-normalize";
import {
  DEFAULT_MONSTER_OVERLAY_POSITIONS,
  DEFAULT_MONSTER_OVERLAY_SIZES,
  DEFAULT_MONSTER_OVERLAY_VISIBILITY,
  MAX_MONSTER_PANEL_SCALE,
  MIN_MONSTER_PANEL_SCALE,
} from "./monster-constants";
import { monsterRuntime } from "./monster-runtime.svelte.js";
import type { MonsterDragTarget, MonsterResizeTarget } from "./monster-types";

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

export function getTeammateCdPanelPosition() {
  return getMonsterOverlayPositions().teammateCdPanel;
}

export function getTeammateCdPanelScale() {
  return getMonsterOverlaySizes().teammateCdPanelScale;
}

const TEAMMATE_CD_SLOT_POSITION_KEYS = {
  five: "teammateCdSlotsFive",
  twenty: "teammateCdSlotsTwenty",
} as const satisfies Record<TeammateCdSlotKind, keyof MonsterOverlayPositions>;

/** First row of a teammate CD grid; only set by dragging it in edit mode. */
export function getTeammateCdSlotsPosition(kind: TeammateCdSlotKind) {
  return getMonsterOverlayPositions()[TEAMMATE_CD_SLOT_POSITION_KEYS[kind]];
}

export function teammateCdPanelStyle() {
  return ensureTeammateCdPanelStyle(
    SETTINGS.monsterMonitor.state.teammateCdPanelStyle,
  );
}

export function getHatePanelPosition() {
  return getMonsterOverlayPositions().hatePanel;
}

export function getHatePanelScale() {
  return getMonsterOverlaySizes().hatePanelScale;
}

export function getStunPanelPosition() {
  return getMonsterOverlayPositions().stunPanel;
}

export function getStunPanelScale() {
  return getMonsterOverlaySizes().stunPanelScale;
}

export function getHpPanelPosition() {
  return getMonsterOverlayPositions().hpPanel;
}

export function getHpPanelScale() {
  return getMonsterOverlaySizes().hpPanelScale;
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

export function getEntityDurationPanelPosition() {
  return getMonsterOverlayPositions().entityDurationPanel;
}

export function getEntityDurationPanelScale() {
  return getMonsterOverlaySizes().entityDurationPanelScale;
}

export function entityDurationPanelStyle() {
  return normalizeCustomPanelStyle(
    SETTINGS.monsterMonitor.state.entityDurationPanelStyle ??
      SETTINGS.monsterMonitor.state.panelStyle,
  );
}

export function monsterPanelStyle() {
  return normalizeCustomPanelStyle(SETTINGS.monsterMonitor.state.panelStyle);
}

export function dbmPanelStyle() {
  return normalizeCustomPanelStyle(
    SETTINGS.monsterMonitor.state.bossDbmPanelStyle ??
      SETTINGS.monsterMonitor.state.panelStyle,
  );
}

export function hatePanelStyle() {
  return normalizeCustomPanelStyle(
    SETTINGS.monsterMonitor.state.hatePanelStyle ??
      SETTINGS.monsterMonitor.state.panelStyle,
  );
}

export function stunPanelStyle() {
  return normalizeCustomPanelStyle(
    SETTINGS.monsterMonitor.state.stunPanelStyle ??
      SETTINGS.monsterMonitor.state.panelStyle,
  );
}

export function hpPanelStyle() {
  return normalizeCustomPanelStyle(
    SETTINGS.monsterMonitor.state.hpPanelStyle ??
      SETTINGS.monsterMonitor.state.panelStyle,
  );
}

export function teammatePanelStyle() {
  return ensureTeammatePanelStyle(
    SETTINGS.monsterMonitor.state.teammatePanelStyle ??
      SETTINGS.monsterMonitor.state.panelStyle,
  );
}

/** Raw per-column color overrides; validated where they are resolved. */
export function teammateBuffColumnStyles() {
  return SETTINGS.monsterMonitor.state.teammateBuffColumnStyles;
}

export function fantasyPanelStyle() {
  return normalizeCustomPanelStyle(
    SETTINGS.monsterMonitor.state.fantasyPanelStyle ??
      SETTINGS.monsterMonitor.state.panelStyle,
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

export function setTeammateCdPanelPosition(nextPos: { x: number; y: number }) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      teammateCdPanel: nextPos,
    },
  }));
}

export function setTeammateCdPanelScale(value: number) {
  patchMonsterMonitor(() => ({
    overlaySizes: {
      ...getMonsterOverlaySizes(),
      teammateCdPanelScale: clampPanelScale(value),
    },
  }));
}

export function setTeammateCdSlotsPosition(
  kind: TeammateCdSlotKind,
  nextPos: { x: number; y: number },
) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      [TEAMMATE_CD_SLOT_POSITION_KEYS[kind]]: nextPos,
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

export function setStunPanelPosition(nextPos: { x: number; y: number }) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      stunPanel: nextPos,
    },
  }));
}

export function setStunPanelScale(value: number) {
  patchMonsterMonitor(() => ({
    overlaySizes: {
      ...getMonsterOverlaySizes(),
      stunPanelScale: clampPanelScale(value),
    },
  }));
}

export function setHpPanelPosition(nextPos: { x: number; y: number }) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      hpPanel: nextPos,
    },
  }));
}

export function setHpPanelScale(value: number) {
  patchMonsterMonitor(() => ({
    overlaySizes: {
      ...getMonsterOverlaySizes(),
      hpPanelScale: clampPanelScale(value),
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

export function setEntityDurationPanelPosition(nextPos: {
  x: number;
  y: number;
}) {
  patchMonsterMonitor(() => ({
    overlayPositions: {
      ...getMonsterOverlayPositions(),
      entityDurationPanel: nextPos,
    },
  }));
}

export function setEntityDurationPanelScale(value: number) {
  patchMonsterMonitor(() => ({
    overlaySizes: {
      ...getMonsterOverlaySizes(),
      entityDurationPanelScale: clampPanelScale(value),
    },
  }));
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
    nextPos: startPos,
    element: previewElement(event),
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
    nextValue: startValue,
    element: previewElement(event),
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
    monsterRuntime.dragState.nextPos = nextPos;
    scheduleLayoutPreview();
  }

  if (monsterRuntime.resizeState) {
    const deltaX = event.clientX - monsterRuntime.resizeState.startX;
    const deltaY = event.clientY - monsterRuntime.resizeState.startY;
    const delta = (deltaX + deltaY) / 300;
    monsterRuntime.resizeState.nextValue = clampPanelScale(
      monsterRuntime.resizeState.startValue + delta,
    );
    scheduleLayoutPreview();
  }
}

export function onGlobalPointerUp() {
  cancelScheduledLayoutPreview();
  commitDragPreview();
  commitResizePreview();
  clearLayoutPreviewStyles();
  monsterRuntime.dragState = null;
  monsterRuntime.resizeState = null;
}

function previewElement(event: PointerEvent): HTMLElement | null {
  const current = event.currentTarget;
  if (!(current instanceof HTMLElement)) return null;
  return current.classList.contains("overlay-group")
    ? current
    : current.closest<HTMLElement>(".overlay-group");
}

function scheduleLayoutPreview() {
  if (monsterRuntime.layoutPreviewRafId !== null) return;
  monsterRuntime.layoutPreviewRafId = window.requestAnimationFrame(() => {
    monsterRuntime.layoutPreviewRafId = null;
    applyLayoutPreviewStyles();
  });
}

function cancelScheduledLayoutPreview() {
  if (monsterRuntime.layoutPreviewRafId === null) return;
  window.cancelAnimationFrame(monsterRuntime.layoutPreviewRafId);
  monsterRuntime.layoutPreviewRafId = null;
}

function applyLayoutPreviewStyles() {
  const drag = monsterRuntime.dragState;
  if (drag?.element) {
    drag.element.style.translate = `${drag.nextPos.x - drag.startPos.x}px ${
      drag.nextPos.y - drag.startPos.y
    }px`;
  }
  const resize = monsterRuntime.resizeState;
  if (resize?.element) {
    const ratio =
      resize.startValue > 0 ? resize.nextValue / resize.startValue : 1;
    resize.element.style.scale = String(ratio);
  }
}

function clearLayoutPreviewStyles() {
  const elements = [
    monsterRuntime.dragState?.element,
    monsterRuntime.resizeState?.element,
  ];
  for (const element of elements) {
    if (!element) continue;
    element.style.removeProperty("translate");
    element.style.removeProperty("scale");
  }
}

function commitDragPreview() {
  const drag = monsterRuntime.dragState;
  if (!drag) return;
  const nextPos = drag.nextPos;
  if (drag.target.kind === "buffPanel") {
    setMonsterPanelPosition(nextPos);
  } else if (drag.target.kind === "teammatePanel") {
    setTeammatePanelPosition(nextPos);
  } else if (drag.target.kind === "teammateCdPanel") {
    setTeammateCdPanelPosition(nextPos);
  } else if (drag.target.kind === "teammateCdSlots") {
    setTeammateCdSlotsPosition(drag.target.grid, nextPos);
  } else if (drag.target.kind === "hatePanel") {
    setHatePanelPosition(nextPos);
  } else if (drag.target.kind === "stunPanel") {
    setStunPanelPosition(nextPos);
  } else if (drag.target.kind === "hpPanel") {
    setHpPanelPosition(nextPos);
  } else if (drag.target.kind === "dbmPanel") {
    setDbmPanelPosition(nextPos);
  } else if (drag.target.kind === "entityDurationPanel") {
    setEntityDurationPanelPosition(nextPos);
  } else {
    setFantasyPanelPosition(nextPos);
  }
}

function commitResizePreview() {
  const resize = monsterRuntime.resizeState;
  if (!resize) return;
  const nextValue = resize.nextValue;
  if (resize.target.kind === "buffPanel") {
    setMonsterPanelScale(nextValue);
  } else if (resize.target.kind === "teammatePanel") {
    setTeammatePanelScale(nextValue);
  } else if (resize.target.kind === "teammateCdPanel") {
    setTeammateCdPanelScale(nextValue);
  } else if (resize.target.kind === "hatePanel") {
    setHatePanelScale(nextValue);
  } else if (resize.target.kind === "stunPanel") {
    setStunPanelScale(nextValue);
  } else if (resize.target.kind === "hpPanel") {
    setHpPanelScale(nextValue);
  } else if (resize.target.kind === "dbmPanel") {
    setDbmPanelScale(nextValue);
  } else if (resize.target.kind === "entityDurationPanel") {
    setEntityDurationPanelScale(nextValue);
  } else {
    setFantasyPanelScale(nextValue);
  }
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
