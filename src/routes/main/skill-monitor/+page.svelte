<script lang="ts">
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import TabSkillCd from "./tab-skill-cd.svelte";
  import TabBuffMonitor from "./tab-buff-monitor.svelte";
  import TabPanelAttr from "./tab-panel-attr.svelte";
  import TabCustomPanel from "./tab-custom-panel.svelte";
  import TabOverlay from "./tab-overlay.svelte";
  import {
    expandBuffSelection,
    getAvailableBuffDefinitions,
    getBuffCategoryDefinitions,
    getBuffIdsByCategory,
    lookupDefaultBuffName,
    normalizeBuffCategoryKeys,
    resolveBuffDisplayName,
    searchBuffsByName,
    type BuffCategoryKey,
    type BuffCategoryDefinition,
    type BuffDefinition,
    type BuffNameInfo,
  } from "$lib/config/buff-name-table";
  import {
    AVAILABLE_PANEL_ATTRS,
    createDefaultBuffGroup,
    createDefaultCustomPanelGroup,
    ensureBuffAliases,
    SETTINGS,
    type BuffDisplayMode,
    type BuffGroup,
    type CustomPanelGroup,
    type CustomPanelStyle,
    type InlineBuffEntry,
    type PanelAttrConfig,
    type PanelAreaRowRef,
    type SkillMonitorProfile,
    type TextBuffPanelDisplayMode,
    type TextBuffPanelStyle,
  } from "$lib/settings-store";
  import {
    findResonanceSkill,
    ensureUserCounterRules,
    getCounterRules,
    getClassConfigs,
    getDurationSkillsByClass,
    getSlotTemplates,
    getSourceTemplates,
    getSkillsByClass,
    resolveUserCounterRulesToPresets,
    searchResonanceSkills,
    type CounterRulePreset,
  } from "$lib/skill-mappings";
  import { uiT } from "$lib/i18n";
  import {
    activeProfileOrDefault,
    updateActiveProfile as updateSharedActiveProfile,
  } from "$lib/skill-monitor-profile.svelte";

  type CounterRuleOption = CounterRulePreset & { origin: "preset" | "user" };

  const t = uiT("skill-monitor/general", () => SETTINGS.live.general.state.language);

  const availableBuffs = getAvailableBuffDefinitions();
  const buffCategoryDefinitions = getBuffCategoryDefinitions();
  let buffSearch = $state("");
  let buffSearchResults = $state<BuffNameInfo[]>([]);
  let globalPrioritySearch = $state("");
  let globalPrioritySearchResults = $state<BuffNameInfo[]>([]);
  let groupSearchKeyword = $state<Record<string, string>>({});
  let groupSearchResults = $state<Record<string, BuffNameInfo[]>>({});
  let groupPrioritySearchKeyword = $state<Record<string, string>>({});
  let groupPrioritySearchResults = $state<Record<string, BuffNameInfo[]>>({});
  let resonanceSearch = $state("");
  let inlineBuffSearch = $state("");
  let inlineBuffSearchResults = $state<BuffNameInfo[]>([]);
  let activeTab = $state<"skill-cd" | "buff" | "panel-attr" | "custom-panel" | "overlay">("skill-cd");
  let attrSectionExpanded = $state(false);
  let buffAliasSectionExpanded = $state(false);
  let buffAliasSearch = $state("");
  let buffAliasSearchResults = $state<BuffNameInfo[]>([]);
  let buffAliasEditingBuffId = $state<number | null>(null);

  const classConfigs = $derived(getClassConfigs());
  const counterRules = $derived(getCounterRules());
  const sourceTemplates = $derived(getSourceTemplates());
  const slotTemplates = $derived(getSlotTemplates());
  const buffAliases = $derived.by(() =>
    ensureBuffAliases(SETTINGS.skillMonitor.state.buffAliases),
  );
  const activeProfile = $derived.by(() => activeProfileOrDefault());
  const selectedClassKey = $derived(activeProfile.selectedClass);
  const classSkills = $derived(getSkillsByClass(selectedClassKey));
  const durationSkills = $derived(getDurationSkillsByClass(selectedClassKey));
  const monitoredSkillIds = $derived(activeProfile.monitoredSkillIds);
  const monitoredSkillDurationIds = $derived(
    activeProfile.monitoredSkillDurationIds ?? [],
  );
  const monitoredBuffIds = $derived(activeProfile.monitoredBuffIds);
  const monitoredBuffCategories = $derived.by(() =>
    normalizeBuffCategoryKeys(activeProfile.monitoredBuffCategories),
  );
  const expandedSelectedBuffIds = $derived.by(() =>
    expandBuffSelection(monitoredBuffIds, monitoredBuffCategories),
  );
  const monitoredPanelAttrs = $derived.by(() => ensurePanelAttrs(activeProfile));
  const panelAttrGap = $derived(ensureOverlaySizes(activeProfile).panelAttrGap);
  const panelAttrFontSize = $derived(ensureOverlaySizes(activeProfile).panelAttrFontSize);
  const panelAttrColumnGap = $derived(ensureOverlaySizes(activeProfile).panelAttrColumnGap);
  const showSkillCdGroup = $derived(
    activeProfile.overlayVisibility?.showSkillCdGroup ?? true,
  );
  const showSkillDurationGroup = $derived(
    activeProfile.overlayVisibility?.showSkillDurationGroup ?? true,
  );
  const showResourceGroup = $derived(
    activeProfile.overlayVisibility?.showResourceGroup ?? true,
  );
  const showPanelAttrGroup = $derived(
    activeProfile.overlayVisibility?.showPanelAttrGroup ?? true,
  );
  const showCustomPanelGroup = $derived(
    activeProfile.overlayVisibility?.showCustomPanelGroup ?? true,
  );
  const customPanelStyle = $derived.by(() => ensureCustomPanelStyle(activeProfile));
  const textBuffPanelStyle = $derived.by(() => ensureTextBuffPanelStyle(activeProfile));
  const buffDisplayMode = $derived(
    activeProfile.buffDisplayMode ?? "individual",
  );
  const buffGroups = $derived.by(() => ensureBuffGroups(activeProfile));
  const individualMonitorAllGroup = $derived.by(() => ensureIndividualMonitorAllGroup(activeProfile));
  const selectedBuffCategories = $derived.by<BuffCategoryDefinition[]>(() =>
    buffCategoryDefinitions.filter((category) =>
      monitoredBuffCategories.includes(category.key),
    ),
  );
  const configuredBuffAliasIds = $derived.by(() =>
    Object.keys(buffAliases)
      .map((baseId) => Number(baseId))
      .filter((baseId) => Number.isFinite(baseId))
      .sort((a, b) => a - b),
  );
  const buffPriorityIds = $derived.by(() => {
    const selected = new Set(expandedSelectedBuffIds);
    return uniqueIds((activeProfile.buffPriorityIds ?? []).filter((id) => selected.has(id)));
  });
  const textBuffMaxVisible = $derived(
    Math.max(1, Math.min(20, activeProfile.textBuffMaxVisible ?? 10)),
  );
  const resolvedUserCounterRules = $derived.by<CounterRuleOption[]>(() =>
    resolveUserCounterRulesToPresets(activeProfile.userCounterRules).map(
      (rule) => ({ ...rule, origin: "user" as const }),
    )
  );
  const allCounterRules = $derived.by<CounterRuleOption[]>(() => [
    ...counterRules.map((rule) => ({ ...rule, origin: "preset" as const })),
    ...resolvedUserCounterRules,
  ]);
  const customPanelGroups = $derived.by(() => ensureCustomPanelGroups(activeProfile));
  const panelAreaRowOrder = $derived.by(() => ensurePanelAreaRowOrder(activeProfile));
  const filteredInlineBuffSearchResults = $derived.by(() => {
    const ids = new Set<number>();
    return inlineBuffSearchResults.filter((item) => {
      if (ids.has(item.baseId)) return false;
      ids.add(item.baseId);
      return true;
    });
  });

  function uniqueIds(ids: number[]): number[] {
    return Array.from(new Set(ids));
  }

  function updateActiveProfile(
    updater: (profile: SkillMonitorProfile) => SkillMonitorProfile,
  ) {
    updateSharedActiveProfile(updater, { createDefaultIfEmpty: true });
  }

  function moveItem(ids: number[], item: number, direction: "up" | "down"): number[] {
    const idx = ids.indexOf(item);
    if (idx === -1) return ids;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= ids.length) return ids;
    const next = [...ids];
    const temp = next[idx];
    const targetValue = next[target];
    if (temp === undefined || targetValue === undefined) return ids;
    next[idx] = targetValue;
    next[target] = temp;
    return next;
  }

  function normalizeGroupPriorityIds(group: BuffGroup): number[] {
    if (group.monitorAll) {
      return uniqueIds(group.priorityBuffIds ?? []);
    }
    const inGroup = new Set(group.buffIds);
    return uniqueIds((group.priorityBuffIds ?? []).filter((id) => inGroup.has(id)));
  }

  function ensureBuffGroup(group: BuffGroup, index: number): BuffGroup {
    return {
      id: group.id ?? `group_${index + 1}`,
      name: group.name ?? `${t("buffGroupDefault", "分组")} ${index + 1}`,
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
    };
  }

  function ensureBuffGroups(profile: SkillMonitorProfile): BuffGroup[] {
    return (profile.buffGroups ?? []).map((group, idx) => ensureBuffGroup(group, idx));
  }

  function ensureIndividualMonitorAllGroup(profile: SkillMonitorProfile): BuffGroup | null {
    const group = profile.individualMonitorAllGroup;
    if (!group) return null;
    const normalized = ensureBuffGroup(group, 0);
    return {
      ...normalized,
      monitorAll: true,
      name: normalized.name || t("allBuffs", "全部 Buff"),
    };
  }

  function ensurePanelAttrs(profile: SkillMonitorProfile): PanelAttrConfig[] {
    const current = profile.monitoredPanelAttrs ?? [];
    const currentMap = new Map(current.map((item) => [item.attrId, item]));
    return AVAILABLE_PANEL_ATTRS.map((item) => {
      const existing = currentMap.get(item.attrId);
      return {
        attrId: item.attrId,
        label: existing?.label ?? item.label,
        color: existing?.color ?? item.color,
        enabled: existing?.enabled ?? item.enabled,
        format: existing?.format ?? item.format,
      };
    });
  }

  function ensureInlineBuffEntries(profile: SkillMonitorProfile): InlineBuffEntry[] {
    return (profile.inlineBuffEntries ?? []).map((entry, idx) => ({
      id: entry.id ?? `inline_${idx + 1}`,
      sourceType: entry.sourceType ?? "buff",
      sourceId: entry.sourceId,
      label: entry.sourceType === "counter"
        ? (entry.label ?? `${t("counterDefault", "计数器")} ${entry.sourceId}`)
        : (entry.label ?? ""),
      format: entry.format ?? "timer",
    }));
  }

  function ensureCustomPanelEntries(entries: InlineBuffEntry[] | undefined): InlineBuffEntry[] {
    return (entries ?? []).map((entry, idx) => ({
      id: entry.id ?? `inline_${idx + 1}`,
      sourceType: entry.sourceType ?? "buff",
      sourceId: entry.sourceId,
      label: entry.sourceType === "counter"
        ? (entry.label ?? `${t("counterDefault", "计数器")} ${entry.sourceId}`)
        : (entry.label ?? ""),
      format: entry.format ?? "timer",
    }));
  }

  function ensureCustomPanelGroups(profile: SkillMonitorProfile): CustomPanelGroup[] {
    const groups = profile.customPanelGroups ?? [];
    const legacyPosition = profile.overlayPositions?.customPanelGroup ?? { x: 700, y: 280 };
    const legacyScale = Math.max(
      0.5,
      Math.min(2.5, profile.overlaySizes?.customPanelGroupScale ?? 1),
    );
    if (groups.length > 0) {
      return groups.map((group, idx) => ({
        id: group.id ?? `custom_panel_group_${idx + 1}`,
        name: group.name ?? `${t("monitorAreaDefault", "监控区")} ${idx + 1}`,
        entries: ensureCustomPanelEntries(group.entries),
        position: group.position ?? {
          x: legacyPosition.x + idx * 40,
          y: legacyPosition.y + idx * 40,
        },
        scale: Math.max(0.5, Math.min(2.5, group.scale ?? (idx === 0 ? legacyScale : 1))),
      }));
    }
    const legacyEntries = ensureInlineBuffEntries(profile);
    if (legacyEntries.length === 0) return [];
    return [
      {
        id: "custom_panel_group_1",
        name: `${t("monitorAreaDefault", "监控区")} 1`,
        entries: legacyEntries,
        position: legacyPosition,
        scale: legacyScale,
      },
    ];
  }

  function isSameRowRef(a: PanelAreaRowRef, b: PanelAreaRowRef): boolean {
    return a.attrId === b.attrId;
  }

  function ensurePanelAreaRowOrder(profile: SkillMonitorProfile): PanelAreaRowRef[] {
    const enabledAttrIds = ensurePanelAttrs(profile)
      .filter((item) => item.enabled)
      .map((item) => item.attrId);
    const attrIdSet = new Set(enabledAttrIds);
    const normalized: PanelAreaRowRef[] = [];
    for (const row of profile.panelAreaRowOrder ?? []) {
      if (!attrIdSet.has(row.attrId)) continue;
      if (!normalized.some((item) => isSameRowRef(item, row))) {
        normalized.push({ type: "attr", attrId: row.attrId });
      }
    }
    for (const attrId of enabledAttrIds) {
      const row: PanelAreaRowRef = { type: "attr", attrId };
      if (!normalized.some((item) => isSameRowRef(item, row))) {
        normalized.push(row);
      }
    }
    return normalized;
  }

  function ensureOverlaySizes(profile: SkillMonitorProfile) {
    const current = profile.overlaySizes;
    return {
      skillCdGroupScale: current?.skillCdGroupScale ?? 1,
      resourceGroupScale: current?.resourceGroupScale ?? 1,
      textBuffPanelScale: current?.textBuffPanelScale ?? 1,
      panelAttrGroupScale: current?.panelAttrGroupScale ?? 1,
      customPanelGroupScale: current?.customPanelGroupScale ?? 1,
      panelAttrGap: Math.max(0, Math.min(24, Math.round(current?.panelAttrGap ?? 4))),
      panelAttrFontSize: Math.max(
        10,
        Math.min(28, Math.round(current?.panelAttrFontSize ?? 14)),
      ),
      panelAttrColumnGap: Math.max(
        0,
        Math.min(240, Math.round(current?.panelAttrColumnGap ?? 12)),
      ),
      iconBuffSizes: current?.iconBuffSizes ?? {},
      skillDurationSizes: current?.skillDurationSizes ?? {},
      categoryIconSizes: current?.categoryIconSizes ?? {},
    };
  }

  function ensureCustomPanelStyle(profile: SkillMonitorProfile): CustomPanelStyle {
    const current = profile.customPanelStyle;
    return {
      gap: Math.max(0, Math.min(24, Math.round(current?.gap ?? 6))),
      columnGap: Math.max(0, Math.min(240, Math.round(current?.columnGap ?? 12))),
      fontSize: Math.max(10, Math.min(28, Math.round(current?.fontSize ?? 14))),
      nameColor: current?.nameColor ?? "#ffffff",
      valueColor: current?.valueColor ?? "#ffffff",
      progressColor: current?.progressColor ?? "#ffffff",
      progressOpacity: Math.max(0, Math.min(1, current?.progressOpacity ?? 0.4)),
    };
  }

  function ensureTextBuffPanelStyle(profile: SkillMonitorProfile): TextBuffPanelStyle {
    const current = profile.textBuffPanelStyle;
    return {
      displayMode: current?.displayMode === "classic" ? "classic" : "modern",
      gap: Math.max(0, Math.min(24, Math.round(current?.gap ?? 6))),
      columnGap: Math.max(0, Math.min(240, Math.round(current?.columnGap ?? 8))),
      fontSize: Math.max(10, Math.min(28, Math.round(current?.fontSize ?? 12))),
      nameColor: current?.nameColor ?? "#ffffff",
      valueColor: current?.valueColor ?? "#ffffff",
      progressColor: current?.progressColor ?? "#ffffff",
      progressOpacity: Math.max(0, Math.min(1, current?.progressOpacity ?? 0.4)),
    };
  }


  function setSelectedClass(classKey: string) {
    updateActiveProfile((profile) => ({
      ...profile,
      selectedClass: classKey,
      monitoredSkillIds: [],
      monitoredSkillDurationIds: [],
    }));
  }

  function toggleSkill(skillId: number) {
    const current = monitoredSkillIds;
    const exists = current.includes(skillId);
    if (exists) {
      updateActiveProfile((profile) => ({
        ...profile,
        monitoredSkillIds: current.filter((id) => id !== skillId),
      }));
      return;
    }
    if (current.length >= 10) return;
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredSkillIds: [...current, skillId],
    }));
  }

  function isSelected(skillId: number): boolean {
    return monitoredSkillIds.includes(skillId);
  }

  function toggleSkillDuration(skillId: number) {
    const current = monitoredSkillDurationIds;
    const exists = current.includes(skillId);
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredSkillDurationIds: exists
        ? current.filter((id) => id !== skillId)
        : [...current, skillId],
    }));
  }

  function isDurationSelected(skillId: number): boolean {
    return monitoredSkillDurationIds.includes(skillId);
  }

  const filteredResonanceSkills = $derived.by(() =>
    searchResonanceSkills(resonanceSearch),
  );
  const selectedResonanceSkills = $derived.by(
    () =>
      monitoredSkillIds
        .map((id) => findResonanceSkill(id))
        .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
        .slice(0, 10),
  );

  function clearSkills() {
    updateActiveProfile((profile) => ({ ...profile, monitoredSkillIds: [] }));
  }

  function clearSkillDurations() {
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredSkillDurationIds: [],
    }));
  }

  function clearBuffs() {
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredBuffIds: [],
      monitoredBuffCategories: [],
      buffPriorityIds: [],
    }));
  }

  function filterPriorityIdsForSelection(
    profile: SkillMonitorProfile,
    nextBuffIds: number[],
    nextCategories: BuffCategoryKey[],
  ): number[] {
    const expandedIds = new Set(expandBuffSelection(nextBuffIds, nextCategories));
    return uniqueIds((profile.buffPriorityIds ?? []).filter((id) => expandedIds.has(id)));
  }

  function setResonanceSearch(value: string) {
    resonanceSearch = value;
  }

  function setBuffSearch(value: string) {
    buffSearch = value;
  }

  function getBuffDisplayName(buffId: number): string {
    return resolveBuffDisplayName(buffId, buffAliases);
  }

  function getBuffDefaultName(buffId: number): string {
    return lookupDefaultBuffName(buffId) ?? `#${buffId}`;
  }

  function getBuffAlias(buffId: number): string {
    return buffAliases[String(buffId)] ?? "";
  }

  function setBuffAlias(buffId: number, alias: string) {
    const next = { ...buffAliases };
    const trimmed = alias.trim();
    if (trimmed) {
      next[String(buffId)] = trimmed;
    } else {
      delete next[String(buffId)];
    }
    SETTINGS.skillMonitor.state.buffAliases = next;
  }

  function resetBuffAlias(buffId: number) {
    const next = { ...buffAliases };
    delete next[String(buffId)];
    SETTINGS.skillMonitor.state.buffAliases = next;
  }

  function setGlobalPrioritySearch(value: string) {
    globalPrioritySearch = value;
  }

  function setAttrSectionExpanded(expanded: boolean) {
    attrSectionExpanded = expanded;
  }

  function setBuffAliasSectionExpanded(expanded: boolean) {
    buffAliasSectionExpanded = expanded;
  }

  function setBuffAliasEditingBuffId(buffId: number | null) {
    buffAliasEditingBuffId = buffId;
  }

  function toggleBuff(buffId: number) {
    const current = monitoredBuffIds;
    const exists = current.includes(buffId);
    if (exists) {
      const nextBuffIds = current.filter((id) => id !== buffId);
      updateActiveProfile((profile) => ({
        ...profile,
        monitoredBuffIds: nextBuffIds,
        buffPriorityIds: filterPriorityIdsForSelection(
          profile,
          nextBuffIds,
          normalizeBuffCategoryKeys(profile.monitoredBuffCategories),
        ),
      }));
      return;
    }
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredBuffIds: [...current, buffId],
    }));
  }

  function toggleBuffCategory(categoryKey: BuffCategoryKey) {
    updateActiveProfile((profile) => {
      const current = normalizeBuffCategoryKeys(profile.monitoredBuffCategories);
      const nextCategories = current.includes(categoryKey)
        ? current.filter((key) => key !== categoryKey)
        : [...current, categoryKey];
      return {
        ...profile,
        monitoredBuffCategories: nextCategories,
        buffPriorityIds: filterPriorityIdsForSelection(
          profile,
          profile.monitoredBuffIds ?? [],
          nextCategories,
        ),
      };
    });
  }

  function toggleGlobalPriority(buffId: number) {
    updateActiveProfile((profile) => {
      const current = uniqueIds(profile.buffPriorityIds ?? []);
      const exists = current.includes(buffId);
      return {
        ...profile,
        buffPriorityIds: exists ? current.filter((id) => id !== buffId) : [...current, buffId],
      };
    });
  }

  function isBuffSelected(buffId: number): boolean {
    return monitoredBuffIds.includes(buffId);
  }

  function isBuffCategorySelected(categoryKey: BuffCategoryKey): boolean {
    return monitoredBuffCategories.includes(categoryKey);
  }

  const filteredBuffs = $derived.by(() => {
    const ids = new Set<number>();
    const merged: BuffNameInfo[] = [];
    for (const item of buffSearchResults) {
      if (ids.has(item.baseId)) continue;
      ids.add(item.baseId);
      merged.push(item);
    }
    return merged;
  });
  const availableBuffMap = $derived.by(() => {
    const map = new Map<number, BuffDefinition>();
    for (const buff of availableBuffs) {
      map.set(buff.baseId, buff);
    }
    return map;
  });
  const selectedBuffs = $derived.by(
    () =>
      monitoredBuffIds
        .map((id) => availableBuffMap.get(id))
        .filter(Boolean) as BuffDefinition[],
  );

  $effect(() => {
    buffSearchResults = searchBuffsByName(buffSearch, buffAliases);
  });

  $effect(() => {
    globalPrioritySearchResults = searchBuffsByName(globalPrioritySearch, buffAliases);
  });

  $effect(() => {
    inlineBuffSearchResults = searchBuffsByName(inlineBuffSearch, buffAliases);
  });

  $effect(() => {
    buffAliasSearchResults = searchBuffsByName(buffAliasSearch, buffAliases);
  });

  function setBuffAliasSearch(value: string) {
    buffAliasSearch = value;
    if (!value.trim()) {
      buffAliasEditingBuffId = null;
    }
  }

  function setOverlaySectionVisibility(
    key:
      | "showSkillCdGroup"
      | "showSkillDurationGroup"
      | "showResourceGroup"
      | "showPanelAttrGroup"
      | "showCustomPanelGroup",
    checked: boolean,
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      overlayVisibility: {
        showSkillCdGroup: profile.overlayVisibility?.showSkillCdGroup ?? true,
        showSkillDurationGroup:
          profile.overlayVisibility?.showSkillDurationGroup ?? true,
        showResourceGroup: profile.overlayVisibility?.showResourceGroup ?? true,
        showPanelAttrGroup: profile.overlayVisibility?.showPanelAttrGroup ?? true,
        showCustomPanelGroup: profile.overlayVisibility?.showCustomPanelGroup ?? true,
        [key]: checked,
      },
    }));
  }

  function toggleOverlaySectionVisibility(
    key:
      | "showSkillCdGroup"
      | "showSkillDurationGroup"
      | "showResourceGroup"
      | "showPanelAttrGroup"
      | "showCustomPanelGroup",
  ) {
    const current = key === "showSkillCdGroup"
      ? showSkillCdGroup
      : key === "showSkillDurationGroup"
      ? showSkillDurationGroup
      : key === "showResourceGroup"
      ? showResourceGroup
      : key === "showPanelAttrGroup"
      ? showPanelAttrGroup
      : showCustomPanelGroup;
    setOverlaySectionVisibility(key, !current);
  }

  function setPanelAttrEnabled(attrId: number, enabled: boolean) {
    updateActiveProfile((profile) => {
      const nextAttrs = ensurePanelAttrs(profile).map((item) =>
        item.attrId === attrId ? { ...item, enabled } : item
      );
      let nextOrder = ensurePanelAreaRowOrder(profile).filter((row) =>
        nextAttrs.some((item) => item.enabled && item.attrId === row.attrId)
      );
      if (enabled && !nextOrder.some((row) => row.type === "attr" && row.attrId === attrId)) {
        nextOrder = [...nextOrder, { type: "attr", attrId }];
      }
      return {
        ...profile,
        monitoredPanelAttrs: nextAttrs,
        panelAreaRowOrder: nextOrder,
      };
    });
  }

  function setPanelAttrColor(attrId: number, color: string) {
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredPanelAttrs: ensurePanelAttrs(profile).map((item) =>
        item.attrId === attrId ? { ...item, color } : item
      ),
    }));
  }

  function setPanelAttrGap(value: number) {
    const nextValue = Math.max(0, Math.min(24, Math.round(value)));
    updateActiveProfile((profile) => ({
      ...profile,
      overlaySizes: {
        ...ensureOverlaySizes(profile),
        panelAttrGap: nextValue,
      },
    }));
  }

  function setPanelAttrFontSize(value: number) {
    const nextValue = Math.max(10, Math.min(28, Math.round(value)));
    updateActiveProfile((profile) => ({
      ...profile,
      overlaySizes: {
        ...ensureOverlaySizes(profile),
        panelAttrFontSize: nextValue,
      },
    }));
  }

  function setPanelAttrColumnGap(value: number) {
    const nextValue = Math.max(0, Math.min(240, Math.round(value)));
    updateActiveProfile((profile) => ({
      ...profile,
      overlaySizes: {
        ...ensureOverlaySizes(profile),
        panelAttrColumnGap: nextValue,
      },
    }));
  }

  function setInlineBuffSearch(value: string) {
    inlineBuffSearch = value;
  }

  function updateCustomPanelGroups(
    updater: (groups: CustomPanelGroup[]) => CustomPanelGroup[],
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      customPanelGroups: updater(ensureCustomPanelGroups(profile)),
      inlineBuffEntries: [],
    }));
  }
  function getNextUserCounterRuleId(profile: SkillMonitorProfile): number {
    const highestPresetRuleId = counterRules.reduce(
      (maxId, rule) => Math.max(maxId, rule.ruleId),
      10000,
    );
    const highestUserRuleId = ensureUserCounterRules(profile.userCounterRules).reduce(
      (maxId, rule) => Math.max(maxId, rule.ruleId),
      10000,
    );
    return Math.max(highestPresetRuleId, highestUserRuleId, 10000) + 1;
  }

  function addUserCounterRule(name: string, sourceRefs: string[], slotRefs: string[]) {
    const nextName = name.trim();
    const nextSourceRefs = Array.from(
      new Set(sourceRefs.filter((item) => typeof item === "string" && item.trim())),
    );
    const nextSlotRefs = Array.from(
      new Set(slotRefs.filter((item) => typeof item === "string" && item.trim())),
    );
    if (!nextName || nextSourceRefs.length === 0 || nextSlotRefs.length === 0) {
      return;
    }
    updateActiveProfile((profile) => ({
      ...profile,
      userCounterRules: [
        ...ensureUserCounterRules(profile.userCounterRules),
        {
          ruleId: getNextUserCounterRuleId(profile),
          name: nextName,
          sourceRefs: nextSourceRefs,
          slotRefs: nextSlotRefs,
        },
      ],
    }));
  }

  function removeUserCounterRule(ruleId: number) {
    updateActiveProfile((profile) => ({
      ...profile,
      userCounterRules: ensureUserCounterRules(profile.userCounterRules).filter((rule) =>
        rule.ruleId !== ruleId
      ),
      customPanelGroups: ensureCustomPanelGroups(profile).map((group) => ({
        ...group,
        entries: group.entries.filter((entry) =>
          !(entry.sourceType === "counter" && entry.sourceId === ruleId)
        ),
      })),
      inlineBuffEntries: ensureInlineBuffEntries(profile).filter((entry) =>
        !(entry.sourceType === "counter" && entry.sourceId === ruleId)
      ),
    }));
  }


  function findCustomPanelEntryLocation(
    sourceType: InlineBuffEntry["sourceType"],
    sourceId: number,
    counterSlotId: number | undefined,
    groups: CustomPanelGroup[],
  ): { groupId: string; groupName: string } | null {
    for (const group of groups) {
      if (group.entries.some((entry) =>
        entry.sourceType === sourceType
        && entry.sourceId === sourceId
        && (sourceType !== "counter" || entry.counterSlotId === counterSlotId)
      )) {
        return { groupId: group.id, groupName: group.name };
      }
    }
    return null;
  }

  function updateCustomPanelStyle(
    updater: (style: CustomPanelStyle) => CustomPanelStyle,
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      customPanelStyle: updater(ensureCustomPanelStyle(profile)),
    }));
  }

  function setCustomPanelGap(value: number) {
    const nextValue = Math.max(0, Math.min(24, Math.round(value)));
    updateCustomPanelStyle((style) => ({ ...style, gap: nextValue }));
  }

  function setCustomPanelFontSize(value: number) {
    const nextValue = Math.max(10, Math.min(28, Math.round(value)));
    updateCustomPanelStyle((style) => ({ ...style, fontSize: nextValue }));
  }

  function setCustomPanelColumnGap(value: number) {
    const nextValue = Math.max(0, Math.min(240, Math.round(value)));
    updateCustomPanelStyle((style) => ({ ...style, columnGap: nextValue }));
  }

  function setCustomPanelNameColor(value: string) {
    updateCustomPanelStyle((style) => ({ ...style, nameColor: value }));
  }

  function setCustomPanelValueColor(value: string) {
    updateCustomPanelStyle((style) => ({ ...style, valueColor: value }));
  }

  function setCustomPanelProgressColor(value: string) {
    updateCustomPanelStyle((style) => ({ ...style, progressColor: value }));
  }

  function setCustomPanelProgressOpacity(value: number) {
    updateCustomPanelStyle((style) => ({
      ...style,
      progressOpacity: Math.max(0, Math.min(1, value)),
    }));
  }

  function addCustomPanelGroup() {
    updateCustomPanelGroups((groups) => [
      ...groups,
      createDefaultCustomPanelGroup(`${t("monitorAreaDefault", "监控区")} ${groups.length + 1}`, groups.length + 1),
    ]);
  }

  function removeCustomPanelGroup(groupId: string) {
    updateCustomPanelGroups((groups) =>
      groups.filter((group) => group.id !== groupId)
    );
  }

  function renameCustomPanelGroup(groupId: string, name: string) {
    updateCustomPanelGroups((groups) =>
      groups.map((group) =>
        group.id === groupId
          ? { ...group, name: name.trim() || group.name }
          : group
      )
    );
  }

  function updateTextBuffPanelStyle(
    updater: (style: TextBuffPanelStyle) => TextBuffPanelStyle,
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      textBuffPanelStyle: updater(ensureTextBuffPanelStyle(profile)),
    }));
  }

  function setTextBuffPanelDisplayMode(value: TextBuffPanelDisplayMode) {
    updateTextBuffPanelStyle((style) => ({ ...style, displayMode: value }));
  }

  function setTextBuffPanelGap(value: number) {
    const nextValue = Math.max(0, Math.min(24, Math.round(value)));
    updateTextBuffPanelStyle((style) => ({ ...style, gap: nextValue }));
  }

  function setTextBuffPanelFontSize(value: number) {
    const nextValue = Math.max(10, Math.min(28, Math.round(value)));
    updateTextBuffPanelStyle((style) => ({ ...style, fontSize: nextValue }));
  }

  function setTextBuffPanelColumnGap(value: number) {
    const nextValue = Math.max(0, Math.min(240, Math.round(value)));
    updateTextBuffPanelStyle((style) => ({ ...style, columnGap: nextValue }));
  }

  function setTextBuffPanelNameColor(value: string) {
    updateTextBuffPanelStyle((style) => ({ ...style, nameColor: value }));
  }

  function setTextBuffPanelValueColor(value: string) {
    updateTextBuffPanelStyle((style) => ({ ...style, valueColor: value }));
  }

  function setTextBuffPanelProgressColor(value: string) {
    updateTextBuffPanelStyle((style) => ({ ...style, progressColor: value }));
  }

  function setTextBuffPanelProgressOpacity(value: number) {
    updateTextBuffPanelStyle((style) => ({
      ...style,
      progressOpacity: Math.max(0, Math.min(1, value)),
    }));
  }

  function addCustomPanelEntry(
    groupId: string,
    sourceType: "buff" | "counter",
    sourceId: number,
    counterSlotId?: number,
  ) {
    updateActiveProfile((profile) => {
      const groups = ensureCustomPanelGroups(profile);
      if (findCustomPanelEntryLocation(sourceType, sourceId, counterSlotId, groups)) {
        return profile;
      }
      const label = sourceType === "counter"
        ? (counterRules.find((rule) => rule.ruleId === sourceId)?.name ?? `${t("counterDefault", "计数器")} ${sourceId}`)
        : "";
      const nextEntry: InlineBuffEntry = {
        id: `inline_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        sourceType,
        sourceId,
        ...(counterSlotId !== undefined ? { counterSlotId } : {}),
        label,
        format: "timer",
      };
      return {
        ...profile,
        customPanelGroups: groups.map((group) =>
          group.id === groupId
            ? { ...group, entries: [...group.entries, nextEntry] }
            : group
        ),
        inlineBuffEntries: [],
      };
    });
  }

  function removeCustomPanelEntry(groupId: string, entryId: string) {
    updateCustomPanelGroups((groups) =>
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              entries: group.entries.filter((entry) => entry.id !== entryId),
            }
          : group
      )
    );
  }

  function updateCustomPanelEntry(
    groupId: string,
    entryId: string,
    updater: (entry: InlineBuffEntry) => InlineBuffEntry,
  ) {
    updateCustomPanelGroups((groups) =>
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              entries: group.entries.map((entry) =>
                entry.id === entryId ? updater(entry) : entry
              ),
            }
          : group
      )
    );
  }

  function setCustomPanelEntryLabel(groupId: string, entryId: string, label: string) {
    updateCustomPanelEntry(groupId, entryId, (entry) => ({ ...entry, label }));
  }

  function movePanelAreaRow(row: PanelAreaRowRef, direction: "up" | "down") {
    updateActiveProfile((profile) => {
      const current = ensurePanelAreaRowOrder(profile);
      const idx = current.findIndex((item) => item.attrId === row.attrId);
      if (idx === -1) return profile;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= current.length) return profile;
      const next = [...current];
      const temp = next[idx];
      const targetValue = next[target];
      if (!temp || !targetValue) return profile;
      next[idx] = targetValue;
      next[target] = temp;
      return {
        ...profile,
        panelAreaRowOrder: next,
      };
    });
  }

  function moveCustomPanelEntry(
    groupId: string,
    entryId: string,
    direction: "up" | "down",
  ) {
    updateCustomPanelGroups((groups) =>
      groups.map((group) => {
        if (group.id !== groupId) return group;
        const idx = group.entries.findIndex((entry) => entry.id === entryId);
        if (idx < 0) return group;
        const target = direction === "up" ? idx - 1 : idx + 1;
        if (target < 0 || target >= group.entries.length) return group;
        const next = [...group.entries];
        const temp = next[idx];
        const targetValue = next[target];
        if (!temp || !targetValue) return group;
        next[idx] = targetValue;
        next[target] = temp;
        return {
          ...group,
          entries: next,
        };
      })
    );
  }

  function setBuffDisplayMode(mode: BuffDisplayMode) {
    updateActiveProfile((profile) => ({
      ...profile,
      buffDisplayMode: mode,
      buffPriorityIds: uniqueIds(profile.buffPriorityIds ?? []),
      textBuffMaxVisible: Math.max(1, Math.min(20, profile.textBuffMaxVisible ?? 10)),
      buffGroups: ensureBuffGroups(profile),
    }));
  }

  function setTextBuffMaxVisible(value: number) {
    const nextValue = Math.max(1, Math.min(20, Math.round(value)));
    updateActiveProfile((profile) => ({
      ...profile,
      textBuffMaxVisible: nextValue,
    }));
  }

  function updateBuffGroup(groupId: string, updater: (group: BuffGroup) => BuffGroup) {
    updateActiveProfile((profile) => ({
      ...profile,
      buffGroups: ensureBuffGroups(profile).map((group) =>
        group.id === groupId
          ? (() => {
              const updated = updater(group);
              return {
                ...updated,
                priorityBuffIds: normalizeGroupPriorityIds(updated),
              };
            })()
          : group,
      ),
    }));
  }

  function addBuffGroup() {
    updateActiveProfile((profile) => {
      const groups = ensureBuffGroups(profile);
      return {
        ...profile,
        buffGroups: [...groups, createDefaultBuffGroup(`${t("buffGroupDefault", "分组")} ${groups.length + 1}`, groups.length + 1)],
      };
    });
  }

  function removeBuffGroup(groupId: string) {
    updateActiveProfile((profile) => ({
      ...profile,
      buffGroups: ensureBuffGroups(profile).filter((group) => group.id !== groupId),
    }));
    const nextKeyword = { ...groupSearchKeyword };
    delete nextKeyword[groupId];
    groupSearchKeyword = nextKeyword;
    const nextResults = { ...groupSearchResults };
    delete nextResults[groupId];
    groupSearchResults = nextResults;
    const nextPriorityKeyword = { ...groupPrioritySearchKeyword };
    delete nextPriorityKeyword[groupId];
    groupPrioritySearchKeyword = nextPriorityKeyword;
    const nextPriorityResults = { ...groupPrioritySearchResults };
    delete nextPriorityResults[groupId];
    groupPrioritySearchResults = nextPriorityResults;
  }

  function addIndividualMonitorAll() {
    updateActiveProfile((profile) => {
      const existing = ensureIndividualMonitorAllGroup(profile);
      if (existing) return profile;
      return {
        ...profile,
        individualMonitorAllGroup: {
          ...createDefaultBuffGroup(t("allBuffs", "全部 Buff"), 1),
          monitorAll: true,
        },
      };
    });
  }

  function removeIndividualMonitorAll() {
    updateActiveProfile((profile) => ({
      ...profile,
      individualMonitorAllGroup: null,
    }));
  }

  function updateIndividualMonitorAllGroup(updater: (group: BuffGroup) => BuffGroup) {
    updateActiveProfile((profile) => {
      const current = ensureIndividualMonitorAllGroup(profile);
      if (!current) return profile;
      const updated = ensureBuffGroup(updater(current), 0);
      return {
        ...profile,
        individualMonitorAllGroup: {
          ...updated,
          monitorAll: true,
        },
      };
    });
  }

  function setGroupSearchKeyword(groupId: string, value: string) {
    groupSearchKeyword = { ...groupSearchKeyword, [groupId]: value };
    const keyword = value.trim();
    if (!keyword) {
      groupSearchResults = { ...groupSearchResults, [groupId]: [] };
      return;
    }
    groupSearchResults = {
      ...groupSearchResults,
      [groupId]: searchBuffsByName(keyword, buffAliases),
    };
  }

  function getGroupSearchKeyword(groupId: string) {
    return groupSearchKeyword[groupId] ?? "";
  }

  function setGroupPrioritySearchKeyword(groupId: string, value: string) {
    groupPrioritySearchKeyword = { ...groupPrioritySearchKeyword, [groupId]: value };
    const keyword = value.trim();
    if (!keyword) {
      groupPrioritySearchResults = { ...groupPrioritySearchResults, [groupId]: [] };
      return;
    }
    groupPrioritySearchResults = {
      ...groupPrioritySearchResults,
      [groupId]: searchBuffsByName(keyword, buffAliases),
    };
  }

  function getGroupPrioritySearchKeyword(groupId: string) {
    return groupPrioritySearchKeyword[groupId] ?? "";
  }

  function getGroupSearchResults(group: BuffGroup): BuffNameInfo[] {
    const results = groupSearchResults[group.id] ?? [];
    const ids = new Set<number>();
    return results.filter((item) => {
      if (ids.has(item.baseId)) return false;
      if (group.buffIds.includes(item.baseId)) return false;
      if (group.priorityBuffIds.includes(item.baseId)) return false;
      ids.add(item.baseId);
      return true;
    });
  }

  function getGroupPrioritySearchResults(group: BuffGroup): BuffNameInfo[] {
    const results = groupPrioritySearchResults[group.id] ?? [];
    const ids = new Set<number>();
    return results.filter((item) => {
      if (ids.has(item.baseId)) return false;
      if (!group.monitorAll && !group.buffIds.includes(item.baseId)) return false;
      if (group.priorityBuffIds.includes(item.baseId)) return false;
      ids.add(item.baseId);
      return true;
    });
  }

  function getGroupPriorityIds(group: BuffGroup): number[] {
    return normalizeGroupPriorityIds(group);
  }

  function toggleBuffInGroup(groupId: string, buffId: number) {
    updateBuffGroup(groupId, (group) => {
      const exists = group.buffIds.includes(buffId);
      return {
        ...group,
        buffIds: exists
          ? group.buffIds.filter((id) => id !== buffId)
          : [...group.buffIds, buffId],
        priorityBuffIds: exists
          ? group.priorityBuffIds.filter((id) => id !== buffId)
          : group.priorityBuffIds,
      };
    });
  }

  function toggleBuffCategoryInGroup(groupId: string, categoryKey: BuffCategoryKey) {
    const categoryBuffIds = getBuffIdsByCategory(categoryKey);
    if (categoryBuffIds.length === 0) return;
    updateBuffGroup(groupId, (group) => {
      const hasCompleteCategory = categoryBuffIds.every((buffId) =>
        group.buffIds.includes(buffId),
      );
      if (hasCompleteCategory) {
        const categoryBuffIdSet = new Set(categoryBuffIds);
        return {
          ...group,
          buffIds: group.buffIds.filter((buffId) => !categoryBuffIdSet.has(buffId)),
          priorityBuffIds: group.priorityBuffIds.filter(
            (buffId) => !categoryBuffIdSet.has(buffId),
          ),
        };
      }
      return {
        ...group,
        buffIds: uniqueIds([...group.buffIds, ...categoryBuffIds]),
      };
    });
  }

  function hasCompleteBuffCategoryInGroup(
    group: BuffGroup,
    categoryKey: BuffCategoryKey,
  ): boolean {
    const categoryBuffIds = getBuffIdsByCategory(categoryKey);
    return categoryBuffIds.length > 0
      && categoryBuffIds.every((buffId) => group.buffIds.includes(buffId));
  }

  function togglePriorityInGroup(groupId: string, buffId: number) {
    updateBuffGroup(groupId, (group) => {
      const exists = group.priorityBuffIds.includes(buffId);
      return {
        ...group,
        priorityBuffIds: exists
          ? group.priorityBuffIds.filter((id) => id !== buffId)
          : uniqueIds([...group.priorityBuffIds, buffId]),
      };
    });
  }

  function moveGlobalPriority(buffId: number, direction: "up" | "down") {
    updateActiveProfile((profile) => ({
      ...profile,
      buffPriorityIds: moveItem(buffPriorityIds, buffId, direction),
    }));
  }

  function moveGroupPriority(groupId: string, buffId: number, direction: "up" | "down") {
    updateBuffGroup(groupId, (group) => ({
      ...group,
      priorityBuffIds: moveItem(normalizeGroupPriorityIds(group), buffId, direction),
    }));
  }

</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border/60 bg-card/40 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)] space-y-2">
    <SettingsSwitch
      bind:checked={SETTINGS.skillMonitor.state.enabled}
      label={t("enableMonitoring", "启用实时监控")}
      description={t("enableMonitoringDescription", "开启后将实时推送监控数据到悬浮窗口")}
    />
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {activeTab === 'skill-cd'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "skill-cd")}
      >
        {t("tab.skillCd", "技能CD")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {activeTab === 'buff'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "buff")}
      >
        {t("tab.buffMonitor", "Buff监控")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {activeTab === 'panel-attr'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "panel-attr")}
      >
        {t("tab.panelAttr", "角色面板")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {activeTab === 'custom-panel'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "custom-panel")}
      >
        {t("tab.customPanel", "自定义监控")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {activeTab === 'overlay'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "overlay")}
      >
        {t("tab.overlay", "启用窗口")}
      </button>
    </div>
  </div>

  {#if activeTab === "skill-cd"}
    <TabSkillCd
      {classConfigs}
      {selectedClassKey}
      {classSkills}
      {durationSkills}
      {monitoredSkillIds}
      {monitoredSkillDurationIds}
      {resonanceSearch}
      {filteredResonanceSkills}
      {selectedResonanceSkills}
      {setSelectedClass}
      {toggleSkill}
      {isSelected}
      {toggleSkillDuration}
      {isDurationSelected}
      {clearSkills}
      {clearSkillDurations}
      {setResonanceSearch}
    />
  {:else if activeTab === "buff"}
    <TabBuffMonitor
      {buffSearch}
      {filteredBuffs}
      {monitoredBuffIds}
      {monitoredBuffCategories}
      {expandedSelectedBuffIds}
      {selectedBuffs}
      {selectedBuffCategories}
      {availableBuffs}
      {buffCategoryDefinitions}
      {availableBuffMap}
      {buffAliasSectionExpanded}
      {setBuffAliasSectionExpanded}
      {buffAliasSearch}
      {setBuffAliasSearch}
      {buffAliasSearchResults}
      {buffAliasEditingBuffId}
      {setBuffAliasEditingBuffId}
      {configuredBuffAliasIds}
      {getBuffDisplayName}
      {getBuffDefaultName}
      {getBuffAlias}
      {setBuffAlias}
      {resetBuffAlias}
      {isBuffSelected}
      {isBuffCategorySelected}
      {toggleBuff}
      {toggleBuffCategory}
      {clearBuffs}
      {setBuffSearch}
      {buffDisplayMode}
      {setBuffDisplayMode}
      {textBuffMaxVisible}
      {setTextBuffMaxVisible}
      {textBuffPanelStyle}
      {setTextBuffPanelDisplayMode}
      {setTextBuffPanelGap}
      {setTextBuffPanelFontSize}
      {setTextBuffPanelColumnGap}
      {setTextBuffPanelNameColor}
      {setTextBuffPanelValueColor}
      {setTextBuffPanelProgressColor}
      {setTextBuffPanelProgressOpacity}
      {globalPrioritySearch}
      {globalPrioritySearchResults}
      {setGlobalPrioritySearch}
      {buffPriorityIds}
      {toggleGlobalPriority}
      {moveGlobalPriority}
      {individualMonitorAllGroup}
      {addIndividualMonitorAll}
      {removeIndividualMonitorAll}
      {updateIndividualMonitorAllGroup}
      {buffGroups}
      {addBuffGroup}
      {removeBuffGroup}
      {updateBuffGroup}
      {getGroupSearchKeyword}
      {setGroupSearchKeyword}
      {getGroupSearchResults}
      {getGroupPrioritySearchKeyword}
      {setGroupPrioritySearchKeyword}
      {getGroupPrioritySearchResults}
      {getGroupPriorityIds}
      {toggleBuffCategoryInGroup}
      {hasCompleteBuffCategoryInGroup}
      {toggleBuffInGroup}
      {togglePriorityInGroup}
      {moveGroupPriority}
    />
  {:else if activeTab === "panel-attr"}
    <TabPanelAttr
      {attrSectionExpanded}
      {monitoredPanelAttrs}
      {panelAttrGap}
      {panelAttrFontSize}
      {panelAttrColumnGap}
      {panelAreaRowOrder}
      {setAttrSectionExpanded}
      {setPanelAttrEnabled}
      {setPanelAttrColor}
      {setPanelAttrGap}
      {setPanelAttrFontSize}
      {setPanelAttrColumnGap}
      {movePanelAreaRow}
    />
  {:else if activeTab === "custom-panel"}
    <TabCustomPanel
      counterRules={allCounterRules}
      {sourceTemplates}
      {slotTemplates}
      {availableBuffMap}
      {getBuffDisplayName}
      {inlineBuffSearch}
      {filteredInlineBuffSearchResults}
      {customPanelGroups}
      {customPanelStyle}
      {setInlineBuffSearch}
      {addCustomPanelGroup}
      {removeCustomPanelGroup}
      {renameCustomPanelGroup}
      {addCustomPanelEntry}
      {addUserCounterRule}
      {removeUserCounterRule}
      {removeCustomPanelEntry}
      {setCustomPanelEntryLabel}
      {moveCustomPanelEntry}
      {setCustomPanelGap}
      {setCustomPanelFontSize}
      {setCustomPanelColumnGap}
      {setCustomPanelNameColor}
      {setCustomPanelValueColor}
      {setCustomPanelProgressColor}
      {setCustomPanelProgressOpacity}
    />
  {:else}
    <TabOverlay
      {showSkillCdGroup}
      {showSkillDurationGroup}
      {showResourceGroup}
      {showPanelAttrGroup}
      {showCustomPanelGroup}
      {toggleOverlaySectionVisibility}
    />
  {/if}

</div>
