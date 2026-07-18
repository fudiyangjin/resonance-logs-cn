<script lang="ts">
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import TabSkillCd from "./tab-skill-cd.svelte";
  import TabBuffMonitor from "./tab-buff-monitor.svelte";
  import TabPanelAttr from "./tab-panel-attr.svelte";
  import TabCustomPanel from "./tab-custom-panel.svelte";
  import TabShieldDetailStyle from "./tab-shield-detail-style.svelte";
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
    createDefaultBuffGroup,
    createDefaultBuffAlertRule,
    createDefaultCustomPanelGroup,
    ensureBuffAliases,
    ensureBuffAlerts,
    ensureBuffVoiceConfigs,
    ensureCounterVoiceConfigs,
    SETTINGS,
    type BuffAlertMap,
    type BuffAlertRule,
    type BuffDisplayMode,
    type BuffGroup,
    type CustomPanelGroup,
    type CustomPanelGroupKind,
    type CustomPanelStyle,
    type InlineBuffEntry,
    type PanelAreaRowRef,
    type ShieldDetailStyle,
    type SkillMonitorProfile,
    type TextBuffPanelDisplayMode,
    type TextBuffPanelStyle,
    type UserCounterRule,
    type OverlayTextStyle,
    ensureOverlayTextStyle,
  } from "$lib/settings-store";
  import {
    findResonanceSkill,
    ensureUserCounterRules,
    getCounterDisplayLabel,
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
  import {
    activeProfileOrDefault,
    clampedProfileIndex,
    updateActiveProfile as updateSharedActiveProfile,
  } from "$lib/skill-monitor-profile.svelte.js";
  import {
    ensureBuffGroup,
    ensureBuffGroups,
    ensureFactorSlotLabels,
    ensureIndividualMonitorAllGroup,
    ensureOverlaySizes,
    ensurePanelAreaRowOrder,
    ensurePanelAttrs,
    ensureShieldDetailStyle,
    ensureTextBuffPanelStyle,
  } from "$lib/skill-monitor-normalize";
  import {
    ensureCustomPanelGroups,
    ensureInlineBuffEntries,
  } from "$lib/custom-panel-utils";
  import { t } from "$lib/i18n/index.svelte";

  type CounterRuleOption = CounterRulePreset & { origin: "preset" | "user" };

  const availableBuffs = getAvailableBuffDefinitions();
  const buffCategoryDefinitions = getBuffCategoryDefinitions();
  let buffSearch = $state("");
  let buffSearchResults = $state<BuffNameInfo[]>([]);
  let globalPrioritySearch = $state("");
  let globalPrioritySearchResults = $state<BuffNameInfo[]>([]);
  let alertSearch = $state("");
  let groupSearchKeyword = $state<Record<string, string>>({});
  let groupSearchResults = $state<Record<string, BuffNameInfo[]>>({});
  let groupPrioritySearchKeyword = $state<Record<string, string>>({});
  let groupPrioritySearchResults = $state<Record<string, BuffNameInfo[]>>({});
  let resonanceSearch = $state("");
  let inlineBuffSearch = $state("");
  let inlineBuffSearchResults = $state<BuffNameInfo[]>([]);
  let activeTab = $state<
    | "skill-cd"
    | "buff"
    | "panel-attr"
    | "custom-panel"
    | "shield-detail"
    | "overlay"
  >("skill-cd");
  let attrSectionExpanded = $state(false);
  let buffAliasSectionExpanded = $state(false);
  let buffAlertSectionExpanded = $state(false);
  let voiceBuffSectionExpanded = $state(false);
  let voiceBuffSearch = $state("");
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
  const activeProfileIndex = $derived.by(() => clampedProfileIndex());
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
  const monitoredPanelAttrs = $derived.by(() =>
    ensurePanelAttrs(activeProfile),
  );
  const panelAttrGap = $derived(ensureOverlaySizes(activeProfile).panelAttrGap);
  const panelAttrFontSize = $derived(
    ensureOverlaySizes(activeProfile).panelAttrFontSize,
  );
  const panelAttrColumnGap = $derived(
    ensureOverlaySizes(activeProfile).panelAttrColumnGap,
  );
  const panelAttrTextStyle = $derived(
    ensureOverlaySizes(activeProfile).panelAttrTextStyle,
  );
  const showSkillCdGroup = $derived(
    activeProfile.overlayVisibility?.showSkillCdGroup ?? false,
  );
  const showSkillDurationGroup = $derived(
    activeProfile.overlayVisibility?.showSkillDurationGroup ?? true,
  );
  const showResourceGroup = $derived(
    activeProfile.overlayVisibility?.showResourceGroup ?? false,
  );
  const showPanelAttrGroup = $derived(
    activeProfile.overlayVisibility?.showPanelAttrGroup ?? true,
  );
  const showCustomPanelGroup = $derived(
    activeProfile.overlayVisibility?.showCustomPanelGroup ?? true,
  );
  const showShieldDetailGroup = $derived(
    activeProfile.overlayVisibility?.showShieldDetailGroup ?? false,
  );
  const textBuffPanelStyle = $derived.by(() =>
    ensureTextBuffPanelStyle(activeProfile),
  );
  const shieldDetailStyle = $derived.by(() =>
    ensureShieldDetailStyle(activeProfile),
  );
  const overlayTextStyle = $derived.by(() =>
    ensureOverlayTextStyle(activeProfile.overlayTextStyle),
  );
  const buffDisplayMode = $derived(
    activeProfile.buffDisplayMode ?? "individual",
  );
  const buffGroups = $derived.by(() => ensureBuffGroups(activeProfile));
  const individualMonitorAllGroup = $derived.by(() =>
    ensureIndividualMonitorAllGroup(activeProfile),
  );
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
    return uniqueIds(
      (activeProfile.buffPriorityIds ?? []).filter((id) => selected.has(id)),
    );
  });
  const buffAlerts = $derived.by(() =>
    ensureBuffAlerts(activeProfile.buffAlerts),
  );
  const factorSlotLabels = $derived.by(() =>
    ensureFactorSlotLabels(activeProfile.factorSlotLabels),
  );
  const alertEligibleBuffIds = $derived.by(() =>
    getAlertEligibleBuffIds(activeProfile),
  );
  const alertSearchResults = $derived.by(() =>
    searchBuffsByName(alertSearch, buffAliases),
  );
  const configuredVoiceBuffIds = $derived.by(() => {
    const eligible = new Set(alertEligibleBuffIds);
    return Object.keys(ensureBuffVoiceConfigs(activeProfile.buffVoiceConfigs))
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && eligible.has(id))
      .sort((a, b) => a - b);
  });
  const voiceBuffSearchResults = $derived.by(() => {
    const ids: number[] = [];
    return searchBuffsByName(voiceBuffSearch, buffAliases).filter((item) => {
      if (ids.includes(item.baseId)) return false;
      if (!alertEligibleBuffIds.includes(item.baseId)) return false;
      if (configuredVoiceBuffIds.includes(item.baseId)) return false;
      ids.push(item.baseId);
      return true;
    });
  });
  const textBuffMaxVisible = $derived(
    Math.max(1, Math.min(20, activeProfile.textBuffMaxVisible ?? 10)),
  );
  const userCounterRules = $derived.by(() =>
    ensureUserCounterRules(activeProfile.userCounterRules),
  );
  const resolvedUserCounterRules = $derived.by<CounterRuleOption[]>(() =>
    resolveUserCounterRulesToPresets(activeProfile.userCounterRules).map(
      (rule) => ({ ...rule, origin: "user" as const }),
    ),
  );
  const allCounterRules = $derived.by<CounterRuleOption[]>(() => [
    ...counterRules.map((rule) => ({ ...rule, origin: "preset" as const })),
    ...resolvedUserCounterRules,
  ]);
  const customPanelGroups = $derived.by(() =>
    ensureCustomPanelGroups(activeProfile),
  );
  const panelAreaRowOrder = $derived.by(() =>
    ensurePanelAreaRowOrder(activeProfile),
  );
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

  function moveItem(
    ids: number[],
    item: number,
    direction: "up" | "down",
  ): number[] {
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
    return uniqueIds(
      (group.priorityBuffIds ?? []).filter((id) => inGroup.has(id)),
    );
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
  const selectedResonanceSkills = $derived.by(() =>
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
      buffAlerts: {},
    }));
  }

  function filterPriorityIdsForSelection(
    profile: SkillMonitorProfile,
    nextBuffIds: number[],
    nextCategories: BuffCategoryKey[],
  ): number[] {
    const expandedIds = new Set(
      expandBuffSelection(nextBuffIds, nextCategories),
    );
    return uniqueIds(
      (profile.buffPriorityIds ?? []).filter((id) => expandedIds.has(id)),
    );
  }

  function getAlertEligibleBuffIds(profile: SkillMonitorProfile): number[] {
    const expandedIds = expandBuffSelection(
      profile.monitoredBuffIds ?? [],
      normalizeBuffCategoryKeys(profile.monitoredBuffCategories),
    );
    const groupBuffIds = ensureBuffGroups(profile)
      .filter((group) => !group.monitorAll)
      .flatMap((group) => group.buffIds);
    const customPanelBuffIds = ensureCustomPanelGroups(profile)
      .filter((group) => group.kind === "manual")
      .flatMap((group) => group.entries)
      .filter((entry) => entry.sourceType === "buff")
      .map((entry) => entry.sourceId);
    return uniqueIds([...expandedIds, ...groupBuffIds, ...customPanelBuffIds]);
  }

  function filterBuffAlertsForProfile(
    profile: SkillMonitorProfile,
    nextAlerts: BuffAlertMap = ensureBuffAlerts(profile.buffAlerts),
  ): BuffAlertMap {
    const eligibleIds = new Set(getAlertEligibleBuffIds(profile));
    const filtered: BuffAlertMap = {};
    for (const [baseId, rule] of Object.entries(ensureBuffAlerts(nextAlerts))) {
      if (eligibleIds.has(Number(baseId))) {
        filtered[baseId] = rule;
      }
    }
    return filtered;
  }

  function setResonanceSearch(value: string) {
    resonanceSearch = value;
  }

  function setBuffSearch(value: string) {
    buffSearch = value;
  }

  function setAlertSearch(value: string) {
    alertSearch = value;
  }

  function setVoiceBuffSearch(value: string) {
    voiceBuffSearch = value;
  }

  function setVoiceBuffSectionExpanded(expanded: boolean) {
    voiceBuffSectionExpanded = expanded;
  }

  function removeVoiceBuffBinding(buffId: number) {
    updateActiveProfile((profile) => {
      const next = { ...ensureBuffVoiceConfigs(profile.buffVoiceConfigs) };
      delete next[String(buffId)];
      return { ...profile, buffVoiceConfigs: next };
    });
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

  function upsertBuffAlert(buffId: number, patch: Partial<BuffAlertRule>) {
    updateActiveProfile((profile) => {
      const current = ensureBuffAlerts(profile.buffAlerts);
      const existing = current[String(buffId)] ?? createDefaultBuffAlertRule();
      return {
        ...profile,
        buffAlerts: {
          ...current,
          [String(buffId)]: {
            ...existing,
            ...patch,
          },
        },
      };
    });
  }

  function removeBuffAlert(buffId: number) {
    updateActiveProfile((profile) => {
      const next = { ...ensureBuffAlerts(profile.buffAlerts) };
      delete next[String(buffId)];
      return {
        ...profile,
        buffAlerts: next,
      };
    });
  }

  function setAttrSectionExpanded(expanded: boolean) {
    attrSectionExpanded = expanded;
  }

  function setBuffAliasSectionExpanded(expanded: boolean) {
    buffAliasSectionExpanded = expanded;
  }

  function setBuffAlertSectionExpanded(expanded: boolean) {
    buffAlertSectionExpanded = expanded;
  }

  function setBuffAliasEditingBuffId(buffId: number | null) {
    buffAliasEditingBuffId = buffId;
  }

  function toggleBuff(buffId: number) {
    const current = monitoredBuffIds;
    const exists = current.includes(buffId);
    if (exists) {
      const nextBuffIds = current.filter((id) => id !== buffId);
      updateActiveProfile((profile) => {
        const nextProfile = {
          ...profile,
          monitoredBuffIds: nextBuffIds,
          buffPriorityIds: filterPriorityIdsForSelection(
            profile,
            nextBuffIds,
            normalizeBuffCategoryKeys(profile.monitoredBuffCategories),
          ),
        };
        return {
          ...nextProfile,
          buffAlerts: filterBuffAlertsForProfile(nextProfile),
        };
      });
      return;
    }
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredBuffIds: [...current, buffId],
    }));
  }

  function toggleBuffCategory(categoryKey: BuffCategoryKey) {
    updateActiveProfile((profile) => {
      const current = normalizeBuffCategoryKeys(
        profile.monitoredBuffCategories,
      );
      const nextCategories = current.includes(categoryKey)
        ? current.filter((key) => key !== categoryKey)
        : [...current, categoryKey];
      const nextProfile = {
        ...profile,
        monitoredBuffCategories: nextCategories,
        buffPriorityIds: filterPriorityIdsForSelection(
          profile,
          profile.monitoredBuffIds ?? [],
          nextCategories,
        ),
      };
      return {
        ...nextProfile,
        buffAlerts: filterBuffAlertsForProfile(nextProfile),
      };
    });
  }

  function toggleGlobalPriority(buffId: number) {
    updateActiveProfile((profile) => {
      const current = uniqueIds(profile.buffPriorityIds ?? []);
      const exists = current.includes(buffId);
      return {
        ...profile,
        buffPriorityIds: exists
          ? current.filter((id) => id !== buffId)
          : [...current, buffId],
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
    globalPrioritySearchResults = searchBuffsByName(
      globalPrioritySearch,
      buffAliases,
    );
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
      | "showCustomPanelGroup"
      | "showShieldDetailGroup",
    checked: boolean,
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      overlayVisibility: {
        showSkillCdGroup: profile.overlayVisibility?.showSkillCdGroup ?? false,
        showSkillDurationGroup:
          profile.overlayVisibility?.showSkillDurationGroup ?? true,
        showResourceGroup:
          profile.overlayVisibility?.showResourceGroup ?? false,
        showPanelAttrGroup:
          profile.overlayVisibility?.showPanelAttrGroup ?? true,
        showCustomPanelGroup:
          profile.overlayVisibility?.showCustomPanelGroup ?? true,
        showShieldDetailGroup:
          profile.overlayVisibility?.showShieldDetailGroup ?? false,
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
      | "showCustomPanelGroup"
      | "showShieldDetailGroup",
  ) {
    const current =
      key === "showSkillCdGroup"
        ? showSkillCdGroup
        : key === "showSkillDurationGroup"
          ? showSkillDurationGroup
          : key === "showResourceGroup"
            ? showResourceGroup
            : key === "showPanelAttrGroup"
              ? showPanelAttrGroup
              : key === "showShieldDetailGroup"
                ? showShieldDetailGroup
                : showCustomPanelGroup;
    setOverlaySectionVisibility(key, !current);
  }

  function setPanelAttrEnabled(attrId: number, enabled: boolean) {
    updateActiveProfile((profile) => {
      const nextAttrs = ensurePanelAttrs(profile).map((item) =>
        item.attrId === attrId ? { ...item, enabled } : item,
      );
      let nextOrder = ensurePanelAreaRowOrder(profile).filter((row) =>
        nextAttrs.some((item) => item.enabled && item.attrId === row.attrId),
      );
      if (
        enabled &&
        !nextOrder.some((row) => row.type === "attr" && row.attrId === attrId)
      ) {
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
        item.attrId === attrId ? { ...item, color } : item,
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

  function updatePanelAttrTextStyle(
    updater: (style: OverlayTextStyle) => OverlayTextStyle,
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      overlaySizes: {
        ...ensureOverlaySizes(profile),
        panelAttrTextStyle: updater(
          ensureOverlaySizes(profile).panelAttrTextStyle,
        ),
      },
    }));
  }

  function setPanelAttrTextShadowEnabled(value: boolean) {
    updatePanelAttrTextStyle((style) => ({
      ...style,
      textShadowEnabled: value,
    }));
  }

  function setPanelAttrBackgroundEnabled(value: boolean) {
    updatePanelAttrTextStyle((style) => ({
      ...style,
      backgroundEnabled: value,
    }));
  }

  function setPanelAttrBackgroundOpacity(value: number) {
    updatePanelAttrTextStyle((style) => ({
      ...style,
      backgroundOpacity: Math.max(0, Math.min(1, value)),
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

  function updateUserCounterRules(
    updater: (rules: UserCounterRule[]) => UserCounterRule[],
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      userCounterRules: updater(
        ensureUserCounterRules(profile.userCounterRules),
      ),
    }));
  }

  function getNextUserCounterRuleId(profile: SkillMonitorProfile): number {
    const highestPresetRuleId = counterRules.reduce(
      (maxId, rule) => Math.max(maxId, rule.ruleId),
      10000,
    );
    const highestUserRuleId = ensureUserCounterRules(
      profile.userCounterRules,
    ).reduce((maxId, rule) => Math.max(maxId, rule.ruleId), 10000);
    return Math.max(highestPresetRuleId, highestUserRuleId, 10000) + 1;
  }

  function addUserCounterRule(
    name: string,
    sourceRefs: string[],
    slotRefs: string[],
  ) {
    const nextName = name.trim();
    const nextSourceRefs = Array.from(
      new Set(
        sourceRefs.filter((item) => typeof item === "string" && item.trim()),
      ),
    );
    const nextSlotRefs = Array.from(
      new Set(
        slotRefs.filter((item) => typeof item === "string" && item.trim()),
      ),
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
      userCounterRules: ensureUserCounterRules(profile.userCounterRules).filter(
        (rule) => rule.ruleId !== ruleId,
      ),
      customPanelGroups: ensureCustomPanelGroups(profile).map((group) => ({
        ...group,
        entries:
          group.kind === "manual"
            ? group.entries.filter(
                (entry) =>
                  !(
                    entry.sourceType === "counter" && entry.sourceId === ruleId
                  ),
              )
            : [],
      })),
      inlineBuffEntries: ensureInlineBuffEntries(profile).filter(
        (entry) =>
          !(entry.sourceType === "counter" && entry.sourceId === ruleId),
      ),
    }));
  }

  function updateUserCounterRule(
    ruleId: number,
    updates: Partial<UserCounterRule>,
  ) {
    updateUserCounterRules((rules) =>
      rules.map((rule) => {
        if (rule.ruleId !== ruleId) return rule;
        return {
          ...rule,
          ...(updates.name !== undefined
            ? { name: updates.name.trim() || rule.name }
            : {}),
          ...(updates.sourceRefs !== undefined
            ? {
                sourceRefs: Array.from(
                  new Set(
                    updates.sourceRefs.filter(
                      (item) => typeof item === "string" && item.trim(),
                    ),
                  ),
                ),
              }
            : {}),
          ...(updates.slotRefs !== undefined
            ? {
                slotRefs: Array.from(
                  new Set(
                    updates.slotRefs.filter(
                      (item) => typeof item === "string" && item.trim(),
                    ),
                  ),
                ),
              }
            : {}),
          ...(updates.voice !== undefined
            ? { voice: ensureCounterVoiceConfigs(updates.voice) }
            : {}),
        };
      }),
    );
  }

  function findCustomPanelEntryLocation(
    sourceType: InlineBuffEntry["sourceType"],
    sourceId: number,
    counterSlotId: number | undefined,
    groups: CustomPanelGroup[],
  ): { groupId: string; groupName: string } | null {
    for (const group of groups) {
      if (group.kind !== "manual") continue;
      if (
        group.entries.some(
          (entry) =>
            entry.sourceType === sourceType &&
            entry.sourceId === sourceId &&
            (sourceType !== "counter" || entry.counterSlotId === counterSlotId),
        )
      ) {
        return { groupId: group.id, groupName: group.name };
      }
    }
    return null;
  }

  function updateCustomPanelGroupStyle(
    groupId: string,
    updater: (style: CustomPanelStyle) => CustomPanelStyle,
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      customPanelGroups: ensureCustomPanelGroups(profile).map((group) =>
        group.id === groupId
          ? { ...group, style: updater(group.style) }
          : group,
      ),
    }));
  }

  function addCustomPanelGroup(kind: CustomPanelGroupKind = "manual") {
    updateCustomPanelGroups((groups) => [
      ...groups,
      createDefaultCustomPanelGroup("", groups.length + 1, kind),
    ]);
  }

  function removeCustomPanelGroup(groupId: string) {
    updateCustomPanelGroups((groups) =>
      groups.filter((group) => group.id !== groupId),
    );
  }

  function renameCustomPanelGroup(groupId: string, name: string) {
    updateCustomPanelGroups((groups) =>
      groups.map((group) =>
        group.id === groupId
          ? { ...group, name: name.trim() || group.name }
          : group,
      ),
    );
  }

  function setCustomPanelGroupHideZeroCounters(
    groupId: string,
    checked: boolean,
  ) {
    updateCustomPanelGroups((groups) =>
      groups.map((group) =>
        group.id === groupId ? { ...group, hideZeroCounters: checked } : group,
      ),
    );
  }

  function setFactorSlotLabel(slotTemplateId: string, name: string) {
    const key = slotTemplateId.trim();
    if (!key) return;
    const trimmed = name.trim();
    updateActiveProfile((profile) => {
      const next = ensureFactorSlotLabels(profile.factorSlotLabels);
      if (trimmed) {
        next[key] = trimmed;
      } else {
        delete next[key];
      }
      return { ...profile, factorSlotLabels: next };
    });
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

  function setTextBuffPanelTextShadowEnabled(value: boolean) {
    updateTextBuffPanelStyle((style) => ({
      ...style,
      textShadowEnabled: value,
    }));
  }

  function setTextBuffPanelBackgroundEnabled(value: boolean) {
    updateTextBuffPanelStyle((style) => ({
      ...style,
      backgroundEnabled: value,
    }));
  }

  function setTextBuffPanelBackgroundOpacity(value: number) {
    updateTextBuffPanelStyle((style) => ({
      ...style,
      backgroundOpacity: Math.max(0, Math.min(1, value)),
    }));
  }

  function updateOverlayTextStyle(
    updater: (style: OverlayTextStyle) => OverlayTextStyle,
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      overlayTextStyle: updater(
        ensureOverlayTextStyle(profile?.overlayTextStyle),
      ),
    }));
  }

  function setOverlayTextShadowEnabled(value: boolean) {
    updateOverlayTextStyle((style) => ({ ...style, textShadowEnabled: value }));
  }

  function setOverlayBackgroundEnabled(value: boolean) {
    updateOverlayTextStyle((style) => ({ ...style, backgroundEnabled: value }));
  }

  function setOverlayBackgroundOpacity(value: number) {
    updateOverlayTextStyle((style) => ({
      ...style,
      backgroundOpacity: Math.max(0, Math.min(1, value)),
    }));
  }

  function updateShieldDetailStyle(
    updater: (style: ShieldDetailStyle) => ShieldDetailStyle,
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      shieldDetailStyle: updater(ensureShieldDetailStyle(profile)),
    }));
  }

  function setShieldDetailStyleFlag(
    key: "showHpBar" | "showTotalShieldBar" | "showShieldEntries",
    value: boolean,
  ) {
    updateShieldDetailStyle((style) => ({ ...style, [key]: value }));
  }

  function setShieldDetailFontSize(value: number) {
    const nextValue = Math.max(8, Math.min(28, Math.round(value)));
    updateShieldDetailStyle((style) => ({ ...style, fontSize: nextValue }));
  }

  function setShieldDetailBarWidth(value: number) {
    const nextValue = Math.max(60, Math.min(400, Math.round(value)));
    updateShieldDetailStyle((style) => ({ ...style, barWidth: nextValue }));
  }

  function setShieldDetailGap(value: number) {
    const nextValue = Math.max(0, Math.min(24, Math.round(value)));
    updateShieldDetailStyle((style) => ({ ...style, gap: nextValue }));
  }

  function setShieldDetailColor(
    key: "hpColor" | "shieldColor" | "healShieldColor",
    value: string,
  ) {
    updateShieldDetailStyle((style) => ({ ...style, [key]: value }));
  }

  function setShieldDetailTextShadowEnabled(value: boolean) {
    updateShieldDetailStyle((style) => ({
      ...style,
      textShadowEnabled: value,
    }));
  }

  function setShieldDetailBackgroundEnabled(value: boolean) {
    updateShieldDetailStyle((style) => ({
      ...style,
      backgroundEnabled: value,
    }));
  }

  function setShieldDetailBackgroundOpacity(value: number) {
    updateShieldDetailStyle((style) => ({
      ...style,
      backgroundOpacity: Math.max(0, Math.min(1, value)),
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
      if (
        !groups.some((group) => group.id === groupId && group.kind === "manual")
      ) {
        return profile;
      }
      if (
        findCustomPanelEntryLocation(
          sourceType,
          sourceId,
          counterSlotId,
          groups,
        )
      ) {
        return profile;
      }
      const counterRule =
        sourceType === "counter"
          ? allCounterRules.find((rule) => rule.ruleId === sourceId)
          : null;
      const counterSlot = counterRule?.effectSlots.find(
        (slot) => slot.slotId === counterSlotId,
      );
      const label =
        sourceType === "counter"
          ? getCounterDisplayLabel({
              sourceId,
              counterSlotId: counterSlot?.slotId,
              ruleName: counterRule?.name,
            })
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
          group.id === groupId && group.kind === "manual"
            ? { ...group, entries: [...group.entries, nextEntry] }
            : group,
        ),
        inlineBuffEntries: [],
      };
    });
  }

  function removeCustomPanelEntry(groupId: string, entryId: string) {
    updateCustomPanelGroups((groups) =>
      groups.map((group) =>
        group.id === groupId && group.kind === "manual"
          ? {
              ...group,
              entries: group.entries.filter((entry) => entry.id !== entryId),
            }
          : group,
      ),
    );
  }

  function updateCustomPanelEntry(
    groupId: string,
    entryId: string,
    updater: (entry: InlineBuffEntry) => InlineBuffEntry,
  ) {
    updateCustomPanelGroups((groups) =>
      groups.map((group) =>
        group.id === groupId && group.kind === "manual"
          ? {
              ...group,
              entries: group.entries.map((entry) =>
                entry.id === entryId ? updater(entry) : entry,
              ),
            }
          : group,
      ),
    );
  }

  function setCustomPanelEntryLabel(
    groupId: string,
    entryId: string,
    label: string,
  ) {
    updateCustomPanelEntry(groupId, entryId, (entry) => ({
      ...entry,
      label: label.trim(),
    }));
  }

  function setCustomPanelEntryHideWhenZero(
    groupId: string,
    entryId: string,
    checked: boolean,
  ) {
    updateCustomPanelEntry(groupId, entryId, (entry) => ({
      ...entry,
      ...(entry.sourceType === "counter" ? { hideWhenZero: checked } : {}),
    }));
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
        if (group.kind !== "manual") return group;
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
      }),
    );
  }

  function setBuffDisplayMode(mode: BuffDisplayMode) {
    updateActiveProfile((profile) => ({
      ...profile,
      buffDisplayMode: mode,
      buffPriorityIds: uniqueIds(profile.buffPriorityIds ?? []),
      textBuffMaxVisible: Math.max(
        1,
        Math.min(20, profile.textBuffMaxVisible ?? 10),
      ),
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

  function updateBuffGroup(
    groupId: string,
    updater: (group: BuffGroup) => BuffGroup,
  ) {
    updateActiveProfile((profile) => {
      const nextProfile = {
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
      };
      return {
        ...nextProfile,
        buffAlerts: filterBuffAlertsForProfile(nextProfile),
      };
    });
  }

  function addBuffGroup() {
    updateActiveProfile((profile) => {
      const groups = ensureBuffGroups(profile);
      return {
        ...profile,
        buffGroups: [...groups, createDefaultBuffGroup("", groups.length + 1)],
      };
    });
  }

  function removeBuffGroup(groupId: string) {
    updateActiveProfile((profile) => {
      const nextProfile = {
        ...profile,
        buffGroups: ensureBuffGroups(profile).filter(
          (group) => group.id !== groupId,
        ),
      };
      return {
        ...nextProfile,
        buffAlerts: filterBuffAlertsForProfile(nextProfile),
      };
    });
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
          ...createDefaultBuffGroup("", 1),
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

  function updateIndividualMonitorAllGroup(
    updater: (group: BuffGroup) => BuffGroup,
  ) {
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
    groupPrioritySearchKeyword = {
      ...groupPrioritySearchKeyword,
      [groupId]: value,
    };
    const keyword = value.trim();
    if (!keyword) {
      groupPrioritySearchResults = {
        ...groupPrioritySearchResults,
        [groupId]: [],
      };
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
      if (!group.monitorAll && !group.buffIds.includes(item.baseId))
        return false;
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

  function toggleBuffCategoryInGroup(
    groupId: string,
    categoryKey: BuffCategoryKey,
  ) {
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
          buffIds: group.buffIds.filter(
            (buffId) => !categoryBuffIdSet.has(buffId),
          ),
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
    return (
      categoryBuffIds.length > 0 &&
      categoryBuffIds.every((buffId) => group.buffIds.includes(buffId))
    );
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

  function moveGroupPriority(
    groupId: string,
    buffId: number,
    direction: "up" | "down",
  ) {
    updateBuffGroup(groupId, (group) => ({
      ...group,
      priorityBuffIds: moveItem(
        normalizeGroupPriorityIds(group),
        buffId,
        direction,
      ),
    }));
  }
</script>

<div class="space-y-6">
  <div
    class="border-border/60 bg-card/40 space-y-2 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <SettingsSwitch
      checked={activeProfile.enabled}
      onCheckedChange={(value) =>
        updateActiveProfile((profile) => ({ ...profile, enabled: value }))}
      label={t("skillMonitor.main.enabled.label")}
      description={t("skillMonitor.main.enabled.description")}
    />
    <SettingsSwitch
      checked={activeProfile.autoHideInDailyScenes ?? false}
      onCheckedChange={(value) =>
        updateActiveProfile((profile) => ({
          ...profile,
          autoHideInDailyScenes: value,
        }))}
      label={t("skillMonitor.main.autoHideInDailyScenes.label")}
      description={t("skillMonitor.main.autoHideInDailyScenes.description")}
    />
  </div>

  <div
    class="border-border/60 bg-card/40 rounded-lg border p-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'skill-cd'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "skill-cd")}
      >
        {t("skillMonitor.tabs.skillCd")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'buff'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "buff")}
      >
        {t("skillMonitor.tabs.buff")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'panel-attr'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "panel-attr")}
      >
        {t("skillMonitor.tabs.panelAttr")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'custom-panel'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "custom-panel")}
      >
        {t("skillMonitor.tabs.customPanel")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'shield-detail'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "shield-detail")}
      >
        {t("skillMonitor.tabs.shieldDetail")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'overlay'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => (activeTab = "overlay")}
      >
        {t("skillMonitor.tabs.overlay")}
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
    {#key activeProfileIndex}
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
        {setTextBuffPanelTextShadowEnabled}
        {setTextBuffPanelBackgroundEnabled}
        {setTextBuffPanelBackgroundOpacity}
        {overlayTextStyle}
        {setOverlayTextShadowEnabled}
        {setOverlayBackgroundEnabled}
        {setOverlayBackgroundOpacity}
        {globalPrioritySearch}
        {globalPrioritySearchResults}
        {setGlobalPrioritySearch}
        {buffPriorityIds}
        {toggleGlobalPriority}
        {moveGlobalPriority}
        {buffAlerts}
        {buffAlertSectionExpanded}
        {setBuffAlertSectionExpanded}
        {alertSearch}
        {alertSearchResults}
        {alertEligibleBuffIds}
        {setAlertSearch}
        {upsertBuffAlert}
        {removeBuffAlert}
        {voiceBuffSectionExpanded}
        {setVoiceBuffSectionExpanded}
        {voiceBuffSearch}
        {setVoiceBuffSearch}
        {voiceBuffSearchResults}
        {configuredVoiceBuffIds}
        {removeVoiceBuffBinding}
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
    {/key}
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
      {panelAttrTextStyle}
      {setPanelAttrTextShadowEnabled}
      {setPanelAttrBackgroundEnabled}
      {setPanelAttrBackgroundOpacity}
    />
  {:else if activeTab === "custom-panel"}
    <TabCustomPanel
      counterRules={allCounterRules}
      {sourceTemplates}
      {slotTemplates}
      {userCounterRules}
      {availableBuffMap}
      {getBuffDisplayName}
      {inlineBuffSearch}
      {filteredInlineBuffSearchResults}
      {customPanelGroups}
      {factorSlotLabels}
      {setFactorSlotLabel}
      {setInlineBuffSearch}
      {addCustomPanelGroup}
      {removeCustomPanelGroup}
      {renameCustomPanelGroup}
      {updateCustomPanelGroupStyle}
      {setCustomPanelGroupHideZeroCounters}
      {addCustomPanelEntry}
      {addUserCounterRule}
      {removeUserCounterRule}
      {updateUserCounterRule}
      {removeCustomPanelEntry}
      {setCustomPanelEntryLabel}
      {setCustomPanelEntryHideWhenZero}
      {moveCustomPanelEntry}
    />
  {:else if activeTab === "shield-detail"}
    <TabShieldDetailStyle
      {shieldDetailStyle}
      {setShieldDetailStyleFlag}
      {setShieldDetailFontSize}
      {setShieldDetailBarWidth}
      {setShieldDetailGap}
      {setShieldDetailColor}
      {setShieldDetailTextShadowEnabled}
      {setShieldDetailBackgroundEnabled}
      {setShieldDetailBackgroundOpacity}
    />
  {:else}
    <TabOverlay
      {showSkillCdGroup}
      {showSkillDurationGroup}
      {showResourceGroup}
      {showPanelAttrGroup}
      {showCustomPanelGroup}
      {showShieldDetailGroup}
      {toggleOverlaySectionVisibility}
    />
  {/if}
</div>
