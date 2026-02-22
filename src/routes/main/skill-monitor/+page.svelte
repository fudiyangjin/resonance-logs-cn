<script lang="ts">
  import { onMount } from "svelte";
  import { commands, type BuffDefinition, type BuffNameInfo } from "$lib/bindings";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import {
    createDefaultBuffGroup,
    createDefaultSkillMonitorProfile,
    SETTINGS,
    type BuffDisplayMode,
    type BuffGroup,
    type SkillMonitorProfile,
  } from "$lib/settings-store";
  import {
    findAnySkillByBaseId,
    findResonanceSkill,
    getClassConfigs,
    getSkillsByClass,
    searchResonanceSkills,
  } from "$lib/skill-mappings";

  let availableBuffs = $state<BuffDefinition[]>([]);
  let buffNames = $state(new Map<number, BuffNameInfo>());
  let buffSearch = $state("");
  let buffSearchResults = $state<BuffNameInfo[]>([]);
  let globalPrioritySearch = $state("");
  let globalPrioritySearchResults = $state<BuffNameInfo[]>([]);
  let groupSearchKeyword = $state<Record<string, string>>({});
  let groupSearchResults = $state<Record<string, BuffNameInfo[]>>({});
  let groupPrioritySearchKeyword = $state<Record<string, string>>({});
  let groupPrioritySearchResults = $state<Record<string, BuffNameInfo[]>>({});
  let resonanceSearch = $state("");
  onMount(() => {
    void (async () => {
      const res = await commands.getAvailableBuffs();
      if (res.status === "ok") {
        availableBuffs = res.data;
      }
    })();
  });

  const classConfigs = $derived(getClassConfigs());
  const profiles = $derived(SETTINGS.skillMonitor.state.profiles);
  const activeProfileIndex = $derived(
    Math.min(
      Math.max(SETTINGS.skillMonitor.state.activeProfileIndex, 0),
      Math.max(0, profiles.length - 1),
    ),
  );
  const activeProfile = $derived(
    profiles[activeProfileIndex] ?? createDefaultSkillMonitorProfile(),
  );
  const selectedClassKey = $derived(activeProfile.selectedClass);
  const classSkills = $derived(getSkillsByClass(selectedClassKey));
  const monitoredSkillIds = $derived(activeProfile.monitoredSkillIds);
  const monitoredBuffIds = $derived(activeProfile.monitoredBuffIds);
  const showSkillCdGroup = $derived(
    activeProfile.overlayVisibility?.showSkillCdGroup ?? true,
  );
  const showResourceGroup = $derived(
    activeProfile.overlayVisibility?.showResourceGroup ?? true,
  );
  const buffDisplayMode = $derived(
    activeProfile.buffDisplayMode ?? "individual",
  );
  const buffGroups = $derived.by(() => ensureBuffGroups(activeProfile));
  const individualMonitorAllGroup = $derived.by(() => ensureIndividualMonitorAllGroup(activeProfile));
  const buffPriorityIds = $derived.by(() => {
    const selected = new Set(monitoredBuffIds);
    return uniqueIds((activeProfile.buffPriorityIds ?? []).filter((id) => selected.has(id)));
  });
  const textBuffMaxVisible = $derived(
    Math.max(1, Math.min(20, activeProfile.textBuffMaxVisible ?? 10)),
  );

  function uniqueIds(ids: number[]): number[] {
    return Array.from(new Set(ids));
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
      name: normalized.name || "全部 Buff",
    };
  }

  function updateActiveProfile(
    updater: (profile: SkillMonitorProfile) => SkillMonitorProfile,
  ) {
    const state = SETTINGS.skillMonitor.state;
    const currentProfiles = state.profiles;
    if (currentProfiles.length === 0) {
      state.profiles = [createDefaultSkillMonitorProfile()];
      state.activeProfileIndex = 0;
      return;
    }

    const index = Math.min(
      Math.max(state.activeProfileIndex, 0),
      currentProfiles.length - 1,
    );
    state.profiles = currentProfiles.map((profile, i) =>
      i === index ? updater(profile) : profile,
    );
  }

  function setActiveProfileIndex(index: number) {
    const maxIndex = Math.max(0, SETTINGS.skillMonitor.state.profiles.length - 1);
    SETTINGS.skillMonitor.state.activeProfileIndex = Math.min(
      Math.max(index, 0),
      maxIndex,
    );
  }

  function addProfile() {
    const nextIndex = SETTINGS.skillMonitor.state.profiles.length + 1;
    const nextProfile = createDefaultSkillMonitorProfile(`方案 ${nextIndex}`);
    SETTINGS.skillMonitor.state.profiles = [
      ...SETTINGS.skillMonitor.state.profiles,
      nextProfile,
    ];
    SETTINGS.skillMonitor.state.activeProfileIndex =
      SETTINGS.skillMonitor.state.profiles.length - 1;
  }

  function renameActiveProfile() {
    const nextName = window.prompt("请输入新的方案名称", activeProfile.name);
    if (!nextName) return;
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    updateActiveProfile((profile) => ({ ...profile, name: trimmedName }));
  }

  function removeActiveProfile() {
    const state = SETTINGS.skillMonitor.state;
    if (state.profiles.length <= 1) return;
    const index = Math.min(
      Math.max(state.activeProfileIndex, 0),
      state.profiles.length - 1,
    );
    state.profiles = state.profiles.filter((_, i) => i !== index);
    state.activeProfileIndex = Math.min(index, state.profiles.length - 1);
  }

  function setSelectedClass(classKey: string) {
    updateActiveProfile((profile) => ({
      ...profile,
      selectedClass: classKey,
      monitoredSkillIds: [],
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

  function clearBuffs() {
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredBuffIds: [],
      buffPriorityIds: [],
    }));
  }

  function toggleBuff(buffId: number) {
    const current = monitoredBuffIds;
    const exists = current.includes(buffId);
    if (exists) {
      updateActiveProfile((profile) => ({
        ...profile,
        monitoredBuffIds: current.filter((id) => id !== buffId),
        buffPriorityIds: (profile.buffPriorityIds ?? []).filter((id) => id !== buffId),
      }));
      return;
    }
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredBuffIds: [...current, buffId],
    }));
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
        .map((id) => availableBuffs.find((buff) => buff.baseId === id))
        .filter(Boolean) as BuffDefinition[],
  );

  $effect(() => {
    const ids = monitoredBuffIds;
    if (ids.length === 0) return;
    void (async () => {
      const missing = ids.filter((id) => !buffNames.has(id));
      if (missing.length === 0) return;
      const res = await commands.getBuffNames(missing);
      if (res.status !== "ok") return;
      const next = new Map(buffNames);
      for (const item of res.data) {
        next.set(item.baseId, item);
      }
      buffNames = next;
    })();
  });

  $effect(() => {
    const keyword = buffSearch.trim();
    if (!keyword) {
      buffSearchResults = [];
      return;
    }
    void (async () => {
      const res = await commands.searchBuffsByName(keyword, 120);
      if (res.status !== "ok") return;
      buffSearchResults = res.data;
    })();
  });

  $effect(() => {
    const keyword = globalPrioritySearch.trim();
    if (!keyword) {
      globalPrioritySearchResults = [];
      return;
    }
    void (async () => {
      const res = await commands.searchBuffsByName(keyword, 120);
      if (res.status !== "ok") return;
      globalPrioritySearchResults = res.data;
    })();
  });

  function setOverlaySectionVisibility(
    key: "showSkillCdGroup" | "showResourceGroup",
    checked: boolean,
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      overlayVisibility: {
        showSkillCdGroup: profile.overlayVisibility?.showSkillCdGroup ?? true,
        showResourceGroup: profile.overlayVisibility?.showResourceGroup ?? true,
        [key]: checked,
      },
    }));
  }

  function toggleOverlaySectionVisibility(
    key: "showSkillCdGroup" | "showResourceGroup",
  ) {
    const current =
      key === "showSkillCdGroup" ? showSkillCdGroup : showResourceGroup;
    setOverlaySectionVisibility(key, !current);
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
        buffGroups: [...groups, createDefaultBuffGroup(`分组 ${groups.length + 1}`, groups.length + 1)],
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
          ...createDefaultBuffGroup("全部 Buff", 1),
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
    void (async () => {
      const res = await commands.searchBuffsByName(keyword, 120);
      if (res.status !== "ok") return;
      groupSearchResults = { ...groupSearchResults, [groupId]: res.data };
    })();
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
    void (async () => {
      const res = await commands.searchBuffsByName(keyword, 120);
      if (res.status !== "ok") return;
      groupPrioritySearchResults = { ...groupPrioritySearchResults, [groupId]: res.data };
    })();
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
      label="启用技能监控"
      description="开启后将实时推送技能CD数据到悬浮窗口"
    />
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">配置方案</h2>
      <p class="text-xs text-muted-foreground">
        可创建多个角色监控方案并快速切换
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <select
        class="w-full sm:w-72 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        value={activeProfileIndex}
        onchange={(event) =>
          setActiveProfileIndex(Number((event.currentTarget as HTMLSelectElement).value))}
      >
        {#each profiles as profile, idx (idx)}
          <option value={idx}>{profile.name}</option>
        {/each}
      </select>
      <button
        type="button"
        class="text-xs px-3 py-2 rounded border border-border/60 text-foreground hover:bg-muted/40 transition-colors"
        onclick={addProfile}
      >
        新建方案
      </button>
      <button
        type="button"
        class="text-xs px-3 py-2 rounded border border-border/60 text-foreground hover:bg-muted/40 transition-colors"
        onclick={renameActiveProfile}
      >
        重命名
      </button>
      <button
        type="button"
        class="text-xs px-3 py-2 rounded border border-border/60 text-destructive hover:bg-destructive/10 transition-colors disabled:text-muted-foreground disabled:hover:bg-transparent"
        onclick={removeActiveProfile}
        disabled={profiles.length <= 1}
      >
        删除方案
      </button>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">Overlay 区域显示</h2>
      <p class="text-xs text-muted-foreground">
        可分别控制技能区和资源区是否显示（按方案保存）
      </p>
    </div>
    <div class="space-y-2">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showSkillCdGroup
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() => toggleOverlaySectionVisibility("showSkillCdGroup")}
        >
          技能CD区：{showSkillCdGroup ? "显示" : "隐藏"}
        </button>
        <button
          type="button"
          class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {showResourceGroup
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() => toggleOverlaySectionVisibility("showResourceGroup")}
        >
          资源监控区：{showResourceGroup ? "显示" : "隐藏"}
        </button>
      </div>
      <p class="text-xs text-muted-foreground">
        点击按钮切换显示状态（按方案保存）
      </p>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">Buff 显示模式</h2>
      <p class="text-xs text-muted-foreground">
        可在独立定位和分组布局间切换，配置会按方案保存
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {buffDisplayMode === 'individual'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => setBuffDisplayMode("individual")}
      >
        独立模式
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {buffDisplayMode === 'grouped'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => setBuffDisplayMode("grouped")}
      >
        分组模式
      </button>
    </div>
    <label class="block text-xs text-muted-foreground max-w-md">
      无图标 Buff 最大显示数: {textBuffMaxVisible}
      <input
        class="w-full mt-1"
        type="range"
        min="1"
        max="20"
        step="1"
        value={textBuffMaxVisible}
        oninput={(event) => setTextBuffMaxVisible(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <span class="block mt-1">超出上限时，按用户设定的优先级截断显示，避免占满屏幕</span>
    </label>
    <div class="space-y-2">
      <div class="text-xs font-medium text-foreground">全局 Buff 优先级</div>
      <p class="text-xs text-muted-foreground">
        排在前面的 Buff 优先显示
      </p>
      <input
        class="w-full sm:w-72 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        placeholder="搜索并添加到全局优先级"
        bind:value={globalPrioritySearch}
      />
      {#if globalPrioritySearch.trim().length > 0 && globalPrioritySearchResults.length > 0}
        <div class="grid grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-2">
          {#each globalPrioritySearchResults as item (item.baseId)}
            {@const iconBuff = availableBuffMap.get(item.baseId)}
            {#if monitoredBuffIds.includes(item.baseId) && !buffPriorityIds.includes(item.baseId)}
              <button
                type="button"
                class="rounded border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors p-1"
                title={item.name}
                onclick={() => toggleGlobalPriority(item.baseId)}
              >
                {#if iconBuff}
                  <img
                    src={`/images/buff/${iconBuff.spriteFile}`}
                    alt={iconBuff.name}
                    class="w-full h-10 object-contain"
                  />
                {:else}
                  <div class="h-10 flex items-center justify-center text-[10px] text-muted-foreground">
                    无图标
                  </div>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
      <div class="space-y-1">
        {#each buffPriorityIds as buffId, idx (buffId)}
          {@const iconBuff = availableBuffMap.get(buffId)}
          {@const nameInfo = buffNames.get(buffId)}
          <div class="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1">
            <span class="w-6 text-center text-xs text-muted-foreground">{idx + 1}</span>
            {#if iconBuff}
              <img
                src={`/images/buff/${iconBuff.spriteFile}`}
                alt={iconBuff.name}
                class="size-6 object-contain"
              />
            {/if}
            <span class="flex-1 text-xs text-foreground truncate">
              {nameInfo?.name ?? iconBuff?.name ?? `#${buffId}`}
            </span>
            <button
              type="button"
              class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40"
              onclick={() => toggleGlobalPriority(buffId)}
            >
              移除
            </button>
            <button
              type="button"
              class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50"
              onclick={() => moveGlobalPriority(buffId, "up")}
              disabled={idx === 0}
            >
              上移
            </button>
            <button
              type="button"
              class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50"
              onclick={() => moveGlobalPriority(buffId, "down")}
              disabled={idx === buffPriorityIds.length - 1}
            >
              下移
            </button>
          </div>
        {/each}
        {#if buffPriorityIds.length === 0}
          <div class="text-xs text-muted-foreground">未设置全局优先级，按后端默认顺序显示</div>
        {/if}
      </div>
    </div>
  </div>

  {#if buffDisplayMode === "individual"}
    <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-foreground">监控全部 Buff </h2>
          <p class="text-xs text-muted-foreground">
            新增一个网格区域显示全部 Buff（自动排除已在独立模式中选中的 Buff）
          </p>
        </div>
        {#if !individualMonitorAllGroup}
          <button
            type="button"
            class="text-xs px-3 py-2 rounded border border-border/60 text-foreground hover:bg-muted/40 transition-colors"
            onclick={addIndividualMonitorAll}
          >
            监控全部 Buff
          </button>
        {:else}
          <button
            type="button"
            class="text-xs px-3 py-2 rounded border border-border/60 text-destructive hover:bg-destructive/10 transition-colors"
            onclick={removeIndividualMonitorAll}
          >
            移除全部 Buff 分组
          </button>
        {/if}
      </div>

      {#if individualMonitorAllGroup}
        <div class="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <input
              class="w-52 rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-foreground"
              value={individualMonitorAllGroup.name}
              oninput={(event) =>
                updateIndividualMonitorAllGroup((curr) => ({
                  ...curr,
                  name: (event.currentTarget as HTMLInputElement).value || curr.name,
                }))}
            />
            <span class="text-xs text-muted-foreground">固定为监控全部 Buff</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-xs text-muted-foreground">
              图标大小: {individualMonitorAllGroup.iconSize}px
              <input
                class="w-full mt-1"
                type="range"
                min="24"
                max="120"
                step="1"
                value={individualMonitorAllGroup.iconSize}
                oninput={(event) =>
                  updateIndividualMonitorAllGroup((curr) => ({
                    ...curr,
                    iconSize: Number((event.currentTarget as HTMLInputElement).value),
                  }))}
              />
            </label>
            <label class="text-xs text-muted-foreground">
              列数: {individualMonitorAllGroup.columns}
              <input
                class="w-full mt-1"
                type="range"
                min="1"
                max="12"
                step="1"
                value={individualMonitorAllGroup.columns}
                oninput={(event) =>
                  updateIndividualMonitorAllGroup((curr) => ({
                    ...curr,
                    columns: Number((event.currentTarget as HTMLInputElement).value),
                  }))}
              />
            </label>
            <label class="text-xs text-muted-foreground">
              行数: {individualMonitorAllGroup.rows}
              <input
                class="w-full mt-1"
                type="range"
                min="1"
                max="12"
                step="1"
                value={individualMonitorAllGroup.rows}
                oninput={(event) =>
                  updateIndividualMonitorAllGroup((curr) => ({
                    ...curr,
                    rows: Number((event.currentTarget as HTMLInputElement).value),
                  }))}
              />
            </label>
            <label class="text-xs text-muted-foreground">
              间距: {individualMonitorAllGroup.gap}px
              <input
                class="w-full mt-1"
                type="range"
                min="0"
                max="16"
                step="1"
                value={individualMonitorAllGroup.gap}
                oninput={(event) =>
                  updateIndividualMonitorAllGroup((curr) => ({
                    ...curr,
                    gap: Number((event.currentTarget as HTMLInputElement).value),
                  }))}
              />
            </label>
          </div>

          <div class="flex flex-wrap gap-3 text-xs">
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={individualMonitorAllGroup.showName}
                onchange={(event) =>
                  updateIndividualMonitorAllGroup((curr) => ({
                    ...curr,
                    showName: (event.currentTarget as HTMLInputElement).checked,
                  }))}
              />
              显示名称
            </label>
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={individualMonitorAllGroup.showTime}
                onchange={(event) =>
                  updateIndividualMonitorAllGroup((curr) => ({
                    ...curr,
                    showTime: (event.currentTarget as HTMLInputElement).checked,
                  }))}
              />
              显示时间
            </label>
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={individualMonitorAllGroup.showLayer}
                onchange={(event) =>
                  updateIndividualMonitorAllGroup((curr) => ({
                    ...curr,
                    showLayer: (event.currentTarget as HTMLInputElement).checked,
                  }))}
              />
              显示层数
            </label>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if buffDisplayMode === "grouped"}
    <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-foreground">Buff 分组管理</h2>
          <p class="text-xs text-muted-foreground">
            通过分组管理 Buff 展示，组内自动网格对齐
          </p>
        </div>
        <button
          type="button"
          class="text-xs px-3 py-2 rounded border border-border/60 text-foreground hover:bg-muted/40 transition-colors"
          onclick={addBuffGroup}
        >
          新建分组
        </button>
      </div>

      {#if buffGroups.length === 0}
        <div class="text-xs text-muted-foreground">暂无分组，请先新建一个分组</div>
      {/if}

      <div class="space-y-3">
        {#each buffGroups as group (group.id)}
          <div class="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <input
                class="w-52 rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-foreground"
                value={group.name}
                oninput={(event) =>
                  updateBuffGroup(group.id, (curr) => ({
                    ...curr,
                    name: (event.currentTarget as HTMLInputElement).value || curr.name,
                  }))}
              />
              <button
                type="button"
                class="text-xs px-2 py-1 rounded border border-border/60 text-destructive hover:bg-destructive/10 transition-colors"
                onclick={() => removeBuffGroup(group.id)}
              >
                删除分组
              </button>
              <label class="ml-auto flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={group.monitorAll}
                  onchange={(event) =>
                    updateBuffGroup(group.id, (curr) => ({
                      ...curr,
                      monitorAll: (event.currentTarget as HTMLInputElement).checked,
                    }))}
                />
                监控全部 Buff
              </label>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label class="text-xs text-muted-foreground">
                图标大小: {group.iconSize}px
                <input
                  class="w-full mt-1"
                  type="range"
                  min="24"
                  max="120"
                  step="1"
                  value={group.iconSize}
                  oninput={(event) =>
                    updateBuffGroup(group.id, (curr) => ({
                      ...curr,
                      iconSize: Number((event.currentTarget as HTMLInputElement).value),
                    }))}
                />
              </label>
              <label class="text-xs text-muted-foreground">
                列数: {group.columns}
                <input
                  class="w-full mt-1"
                  type="range"
                  min="1"
                  max="12"
                  step="1"
                  value={group.columns}
                  oninput={(event) =>
                    updateBuffGroup(group.id, (curr) => ({
                      ...curr,
                      columns: Number((event.currentTarget as HTMLInputElement).value),
                    }))}
                />
              </label>
              <label class="text-xs text-muted-foreground">
                行数: {group.rows}
                <input
                  class="w-full mt-1"
                  type="range"
                  min="1"
                  max="12"
                  step="1"
                  value={group.rows}
                  oninput={(event) =>
                    updateBuffGroup(group.id, (curr) => ({
                      ...curr,
                      rows: Number((event.currentTarget as HTMLInputElement).value),
                    }))}
                />
              </label>
              <label class="text-xs text-muted-foreground">
                间距: {group.gap}px
                <input
                  class="w-full mt-1"
                  type="range"
                  min="0"
                  max="16"
                  step="1"
                  value={group.gap}
                  oninput={(event) =>
                    updateBuffGroup(group.id, (curr) => ({
                      ...curr,
                      gap: Number((event.currentTarget as HTMLInputElement).value),
                    }))}
                />
              </label>
            </div>

            <div class="flex flex-wrap gap-3 text-xs">
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={group.showName}
                  onchange={(event) =>
                    updateBuffGroup(group.id, (curr) => ({
                      ...curr,
                      showName: (event.currentTarget as HTMLInputElement).checked,
                    }))}
                />
                显示名称
              </label>
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={group.showTime}
                  onchange={(event) =>
                    updateBuffGroup(group.id, (curr) => ({
                      ...curr,
                      showTime: (event.currentTarget as HTMLInputElement).checked,
                    }))}
                />
                显示时间
              </label>
              <label class="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={group.showLayer}
                  onchange={(event) =>
                    updateBuffGroup(group.id, (curr) => ({
                      ...curr,
                      showLayer: (event.currentTarget as HTMLInputElement).checked,
                    }))}
                />
                显示层数
              </label>
            </div>

            {#if !group.monitorAll}
              <div class="space-y-2">
                <input
                  class="w-full sm:w-72 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="搜索并添加到此分组"
                  value={getGroupSearchKeyword(group.id)}
                  oninput={(event) =>
                    setGroupSearchKeyword(group.id, (event.currentTarget as HTMLInputElement).value)}
                />
                {#if getGroupSearchResults(group).length > 0}
                  <div class="grid grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-2">
                    {#each getGroupSearchResults(group).slice(0, 40) as item (item.baseId)}
                      {@const iconBuff = availableBuffMap.get(item.baseId)}
                      <button
                        type="button"
                        class="rounded border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors p-1"
                        title={item.name}
                        onclick={() => toggleBuffInGroup(group.id, item.baseId)}
                      >
                        {#if iconBuff}
                          <img
                            src={`/images/buff/${iconBuff.spriteFile}`}
                            alt={iconBuff.name}
                            class="w-full h-10 object-contain"
                          />
                        {:else}
                          <div class="h-10 flex items-center justify-center text-[10px] text-muted-foreground">
                            无图标
                          </div>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/if}

                <div class="text-xs text-muted-foreground">
                  已分配 Buff（点击可移除）
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each group.buffIds as buffId (buffId)}
                    {@const iconBuff = availableBuffMap.get(buffId)}
                    {@const nameInfo = buffNames.get(buffId)}
                    <button
                      type="button"
                      class="relative rounded-md border border-border/60 overflow-hidden bg-muted/20 size-12 hover:border-border hover:bg-muted/30"
                      title={nameInfo?.name ?? iconBuff?.name ?? `#${buffId}`}
                      onclick={() => toggleBuffInGroup(group.id, buffId)}
                    >
                      {#if iconBuff}
                        <img
                          src={`/images/buff/${iconBuff.spriteFile}`}
                          alt={iconBuff.name}
                          class="w-full h-full object-contain"
                        />
                      {:else}
                        <div class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                          文本
                        </div>
                      {/if}
                    </button>
                  {/each}
                  {#if group.buffIds.length === 0}
                    <div class="text-xs text-muted-foreground">未添加 Buff</div>
                  {/if}
                </div>
                <div class="space-y-1">
                  <div class="text-xs text-muted-foreground">分组内优先级</div>
                  <div class="text-xs text-muted-foreground">
                    可搜索组内 Buff 并添加到优先级列表
                  </div>
                  <input
                    class="w-full sm:w-72 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="搜索并添加到优先级列表"
                    value={getGroupPrioritySearchKeyword(group.id)}
                    oninput={(event) =>
                      setGroupPrioritySearchKeyword(group.id, (event.currentTarget as HTMLInputElement).value)}
                  />
                  {#if getGroupPrioritySearchResults(group).length > 0}
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-2">
                      {#each getGroupPrioritySearchResults(group).slice(0, 40) as item (item.baseId)}
                        {@const iconBuff = availableBuffMap.get(item.baseId)}
                        <button
                          type="button"
                          class="rounded border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors p-1"
                          title={item.name}
                          onclick={() => togglePriorityInGroup(group.id, item.baseId)}
                        >
                          {#if iconBuff}
                            <img
                              src={`/images/buff/${iconBuff.spriteFile}`}
                              alt={iconBuff.name}
                              class="w-full h-10 object-contain"
                            />
                          {:else}
                            <div class="h-10 flex items-center justify-center text-[10px] text-muted-foreground">
                              无图标
                            </div>
                          {/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                  {#each getGroupPriorityIds(group) as buffId, idx (buffId)}
                    {@const iconBuff = availableBuffMap.get(buffId)}
                    {@const nameInfo = buffNames.get(buffId)}
                    <div class="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1">
                      <span class="w-6 text-center text-xs text-muted-foreground">{idx + 1}</span>
                      {#if iconBuff}
                        <img
                          src={`/images/buff/${iconBuff.spriteFile}`}
                          alt={iconBuff.name}
                          class="size-5 object-contain"
                        />
                      {/if}
                      <span class="flex-1 text-xs text-foreground truncate">
                        {nameInfo?.name ?? iconBuff?.name ?? `#${buffId}`}
                      </span>
                      <button
                        type="button"
                        class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40"
                        onclick={() => togglePriorityInGroup(group.id, buffId)}
                      >
                        移除
                      </button>
                      <button
                        type="button"
                        class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50"
                        onclick={() => moveGroupPriority(group.id, buffId, "up")}
                        disabled={idx === 0}
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50"
                        onclick={() => moveGroupPriority(group.id, buffId, "down")}
                        disabled={idx === getGroupPriorityIds(group).length - 1}
                      >
                        下移
                      </button>
                    </div>
                  {/each}
                  {#if getGroupPriorityIds(group).length === 0}
                    <div class="text-xs text-muted-foreground">未设置优先级，按后端默认顺序显示</div>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="space-y-2">
                <div class="text-xs text-muted-foreground">
                  当前分组已开启“监控全部 Buff”，可额外配置优先级以便优先展示关键 Buff
                </div>
                <input
                  class="w-full sm:w-72 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="搜索并添加到优先级列表"
                  value={getGroupSearchKeyword(group.id)}
                  oninput={(event) =>
                    setGroupSearchKeyword(group.id, (event.currentTarget as HTMLInputElement).value)}
                />
                {#if getGroupSearchResults(group).length > 0}
                  <div class="grid grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-2">
                    {#each getGroupSearchResults(group).slice(0, 40) as item (item.baseId)}
                      {@const iconBuff = availableBuffMap.get(item.baseId)}
                      <button
                        type="button"
                        class="rounded border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors p-1"
                        title={item.name}
                        onclick={() => togglePriorityInGroup(group.id, item.baseId)}
                      >
                        {#if iconBuff}
                          <img
                            src={`/images/buff/${iconBuff.spriteFile}`}
                            alt={iconBuff.name}
                            class="w-full h-10 object-contain"
                          />
                        {:else}
                          <div class="h-10 flex items-center justify-center text-[10px] text-muted-foreground">
                            无图标
                          </div>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/if}
                <div class="space-y-1">
                  <div class="text-xs text-muted-foreground">分组内优先级</div>
                  {#each getGroupPriorityIds(group) as buffId, idx (buffId)}
                    {@const iconBuff = availableBuffMap.get(buffId)}
                    {@const nameInfo = buffNames.get(buffId)}
                    <div class="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1">
                      <span class="w-6 text-center text-xs text-muted-foreground">{idx + 1}</span>
                      {#if iconBuff}
                        <img
                          src={`/images/buff/${iconBuff.spriteFile}`}
                          alt={iconBuff.name}
                          class="size-5 object-contain"
                        />
                      {/if}
                      <span class="flex-1 text-xs text-foreground truncate">
                        {nameInfo?.name ?? iconBuff?.name ?? `#${buffId}`}
                      </span>
                      <button
                        type="button"
                        class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40"
                        onclick={() => togglePriorityInGroup(group.id, buffId)}
                      >
                        移除
                      </button>
                      <button
                        type="button"
                        class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50"
                        onclick={() => moveGroupPriority(group.id, buffId, "up")}
                        disabled={idx === 0}
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        class="text-xs px-2 py-0.5 rounded border border-border/60 hover:bg-muted/40 disabled:opacity-50"
                        onclick={() => moveGroupPriority(group.id, buffId, "down")}
                        disabled={idx === getGroupPriorityIds(group).length - 1}
                      >
                        下移
                      </button>
                    </div>
                  {/each}
                  {#if getGroupPriorityIds(group).length === 0}
                    <div class="text-xs text-muted-foreground">未设置优先级，按后端默认顺序显示</div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
        <div class="text-xs text-muted-foreground">分组布局预览</div>
        <div class="space-y-2">
          {#each buffGroups as group (group.id)}
            <div class="rounded border border-border/50 p-2">
              <div class="text-xs mb-2 text-foreground">{group.name}{group.monitorAll ? "（全部）" : ""}</div>
              <div
                class="grid"
                style:grid-template-columns={`repeat(${Math.max(1, group.columns)}, minmax(0, ${group.iconSize / 2}px))`}
                style:gap={`${Math.max(0, group.gap / 2)}px`}
              >
                {#if group.monitorAll}
                  {#each availableBuffs.slice(0, Math.max(6, group.columns * group.rows)) as buff (buff.baseId)}
                    <img
                      src={`/images/buff/${buff.spriteFile}`}
                      alt={buff.name}
                      class="w-full aspect-square object-contain rounded border border-border/30 bg-muted/20"
                    />
                  {/each}
                {:else}
                  {#each group.buffIds.slice(0, Math.max(6, group.columns * group.rows)) as buffId (buffId)}
                    {@const buff = availableBuffMap.get(buffId)}
                    {#if buff}
                      <img
                        src={`/images/buff/${buff.spriteFile}`}
                        alt={buff.name}
                        class="w-full aspect-square object-contain rounded border border-border/30 bg-muted/20"
                      />
                    {:else}
                      <div class="w-full aspect-square rounded border border-border/30 bg-muted/20"></div>
                    {/if}
                  {/each}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">职业选择</h2>
      <p class="text-xs text-muted-foreground">
        支持青岚骑士、冰法职业
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#each classConfigs as config (config.classKey)}
        <button
          type="button"
          class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {selectedClassKey === config.classKey
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
          onclick={() => setSelectedClass(config.classKey)}
        >
          {config.className}
        </button>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-foreground">技能选择</h2>
        <p class="text-xs text-muted-foreground">
          最多监控 10 个技能（2行 x 5列）
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-muted-foreground">
          已选 {monitoredSkillIds.length}/10
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={clearSkills}
        >
          清空
        </button>
      </div>
    </div>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-3">
      {#each classSkills as skill (skill.skillId)}
        <button
          type="button"
          class="relative group rounded-lg border overflow-hidden transition-colors {isSelected(skill.skillId)
            ? 'border-primary ring-1 ring-primary'
            : 'border-border/60 hover:border-border'}"
          onclick={() => toggleSkill(skill.skillId)}
        >
          {#if skill.imagePath}
            <img
              src={skill.imagePath}
              alt={skill.name}
              class="w-full h-full object-cover aspect-square"
            />
          {:else}
            <div class="w-full h-full aspect-square flex items-center justify-center bg-muted/30 text-xs text-muted-foreground">
              未配置
            </div>
          {/if}
          <div class="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white px-1 py-0.5 truncate">
            {skill.name || `#${skill.skillId}`}
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">共鸣技能</h2>
        <p class="text-xs text-muted-foreground">
          通过搜索选择共鸣技能，与普通技能共享 10 个监控格
        </p>
      </div>
      <div class="text-xs text-muted-foreground">
        已选 {selectedResonanceSkills.length}
      </div>
    </div>

    <input
      class="w-full sm:w-64 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      placeholder="搜索共鸣技能名称"
      bind:value={resonanceSearch}
    />

    {#if resonanceSearch.trim().length > 0}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-3">
        {#each filteredResonanceSkills as skill (skill.skillId)}
          <button
            type="button"
            class="relative group rounded-lg border overflow-hidden transition-colors {isSelected(skill.skillId)
              ? 'border-primary ring-1 ring-primary'
              : 'border-border/60 hover:border-border'}"
            title={skill.name}
            onclick={() => toggleSkill(skill.skillId)}
          >
            <img
              src={skill.imagePath}
              alt={skill.name}
              class="w-full h-full object-contain aspect-square bg-muted/20"
            />
            <div class="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white px-1 py-0.5 truncate">
              {skill.name}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="text-xs text-muted-foreground">请输入关键词搜索共鸣技能</div>
    {/if}

    <div class="space-y-2">
      <div class="text-xs text-muted-foreground">已选共鸣技能</div>
      <div class="flex flex-wrap gap-2">
        {#each selectedResonanceSkills as skill (skill.skillId)}
          <button
            type="button"
            class="relative rounded-md border border-border/60 overflow-hidden bg-muted/20 size-12 hover:border-border hover:bg-muted/30"
            title={skill.name}
            onclick={() => toggleSkill(skill.skillId)}
          >
            <img
              src={skill.imagePath}
              alt={skill.name}
              class="w-full h-full object-contain"
            />
            <div class="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-white px-1 py-0.5 truncate">
              {skill.name}
            </div>
          </button>
        {/each}
        {#if selectedResonanceSkills.length === 0}
          <div class="text-xs text-muted-foreground">未选择共鸣技能</div>
        {/if}
      </div>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">Buff 监控</h2>
        <p class="text-xs text-muted-foreground">
          统一通过 Buff 名称搜索（含有图标/无图标 Buff）
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-muted-foreground">
          已选 {monitoredBuffIds.length}
        </div>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onclick={clearBuffs}
        >
          清空
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-3 items-center">
      <input
        class="w-full sm:w-64 rounded border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        placeholder="搜索 Buff 名称"
        bind:value={buffSearch}
      />
    </div>

  {#if buffSearch.trim().length > 0}
    <div class="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-3">
      {#each filteredBuffs as buff (buff.baseId)}
        {@const iconBuff = availableBuffMap.get(buff.baseId)}
        <button
          type="button"
          class="relative group rounded-lg border overflow-hidden transition-colors {isBuffSelected(buff.baseId)
            ? 'border-primary ring-1 ring-primary'
            : 'border-border/60 hover:border-border'}"
          title={buff.name}
          onclick={() => toggleBuff(buff.baseId)}
        >
          {#if iconBuff}
            <img
              src={`/images/buff/${iconBuff.spriteFile}`}
              alt={iconBuff.name}
              class="w-full h-full object-contain aspect-square bg-muted/20"
            />
            <div class="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white px-1 py-0.5 truncate">
              {iconBuff.name.slice(0, 6)}
            </div>
          {:else}
            <div class="w-full h-full aspect-square flex items-center justify-center bg-muted/20 text-[11px] text-foreground p-1 text-center">
              {buff.name.slice(0, 8)}
            </div>
            <div class="absolute right-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">
              无图标
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {:else}
    <div class="text-xs text-muted-foreground">
      请输入关键词搜索 Buff
    </div>
  {/if}

    <div class="space-y-2">
      <div class="text-xs text-muted-foreground">已选 Buff</div>
      <div class="flex flex-wrap gap-2">
        {#each monitoredBuffIds as buffId (buffId)}
          {@const iconBuff = selectedBuffs.find((buff) => buff.baseId === buffId)}
          {@const nameInfo = buffNames.get(buffId)}
          {#if iconBuff}
            <button
              type="button"
              class="relative rounded-md border border-border/60 overflow-hidden bg-muted/20 size-12 hover:border-border hover:bg-muted/30"
              title={iconBuff.name}
              onclick={() => toggleBuff(iconBuff.baseId)}
            >
              <img
                src={`/images/buff/${iconBuff.spriteFile}`}
                alt={iconBuff.name}
                class="w-full h-full object-contain"
              />
              <div class="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-white px-1 py-0.5 truncate">
                {iconBuff.name.slice(0, 6)}
              </div>
            </button>
          {:else}
            <button
              type="button"
              class="rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[11px] text-foreground hover:border-border hover:bg-muted/30"
              title={nameInfo?.name ?? `#${buffId}`}
              onclick={() => toggleBuff(buffId)}
            >
              {nameInfo?.name ?? `#${buffId}`}
            </button>
          {/if}
        {/each}
        {#if monitoredBuffIds.length === 0}
          <div class="text-xs text-muted-foreground">未选择 Buff</div>
        {/if}
      </div>
    </div>
  </div>

  <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]">
    <div>
      <h2 class="text-base font-semibold text-foreground">监控预览</h2>
      <p class="text-xs text-muted-foreground">按选择顺序排列</p>
    </div>
    <div class="grid grid-cols-5 gap-2">
      {#each Array(10) as _, idx (idx)}
        {@const skillId = monitoredSkillIds[idx]}
        {@const skill = skillId ? findAnySkillByBaseId(selectedClassKey, skillId) : undefined}
        <button
          type="button"
          class="relative rounded-md border border-border/60 overflow-hidden bg-muted/20 aspect-square text-left {skillId
            ? 'hover:border-border hover:bg-muted/30'
            : ''}"
          onclick={() => {
            if (skillId) toggleSkill(skillId);
          }}
        >
          {#if skill?.imagePath}
            <img
              src={skill.imagePath}
              alt={skill.name}
              class="w-full h-full object-cover"
            />
          {:else if skillId}
            <div class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
              #{skillId}
            </div>
          {:else}
            <div class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
              空
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>
