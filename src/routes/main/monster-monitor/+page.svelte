<script lang="ts">
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import {
    getAvailableBuffDefinitions,
    lookupDefaultBuffName,
    resolveBuffDisplayName,
    searchBuffsByName,
    type BuffDefinition,
    type BuffNameInfo,
  } from "$lib/config/buff-name-table";
  import { t } from "$lib/i18n/index.svelte";
  import {
    SETTINGS,
    createDefaultBuffAlertRule,
    ensureBuffAliases,
    ensureBuffAlerts,
    type BuffAlertRule,
  } from "$lib/settings-store";

  type SearchTarget = "global" | "self";
  type MonsterMonitorTab = "buff" | "teammate" | "hate";

  const availableBuffDefinitions = getAvailableBuffDefinitions();
  const availableBuffMap = new Map<number, BuffDefinition>(
    availableBuffDefinitions.map((buff) => [buff.baseId, buff]),
  );

  let searchKeyword = $state("");
  let teammateSearchKeyword = $state("");
  let prioritySearchKeyword = $state("");
  let alertSearchKeyword = $state("");
  let searchTarget = $state<SearchTarget>("self");
  let activeTab = $state<MonsterMonitorTab>("buff");

  const monsterMonitor = $derived(SETTINGS.monsterMonitor.state);
  const buffAliases = $derived.by(() =>
    ensureBuffAliases(monsterMonitor.buffAliases),
  );
  const hatePanelStyle = $derived.by(
    () => monsterMonitor.hatePanelStyle ?? monsterMonitor.panelStyle,
  );
  const globalBuffIds = $derived(monsterMonitor.monitoredBuffIds);
  const selfAppliedBuffIds = $derived(monsterMonitor.selfAppliedBuffIds);
  const teammateBuffIds = $derived(monsterMonitor.teammateBuffIds);
  const buffPriorityIds = $derived(monsterMonitor.buffPriorityIds ?? []);
  const buffAlerts = $derived.by(() =>
    ensureBuffAlerts(monsterMonitor.buffAlerts),
  );
  const allConfiguredBuffIds = $derived.by(() =>
    Array.from(
      new Set([
        ...globalBuffIds,
        ...selfAppliedBuffIds,
      ]),
    ),
  );
  const configuredAlertBuffIds = $derived.by(() =>
    Object.keys(buffAlerts)
      .map((baseId) => Number(baseId))
      .filter(
        (baseId) =>
          Number.isFinite(baseId) && allConfiguredBuffIds.includes(baseId),
      )
      .sort((a, b) => a - b),
  );
  const searchResults = $derived.by(() =>
    searchKeyword.trim().length > 0
      ? searchBuffsByName(searchKeyword, buffAliases)
      : ([] as BuffNameInfo[]),
  );
  const teammateSearchResults = $derived.by(() =>
    teammateSearchKeyword.trim().length > 0
      ? searchBuffsByName(teammateSearchKeyword, buffAliases)
      : ([] as BuffNameInfo[]),
  );
  const prioritySearchResults = $derived.by(() => {
    if (prioritySearchKeyword.trim().length === 0) return [];

    const matching = searchBuffsByName(prioritySearchKeyword, buffAliases);
    const combinedSet = new Set(allConfiguredBuffIds);
    const prioritySet = new Set(buffPriorityIds);

    return matching.filter(
      (item) => combinedSet.has(item.baseId) && !prioritySet.has(item.baseId),
    );
  });
  const alertSearchResults = $derived.by(() => {
    if (alertSearchKeyword.trim().length === 0) return [];

    const matching = searchBuffsByName(alertSearchKeyword, buffAliases);

    return matching.filter(
      (item) =>
        allConfiguredBuffIds.includes(item.baseId) &&
        !configuredAlertBuffIds.includes(item.baseId),
    );
  });

  function updateMonsterMonitor(
    updater: (
      state: typeof SETTINGS.monsterMonitor.state,
    ) => Partial<typeof SETTINGS.monsterMonitor.state>,
  ) {
    Object.assign(
      SETTINGS.monsterMonitor.state,
      updater(SETTINGS.monsterMonitor.state),
    );
  }

  function removeAlertIfUnmonitored(
    state: typeof SETTINGS.monsterMonitor.state,
    buffId: number,
    monitoredBuffIds: number[],
    selfAppliedBuffIds: number[],
  ) {
    const stillMonitored =
      monitoredBuffIds.includes(buffId) || selfAppliedBuffIds.includes(buffId);
    if (stillMonitored) return ensureBuffAlerts(state.buffAlerts);
    const nextAlerts = { ...ensureBuffAlerts(state.buffAlerts) };
    delete nextAlerts[String(buffId)];
    return nextAlerts;
  }

  function toggleSelectedBuff(buffId: number) {
    updateMonsterMonitor((state) => {
      const nextGlobal = state.monitoredBuffIds.filter((id) => id !== buffId);
      const nextSelf = state.selfAppliedBuffIds.filter((id) => id !== buffId);
      const targetIds =
        searchTarget === "global" ? nextGlobal : nextSelf;
      const existsInTarget =
        searchTarget === "global"
          ? state.monitoredBuffIds.includes(buffId)
          : state.selfAppliedBuffIds.includes(buffId);
      const nextTargetIds = existsInTarget ? targetIds : [...targetIds, buffId];

      const monitoredBuffIds =
        searchTarget === "global" ? nextTargetIds : nextGlobal;
      const selfAppliedBuffIds =
        searchTarget === "self" ? nextTargetIds : nextSelf;

      const stillMonitored =
        monitoredBuffIds.includes(buffId) || selfAppliedBuffIds.includes(buffId);
      const buffPriorityIds =
        !stillMonitored && state.buffPriorityIds
          ? state.buffPriorityIds.filter((id) => id !== buffId)
          : state.buffPriorityIds;
      const buffAlerts = removeAlertIfUnmonitored(
        state,
        buffId,
        monitoredBuffIds,
        selfAppliedBuffIds,
      );

      return {
        ...state,
        monitoredBuffIds,
        selfAppliedBuffIds,
        buffPriorityIds,
        buffAlerts,
      };
    });
  }

  function removeBuff(target: SearchTarget, buffId: number) {
    updateMonsterMonitor((state) => {
      const nextMonitored =
        target === "global"
          ? state.monitoredBuffIds.filter((id) => id !== buffId)
          : state.monitoredBuffIds;
      const nextSelfApplied =
        target === "self"
          ? state.selfAppliedBuffIds.filter((id) => id !== buffId)
          : state.selfAppliedBuffIds;

      const stillMonitored =
        nextMonitored.includes(buffId) || nextSelfApplied.includes(buffId);
      const nextPriorityIds =
        !stillMonitored && state.buffPriorityIds
          ? state.buffPriorityIds.filter((id) => id !== buffId)
          : state.buffPriorityIds;
      const buffAlerts = removeAlertIfUnmonitored(
        state,
        buffId,
        nextMonitored,
        nextSelfApplied,
      );

      return {
        ...state,
        monitoredBuffIds: nextMonitored,
        selfAppliedBuffIds: nextSelfApplied,
        buffPriorityIds: nextPriorityIds,
        buffAlerts,
      };
    });
  }

  function toggleTeammateBuff(buffId: number) {
    updateMonsterMonitor((state) => {
      const current = state.teammateBuffIds;
      const exists = current.includes(buffId);
      return {
        ...state,
        teammateBuffIds: exists
          ? current.filter((id) => id !== buffId)
          : [...current, buffId],
      };
    });
  }

  function removeTeammateBuff(buffId: number) {
    updateMonsterMonitor((state) => ({
      ...state,
      teammateBuffIds: state.teammateBuffIds.filter((id) => id !== buffId),
    }));
  }

  function setAlias(buffId: number, alias: string) {
    updateMonsterMonitor((state) => {
      const nextAliases = { ...state.buffAliases };
      const trimmed = alias.trim();
      if (trimmed) {
        nextAliases[buffId] = trimmed;
      } else {
        delete nextAliases[buffId];
      }
      return {
        ...state,
        buffAliases: nextAliases,
      };
    });
  }

  function updatePanelStyle<K extends keyof typeof monsterMonitor.panelStyle>(
    key: K,
    value: (typeof monsterMonitor.panelStyle)[K],
  ) {
    updateMonsterMonitor((state) => ({
      ...state,
      panelStyle: {
        ...state.panelStyle,
        [key]: value,
      },
    }));
  }

  function updateHatePanelStyle<K extends keyof typeof hatePanelStyle>(
    key: K,
    value: (typeof hatePanelStyle)[K],
  ) {
    updateMonsterMonitor((state) => ({
      ...state,
      hatePanelStyle: {
        ...(state.hatePanelStyle ?? state.panelStyle),
        [key]: value,
      },
    }));
  }

  function isSelectedInCurrentTarget(buffId: number) {
    return searchTarget === "global"
      ? globalBuffIds.includes(buffId)
      : selfAppliedBuffIds.includes(buffId);
  }

  function isSelectedTeammateBuff(buffId: number) {
    return teammateBuffIds.includes(buffId);
  }

  function searchStatusLabel(buffId: number): string | null {
    if (searchTarget === "global") {
      if (globalBuffIds.includes(buffId))
        return t("monsterMonitor.buffSearch.status.addedGlobal");
      if (selfAppliedBuffIds.includes(buffId))
        return t("monsterMonitor.buffSearch.status.currentSelf");
      return null;
    }
    if (selfAppliedBuffIds.includes(buffId))
      return t("monsterMonitor.buffSearch.status.addedSelf");
    if (globalBuffIds.includes(buffId))
      return t("monsterMonitor.buffSearch.status.currentGlobal");
    return null;
  }

  function teammateSearchStatusLabel(buffId: number): string | null {
    if (teammateBuffIds.includes(buffId))
      return t("monsterMonitor.buffSearch.status.addedTeammate");
    return null;
  }

  function buffName(buffId: number) {
    return resolveBuffDisplayName(buffId, buffAliases);
  }

  function defaultBuffName(buffId: number) {
    return (
      lookupDefaultBuffName(buffId) ??
      t("monsterMonitor.buffFallback", { id: buffId })
    );
  }

  function toggleMonsterBuffPriority(buffId: number) {
    updateMonsterMonitor((state) => {
      const current = state.buffPriorityIds ?? [];
      const exists = current.includes(buffId);
      return {
        ...state,
        buffPriorityIds: exists
          ? current.filter((id) => id !== buffId)
          : [...current, buffId],
      };
    });
  }

  function upsertMonsterBuffAlert(
    buffId: number,
    patch: Partial<BuffAlertRule>,
  ) {
    updateMonsterMonitor((state) => {
      const current = ensureBuffAlerts(state.buffAlerts);
      const existing = current[String(buffId)] ?? createDefaultBuffAlertRule();
      return {
        ...state,
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

  function removeMonsterBuffAlert(buffId: number) {
    updateMonsterMonitor((state) => {
      const next = { ...ensureBuffAlerts(state.buffAlerts) };
      delete next[String(buffId)];
      return {
        ...state,
        buffAlerts: next,
      };
    });
  }

  function moveMonsterBuffPriority(buffId: number, direction: "up" | "down") {
    updateMonsterMonitor((state) => {
      const current = state.buffPriorityIds ?? [];
      const idx = current.indexOf(buffId);
      if (idx === -1) return state;

      const next = [...current];
      if (direction === "up" && idx > 0) {
        next[idx] = next[idx - 1]!;
        next[idx - 1] = buffId;
      } else if (direction === "down" && idx < next.length - 1) {
        next[idx] = next[idx + 1]!;
        next[idx + 1] = buffId;
      }
      return { ...state, buffPriorityIds: next };
    });
  }
</script>

<div class="space-y-6">
  <section class="border-border/60 bg-card/60 space-y-4 rounded-xl border p-5">
    <div class="flex justify-start">
      <div class="min-w-[220px]">
        <SettingsSwitch
          label={t("monsterMonitor.enabled")}
          bind:checked={SETTINGS.monsterMonitor.state.enabled}
        />
      </div>
    </div>
  </section>

  <section class="border-border/60 bg-card/60 rounded-xl border p-2">
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'buff'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => {
          activeTab = "buff";
        }}
      >
        {t("monsterMonitor.tabs.buff")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'teammate'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => {
          activeTab = "teammate";
        }}
      >
        {t("monsterMonitor.tabs.teammate")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'hate'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => {
          activeTab = "hate";
        }}
      >
        {t("monsterMonitor.tabs.hate")}
      </button>
    </div>
  </section>

  {#if activeTab === "buff"}
    <section
      class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5"
    >
      <div class="space-y-1">
        <h2 class="text-foreground text-base font-semibold">
          {t("monsterMonitor.buffSearch.title")}
        </h2>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm font-medium transition-colors {searchTarget ===
          'self'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/40 text-foreground hover:bg-muted/60'}"
          onclick={() => {
            searchTarget = "self";
          }}
        >
          {t("monsterMonitor.buffSearch.self")}
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm font-medium transition-colors {searchTarget ===
          'global'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/40 text-foreground hover:bg-muted/60'}"
          onclick={() => {
            searchTarget = "global";
          }}
        >
          {t("monsterMonitor.buffSearch.global")}
        </button>
      </div>

      <div class="space-y-3">
        <input
          type="text"
          bind:value={searchKeyword}
          placeholder={searchTarget === "global"
            ? t("monsterMonitor.buffSearch.placeholderGlobal")
            : t("monsterMonitor.buffSearch.placeholderSelf")}
          class="border-border bg-background focus:border-primary w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
        />

        {#if searchKeyword.trim().length > 0}
          <BuffSearchResultGrid
            items={searchResults}
            {availableBuffMap}
            onSelect={toggleSelectedBuff}
            isSelected={isSelectedInCurrentTarget}
            getStatusLabel={searchStatusLabel}
            emptyMessage={t("monsterMonitor.buffSearch.empty")}
          />
        {/if}
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <div
          class="border-border/60 bg-background/50 space-y-3 rounded-lg border p-4"
        >
          <div>
            <div class="text-foreground text-sm font-semibold">
              {t("monsterMonitor.buffGroups.self.title")}
            </div>
            <div class="text-muted-foreground text-xs">
              {t("monsterMonitor.buffGroups.self.description")}
            </div>
          </div>
          {#if selfAppliedBuffIds.length > 0}
            <div class="flex flex-wrap gap-2">
              {#each selfAppliedBuffIds as buffId (buffId)}
                {@const iconBuff = availableBuffMap.get(buffId)}
                <button
                  type="button"
                  class="selected-buff"
                  onclick={() => removeBuff("self", buffId)}
                  title={t("monsterMonitor.buffGroups.removeTitle")}
                >
                  {#if iconBuff}
                    <img
                      src={`/images/buff/${iconBuff.spriteFile}`}
                      alt={buffName(buffId)}
                      class="bg-muted/20 h-8 w-8 rounded object-contain"
                    />
                  {/if}
                  <span>{buffName(buffId)}</span>
                </button>
              {/each}
            </div>
          {:else}
            <div class="text-muted-foreground text-xs">
              {t("monsterMonitor.buffGroups.empty")}
            </div>
          {/if}
        </div>

        <div
          class="border-border/60 bg-background/50 space-y-3 rounded-lg border p-4"
        >
          <div>
            <div class="text-foreground text-sm font-semibold">
              {t("monsterMonitor.buffGroups.global.title")}
            </div>
            <div class="text-muted-foreground text-xs">
              {t("monsterMonitor.buffGroups.global.description")}
            </div>
          </div>
          {#if globalBuffIds.length > 0}
            <div class="flex flex-wrap gap-2">
              {#each globalBuffIds as buffId (buffId)}
                {@const iconBuff = availableBuffMap.get(buffId)}
                <button
                  type="button"
                  class="selected-buff"
                  onclick={() => removeBuff("global", buffId)}
                  title={t("monsterMonitor.buffGroups.removeTitle")}
                >
                  {#if iconBuff}
                    <img
                      src={`/images/buff/${iconBuff.spriteFile}`}
                      alt={buffName(buffId)}
                      class="bg-muted/20 h-8 w-8 rounded object-contain"
                    />
                  {/if}
                  <span>{buffName(buffId)}</span>
                </button>
              {/each}
            </div>
          {:else}
            <div class="text-muted-foreground text-xs">
              {t("monsterMonitor.buffGroups.empty")}
            </div>
          {/if}
        </div>
      </div>

    </section>

    <section
      class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5"
    >
      <div class="space-y-2">
        <div class="text-foreground text-base font-semibold">
          {t("monsterMonitor.priority.title")}
        </div>
        <div class="text-muted-foreground text-xs">
          {t("monsterMonitor.priority.description")}
        </div>

        <input
          class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 mt-2 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-72"
          placeholder={t("monsterMonitor.priority.placeholder")}
          value={prioritySearchKeyword}
          oninput={(event) => {
            prioritySearchKeyword = (event.currentTarget as HTMLInputElement)
              .value;
          }}
        />
        {#if prioritySearchKeyword.trim().length > 0}
          <BuffSearchResultGrid
            items={prioritySearchResults}
            {availableBuffMap}
            onSelect={toggleMonsterBuffPriority}
            emptyMessage={t("monsterMonitor.priority.emptySearch")}
            minColumnWidth={180}
          />
        {/if}
        <div class="mt-3 space-y-1">
          {#each buffPriorityIds as buffId, idx (buffId)}
            <div
              class="border-border/60 bg-muted/20 flex items-center gap-2 rounded border px-2 py-1"
            >
              <span class="text-muted-foreground w-6 text-center text-xs"
                >{idx + 1}</span
              >
              <span class="text-foreground flex-1 truncate text-xs">
                {buffName(buffId)}
              </span>
              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 rounded border px-2 py-0.5 text-xs"
                onclick={() => toggleMonsterBuffPriority(buffId)}
                >{t("monsterMonitor.priority.remove")}</button
              >
              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 rounded border px-2 py-0.5 text-xs disabled:opacity-50"
                onclick={() => moveMonsterBuffPriority(buffId, "up")}
                disabled={idx === 0}
                >{t("monsterMonitor.priority.moveUp")}</button
              >
              <button
                type="button"
                class="border-border/60 hover:bg-muted/40 rounded border px-2 py-0.5 text-xs disabled:opacity-50"
                onclick={() => moveMonsterBuffPriority(buffId, "down")}
                disabled={idx === buffPriorityIds.length - 1}
                >{t("monsterMonitor.priority.moveDown")}</button
              >
            </div>
          {:else}
            <div class="text-xs text-muted-foreground py-2">
              {t("monsterMonitor.priority.empty")}
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section
      class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5"
    >
      <div class="space-y-1">
        <h2 class="text-foreground text-base font-semibold">
          {t("monsterMonitor.alert.title")}
        </h2>
        <p class="text-muted-foreground text-xs">
          {t("monsterMonitor.alert.description")}
        </p>
      </div>

      <input
        class="border-border/60 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:w-72"
        placeholder={t("monsterMonitor.alert.addPlaceholder")}
        value={alertSearchKeyword}
        oninput={(event) => {
          alertSearchKeyword = (event.currentTarget as HTMLInputElement).value;
        }}
      />
      {#if alertSearchKeyword.trim().length > 0}
        <BuffSearchResultGrid
          items={alertSearchResults}
          {availableBuffMap}
          onSelect={(buffId) => upsertMonsterBuffAlert(buffId, {})}
          emptyMessage={t("monsterMonitor.alert.emptySearch")}
          minColumnWidth={180}
        />
      {/if}

      <div class="space-y-2">
        {#each configuredAlertBuffIds as buffId (buffId)}
          {@const rule = buffAlerts[String(buffId)]}
          {#if rule}
            <div
              class="border-border/60 bg-background/50 space-y-3 rounded-lg border p-4"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="text-foreground min-w-0 truncate text-sm">
                  {buffName(buffId)}
                </span>
                <button
                  type="button"
                  class="border-border/60 text-destructive hover:bg-destructive/10 rounded border px-2 py-1 text-xs"
                  onclick={() => removeMonsterBuffAlert(buffId)}
                >
                  {t("monsterMonitor.alert.remove")}
                </button>
              </div>
              <div
                class="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_120px] md:items-center"
              >
                <label class="text-muted-foreground text-xs">
                  {t("monsterMonitor.alert.threshold", {
                    seconds: rule.thresholdSeconds,
                  })}
                  <input
                    class="border-border/60 bg-muted/30 text-foreground mt-1 w-full rounded border px-2 py-1 text-sm"
                    type="number"
                    min="1"
                    max="60"
                    step="1"
                    value={rule.thresholdSeconds}
                    oninput={(event) =>
                      upsertMonsterBuffAlert(buffId, {
                        thresholdSeconds: Number(
                          (event.currentTarget as HTMLInputElement).value,
                        ),
                      })}
                  />
                </label>
                <label class="text-muted-foreground text-xs">
                  {t("monsterMonitor.alert.highlightColor")}
                  <input
                    class="border-border/60 mt-1 h-8 w-full rounded border bg-transparent p-0"
                    type="color"
                    value={rule.highlightColor}
                    oninput={(event) =>
                      upsertMonsterBuffAlert(buffId, {
                        highlightColor: (
                          event.currentTarget as HTMLInputElement
                        ).value,
                      })}
                  />
                </label>
                <label class="text-foreground flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={rule.flash}
                    onchange={(event) =>
                      upsertMonsterBuffAlert(buffId, {
                        flash: (event.currentTarget as HTMLInputElement)
                          .checked,
                      })}
                  />
                  {t("monsterMonitor.alert.flash")}
                </label>
              </div>
            </div>
          {/if}
        {:else}
          <div class="text-xs text-muted-foreground">
            {t("monsterMonitor.alert.empty")}
          </div>
        {/each}
      </div>
    </section>

    <section
      class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5"
    >
      <div class="space-y-1">
        <h2 class="text-foreground text-base font-semibold">
          {t("monsterMonitor.alias.title")}
        </h2>
      </div>

      {#if allConfiguredBuffIds.length > 0}
        <div class="grid gap-3">
          {#each allConfiguredBuffIds as buffId (buffId)}
            <div
              class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:items-center"
            >
              <div class="text-foreground text-sm">
                {defaultBuffName(buffId)}
              </div>
              <input
                type="text"
                value={buffAliases[buffId] ?? ""}
                placeholder={defaultBuffName(buffId)}
                class="border-border bg-background focus:border-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
                oninput={(event) =>
                  setAlias(
                    buffId,
                    (event.currentTarget as HTMLInputElement).value,
                  )}
              />
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-muted-foreground text-sm">
          {t("monsterMonitor.alias.empty")}
        </div>
      {/if}
    </section>

    <section
      class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5"
    >
      <div class="space-y-1">
        <h2 class="text-foreground text-base font-semibold">
          {t("monsterMonitor.style.panelTitle")}
        </h2>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <label class="style-field">
          <span>{t("monsterMonitor.style.gap")}</span>
          <input
            type="range"
            min="0"
            max="24"
            value={monsterMonitor.panelStyle.gap}
            oninput={(event) =>
              updatePanelStyle(
                "gap",
                Number.parseInt(
                  (event.currentTarget as HTMLInputElement).value,
                  10,
                ),
              )}
          />
          <strong>{monsterMonitor.panelStyle.gap}px</strong>
        </label>

        <label class="style-field">
          <span>{t("monsterMonitor.style.columnGap")}</span>
          <input
            type="range"
            min="0"
            max="40"
            value={monsterMonitor.panelStyle.columnGap}
            oninput={(event) =>
              updatePanelStyle(
                "columnGap",
                Number.parseInt(
                  (event.currentTarget as HTMLInputElement).value,
                  10,
                ),
              )}
          />
          <strong>{monsterMonitor.panelStyle.columnGap}px</strong>
        </label>

        <label class="style-field">
          <span>{t("monsterMonitor.style.fontSize")}</span>
          <input
            type="range"
            min="10"
            max="28"
            value={monsterMonitor.panelStyle.fontSize}
            oninput={(event) =>
              updatePanelStyle(
                "fontSize",
                Number.parseInt(
                  (event.currentTarget as HTMLInputElement).value,
                  10,
                ),
              )}
          />
          <strong>{monsterMonitor.panelStyle.fontSize}px</strong>
        </label>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label class="color-field">
          <span>{t("monsterMonitor.style.nameColor")}</span>
          <input
            type="color"
            value={monsterMonitor.panelStyle.nameColor}
            oninput={(event) =>
              updatePanelStyle(
                "nameColor",
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>

        <label class="color-field">
          <span>{t("monsterMonitor.style.valueColor")}</span>
          <input
            type="color"
            value={monsterMonitor.panelStyle.valueColor}
            oninput={(event) =>
              updatePanelStyle(
                "valueColor",
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>

        <label class="color-field">
          <span>{t("monsterMonitor.style.progressColor")}</span>
          <input
            type="color"
            value={monsterMonitor.panelStyle.progressColor}
            oninput={(event) =>
              updatePanelStyle(
                "progressColor",
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>

        <label class="color-field">
          <span>{t("monsterMonitor.style.progressOpacity")}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={monsterMonitor.panelStyle.progressOpacity ?? 0.4}
            oninput={(event) =>
              updatePanelStyle(
                "progressOpacity",
                Number((event.currentTarget as HTMLInputElement).value),
              )}
          />
          <strong
            >{Math.round(
              (monsterMonitor.panelStyle.progressOpacity ?? 0.4) * 100,
            )}%</strong
          >
        </label>
      </div>
    </section>
  {:else if activeTab === "teammate"}
    <section
      class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5"
    >
      <div class="space-y-1">
        <h2 class="text-foreground text-base font-semibold">
          {t("monsterMonitor.teammate.title")}
        </h2>
      </div>

      <div class="space-y-3">
        <input
          type="text"
          bind:value={teammateSearchKeyword}
          placeholder={t("monsterMonitor.teammate.placeholder")}
          class="border-border bg-background focus:border-primary w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
        />

        {#if teammateSearchKeyword.trim().length > 0}
          <BuffSearchResultGrid
            items={teammateSearchResults}
            {availableBuffMap}
            onSelect={toggleTeammateBuff}
            isSelected={isSelectedTeammateBuff}
            getStatusLabel={teammateSearchStatusLabel}
            emptyMessage={t("monsterMonitor.teammate.emptySearch")}
          />
        {/if}
      </div>

      <div
        class="border-border/60 bg-background/50 space-y-3 rounded-lg border p-4"
      >
        <div>
          <div class="text-foreground text-sm font-semibold">
            {t("monsterMonitor.teammate.groupTitle")}
          </div>
        </div>
        {#if teammateBuffIds.length > 0}
          <div class="flex flex-wrap gap-2">
            {#each teammateBuffIds as buffId (buffId)}
              {@const iconBuff = availableBuffMap.get(buffId)}
              <button
                type="button"
                class="selected-buff"
                onclick={() => removeTeammateBuff(buffId)}
                title={t("monsterMonitor.buffGroups.removeTitle")}
              >
                {#if iconBuff}
                  <img
                    src={`/images/buff/${iconBuff.spriteFile}`}
                    alt={buffName(buffId)}
                    class="bg-muted/20 h-8 w-8 rounded object-contain"
                  />
                {/if}
                <span>{buffName(buffId)}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="text-muted-foreground text-xs">
            {t("monsterMonitor.buffGroups.empty")}
          </div>
        {/if}
      </div>
    </section>
  {:else}
    <section
      class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5"
    >
      <div class="space-y-1">
        <h2 class="text-foreground text-base font-semibold">
          {t("monsterMonitor.hate.displayTitle")}
        </h2>
        <p class="text-muted-foreground text-sm">
          {t("monsterMonitor.hate.displayDescription")}
        </p>
      </div>

      <div class="flex justify-start">
        <div class="min-w-[220px]">
          <SettingsSwitch
            label={t("monsterMonitor.hate.enabled")}
            bind:checked={SETTINGS.monsterMonitor.state.hateListEnabled}
          />
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <label class="style-field">
          <span>{t("monsterMonitor.hate.maxDisplay")}</span>
          <input
            type="range"
            min="5"
            max="20"
            step="1"
            value={monsterMonitor.hateListMaxDisplay ?? 5}
            oninput={(event) =>
              updateMonsterMonitor((state) => ({
                ...state,
                hateListMaxDisplay: Number.parseInt(
                  (event.currentTarget as HTMLInputElement).value,
                  10,
                ),
              }))}
          />
          <strong>{monsterMonitor.hateListMaxDisplay ?? 5}</strong>
        </label>
      </div>
    </section>

    <section
      class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5"
    >
      <div class="space-y-1">
        <h2 class="text-foreground text-base font-semibold">
          {t("monsterMonitor.hate.styleTitle")}
        </h2>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <label class="style-field">
          <span>{t("monsterMonitor.style.gap")}</span>
          <input
            type="range"
            min="0"
            max="24"
            value={hatePanelStyle.gap}
            oninput={(event) =>
              updateHatePanelStyle(
                "gap",
                Number.parseInt(
                  (event.currentTarget as HTMLInputElement).value,
                  10,
                ),
              )}
          />
          <strong>{hatePanelStyle.gap}px</strong>
        </label>

        <label class="style-field">
          <span>{t("monsterMonitor.style.columnGap")}</span>
          <input
            type="range"
            min="0"
            max="40"
            value={hatePanelStyle.columnGap}
            oninput={(event) =>
              updateHatePanelStyle(
                "columnGap",
                Number.parseInt(
                  (event.currentTarget as HTMLInputElement).value,
                  10,
                ),
              )}
          />
          <strong>{hatePanelStyle.columnGap}px</strong>
        </label>

        <label class="style-field">
          <span>{t("monsterMonitor.style.fontSize")}</span>
          <input
            type="range"
            min="10"
            max="28"
            value={hatePanelStyle.fontSize}
            oninput={(event) =>
              updateHatePanelStyle(
                "fontSize",
                Number.parseInt(
                  (event.currentTarget as HTMLInputElement).value,
                  10,
                ),
              )}
          />
          <strong>{hatePanelStyle.fontSize}px</strong>
        </label>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label class="color-field">
          <span>{t("monsterMonitor.style.nameColor")}</span>
          <input
            type="color"
            value={hatePanelStyle.nameColor}
            oninput={(event) =>
              updateHatePanelStyle(
                "nameColor",
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>

        <label class="color-field">
          <span>{t("monsterMonitor.style.valueColor")}</span>
          <input
            type="color"
            value={hatePanelStyle.valueColor}
            oninput={(event) =>
              updateHatePanelStyle(
                "valueColor",
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>

        <label class="color-field">
          <span>{t("monsterMonitor.style.progressColor")}</span>
          <input
            type="color"
            value={hatePanelStyle.progressColor}
            oninput={(event) =>
              updateHatePanelStyle(
                "progressColor",
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>

        <label class="color-field">
          <span>{t("monsterMonitor.style.progressOpacity")}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={hatePanelStyle.progressOpacity ?? 0.4}
            oninput={(event) =>
              updateHatePanelStyle(
                "progressOpacity",
                Number((event.currentTarget as HTMLInputElement).value),
              )}
          />
          <strong
            >{Math.round(
              (hatePanelStyle.progressOpacity ?? 0.4) * 100,
            )}%</strong
          >
        </label>
      </div>
    </section>
  {/if}
</div>

<style>
  .selected-buff {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.35);
    color: var(--foreground, #fff);
    font-size: 12px;
    cursor: pointer;
  }

  .selected-buff:hover {
    border-color: rgba(96, 165, 250, 0.65);
    background: rgba(30, 41, 59, 0.55);
  }

  .style-field,
  .color-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(15, 23, 42, 0.22);
    font-size: 13px;
    color: var(--foreground, #fff);
  }

  .style-field strong {
    font-size: 12px;
    color: var(--muted-foreground, rgba(255, 255, 255, 0.72));
  }

  .color-field input[type="color"] {
    width: 100%;
    height: 42px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }
</style>
