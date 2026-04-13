import {
  DEFAULT_OVERLAY_POSITIONS,
  DEFAULT_OVERLAY_SIZES,
} from "./overlay-constants";
import { type BuffCategoryKey } from "$lib/config/buff-name-table";
import { activeProfile, updateActiveProfile } from "./overlay-profile.svelte.js";
import {
  overlayRuntime,
} from "./overlay-runtime.svelte.js";
import {
  iconDisplayBuffs,
  skillDurationDisplays,
} from "./overlay-display.svelte.js";
import type { DragTarget, IconBuffDisplay, ResizeTarget } from "./overlay-types";
import {
  ensureBuffGroups,
  ensureCustomPanelGroups,
  ensureIndividualMonitorAllGroup,
  ensureOverlayPositions,
  ensureOverlaySizes,
} from "./overlay-utils";

type OverlayPositionKey = keyof Omit<
  typeof DEFAULT_OVERLAY_POSITIONS,
  "iconBuffPositions" | "standaloneIconPositions" | "skillDurationPositions" | "categoryIconPositions"
>;
type OverlaySizeKey = keyof Omit<
  typeof DEFAULT_OVERLAY_SIZES,
  "iconBuffSizes" | "standaloneIconSizes" | "skillDurationSizes" | "categoryIconSizes"
>;

function clampGroupScale(value: number) {
  return Math.max(0.5, Math.min(2.5, value));
}

function clampIconSize(value: number) {
  return Math.max(24, Math.min(120, Math.round(value)));
}

function getLegacyStandaloneIconPositionRecord() {
  const record = getOverlayPositions().iconBuffPositions as Record<string, { x: number; y: number }>;
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => Number.isNaN(Number(key))),
  ) as Record<string, { x: number; y: number }>;
}

function getStandaloneIconPositionRecord() {
  return (getOverlayPositions().standaloneIconPositions ?? {}) as Record<string, { x: number; y: number }>;
}

function getLegacyStandaloneIconSizeRecord() {
  const record = getOverlaySizes().iconBuffSizes as Record<string, number>;
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => Number.isNaN(Number(key))),
  ) as Record<string, number>;
}

function getStandaloneIconSizeRecord() {
  return (getOverlaySizes().standaloneIconSizes ?? {}) as Record<string, number>;
}

export function hasStandaloneIconPosition(layoutKey: string) {
  return getStandaloneIconPositionRecord()[layoutKey] !== undefined;
}

export function hasStandaloneIconSize(layoutKey: string) {
  return getStandaloneIconSizeRecord()[layoutKey] !== undefined;
}

function updateOverlaySizes(
  updater: (
    sizes: ReturnType<typeof ensureOverlaySizes>,
  ) => ReturnType<typeof ensureOverlaySizes>,
) {
  updateActiveProfile((profile) => ({
    ...profile,
    overlaySizes: updater(ensureOverlaySizes(profile)),
  }));
}

function updateOverlayPositions(
  updater: (
    positions: ReturnType<typeof ensureOverlayPositions>,
  ) => ReturnType<typeof ensureOverlayPositions>,
) {
  updateActiveProfile((profile) => ({
    ...profile,
    overlayPositions: updater(ensureOverlayPositions(profile)),
  }));
}

function updateBuffGroups(
  updater: (
    groups: ReturnType<typeof ensureBuffGroups>,
  ) => ReturnType<typeof ensureBuffGroups>,
) {
  updateActiveProfile((profile) => ({
    ...profile,
    buffGroups: updater(ensureBuffGroups(profile)),
  }));
}

function updateCustomPanelGroups(
  updater: (
    groups: ReturnType<typeof ensureCustomPanelGroups>,
  ) => ReturnType<typeof ensureCustomPanelGroups>,
) {
  updateActiveProfile((profile) => ({
    ...profile,
    customPanelGroups: updater(ensureCustomPanelGroups(profile)),
    inlineBuffEntries: [],
  }));
}

function updateIndividualAllGroup(
  updater: (
    group: NonNullable<ReturnType<typeof ensureIndividualMonitorAllGroup>>,
  ) => NonNullable<ReturnType<typeof ensureIndividualMonitorAllGroup>>,
) {
  updateActiveProfile((profile) => {
    const group = ensureIndividualMonitorAllGroup(profile);
    if (!group) return profile;
    return {
      ...profile,
      individualMonitorAllGroup: updater(group),
    };
  });
}

export function setOverlayWindow(
  currentWindow: typeof overlayRuntime.currentWindow,
) {
  overlayRuntime.currentWindow = currentWindow;
}

export function getOverlayPositions() {
  const profile = activeProfile();
  if (!profile) return DEFAULT_OVERLAY_POSITIONS;
  return ensureOverlayPositions(profile);
}

export function getOverlaySizes() {
  const profile = activeProfile();
  if (!profile) return DEFAULT_OVERLAY_SIZES;
  return ensureOverlaySizes(profile);
}

export function getGroupPosition(
  key: OverlayPositionKey,
) {
  return getOverlayPositions()[key];
}

export function getIconBuffPosition(baseId: number) {
  const positions = getOverlayPositions();
  const cached = positions.iconBuffPositions[baseId];
  if (cached) return cached;
  const idx = iconDisplayBuffs().findIndex((buff) => buff.baseId === baseId);
  return {
    x: 40 + (idx % 8) * 58,
    y: 310 + Math.floor(idx / 8) * 64,
  };
}

export function getSkillDurationPosition(skillId: number, fallbackIndex = 0) {
  const positions = getOverlayPositions();
  const cached = positions.skillDurationPositions[skillId];
  if (cached) return cached;
  const idx = skillDurationDisplays().findIndex((skill) => skill.skillId === skillId);
  const resolvedIndex = idx >= 0 ? idx : fallbackIndex;
  return {
    x: DEFAULT_OVERLAY_POSITIONS.specialBuffGroup.x + (resolvedIndex % 6) * 60,
    y:
      DEFAULT_OVERLAY_POSITIONS.specialBuffGroup.y +
      Math.floor(resolvedIndex / 6) * 72,
  };
}

export function getCategoryIconPosition(
  categoryKey: BuffCategoryKey,
  fallbackIndex = 0,
) {
  const positions = getOverlayPositions();
  const cached = positions.categoryIconPositions?.[categoryKey];
  if (cached) return cached;
  return {
    x: 40 + (fallbackIndex % 8) * 58,
    y: 310 + Math.floor(fallbackIndex / 8) * 64,
  };
}

export function getDisplayIconPosition(
  buff: IconBuffDisplay,
  fallbackIndex = 0,
) {
  if (buff.layoutKey) {
    const cached = getStandaloneIconPositionRecord()[buff.layoutKey];
    if (cached) return cached;
    const legacy = getLegacyStandaloneIconPositionRecord()[buff.layoutKey];
    if (legacy) return legacy;
  }
  if (buff.categoryKey) {
    return getCategoryIconPosition(buff.categoryKey, fallbackIndex);
  }
  return getIconBuffPosition(buff.baseId);
}

export function getGroupScale(
  key: OverlaySizeKey,
): number {
  return getOverlaySizes()[key];
}

export function setGroupScale(
  key: OverlaySizeKey,
  value: number,
) {
  const nextValue = clampGroupScale(value);
  updateOverlaySizes((sizes) => ({
    ...sizes,
    [key]: nextValue,
  }));
}

export function getIconBuffSize(baseId: number): number {
  return getOverlaySizes().iconBuffSizes[baseId] ?? 44;
}

export function getSkillDurationSize(skillId: number): number {
  return getOverlaySizes().skillDurationSizes[skillId] ?? 44;
}

export function getCategoryIconSize(categoryKey: BuffCategoryKey): number {
  return getOverlaySizes().categoryIconSizes?.[categoryKey] ?? 44;
}

export function getDisplayIconSize(buff: IconBuffDisplay): number {
  if (buff.layoutKey) {
    const cached = getStandaloneIconSizeRecord()[buff.layoutKey];
    if (cached !== undefined) return cached;
    const legacy = getLegacyStandaloneIconSizeRecord()[buff.layoutKey];
    if (legacy !== undefined) return legacy;
  }
  if (buff.categoryKey) {
    return getCategoryIconSize(buff.categoryKey);
  }
  return getIconBuffSize(buff.baseId);
}

export function setStandaloneIconSize(layoutKey: string, value: number) {
  const nextValue = clampIconSize(value);
  updateOverlaySizes((sizes) => {
    const nextLegacy = { ...(sizes.iconBuffSizes as Record<string, number>) };
    delete nextLegacy[layoutKey];
    return {
      ...sizes,
      iconBuffSizes: nextLegacy as typeof sizes.iconBuffSizes,
      standaloneIconSizes: {
        ...(sizes.standaloneIconSizes ?? {}),
        [layoutKey]: nextValue,
      },
    };
  });
}

export function setIconBuffSize(baseId: number, value: number) {
  const nextValue = clampIconSize(value);
  updateOverlaySizes((sizes) => ({
    ...sizes,
    iconBuffSizes: {
      ...sizes.iconBuffSizes,
      [baseId]: nextValue,
    },
  }));
}

export function setSkillDurationSize(skillId: number, value: number) {
  const nextValue = clampIconSize(value);
  updateOverlaySizes((sizes) => ({
    ...sizes,
    skillDurationSizes: {
      ...sizes.skillDurationSizes,
      [skillId]: nextValue,
    },
  }));
}

export function setGroupPosition(
  key: OverlayPositionKey,
  nextPos: { x: number; y: number },
) {
  updateOverlayPositions((positions) => ({
    ...positions,
    [key]: nextPos,
  }));
}

export function setIconBuffPosition(
  baseId: number,
  nextPos: { x: number; y: number },
) {
  updateOverlayPositions((positions) => ({
    ...positions,
    iconBuffPositions: {
      ...positions.iconBuffPositions,
      [baseId]: nextPos,
    },
  }));
}

export function setStandaloneIconPosition(
  layoutKey: string,
  nextPos: { x: number; y: number },
) {
  updateOverlayPositions((positions) => {
    const nextLegacy = { ...(positions.iconBuffPositions as Record<string, { x: number; y: number }>) };
    delete nextLegacy[layoutKey];
    return {
      ...positions,
      iconBuffPositions: nextLegacy as typeof positions.iconBuffPositions,
      standaloneIconPositions: {
        ...(positions.standaloneIconPositions ?? {}),
        [layoutKey]: nextPos,
      },
    };
  });
}

export function setSkillDurationPosition(
  skillId: number,
  nextPos: { x: number; y: number },
) {
  updateOverlayPositions((positions) => ({
    ...positions,
    skillDurationPositions: {
      ...positions.skillDurationPositions,
      [skillId]: nextPos,
    },
  }));
}

export function setCategoryIconPosition(
  categoryKey: BuffCategoryKey,
  nextPos: { x: number; y: number },
) {
  updateOverlayPositions((positions) => ({
    ...positions,
    categoryIconPositions: {
      ...(positions.categoryIconPositions ?? {}),
      [categoryKey]: nextPos,
    },
  }));
}

export function setBuffGroupPosition(
  groupId: string,
  nextPos: { x: number; y: number },
) {
  updateBuffGroups((groups) =>
    groups.map((group) =>
      group.id === groupId ? { ...group, position: nextPos } : group,
    ),
  );
}

export function setBuffGroupIconSize(groupId: string, value: number) {
  const nextValue = clampIconSize(value);
  updateBuffGroups((groups) =>
    groups.map((group) =>
      group.id === groupId ? { ...group, iconSize: nextValue } : group,
    ),
  );
}

export function setCustomPanelGroupPosition(
  groupId: string,
  nextPos: { x: number; y: number },
) {
  updateCustomPanelGroups((groups) =>
    groups.map((group) =>
      group.id === groupId ? { ...group, position: nextPos } : group,
    ),
  );
}

export function setCustomPanelGroupScale(groupId: string, value: number) {
  const nextValue = clampGroupScale(value);
  updateCustomPanelGroups((groups) =>
    groups.map((group) =>
      group.id === groupId ? { ...group, scale: nextValue } : group,
    ),
  );
}

export function setIndividualAllGroupPosition(nextPos: { x: number; y: number }) {
  updateIndividualAllGroup((group) => ({
    ...group,
    position: nextPos,
  }));
}

export function setIndividualAllGroupIconSize(value: number) {
  const nextValue = clampIconSize(value);
  updateIndividualAllGroup((group) => ({
    ...group,
    iconSize: nextValue,
  }));
}

export function setCategoryIconSize(categoryKey: BuffCategoryKey, value: number) {
  const nextValue = clampIconSize(value);
  updateOverlaySizes((sizes) => ({
    ...sizes,
    categoryIconSizes: {
      ...(sizes.categoryIconSizes ?? {}),
      [categoryKey]: nextValue,
    },
  }));
}

export function startDrag(
  e: PointerEvent,
  target: DragTarget,
  startPos: { x: number; y: number },
) {
  if (!overlayRuntime.isEditing || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  overlayRuntime.dragState = {
    target,
    startX: e.clientX,
    startY: e.clientY,
    startPos,
  };
}

export function startResize(
  e: PointerEvent,
  target: ResizeTarget,
  startValue: number,
) {
  if (!overlayRuntime.isEditing || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  overlayRuntime.resizeState = {
    target,
    startX: e.clientX,
    startY: e.clientY,
    startValue,
  };
}

export function onGlobalPointerMove(e: PointerEvent) {
  if (overlayRuntime.resizeState) {
    const delta =
      e.clientX - overlayRuntime.resizeState.startX +
      (e.clientY - overlayRuntime.resizeState.startY);
    if (overlayRuntime.resizeState.target.kind === "group") {
      setGroupScale(
        overlayRuntime.resizeState.target.key,
        overlayRuntime.resizeState.startValue + delta / 300,
      );
    } else if (overlayRuntime.resizeState.target.kind === "customPanelGroup") {
      setCustomPanelGroupScale(
        overlayRuntime.resizeState.target.groupId,
        overlayRuntime.resizeState.startValue + delta / 300,
      );
    } else if (overlayRuntime.resizeState.target.kind === "standaloneIcon") {
      setStandaloneIconSize(
        overlayRuntime.resizeState.target.layoutKey,
        overlayRuntime.resizeState.startValue + delta / 2,
      );
    } else if (overlayRuntime.resizeState.target.kind === "individualAllGroup") {
      setIndividualAllGroupIconSize(overlayRuntime.resizeState.startValue + delta / 2);
    } else if (overlayRuntime.resizeState.target.kind === "buffGroup") {
      setBuffGroupIconSize(
        overlayRuntime.resizeState.target.groupId,
        overlayRuntime.resizeState.startValue + delta / 2,
      );
    } else if (overlayRuntime.resizeState.target.kind === "categoryIcon") {
      setCategoryIconSize(
        overlayRuntime.resizeState.target.categoryKey,
        overlayRuntime.resizeState.startValue + delta / 2,
      );
    } else if (overlayRuntime.resizeState.target.kind === "skillDuration") {
      setSkillDurationSize(
        overlayRuntime.resizeState.target.skillId,
        overlayRuntime.resizeState.startValue + delta / 2,
      );
    } else {
      setIconBuffSize(
        overlayRuntime.resizeState.target.baseId,
        overlayRuntime.resizeState.startValue + delta / 2,
      );
    }
    return;
  }

  if (!overlayRuntime.dragState) return;
  const nextPos = {
    x: Math.max(
      0,
      Math.min(
        window.innerWidth - 20,
        overlayRuntime.dragState.startPos.x +
          (e.clientX - overlayRuntime.dragState.startX),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        window.innerHeight - 20,
        overlayRuntime.dragState.startPos.y +
          (e.clientY - overlayRuntime.dragState.startY),
      ),
    ),
  };
  if (overlayRuntime.dragState.target.kind === "group") {
    setGroupPosition(overlayRuntime.dragState.target.key, nextPos);
  } else if (overlayRuntime.dragState.target.kind === "customPanelGroup") {
    setCustomPanelGroupPosition(overlayRuntime.dragState.target.groupId, nextPos);
  } else if (overlayRuntime.dragState.target.kind === "standaloneIcon") {
    setStandaloneIconPosition(overlayRuntime.dragState.target.layoutKey, nextPos);
  } else if (overlayRuntime.dragState.target.kind === "individualAllGroup") {
    setIndividualAllGroupPosition(nextPos);
  } else if (overlayRuntime.dragState.target.kind === "buffGroup") {
    setBuffGroupPosition(overlayRuntime.dragState.target.groupId, nextPos);
  } else if (overlayRuntime.dragState.target.kind === "categoryIcon") {
    setCategoryIconPosition(overlayRuntime.dragState.target.categoryKey, nextPos);
  } else if (overlayRuntime.dragState.target.kind === "skillDuration") {
    setSkillDurationPosition(overlayRuntime.dragState.target.skillId, nextPos);
  } else {
    setIconBuffPosition(overlayRuntime.dragState.target.baseId, nextPos);
  }
}

export function onGlobalPointerUp() {
  overlayRuntime.dragState = null;
  overlayRuntime.resizeState = null;
}

export async function setEditMode(editing: boolean) {
  overlayRuntime.isEditing = editing;
  if (overlayRuntime.currentWindow) {
    await overlayRuntime.currentWindow.setIgnoreCursorEvents(!editing);
  }
}

export function onWindowDragPointerDown(e: PointerEvent) {
  if (!overlayRuntime.isEditing || e.button !== 0 || !overlayRuntime.currentWindow) {
    return;
  }
  const el = e.target as HTMLElement | null;
  if (el?.closest("button,a,input,textarea,select")) return;
  e.preventDefault();
  void overlayRuntime.currentWindow.startDragging();
}

export function resetOverlaySizes() {
  updateActiveProfile((profile) => ({
    ...profile,
    overlaySizes: { ...DEFAULT_OVERLAY_SIZES },
    customPanelGroups: ensureCustomPanelGroups(profile).map((group) => ({
      ...group,
      scale: 1,
    })),
    inlineBuffEntries: [],
  }));
}

export function resetOverlayPositions() {
  updateActiveProfile((profile) => ({
    ...profile,
    overlayPositions: { ...DEFAULT_OVERLAY_POSITIONS },
    customPanelGroups: ensureCustomPanelGroups(profile).map((group, index) => ({
      ...group,
      position: {
        x: DEFAULT_OVERLAY_POSITIONS.customPanelGroup.x + index * 40,
        y: DEFAULT_OVERLAY_POSITIONS.customPanelGroup.y + index * 40,
      },
    })),
    inlineBuffEntries: [],
    buffGroups: ensureBuffGroups(profile).map((group) => ({
      ...group,
      position: { x: 40, y: 40 },
    })),
    individualMonitorAllGroup: profile.individualMonitorAllGroup
      ? { ...profile.individualMonitorAllGroup, position: { x: 40, y: 40 } }
      : null,
  }));
}
