<script lang="ts">
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import {
    onBuffUpdate,
    onFightResUpdate,
    onSkillCdUpdate,
    type BuffUpdateState,
    type SkillCdState,
  } from "$lib/api";
  import { commands, type BuffDefinition } from "$lib/bindings";
  import {
    SETTINGS,
    type BuffGroup,
    type OverlayPositions,
    type OverlaySizes,
    type OverlayVisibility,
    type SkillMonitorProfile,
  } from "$lib/settings-store";
  import {
    findAnySkillByBaseId,
    findResourcesByClass,
    type SpecialBuffDisplay,
    findSkillDerivationBySource,
    findSpecialBuffDisplays,
  } from "$lib/skill-mappings";

  type SkillDisplay = {
    isActive: boolean;
    percent: number;
    text: string;
    chargesText?: string;
  };

  type IconBuffDisplay = {
    baseId: number;
    name: string;
    spriteFile: string;
    text: string;
    layer: number;
    isPlaceholder?: boolean;
    specialImages?: string[];
  };

  type TextBuffDisplay = {
    baseId: number;
    name: string;
    text: string;
    remainPercent: number;
    layer: number;
    isPlaceholder?: boolean;
  };

  type DragTarget =
    | { kind: "group"; key: keyof Omit<OverlayPositions, "iconBuffPositions"> }
    | { kind: "iconBuff"; baseId: number }
    | { kind: "buffGroup"; groupId: string }
    | { kind: "individualAllGroup" };

  type DragState = {
    target: DragTarget;
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
  };

  type ResizeTarget =
    | { kind: "group"; key: keyof Omit<OverlaySizes, "iconBuffSizes"> }
    | { kind: "iconBuff"; baseId: number }
    | { kind: "buffGroup"; groupId: string }
    | { kind: "individualAllGroup" };

  type ResizeState = {
    target: ResizeTarget;
    startX: number;
    startY: number;
    startValue: number;
  };

  const RESOURCE_SCALES: Record<number, number> = {
    4: 100,
    5: 100,
  };
  const DEFAULT_RESOURCE_VALUES_BY_CLASS: Record<string, Record<number, number>> = {
    wind_knight: { 4: 130, 5: 130, 6: 6, 7: 6 },
    frost_mage: { 4: 0, 5: 125, 6: 0, 7: 4 },
  };
  const DEFAULT_OVERLAY_POSITIONS: OverlayPositions = {
    skillCdGroup: { x: 40, y: 40 },
    resourceGroup: { x: 40, y: 170 },
    textBuffPanel: { x: 360, y: 40 },
    specialBuffGroup: { x: 360, y: 220 },
    iconBuffPositions: {},
  };
  const DEFAULT_OVERLAY_SIZES: OverlaySizes = {
    skillCdGroupScale: 1,
    resourceGroupScale: 1,
    textBuffPanelScale: 1,
    iconBuffSizes: {},
  };
  const DEFAULT_OVERLAY_VISIBILITY: OverlayVisibility = {
    showSkillCdGroup: true,
    showResourceGroup: true,
  };

  let cdMap = $state(new Map<number, SkillCdState>());
  let displayMap = $state(new Map<number, SkillDisplay>());
  let fightResValues = $state<number[]>([]);
  let buffMap = $state(new Map<number, BuffUpdateState>());
  let activeBuffIds = $state(new Set<number>());
  let buffDurationPercents = $state(new Map<number, number>());
  let buffDefinitions = $state(new Map<number, BuffDefinition>());
  let buffNameMap = $state(new Map<number, string>());
  let iconDisplayBuffs = $state<IconBuffDisplay[]>([]);
  let textBuffs = $state<TextBuffDisplay[]>([]);
  let isEditing = $state(false);
  let dragState = $state<DragState | null>(null);
  let resizeState = $state<ResizeState | null>(null);
  let rafId: number | null = null;
  const win = getCurrentWindow();

  const activeProfileIndex = $derived.by(() => {
    const profiles = SETTINGS.skillMonitor.state.profiles;
    if (profiles.length === 0) return 0;
    return Math.min(
      Math.max(SETTINGS.skillMonitor.state.activeProfileIndex, 0),
      profiles.length - 1,
    );
  });

  const activeProfile = $derived.by(() => {
    const profiles = SETTINGS.skillMonitor.state.profiles;
    return profiles[activeProfileIndex] ?? null;
  });

  const selectedClassKey = $derived(activeProfile?.selectedClass ?? "wind_knight");
  const monitoredSkillIds = $derived(activeProfile?.monitoredSkillIds ?? []);
  const monitoredBuffIds = $derived(activeProfile?.monitoredBuffIds ?? []);
  const buffDisplayMode = $derived(activeProfile?.buffDisplayMode ?? "individual");
  const textBuffMaxVisible = $derived(
    Math.max(1, Math.min(20, activeProfile?.textBuffMaxVisible ?? 10)),
  );
  const normalizedBuffGroups = $derived.by(() => {
    if (!activeProfile) return [];
    return ensureBuffGroups(activeProfile);
  });
  const individualMonitorAllGroup = $derived.by(() => {
    if (!activeProfile) return null;
    return ensureIndividualMonitorAllGroup(activeProfile);
  });
  const overlayVisibility = $derived(
    activeProfile?.overlayVisibility ?? DEFAULT_OVERLAY_VISIBILITY,
  );
  const specialBuffConfigMap = $derived.by(() => {
    const map = new Map<number, SpecialBuffDisplay>();
    for (const config of findSpecialBuffDisplays(selectedClassKey)) {
      map.set(config.buffBaseId, config);
    }
    return map;
  });

  function ensureOverlayPositions(profile: SkillMonitorProfile): OverlayPositions {
    const current = profile.overlayPositions;
    return {
      skillCdGroup: current?.skillCdGroup ?? DEFAULT_OVERLAY_POSITIONS.skillCdGroup,
      resourceGroup: current?.resourceGroup ?? DEFAULT_OVERLAY_POSITIONS.resourceGroup,
      textBuffPanel: current?.textBuffPanel ?? DEFAULT_OVERLAY_POSITIONS.textBuffPanel,
      specialBuffGroup: current?.specialBuffGroup ?? DEFAULT_OVERLAY_POSITIONS.specialBuffGroup,
      iconBuffPositions: current?.iconBuffPositions ?? {},
    };
  }

  function ensureOverlaySizes(profile: SkillMonitorProfile): OverlaySizes {
    const current = profile.overlaySizes;
    return {
      skillCdGroupScale:
        current?.skillCdGroupScale ?? DEFAULT_OVERLAY_SIZES.skillCdGroupScale,
      resourceGroupScale:
        current?.resourceGroupScale ?? DEFAULT_OVERLAY_SIZES.resourceGroupScale,
      textBuffPanelScale:
        current?.textBuffPanelScale ?? DEFAULT_OVERLAY_SIZES.textBuffPanelScale,
      iconBuffSizes: current?.iconBuffSizes ?? {},
    };
  }

  function ensureOverlayVisibility(profile: SkillMonitorProfile): OverlayVisibility {
    const current = profile.overlayVisibility;
    return {
      showSkillCdGroup:
        current?.showSkillCdGroup ?? DEFAULT_OVERLAY_VISIBILITY.showSkillCdGroup,
      showResourceGroup:
        current?.showResourceGroup ?? DEFAULT_OVERLAY_VISIBILITY.showResourceGroup,
    };
  }

  function ensureBuffGroups(profile: SkillMonitorProfile): BuffGroup[] {
    const groups = profile.buffGroups ?? [];
    return groups.map((group, index) => ({
      id: group.id ?? `group_${index + 1}`,
      name: group.name ?? `分组 ${index + 1}`,
      buffIds: group.buffIds ?? [],
      priorityBuffIds: group.priorityBuffIds ?? [],
      monitorAll: group.monitorAll ?? false,
      position: group.position ?? { x: 40 + index * 40, y: 310 + index * 40 },
      iconSize: Math.max(24, Math.min(120, group.iconSize ?? 44)),
      columns: Math.max(1, Math.min(12, group.columns ?? 6)),
      rows: Math.max(1, Math.min(12, group.rows ?? 3)),
      gap: Math.max(0, Math.min(16, group.gap ?? 6)),
      showName: group.showName ?? true,
      showTime: group.showTime ?? true,
      showLayer: group.showLayer ?? true,
    }));
  }

  function ensureIndividualMonitorAllGroup(profile: SkillMonitorProfile): BuffGroup | null {
    const group = profile.individualMonitorAllGroup;
    if (!group) return null;
    const fallbackPosition = { x: 40, y: 310 };
    return {
      id: group.id ?? "individual_all_group",
      name: group.name ?? "全部 Buff",
      buffIds: [],
      priorityBuffIds: group.priorityBuffIds ?? [],
      monitorAll: true,
      position: group.position ?? fallbackPosition,
      iconSize: Math.max(24, Math.min(120, group.iconSize ?? 44)),
      columns: Math.max(1, Math.min(12, group.columns ?? 6)),
      rows: Math.max(1, Math.min(12, group.rows ?? 3)),
      gap: Math.max(0, Math.min(16, group.gap ?? 6)),
      showName: group.showName ?? true,
      showTime: group.showTime ?? true,
      showLayer: group.showLayer ?? true,
    };
  }

  function updateActiveProfile(
    updater: (profile: SkillMonitorProfile) => SkillMonitorProfile,
  ) {
    const state = SETTINGS.skillMonitor.state;
    const profiles = state.profiles;
    if (profiles.length === 0) return;
    const index = Math.min(Math.max(state.activeProfileIndex, 0), profiles.length - 1);
    state.profiles = profiles.map((profile, i) => (i === index ? updater(profile) : profile));
  }

  function getOverlayPositions(): OverlayPositions {
    if (!activeProfile) return DEFAULT_OVERLAY_POSITIONS;
    return ensureOverlayPositions(activeProfile);
  }

  function getOverlaySizes(): OverlaySizes {
    if (!activeProfile) return DEFAULT_OVERLAY_SIZES;
    return ensureOverlaySizes(activeProfile);
  }

  function getGroupPosition(key: keyof Omit<OverlayPositions, "iconBuffPositions">) {
    return getOverlayPositions()[key];
  }

  function getIconBuffPosition(baseId: number) {
    const positions = getOverlayPositions();
    const cached = positions.iconBuffPositions[baseId];
    if (cached) return cached;
    const idx = iconDisplayBuffs.findIndex((buff) => buff.baseId === baseId);
    const fallbackX = 40 + (idx % 8) * 58;
    const fallbackY = 310 + Math.floor(idx / 8) * 64;
    return { x: fallbackX, y: fallbackY };
  }

  function getGroupScale(key: keyof Omit<OverlaySizes, "iconBuffSizes">): number {
    return getOverlaySizes()[key];
  }

  function setGroupScale(
    key: keyof Omit<OverlaySizes, "iconBuffSizes">,
    value: number,
  ) {
    const nextValue = Math.max(0.5, Math.min(2.5, value));
    updateActiveProfile((profile) => {
      const sizes = ensureOverlaySizes(profile);
      return {
        ...profile,
        overlaySizes: {
          ...sizes,
          [key]: nextValue,
        },
      };
    });
  }

  function getIconBuffSize(baseId: number): number {
    const sizes = getOverlaySizes();
    const cached = sizes.iconBuffSizes[baseId];
    return cached ?? 44;
  }

  function setIconBuffSize(baseId: number, value: number) {
    const nextValue = Math.max(24, Math.min(120, Math.round(value)));
    updateActiveProfile((profile) => {
      const sizes = ensureOverlaySizes(profile);
      return {
        ...profile,
        overlaySizes: {
          ...sizes,
          iconBuffSizes: {
            ...sizes.iconBuffSizes,
            [baseId]: nextValue,
          },
        },
      };
    });
  }

  function setGroupPosition(
    key: keyof Omit<OverlayPositions, "iconBuffPositions">,
    nextPos: { x: number; y: number },
  ) {
    updateActiveProfile((profile) => {
      const positions = ensureOverlayPositions(profile);
      return {
        ...profile,
        overlayPositions: {
          ...positions,
          [key]: nextPos,
        },
      };
    });
  }

  function setIconBuffPosition(baseId: number, nextPos: { x: number; y: number }) {
    updateActiveProfile((profile) => {
      const positions = ensureOverlayPositions(profile);
      return {
        ...profile,
        overlayPositions: {
          ...positions,
          iconBuffPositions: {
            ...positions.iconBuffPositions,
            [baseId]: nextPos,
          },
        },
      };
    });
  }

  function setBuffGroupPosition(groupId: string, nextPos: { x: number; y: number }) {
    updateActiveProfile((profile) => ({
      ...profile,
      buffGroups: ensureBuffGroups(profile).map((group) =>
        group.id === groupId ? { ...group, position: nextPos } : group,
      ),
    }));
  }

  function setBuffGroupIconSize(groupId: string, value: number) {
    const nextValue = Math.max(24, Math.min(120, Math.round(value)));
    updateActiveProfile((profile) => ({
      ...profile,
      buffGroups: ensureBuffGroups(profile).map((group) =>
        group.id === groupId ? { ...group, iconSize: nextValue } : group,
      ),
    }));
  }

  function setIndividualAllGroupPosition(nextPos: { x: number; y: number }) {
    updateActiveProfile((profile) => {
      const group = ensureIndividualMonitorAllGroup(profile);
      if (!group) return profile;
      return {
        ...profile,
        individualMonitorAllGroup: {
          ...group,
          position: nextPos,
        },
      };
    });
  }

  function setIndividualAllGroupIconSize(value: number) {
    const nextValue = Math.max(24, Math.min(120, Math.round(value)));
    updateActiveProfile((profile) => {
      const group = ensureIndividualMonitorAllGroup(profile);
      if (!group) return profile;
      return {
        ...profile,
        individualMonitorAllGroup: {
          ...group,
          iconSize: nextValue,
        },
      };
    });
  }

  function startDrag(e: PointerEvent, target: DragTarget, startPos: { x: number; y: number }) {
    if (!isEditing || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragState = {
      target,
      startX: e.clientX,
      startY: e.clientY,
      startPos,
    };
  }

  function startResize(
    e: PointerEvent,
    target: ResizeTarget,
    startValue: number,
  ) {
    if (!isEditing || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeState = {
      target,
      startX: e.clientX,
      startY: e.clientY,
      startValue,
    };
  }

  function onGlobalPointerMove(e: PointerEvent) {
    if (resizeState) {
      const delta = (e.clientX - resizeState.startX) + (e.clientY - resizeState.startY);
      if (resizeState.target.kind === "group") {
        const nextScale = resizeState.startValue + delta / 300;
        setGroupScale(resizeState.target.key, nextScale);
      } else if (resizeState.target.kind === "individualAllGroup") {
        const nextSize = resizeState.startValue + delta / 2;
        setIndividualAllGroupIconSize(nextSize);
      } else if (resizeState.target.kind === "buffGroup") {
        const nextSize = resizeState.startValue + delta / 2;
        setBuffGroupIconSize(resizeState.target.groupId, nextSize);
      } else {
        const nextSize = resizeState.startValue + delta / 2;
        setIconBuffSize(resizeState.target.baseId, nextSize);
      }
      return;
    }

    if (!dragState) return;
    const nextPos = {
      x: dragState.startPos.x + (e.clientX - dragState.startX),
      y: dragState.startPos.y + (e.clientY - dragState.startY),
    };
    if (dragState.target.kind === "group") {
      setGroupPosition(dragState.target.key, nextPos);
    } else if (dragState.target.kind === "individualAllGroup") {
      setIndividualAllGroupPosition(nextPos);
    } else if (dragState.target.kind === "buffGroup") {
      setBuffGroupPosition(dragState.target.groupId, nextPos);
    } else {
      setIconBuffPosition(dragState.target.baseId, nextPos);
    }
  }

  function onGlobalPointerUp() {
    dragState = null;
    resizeState = null;
  }

  async function setEditMode(editing: boolean) {
    isEditing = editing;
    await win.setIgnoreCursorEvents(!editing);
  }

  function onWindowDragPointerDown(e: PointerEvent) {
    if (!isEditing || e.button !== 0) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest("button,a,input,textarea,select")) return;
    e.preventDefault();
    void win.startDragging();
  }

  function resetOverlaySizes() {
    updateActiveProfile((profile) => ({
      ...profile,
      overlaySizes: { ...DEFAULT_OVERLAY_SIZES },
    }));
  }

  function computeDisplay(skillId: number, cd: SkillCdState, now: number): SkillDisplay | null {
    const skill = findAnySkillByBaseId(selectedClassKey, skillId);
    const cdAccelerateRate = Math.max(0, cd.cdAccelerateRate ?? 0);
    const elapsed = Math.max(0, now - cd.receivedAt);
    const baseDuration = cd.duration > 0 ? Math.max(1, cd.duration) : 1;
    const reducedDuration = cd.duration > 0 ? Math.max(0, cd.calculatedDuration) : 0;
    const validCdScale = cd.duration > 0 ? reducedDuration / baseDuration : 1;
    const scaledValidCdTime = cd.validCdTime * validCdScale;
    const progressed = scaledValidCdTime + elapsed * (1 + cdAccelerateRate);

    if (cd.duration === -1 && cd.skillCdType === 1) {
      if (!skill?.maxValidCdTime) return null;
      const chargePercent = Math.max(0, Math.min(1, cd.validCdTime / skill.maxValidCdTime));
      return {
        isActive: chargePercent < 1,
        percent: 1 - chargePercent,
        text: `${Math.round(chargePercent * 100)}%`,
      };
    }

    if (cd.skillCdType === 1 && cd.duration > 0) {
      const maxCharges = Math.max(1, skill?.maxCharges ?? 1);
      if (maxCharges > 1) {
        const chargeDuration = Math.max(1, cd.calculatedDuration);
        const maxVct = maxCharges * chargeDuration;
        const currentVct = Math.min(maxVct, progressed);
        const chargesAvailable = Math.min(maxCharges, Math.floor(currentVct / chargeDuration));
        const chargesOnCd = Math.max(0, maxCharges - chargesAvailable);
        if (chargesOnCd <= 0) {
          return {
            isActive: false,
            percent: 0,
            text: "",
            chargesText: `${maxCharges}/${maxCharges}`,
          };
        }
        const timeToNextCharge = Math.max(0, chargeDuration - (currentVct % chargeDuration));
        return {
          isActive: chargesOnCd > 0,
          percent: Math.min(1, timeToNextCharge / chargeDuration),
          text: (timeToNextCharge / 1000).toFixed(1),
          chargesText: `${chargesAvailable}/${maxCharges}`,
        };
      }
    }

    const remaining = reducedDuration > 0 ? Math.max(0, reducedDuration - progressed) : 0;
    const duration = reducedDuration > 0 ? reducedDuration : 1;
    return {
      isActive: remaining > 0,
      percent: remaining > 0 ? Math.min(1, remaining / duration) : 0,
      text: remaining > 0 ? (remaining / 1000).toFixed(1) : "",
    };
  }

  function getResourceValue(index: number): number {
    const raw = fightResValues[index];
    if (raw === undefined) {
      return DEFAULT_RESOURCE_VALUES_BY_CLASS[selectedClassKey]?.[index] ?? 0;
    }
    const scale = RESOURCE_SCALES[index] ?? 1;
    return Math.floor(raw / scale);
  }

  function getResourcePreciseValue(index: number): number {
    const raw = fightResValues[index];
    if (raw === undefined) {
      return DEFAULT_RESOURCE_VALUES_BY_CLASS[selectedClassKey]?.[index] ?? 0;
    }
    const scale = RESOURCE_SCALES[index] ?? 1;
    return raw / scale;
  }

  async function loadBuffNames(baseIds: number[]) {
    if (baseIds.length === 0) return;
    const uniq = Array.from(new Set(baseIds)).filter((id) => !buffNameMap.has(id));
    if (uniq.length === 0) return;
    const res = await commands.getBuffNames(uniq);
    if (res.status !== "ok") return;
    const next = new Map(buffNameMap);
    for (const item of res.data) {
      next.set(item.baseId, item.name);
    }
    buffNameMap = next;
  }

  $effect(() => {
    const ids = monitoredBuffIds;
    if (ids.length === 0) return;
    void loadBuffNames(ids);
  });

  const groupedIconBuffs = $derived.by(() => {
    if (buffDisplayMode !== "grouped") return new Map<string, IconBuffDisplay[]>();
    const groups = normalizedBuffGroups;
    const iconBuffs = iconDisplayBuffs.filter(
      (buff) => !(buff.specialImages && buff.specialImages.length > 0),
    );
    const selectedBySpecificGroups = new Set<number>();
    for (const group of groups) {
      if (group.monitorAll) continue;
      for (const buffId of group.buffIds) {
        selectedBySpecificGroups.add(buffId);
      }
    }
    const result = new Map<string, IconBuffDisplay[]>();
    for (const group of groups) {
      const maxVisible = Math.max(1, group.columns * group.rows);
      const entries = group.monitorAll
        ? iconBuffs.filter((buff) => !selectedBySpecificGroups.has(buff.baseId))
        : iconBuffs.filter((buff) => group.buffIds.includes(buff.baseId));
      result.set(group.id, entries.slice(0, maxVisible));
    }
    return result;
  });

  const individualModeIconBuffs = $derived.by(() => {
    if (buffDisplayMode !== "individual") return [];
    const selected = new Set(monitoredBuffIds);
    return iconDisplayBuffs.filter(
      (buff) => selected.has(buff.baseId),
    );
  });

  const individualAllGroupBuffs = $derived.by(() => {
    if (buffDisplayMode !== "individual" || !individualMonitorAllGroup) return [];
    const selected = new Set(monitoredBuffIds);
    return iconDisplayBuffs.filter(
      (buff) => !selected.has(buff.baseId) && !(buff.specialImages && buff.specialImages.length > 0),
    );
  });

  const specialStandaloneBuffs = $derived.by(() => {
    if (buffDisplayMode !== "grouped") return [];
    const specials = iconDisplayBuffs.filter(
      (buff) => buff.specialImages && buff.specialImages.length > 0,
    );
    const groups = normalizedBuffGroups;
    if (groups.some((g) => g.monitorAll)) return specials;
    const selectedIds = new Set<number>();
    for (const group of groups) {
      for (const buffId of group.buffIds) selectedIds.add(buffId);
    }
    return specials.filter((buff) => selectedIds.has(buff.baseId));
  });
  const limitedTextBuffs = $derived.by(() => textBuffs.slice(0, textBuffMaxVisible));

  function updateDisplay() {
    const now = Date.now();
    const nextActiveBuffIds = new Set<number>();
    const nextBuffDurationPercents = new Map<number, number>();
    const nextIconBuffs: IconBuffDisplay[] = [];
    const nextTextBuffs: TextBuffDisplay[] = [];

    for (const [baseId, buff] of buffMap) {
      const end = buff.createTimeMs + buff.durationMs;
      const remaining = Math.max(0, end - now);
      const remainPercent =
        buff.durationMs > 0 ? Math.min(100, Math.max(0, (remaining / buff.durationMs) * 100)) : 100;

      if (buff.durationMs > 0) {
        nextBuffDurationPercents.set(baseId, remainPercent);
      }
      if (buff.durationMs <= 0 || end > now) {
        nextActiveBuffIds.add(baseId);
      } else {
        continue;
      }

      // Permanent buffs still remain in activeBuffIds for linkage logic.
      // Hide only non-stacking permanent buffs from visual display.
      if (buff.durationMs <= 0 && buff.layer <= 1) {
        continue;
      }

      const def = buffDefinitions.get(baseId);
      const name = def?.name ?? buffNameMap.get(baseId) ?? `#${baseId}`;
      const timeText = buff.durationMs > 0 ? (remaining / 1000).toFixed(1) : "∞";
      const specialConfig = specialBuffConfigMap.get(baseId);
      const specialImages = specialConfig
        ? (() => {
            const layer = Math.max(1, buff.layer);
            const layerIdx = Math.min(specialConfig.layerImages.length - 1, layer - 1);
            return specialConfig.layerImages[layerIdx] ?? [];
          })()
        : [];
      if (def?.spriteFile) {
        nextIconBuffs.push({
          baseId,
          name,
          spriteFile: def.spriteFile,
          text: timeText,
          layer: buff.layer,
          ...(specialImages.length > 0 ? { specialImages } : {}),
        });
      } else {
        nextTextBuffs.push({
          baseId,
          name,
          text: timeText,
          remainPercent,
          layer: buff.layer,
        });
      }
    }

    // In edit mode, always show configured monitored buffs as placeholders
    // so users can drag/arrange layout even when buffs are not currently active.
    if (isEditing) {
      const iconIds = new Set(nextIconBuffs.map((buff) => buff.baseId));
      const textIds = new Set(nextTextBuffs.map((buff) => buff.baseId));
      for (const baseId of monitoredBuffIds) {
        if (iconIds.has(baseId) || textIds.has(baseId)) continue;
        const def = buffDefinitions.get(baseId);
        const name = def?.name ?? buffNameMap.get(baseId) ?? `#${baseId}`;
        const specialConfig = specialBuffConfigMap.get(baseId);
        const placeholderSpecialImages =
          specialConfig && specialConfig.layerImages.length > 0
            ? (specialConfig.layerImages[0] ?? [])
            : [];
        if (def?.spriteFile) {
          nextIconBuffs.push({
            baseId,
            name,
            spriteFile: def.spriteFile,
            text: "--",
            layer: 1,
            isPlaceholder: true,
            ...(placeholderSpecialImages.length > 0
              ? { specialImages: placeholderSpecialImages }
              : {}),
          });
        } else {
          nextTextBuffs.push({
            baseId,
            name,
            text: "--",
            remainPercent: 0,
            layer: 1,
            isPlaceholder: true,
          });
        }
      }
    }

    const next = new Map<number, SkillDisplay>();
    for (const [skillId, cd] of cdMap) {
      const display = computeDisplay(skillId, cd, now);
      if (display) {
        next.set(skillId, display);
      }
    }

    activeBuffIds = nextActiveBuffIds;
    buffDurationPercents = nextBuffDurationPercents;
    displayMap = next;
    iconDisplayBuffs = nextIconBuffs;
    textBuffs = nextTextBuffs;

    rafId = requestAnimationFrame(updateDisplay);
  }

  onMount(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("background", "transparent", "important");
      document.body.style.setProperty("background", "transparent", "important");
    }

    if (
      activeProfile &&
      (!activeProfile.overlayPositions ||
        !activeProfile.overlaySizes ||
        !activeProfile.overlayVisibility ||
        !activeProfile.buffDisplayMode ||
        !activeProfile.buffGroups ||
        !activeProfile.textBuffMaxVisible)
    ) {
      updateActiveProfile((profile) => ({
        ...profile,
        overlayPositions: ensureOverlayPositions(profile),
        overlaySizes: ensureOverlaySizes(profile),
        overlayVisibility: ensureOverlayVisibility(profile),
        buffDisplayMode: profile.buffDisplayMode ?? "individual",
        buffGroups: ensureBuffGroups(profile),
        individualMonitorAllGroup: ensureIndividualMonitorAllGroup(profile),
        textBuffMaxVisible: Math.max(1, Math.min(20, profile.textBuffMaxVisible ?? 10)),
      }));
    }

    void setEditMode(false);

    void (async () => {
      const res = await commands.getAvailableBuffs();
      if (res.status === "ok") {
        const next = new Map<number, BuffDefinition>();
        for (const buff of res.data) {
          next.set(buff.baseId, buff);
        }
        buffDefinitions = next;
      }
    })();

    const unlistenEditToggle = listen("overlay-edit-toggle", () => {
      void setEditMode(!isEditing);
    });

    const unlistenBuff = onBuffUpdate((event) => {
      const next = new Map<number, BuffUpdateState>();
      for (const buff of event.payload.buffs) {
        const existing = next.get(buff.baseId);
        if (!existing || buff.createTimeMs >= existing.createTimeMs) {
          next.set(buff.baseId, buff);
        }
      }
      buffMap = next;
      void loadBuffNames(Array.from(next.keys()));
    });

    const unlisten = onSkillCdUpdate((event) => {
      const next = new Map(cdMap);
      for (const cd of event.payload.skillCds) {
        const baseId = Math.floor(cd.skillLevelId / 100);
        next.set(baseId, cd);
      }
      cdMap = next;
    });

    const unlistenRes = onFightResUpdate((event) => {
      fightResValues = event.payload.fightRes.values;
    });

    // Preload names for monitored ids so edit mode can show non-active buffs.
    void loadBuffNames(monitoredBuffIds);

    window.addEventListener("pointermove", onGlobalPointerMove);
    window.addEventListener("pointerup", onGlobalPointerUp);
    rafId = requestAnimationFrame(updateDisplay);

    return () => {
      unlistenEditToggle.then((fn) => fn());
      unlistenBuff.then((fn) => fn());
      unlisten.then((fn) => fn());
      unlistenRes.then((fn) => fn());
      window.removeEventListener("pointermove", onGlobalPointerMove);
      window.removeEventListener("pointerup", onGlobalPointerUp);
      if (rafId) cancelAnimationFrame(rafId);
    };
  });
</script>

<div class="overlay-root" class:editing={isEditing}>
  {#if isEditing}
    <div class="edit-banner">
      <div class="edit-title">编辑模式 - 可拖拽调整位置</div>
      <button type="button" class="done-btn secondary" onclick={resetOverlaySizes}>重置尺寸</button>
      <button type="button" class="done-btn" onclick={() => setEditMode(false)}>完成编辑</button>
    </div>
    <div class="window-drag-bar" onpointerdown={onWindowDragPointerDown}>
      拖动此处移动 Game Overlay 窗口
    </div>
  {/if}

  {#if overlayVisibility.showSkillCdGroup}
    <div
      class="overlay-group skill-group"
      class:editable={isEditing}
      style:left={`${getGroupPosition("skillCdGroup").x}px`}
      style:top={`${getGroupPosition("skillCdGroup").y}px`}
      style:transform={`scale(${getGroupScale("skillCdGroupScale")})`}
      style:transform-origin="top left"
      onpointerdown={(e) => startDrag(e, { kind: "group", key: "skillCdGroup" }, getGroupPosition("skillCdGroup"))}
    >
    {#if isEditing}
      <div class="group-tag">技能CD区</div>
    {/if}
    <div class="skill-cd-grid">
      {#each Array(10) as _, idx (idx)}
        {@const skillId = monitoredSkillIds[idx]}
        {@const display = skillId ? displayMap.get(skillId) : undefined}
        {@const skill = skillId ? findAnySkillByBaseId(selectedClassKey, skillId) : undefined}
        {@const derivation = skillId ? findSkillDerivationBySource(selectedClassKey, skillId) : undefined}
        {@const isDerivedActive = derivation ? activeBuffIds.has(derivation.triggerBuffBaseId) : false}
        {@const displaySkill = isDerivedActive && derivation
          ? { name: derivation.derivedName, imagePath: derivation.derivedImagePath }
          : skill}
        {@const effectiveDisplay = isDerivedActive && !derivation?.keepCdWhenDerived ? undefined : display}
        {@const resourceBlocked = skill?.resourceRequirement
          ? getResourceValue(skill.resourceRequirement.resourceIndex) < skill.resourceRequirement.amount
          : false}
        {@const isOnCd = effectiveDisplay?.isActive ?? false}
        {@const isUnavailable = isOnCd || resourceBlocked}
        {@const percent = isOnCd ? effectiveDisplay?.percent ?? 0 : 0}
        {@const displayText = effectiveDisplay?.text ?? ""}
        <div
          class="skill-cell"
          class:empty={!skillId}
          class:on-cd={isOnCd}
          class:derived-active={isDerivedActive}
        >
          {#if displaySkill?.imagePath}
            <img
              src={displaySkill.imagePath}
              alt={displaySkill.name}
              class="skill-icon"
              class:dimmed={isUnavailable}
            />
          {:else if skillId}
            <div class="skill-fallback">#{skillId}</div>
          {/if}

          {#if effectiveDisplay?.chargesText}
            <div class="charges-badge">{effectiveDisplay.chargesText}</div>
          {/if}

          {#if isOnCd}
            <div class="cd-overlay" style={`--cd-percent: ${percent}`}>
              {#if displayText}
                <span class="cd-text">{displayText}</span>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {#if isEditing}
      <div
        class="resize-handle"
        onpointerdown={(e) =>
          startResize(e, { kind: "group", key: "skillCdGroupScale" }, getGroupScale("skillCdGroupScale"))}
      ></div>
    {/if}
    </div>
  {/if}

  {#if overlayVisibility.showResourceGroup}
    <div
      class="overlay-group resource-group"
      class:editable={isEditing}
      style:left={`${getGroupPosition("resourceGroup").x}px`}
      style:top={`${getGroupPosition("resourceGroup").y}px`}
      style:transform={`scale(${getGroupScale("resourceGroupScale")})`}
      style:transform-origin="top left"
      onpointerdown={(e) => startDrag(e, { kind: "group", key: "resourceGroup" }, getGroupPosition("resourceGroup"))}
    >
    {#if isEditing}
      <div class="group-tag">资源区</div>
    {/if}
    <div class="resources-panel" data-class={selectedClassKey}>
      <div class="resources-row energy-row">
        {#each findResourcesByClass(selectedClassKey).filter((res) => res.type === "bar") as res}
          {@const cur = getResourceValue(res.currentIndex)}
          {@const max = Math.max(1, getResourceValue(res.maxIndex))}
          {@const curPrecise = getResourcePreciseValue(res.currentIndex)}
          {@const maxPrecise = Math.max(1, getResourcePreciseValue(res.maxIndex))}
          {@const energyPercent = Math.min(100, Math.max(0, (curPrecise / maxPrecise) * 100))}
          {@const buffPercent = res.buffBaseId ? (buffDurationPercents.get(res.buffBaseId) ?? 0) : energyPercent}
          <div class="res-bar-container">
            <img src={res.imageOff} alt={res.label} class="res-bar-bg" />
            <div class="res-bar-fill-mask" style:clip-path={`inset(0 ${100 - buffPercent}% 0 0)`}>
              <img src={res.imageOn} alt={res.label} class="res-bar-fill" />
            </div>
            <div class="res-energy-overlay">
              <div class="res-energy-track">
                <div class="res-energy-fill" style:width={`${energyPercent}%`}></div>
              </div>
            </div>
            <div class="res-text">{cur}/{max}</div>
          </div>
        {/each}
      </div>

      <div class="resources-row sharpness-row">
        {#each findResourcesByClass(selectedClassKey).filter((res) => res.type === "charges") as res}
          {@const cur = getResourceValue(res.currentIndex)}
          {@const max = Math.max(1, getResourceValue(res.maxIndex))}
          <div class="res-charges-container">
            {#each Array(max) as _, i}
              <img src={i < cur ? res.imageOn : res.imageOff} alt={res.label} class="res-charge-icon" />
            {/each}
          </div>
        {/each}
      </div>
    </div>
    {#if isEditing}
      <div
        class="resize-handle"
        onpointerdown={(e) =>
          startResize(e, { kind: "group", key: "resourceGroupScale" }, getGroupScale("resourceGroupScale"))}
      ></div>
    {/if}
    </div>
  {/if}

  {#if limitedTextBuffs.length > 0}
    <div
      class="overlay-group text-buff-panel"
      class:editable={isEditing}
      style:left={`${getGroupPosition("textBuffPanel").x}px`}
      style:top={`${getGroupPosition("textBuffPanel").y}px`}
      style:transform={`scale(${getGroupScale("textBuffPanelScale")})`}
      style:transform-origin="top left"
      onpointerdown={(e) => startDrag(e, { kind: "group", key: "textBuffPanel" }, getGroupPosition("textBuffPanel"))}
    >
      {#if isEditing}
        <div class="group-tag">无图标Buff区</div>
      {/if}
      {#each limitedTextBuffs as buff (buff.baseId)}
        <div class="text-buff-row" class:placeholder={buff.isPlaceholder}>
          <div class="text-buff-name">{buff.name}</div>
          <div class="text-buff-time">{buff.text}</div>
          <div class="text-buff-decay">
            <div class="text-buff-decay-fill" style:width={`${buff.remainPercent}%`}></div>
          </div>
          {#if buff.layer > 1}
            <div class="text-buff-layer">x{buff.layer}</div>
          {/if}
        </div>
      {/each}
      {#if isEditing}
        <div
          class="resize-handle"
          onpointerdown={(e) =>
            startResize(e, { kind: "group", key: "textBuffPanelScale" }, getGroupScale("textBuffPanelScale"))}
        ></div>
      {/if}
    </div>
  {/if}

  {#if buffDisplayMode === "grouped"}
    {#if normalizedBuffGroups.length === 0 && isEditing}
      <div class="overlay-group grouped-empty-tip" style:left="40px" style:top="310px">
        请先在技能监控页创建 Buff 分组
      </div>
    {/if}
    {#each normalizedBuffGroups as group (group.id)}
      {@const groupBuffs = groupedIconBuffs.get(group.id) ?? []}
      {#if groupBuffs.length > 0 || isEditing}
        <div
          class="overlay-group buff-group-container"
          class:editable={isEditing}
          style:left={`${group.position.x}px`}
          style:top={`${group.position.y}px`}
          onpointerdown={(e) => startDrag(e, { kind: "buffGroup", groupId: group.id }, group.position)}
        >
          {#if isEditing}
            <div class="group-tag">{group.name}{group.monitorAll ? "（全部）" : ""}</div>
          {/if}
          <div
            class="buff-group-grid"
            style:grid-template-columns={`repeat(${Math.max(1, group.columns)}, ${group.iconSize + 8}px)`}
            style:grid-template-rows={`repeat(${Math.max(1, group.rows)}, auto)`}
            style:gap={`${Math.max(0, group.gap)}px`}
          >
            {#each groupBuffs as buff (buff.baseId)}
              <div class="icon-buff-cell" class:placeholder={buff.isPlaceholder} style:width={`${group.iconSize + 8}px`}>
                {#if group.showName && !(buff.specialImages && buff.specialImages.length > 0)}
                  <div class="buff-name-label" style:max-width={`${group.iconSize + 8}px`}>{buff.name.slice(0, 6)}</div>
                {/if}
                <div class="buff-icon-wrap" style:width={`${group.iconSize}px`} style:height={`${group.iconSize}px`}>
                  {#if buff.specialImages && buff.specialImages.length > 0}
                    {#each buff.specialImages as imgSrc (imgSrc)}
                      <img src={imgSrc} alt={buff.name} class="special-buff-icon" />
                    {/each}
                  {:else}
                    <img
                      src={`/images/buff/${buff.spriteFile}`}
                      alt={buff.name}
                      class="buff-icon"
                    />
                  {/if}
                  {#if group.showLayer && !(buff.specialImages && buff.specialImages.length > 0) && buff.layer > 1}
                    <div class="layer-badge">{buff.layer}</div>
                  {/if}
                </div>
                {#if group.showTime && !(buff.specialImages && buff.specialImages.length > 0)}
                  <div class="buff-time" style:font-size={`${Math.max(10, Math.round(group.iconSize * 0.26))}px`}>{buff.text}</div>
                {/if}
              </div>
            {/each}
          </div>
          {#if isEditing}
            <div
              class="resize-handle icon"
              onpointerdown={(e) => startResize(e, { kind: "buffGroup", groupId: group.id }, group.iconSize)}
            ></div>
          {/if}
        </div>
      {/if}
    {/each}

    {#each specialStandaloneBuffs as buff (buff.baseId)}
      {@const iconPos = getIconBuffPosition(buff.baseId)}
      {@const iconSize = getIconBuffSize(buff.baseId)}
      <div
        class="overlay-group icon-buff-cell"
        class:editable={isEditing}
        class:placeholder={buff.isPlaceholder}
        style:left={`${iconPos.x}px`}
        style:top={`${iconPos.y}px`}
        style:width={`${iconSize + 8}px`}
        onpointerdown={(e) => startDrag(e, { kind: "iconBuff", baseId: buff.baseId }, iconPos)}
      >
        <div class="buff-icon-wrap" style:width={`${iconSize}px`} style:height={`${iconSize}px`}>
          {#each buff.specialImages ?? [] as imgSrc (imgSrc)}
            <img src={imgSrc} alt={buff.name} class="special-buff-icon" />
          {/each}
        </div>
        {#if isEditing}
          <div
            class="resize-handle icon"
            onpointerdown={(e) => startResize(e, { kind: "iconBuff", baseId: buff.baseId }, iconSize)}
          ></div>
        {/if}
      </div>
    {/each}
  {:else}
    {#each individualModeIconBuffs as buff (buff.baseId)}
      {@const iconPos = getIconBuffPosition(buff.baseId)}
      {@const iconSize = getIconBuffSize(buff.baseId)}
      <div
        class="overlay-group icon-buff-cell"
        class:editable={isEditing}
        class:placeholder={buff.isPlaceholder}
        style:left={`${iconPos.x}px`}
        style:top={`${iconPos.y}px`}
        style:width={`${iconSize + 8}px`}
        onpointerdown={(e) => startDrag(e, { kind: "iconBuff", baseId: buff.baseId }, iconPos)}
      >
        {#if !(buff.specialImages && buff.specialImages.length > 0)}
          <div class="buff-name-label" style:max-width={`${iconSize + 8}px`}>{buff.name.slice(0, 6)}</div>
        {/if}
        <div class="buff-icon-wrap" style:width={`${iconSize}px`} style:height={`${iconSize}px`}>
          {#if buff.specialImages && buff.specialImages.length > 0}
            {#each buff.specialImages as imgSrc (imgSrc)}
              <img src={imgSrc} alt={buff.name} class="special-buff-icon" />
            {/each}
          {:else}
            <img
              src={`/images/buff/${buff.spriteFile}`}
              alt={buff.name}
              class="buff-icon"
            />
          {/if}
          {#if !(buff.specialImages && buff.specialImages.length > 0) && buff.layer > 1}
            <div class="layer-badge">{buff.layer}</div>
          {/if}
        </div>
        {#if !(buff.specialImages && buff.specialImages.length > 0)}
          <div class="buff-time" style:font-size={`${Math.max(10, Math.round(iconSize * 0.26))}px`}>{buff.text}</div>
        {/if}
        {#if isEditing}
          <div
            class="resize-handle icon"
            onpointerdown={(e) => startResize(e, { kind: "iconBuff", baseId: buff.baseId }, iconSize)}
          ></div>
        {/if}
      </div>
    {/each}
    {#if individualMonitorAllGroup && (individualAllGroupBuffs.length > 0 || isEditing)}
      {@const maxVisible = Math.max(1, individualMonitorAllGroup.columns * individualMonitorAllGroup.rows)}
      <div
        class="overlay-group buff-group-container"
        class:editable={isEditing}
        style:left={`${individualMonitorAllGroup.position.x}px`}
        style:top={`${individualMonitorAllGroup.position.y}px`}
        onpointerdown={(e) =>
          startDrag(
            e,
            { kind: "individualAllGroup" },
            individualMonitorAllGroup.position,
          )}
      >
        {#if isEditing}
          <div class="group-tag">{individualMonitorAllGroup.name}（全部）</div>
        {/if}
        <div
          class="buff-group-grid"
          style:grid-template-columns={`repeat(${Math.max(1, individualMonitorAllGroup.columns)}, ${individualMonitorAllGroup.iconSize + 8}px)`}
          style:grid-template-rows={`repeat(${Math.max(1, individualMonitorAllGroup.rows)}, auto)`}
          style:gap={`${Math.max(0, individualMonitorAllGroup.gap)}px`}
        >
          {#each individualAllGroupBuffs.slice(0, maxVisible) as buff (buff.baseId)}
            <div class="icon-buff-cell" class:placeholder={buff.isPlaceholder} style:width={`${individualMonitorAllGroup.iconSize + 8}px`}>
              {#if individualMonitorAllGroup.showName && !(buff.specialImages && buff.specialImages.length > 0)}
                <div class="buff-name-label" style:max-width={`${individualMonitorAllGroup.iconSize + 8}px`}>{buff.name.slice(0, 6)}</div>
              {/if}
              <div class="buff-icon-wrap" style:width={`${individualMonitorAllGroup.iconSize}px`} style:height={`${individualMonitorAllGroup.iconSize}px`}>
                <img
                  src={`/images/buff/${buff.spriteFile}`}
                  alt={buff.name}
                  class="buff-icon"
                />
                {#if individualMonitorAllGroup.showLayer && buff.layer > 1}
                  <div class="layer-badge">{buff.layer}</div>
                {/if}
              </div>
              {#if individualMonitorAllGroup.showTime}
                <div class="buff-time" style:font-size={`${Math.max(10, Math.round(individualMonitorAllGroup.iconSize * 0.26))}px`}>{buff.text}</div>
              {/if}
            </div>
          {/each}
        </div>
        {#if isEditing}
          <div
            class="resize-handle icon"
            onpointerdown={(e) =>
              startResize(e, { kind: "individualAllGroup" }, individualMonitorAllGroup.iconSize)}
          ></div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .overlay-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: transparent;
    user-select: none;
  }

  .overlay-root.editing {
    background-color: rgba(0, 0, 0, 0.22);
    background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
    background-size: 20px 20px;
    box-shadow: inset 0 0 0 3px rgba(255, 214, 102, 0.9);
  }

  .edit-banner {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(15, 15, 15, 0.76);
    border: 1px solid rgba(255, 255, 255, 0.25);
  }

  .window-drag-bar {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1000;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(30, 30, 30, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: move;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
  }

  .edit-title {
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }

  .done-btn {
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 12px;
    cursor: pointer;
  }

  .done-btn.secondary {
    background: rgba(80, 80, 80, 0.45);
  }

  .overlay-group {
    position: absolute;
    pointer-events: auto;
  }

  .overlay-group.editable {
    outline: 2px dashed rgba(255, 255, 255, 0.85);
    outline-offset: 3px;
    cursor: move;
  }

  .buff-group-container {
    min-width: 52px;
    padding: 0;
    border-radius: 0;
    background: transparent;
  }

  .buff-group-container.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    background: rgba(20, 36, 56, 0.5);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    padding: 8px;
  }

  .buff-group-grid {
    display: grid;
    align-items: start;
    justify-items: center;
  }

  .grouped-empty-tip {
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(30, 30, 30, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    font-size: 12px;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.9);
  }

  .skill-group.editable,
  .resource-group.editable,
  .text-buff-panel.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.45);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    padding: 8px;
  }

  .icon-buff-cell.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 8px;
    background: rgba(20, 36, 56, 0.55);
    padding: 4px 2px;
  }

  .group-tag {
    margin-bottom: 6px;
    padding: 3px 7px;
    border-radius: 6px;
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: rgba(255, 140, 0, 0.75);
    border: 1px solid rgba(255, 220, 170, 0.8);
  }

  .resize-handle {
    position: absolute;
    right: -10px;
    bottom: -10px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(255, 140, 0, 0.95);
    border: 2px solid rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    cursor: nwse-resize;
  }

  .resize-handle.icon {
    right: -8px;
    bottom: -8px;
    width: 14px;
    height: 14px;
  }

  .skill-cd-grid {
    display: grid;
    grid-template-columns: repeat(5, 52px);
    grid-template-rows: repeat(2, 52px);
    gap: 6px;
  }

  .skill-cell {
    position: relative;
    width: 52px;
    height: 52px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
  }

  .skill-cell.empty {
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .skill-cell.derived-active {
    border-color: rgba(255, 216, 102, 0.85);
    box-shadow: 0 0 8px rgba(255, 216, 102, 0.6);
  }

  .skill-icon {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .skill-icon.dimmed {
    filter: grayscale(80%) brightness(0.5);
  }

  .skill-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.7);
  }

  .cd-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: conic-gradient(
      rgba(0, 0, 0, 0.65) calc(var(--cd-percent) * 360deg),
      transparent calc(var(--cd-percent) * 360deg)
    );
  }

  .cd-text {
    font-size: 13px;
    font-weight: 600;
    color: #ffffff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }

  .charges-badge {
    position: absolute;
    right: 3px;
    bottom: 3px;
    padding: 1px 4px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.65);
    color: #ffffff;
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
  }

  .resources-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .resources-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .sharpness-row {
    margin-top: -2px;
  }

  .resources-panel[data-class="frost_mage"] {
    transform: scale(1.5);
    transform-origin: center;
  }

  .res-bar-container {
    position: relative;
    margin-top: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .res-bar-bg {
    display: block;
    height: 40px;
    width: auto;
  }

  .res-bar-fill-mask {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .res-bar-fill {
    display: block;
    height: 40px;
    width: auto;
  }

  .res-energy-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding: 0 43px 0 29px;
  }

  .res-energy-track {
    width: 100%;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    overflow: hidden;
  }

  .res-energy-fill {
    height: 100%;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
    transition: width 100ms linear;
  }

  .res-text {
    position: absolute;
    top: -17px;
    left: 0;
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.9);
  }

  .res-charges-container {
    display: flex;
    flex-direction: row;
  }

  .res-charge-icon {
    height: 24px;
    width: auto;
  }

  .icon-buff-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 52px;
  }

  .icon-buff-cell.placeholder {
    opacity: 0.6;
  }

  .buff-name-label {
    font-size: 10px;
    color: #ffffff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
    line-height: 1;
    max-width: 52px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .buff-icon-wrap {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
  }

  .buff-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .buff-time {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
    line-height: 1;
  }

  .layer-badge {
    position: absolute;
    right: 2px;
    top: 2px;
    padding: 1px 4px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.65);
    color: #ffffff;
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
  }

  .text-buff-panel {
    min-width: 220px;
    max-width: 320px;
    padding: 0;
    border-radius: 0;
    background: transparent;
    border: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .text-buff-title {
    font-size: 12px;
    font-weight: 700;
    color: #ffffff;
  }

  .text-buff-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 8px;
  }

  .text-buff-row.placeholder {
    opacity: 0.6;
  }

  .text-buff-name {
    font-size: 12px;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .text-buff-time {
    font-size: 12px;
    color: #ffffff;
    font-variant-numeric: tabular-nums;
  }

  .text-buff-decay {
    grid-column: 1 / -1;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.2);
    overflow: hidden;
  }

  .text-buff-decay-fill {
    height: 100%;
    background: #ffffff;
    transition: width 100ms linear;
  }

  .text-buff-layer {
    grid-column: 1 / -1;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.85);
  }

  .special-buff-icon {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.9));
  }

  :global(html),
  :global(body) {
    margin: 0;
    width: 100%;
    height: 100%;
    background: transparent !important;
    overflow: hidden;
  }
</style>
