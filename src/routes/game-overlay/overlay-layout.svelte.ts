import {
  DEFAULT_OVERLAY_POSITIONS,
  DEFAULT_OVERLAY_SIZES,
} from "./overlay-constants";
import { type BuffCategoryKey } from "$lib/config/buff-name-table";
import {
  activeProfile,
  updateActiveProfile,
} from "./overlay-profile.svelte.js";
import { overlayRuntime } from "./overlay-runtime.svelte.js";
import {
  resetResourceSectionLayouts,
  updateResourceSectionLayout,
} from "$lib/resource-sections";
import {
  iconDisplayBuffs,
  skillDurationDisplays,
} from "./overlay-display.svelte.js";
import type {
  DragTarget,
  IconBuffDisplay,
  OverlayScaleKey,
  ResizeTarget,
} from "./overlay-types";
import {
  ensureBuffGroups,
  ensureCustomPanelGroups,
  ensureIndividualMonitorAllGroup,
  ensureOverlayPositions,
  ensureOverlaySizes,
} from "./overlay-utils";

type OverlayPositionKey = keyof Omit<
  typeof DEFAULT_OVERLAY_POSITIONS,
  "iconBuffPositions" | "skillDurationPositions" | "categoryIconPositions"
>;
type OverlaySizeKey = OverlayScaleKey;

function clampGroupScale(value: number) {
  return Math.max(0.5, Math.min(2.5, value));
}

function clampIconSize(value: number) {
  return Math.max(24, Math.min(120, Math.round(value)));
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

export function getGroupPosition(key: OverlayPositionKey) {
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
  const idx = skillDurationDisplays().findIndex(
    (skill) => skill.skillId === skillId,
  );
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
  if (buff.categoryKey) {
    return getCategoryIconPosition(buff.categoryKey, fallbackIndex);
  }
  return getIconBuffPosition(buff.baseId);
}

export function getGroupScale(key: OverlaySizeKey): number {
  return getOverlaySizes()[key];
}

export function setGroupScale(key: OverlaySizeKey, value: number) {
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
  if (buff.categoryKey) {
    return getCategoryIconSize(buff.categoryKey);
  }
  return getIconBuffSize(buff.baseId);
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

export function setResourceSectionPosition(
  key: string,
  nextPos: { x: number; y: number },
) {
  updateActiveProfile((profile) =>
    updateResourceSectionLayout(profile, key, { position: nextPos }),
  );
}

export function setResourceSectionScale(key: string, value: number) {
  const nextValue = clampGroupScale(value);
  updateActiveProfile((profile) =>
    updateResourceSectionLayout(profile, key, { scale: nextValue }),
  );
}

export function setResourceSectionVisible(key: string, visible: boolean) {
  updateActiveProfile((profile) =>
    updateResourceSectionLayout(profile, key, { visible }),
  );
}

export function setIndividualAllGroupPosition(nextPos: {
  x: number;
  y: number;
}) {
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

export function setCategoryIconSize(
  categoryKey: BuffCategoryKey,
  value: number,
) {
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
    nextPos: startPos,
    element: previewElement(e),
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
    nextValue: startValue,
    element: previewElement(e),
  };
}

export function onGlobalPointerMove(e: PointerEvent) {
  if (overlayRuntime.resizeState) {
    const delta =
      e.clientX -
      overlayRuntime.resizeState.startX +
      (e.clientY - overlayRuntime.resizeState.startY);
    const targetKind = overlayRuntime.resizeState.target.kind;
    const isIconSize =
      targetKind !== "group" &&
      targetKind !== "customPanelGroup" &&
      targetKind !== "resourceSection";
    overlayRuntime.resizeState.nextValue = isIconSize
      ? clampIconSize(overlayRuntime.resizeState.startValue + delta / 2)
      : clampGroupScale(overlayRuntime.resizeState.startValue + delta / 300);
    scheduleLayoutPreview();
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
  overlayRuntime.dragState.nextPos = nextPos;
  scheduleLayoutPreview();
}

export function onGlobalPointerUp() {
  cancelScheduledLayoutPreview();
  commitDragPreview();
  commitResizePreview();
  clearLayoutPreviewStyles();
  overlayRuntime.dragState = null;
  overlayRuntime.resizeState = null;
}

function previewElement(event: PointerEvent): HTMLElement | null {
  const current = event.currentTarget;
  if (!(current instanceof HTMLElement)) return null;
  return current.classList.contains("overlay-group")
    ? current
    : current.closest<HTMLElement>(".overlay-group");
}

function scheduleLayoutPreview() {
  if (overlayRuntime.layoutPreviewRafId !== null) return;
  overlayRuntime.layoutPreviewRafId = window.requestAnimationFrame(() => {
    overlayRuntime.layoutPreviewRafId = null;
    applyLayoutPreviewStyles();
  });
}

function cancelScheduledLayoutPreview() {
  if (overlayRuntime.layoutPreviewRafId === null) return;
  window.cancelAnimationFrame(overlayRuntime.layoutPreviewRafId);
  overlayRuntime.layoutPreviewRafId = null;
}

function applyLayoutPreviewStyles() {
  const drag = overlayRuntime.dragState;
  if (drag?.element) {
    drag.element.style.translate = `${drag.nextPos.x - drag.startPos.x}px ${
      drag.nextPos.y - drag.startPos.y
    }px`;
  }
  const resize = overlayRuntime.resizeState;
  if (resize?.element) {
    const ratio =
      resize.startValue > 0 ? resize.nextValue / resize.startValue : 1;
    resize.element.style.scale = String(ratio);
  }
}

function clearLayoutPreviewStyles() {
  const elements = [
    overlayRuntime.dragState?.element,
    overlayRuntime.resizeState?.element,
  ];
  for (const element of elements) {
    if (!element) continue;
    element.style.removeProperty("translate");
    element.style.removeProperty("scale");
  }
}

function commitDragPreview() {
  const drag = overlayRuntime.dragState;
  if (!drag) return;
  const nextPos = drag.nextPos;
  if (drag.target.kind === "group") {
    setGroupPosition(drag.target.key, nextPos);
  } else if (drag.target.kind === "customPanelGroup") {
    setCustomPanelGroupPosition(drag.target.groupId, nextPos);
  } else if (drag.target.kind === "resourceSection") {
    setResourceSectionPosition(drag.target.key, nextPos);
  } else if (drag.target.kind === "individualAllGroup") {
    setIndividualAllGroupPosition(nextPos);
  } else if (drag.target.kind === "buffGroup") {
    setBuffGroupPosition(drag.target.groupId, nextPos);
  } else if (drag.target.kind === "categoryIcon") {
    setCategoryIconPosition(drag.target.categoryKey, nextPos);
  } else if (drag.target.kind === "skillDuration") {
    setSkillDurationPosition(drag.target.skillId, nextPos);
  } else {
    setIconBuffPosition(drag.target.baseId, nextPos);
  }
}

function commitResizePreview() {
  const resize = overlayRuntime.resizeState;
  if (!resize) return;
  const nextValue = resize.nextValue;
  if (resize.target.kind === "group") {
    setGroupScale(resize.target.key, nextValue);
  } else if (resize.target.kind === "customPanelGroup") {
    setCustomPanelGroupScale(resize.target.groupId, nextValue);
  } else if (resize.target.kind === "resourceSection") {
    setResourceSectionScale(resize.target.key, nextValue);
  } else if (resize.target.kind === "individualAllGroup") {
    setIndividualAllGroupIconSize(nextValue);
  } else if (resize.target.kind === "buffGroup") {
    setBuffGroupIconSize(resize.target.groupId, nextValue);
  } else if (resize.target.kind === "categoryIcon") {
    setCategoryIconSize(resize.target.categoryKey, nextValue);
  } else if (resize.target.kind === "skillDuration") {
    setSkillDurationSize(resize.target.skillId, nextValue);
  } else {
    setIconBuffSize(resize.target.baseId, nextValue);
  }
}

export function resetOverlaySizes() {
  updateActiveProfile((profile) => ({
    ...profile,
    overlaySizes: { ...DEFAULT_OVERLAY_SIZES },
    resourceSectionLayouts: resetResourceSectionLayouts(
      profile.resourceSectionLayouts,
      ["scale"],
    ),
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
    resourceSectionLayouts: resetResourceSectionLayouts(
      profile.resourceSectionLayouts,
      ["position"],
    ),
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
