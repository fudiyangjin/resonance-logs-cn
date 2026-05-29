<script lang="ts">
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import {
    getAvailableBuffDefinitions,
    getDirectBuffOverlayAlias,
    lookupResolvedBuffBaseName,
    resolveBuffSearchDisplayName,
    saveBuffOverlayAlias,
    searchBuffsByName,
    type BuffDefinition,
    type BuffNameInfo,
  } from "$lib/config/buff-name-table";
  import {
    SETTINGS,
    createDefaultBuffAlertRule,
    ensureBuffAliases,
    ensureBuffAlerts,
    type BuffAlertRule,
  } from "$lib/settings-store";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import { resolveMonsterMonitorTranslation } from "$lib/i18n";
  import { toast } from "svelte-sonner";

  type SearchTarget = "global" | "self";
  type MonsterMonitorTab = "buff" | "hate";

  const availableBuffs = getAvailableBuffDefinitions();
  const availableBuffMap = new Map<number, BuffDefinition>(
    availableBuffs.map((buff) => [buff.baseId, buff]),
  );

  let searchKeyword = $state("");
  let prioritySearchKeyword = $state("");
  let alertSearchKeyword = $state("");
  let searchTarget = $state<SearchTarget>("self");
  let activeTab = $state<MonsterMonitorTab>("buff");

  const monsterMonitor = $derived(SETTINGS.monsterMonitor.state);
  const buffAliases = $derived.by(() =>
    ensureBuffAliases(monsterMonitor.buffAliases),
  );
  const hatePanelStyle = $derived.by(() =>
    monsterMonitor.hatePanelStyle ?? monsterMonitor.panelStyle,
  );
  const globalBuffIds = $derived(monsterMonitor.monitoredBuffIds);
  const selfAppliedBuffIds = $derived(monsterMonitor.selfAppliedBuffIds);
  const combinedBuffIds = $derived.by(() =>
    Array.from(new Set([...globalBuffIds, ...selfAppliedBuffIds])),
  );
  const buffPriorityIds = $derived.by(() =>
    (monsterMonitor.buffPriorityIds ?? []).filter((buffId) => combinedBuffIds.includes(buffId)),
  );
  const buffAlerts = $derived.by(() => ensureBuffAlerts(monsterMonitor.buffAlerts));
  const configuredAlertBuffIds = $derived.by(() =>
    Object.keys(buffAlerts)
      .map((baseId) => Number(baseId))
      .filter((baseId) => Number.isFinite(baseId) && combinedBuffIds.includes(baseId))
      .sort((a, b) => a - b),
  );
  const searchResults = $derived.by(() =>
    searchKeyword.trim().length > 0
      ? searchBuffsByName(searchKeyword, buffAliases)
      : ([] as BuffNameInfo[]),
  );
  const prioritySearchResults = $derived.by(() =>
    prioritySearchKeyword.trim().length > 0
      ? searchBuffsByName(prioritySearchKeyword, buffAliases)
      : ([] as BuffNameInfo[]),
  );
  const alertSearchResults = $derived.by(() =>
    alertSearchKeyword.trim().length > 0
      ? searchBuffsByName(alertSearchKeyword, buffAliases)
      : ([] as BuffNameInfo[]),
  );

  function t(key: string, fallback: string): string {
    return resolveMonsterMonitorTranslation(
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  function updateMonsterMonitor(
    updater: (state: typeof SETTINGS.monsterMonitor.state) => Partial<typeof SETTINGS.monsterMonitor.state>,
  ) {
    Object.assign(
      SETTINGS.monsterMonitor.state,
      updater(SETTINGS.monsterMonitor.state),
    );
  }

  function toggleSelectedBuff(buffId: number) {
    updateMonsterMonitor((state) => {
      const nextGlobal = state.monitoredBuffIds.filter((id) => id !== buffId);
      const nextSelf = state.selfAppliedBuffIds.filter((id) => id !== buffId);
      const targetIds = searchTarget === "global" ? nextGlobal : nextSelf;
      const existsInTarget = (searchTarget === "global"
        ? state.monitoredBuffIds
        : state.selfAppliedBuffIds).includes(buffId);
      const nextTargetIds = existsInTarget ? targetIds : [...targetIds, buffId];

      const monitoredBuffIds = searchTarget === "global" ? nextTargetIds : nextGlobal;
      const selfAppliedBuffIds = searchTarget === "self" ? nextTargetIds : nextSelf;
      const stillMonitored = new Set([...monitoredBuffIds, ...selfAppliedBuffIds]);
      const nextAlerts = { ...ensureBuffAlerts(state.buffAlerts) };
      if (!stillMonitored.has(buffId)) {
        delete nextAlerts[String(buffId)];
      }

      return {
        ...state,
        monitoredBuffIds,
        selfAppliedBuffIds,
        buffPriorityIds: (state.buffPriorityIds ?? []).filter((id) => stillMonitored.has(id)),
        buffAlerts: nextAlerts,
      };
    });
  }

  function removeBuff(target: SearchTarget, buffId: number) {
    updateMonsterMonitor((state) => {
      const monitoredBuffIds = target === "global"
        ? state.monitoredBuffIds.filter((id) => id !== buffId)
        : state.monitoredBuffIds;
      const selfAppliedBuffIds = target === "self"
        ? state.selfAppliedBuffIds.filter((id) => id !== buffId)
        : state.selfAppliedBuffIds;
      const stillMonitored = new Set([...monitoredBuffIds, ...selfAppliedBuffIds]);
      const nextAlerts = { ...ensureBuffAlerts(state.buffAlerts) };
      if (!stillMonitored.has(buffId)) {
        delete nextAlerts[String(buffId)];
      }
      return {
        ...state,
        monitoredBuffIds,
        selfAppliedBuffIds,
        buffPriorityIds: (state.buffPriorityIds ?? []).filter((id) => stillMonitored.has(id)),
        buffAlerts: nextAlerts,
      };
    });
  }

  async function setAlias(buffId: number, alias: string) {
    updateMonsterMonitor((state) => {
      const nextAliases = { ...state.buffAliases };
      delete nextAliases[String(buffId)];
      return {
        ...state,
        buffAliases: nextAliases,
      };
    });

    const result = await saveBuffOverlayAlias(buffId, alias);
    if (!result.ok) {
      toast.error(`Failed to save overlay alias: ${result.error}`);
    }
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

  function searchStatusLabel(buffId: number): string | null {
    if (searchTarget === "global") {
      if (globalBuffIds.includes(buffId)) return t("status.addedGlobal", "Added to Global");
      if (selfAppliedBuffIds.includes(buffId)) return t("status.currentlySelf", "Currently in Self Only");
      return null;
    }
    if (selfAppliedBuffIds.includes(buffId)) return t("status.addedSelf", "Added to Self Only");
    if (globalBuffIds.includes(buffId)) return t("status.currentlyGlobal", "Currently in Global");
    return null;
  }

  function getFilteredPrioritySearchResults(): BuffNameInfo[] {
    const seen = new Set<number>();
    return prioritySearchResults.filter((item) => {
      if (seen.has(item.baseId)) return false;
      if (!combinedBuffIds.includes(item.baseId)) return false;
      if (buffPriorityIds.includes(item.baseId)) return false;
      seen.add(item.baseId);
      return true;
    });
  }

  function getFilteredAlertSearchResults(): BuffNameInfo[] {
    const seen = new Set<number>();
    return alertSearchResults.filter((item) => {
      if (seen.has(item.baseId)) return false;
      if (!combinedBuffIds.includes(item.baseId)) return false;
      if (buffAlerts[String(item.baseId)]) return false;
      seen.add(item.baseId);
      return true;
    });
  }

  function toggleMonsterBuffPriority(buffId: number) {
    updateMonsterMonitor((state) => {
      const current = (state.buffPriorityIds ?? []).filter((id) =>
        combinedBuffIds.includes(id)
      );
      return {
        ...state,
        buffPriorityIds: current.includes(buffId)
          ? current.filter((id) => id !== buffId)
          : [...current, buffId],
      };
    });
  }

  function moveMonsterBuffPriority(buffId: number, direction: "up" | "down") {
    updateMonsterMonitor((state) => {
      const current = (state.buffPriorityIds ?? []).filter((id) =>
        combinedBuffIds.includes(id)
      );
      const index = current.indexOf(buffId);
      if (index < 0) return state;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return state;
      const next = [...current];
      const sourceValue = next[index];
      const targetValue = next[targetIndex];
      if (sourceValue === undefined || targetValue === undefined) return state;
      next[index] = targetValue;
      next[targetIndex] = sourceValue;
      return { ...state, buffPriorityIds: next };
    });
  }

  function upsertMonsterBuffAlert(buffId: number, patch: Partial<BuffAlertRule>) {
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
      return { ...state, buffAlerts: next };
    });
  }

  function buffName(buffId: number) {
    return resolveBuffSearchDisplayName(buffId, buffAliases);
  }

  function defaultBuffName(buffId: number) {
    return lookupResolvedBuffBaseName(buffId) ?? `Buff ${buffId}`;
  }
</script>

<div class="space-y-6">
  <section class="rounded-xl border border-border/60 bg-card/60 p-2">
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {activeTab === 'buff'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => {
          activeTab = "buff";
        }}
      >
        {t("tab.buff", "On-Hit Monitor")}
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors {activeTab === 'hate'
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-foreground border-border/60 hover:bg-muted/50'}"
        onclick={() => {
          activeTab = "hate";
        }}
      >
        {t("tab.hate", "Hate List")}
      </button>
    </div>
  </section>

  {#if activeTab === "buff"}
    <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
      <div class="space-y-1">
        <h2 class="text-base font-semibold text-foreground">{t("buffSearchTitle", "Buff Search & Selection")}</h2>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="px-3 py-2 rounded-lg text-sm font-medium transition-colors {searchTarget === 'self'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/40 text-foreground hover:bg-muted/60'}"
          onclick={() => {
            searchTarget = "self";
          }}
        >
          {t("searchTarget.self", "Search to Add to Self-Only On-Hit Monitoring")}
        </button>
        <button
          type="button"
          class="px-3 py-2 rounded-lg text-sm font-medium transition-colors {searchTarget === 'global'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/40 text-foreground hover:bg-muted/60'}"
          onclick={() => {
            searchTarget = "global";
          }}
        >
          {t("searchTarget.global", "Search to Add to Global On-Hit Monitoring")}
        </button>
      </div>

      <div class="space-y-3">
        <input
          type="text"
          bind:value={searchKeyword}
          placeholder={searchTarget === "global"
            ? t("placeholder.global", "Search for on-boss hit effects to add to global monitoring")
            : t("placeholder.self", "Search for on-boss hit effects to add to self-only monitoring")}
          class="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
        />

        {#if searchKeyword.trim().length > 0}
          <BuffSearchResultGrid
            items={searchResults}
            {availableBuffMap}
            onSelect={toggleSelectedBuff}
            isSelected={isSelectedInCurrentTarget}
            getStatusLabel={searchStatusLabel}
            emptyMessage={t("emptySearch", "No matching boss buffs")}
          />
        {/if}
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <div class="rounded-lg border border-border/60 bg-background/50 p-4 space-y-3">
          <div>
            <div class="text-sm font-semibold text-foreground">{t("selfApplied", "Self Only")}</div>
            <div class="text-xs text-muted-foreground">{t("selfAppliedDescription", "Track only buffs applied to the boss by your character")}</div>
          </div>
          {#if selfAppliedBuffIds.length > 0}
            <div class="flex flex-wrap gap-2">
              {#each selfAppliedBuffIds as buffId (buffId)}
                {@const iconBuff = availableBuffMap.get(buffId)}
                <button
                  type="button"
                  class="selected-buff"
                  onclick={() => removeBuff("self", buffId)}
                  title={t("removeHint", "Click to remove")}
                >
                  {#if iconBuff}
                    <img
                      src={`/images/buff/${iconBuff.spriteFile}`}
                      alt={buffName(buffId)}
                      class="w-8 h-8 rounded object-contain bg-muted/20"
                    />
                  {/if}
                  <span>{buffName(buffId)}</span>
                </button>
              {/each}
            </div>
          {:else}
            <div class="text-xs text-muted-foreground">{t("noneSelected", "No buffs selected yet")}</div>
          {/if}
        </div>

        <div class="rounded-lg border border-border/60 bg-background/50 p-4 space-y-3">
          <div>
            <div class="text-sm font-semibold text-foreground">{t("globalMonitoring", "Global Monitoring")}</div>
            <div class="text-xs text-muted-foreground">{t("globalMonitoringDescription", "Show the buff whenever it appears on the boss, no matter who applied it")}</div>
          </div>
          {#if globalBuffIds.length > 0}
            <div class="flex flex-wrap gap-2">
              {#each globalBuffIds as buffId (buffId)}
                {@const iconBuff = availableBuffMap.get(buffId)}
                <button
                  type="button"
                  class="selected-buff"
                  onclick={() => removeBuff("global", buffId)}
                  title={t("removeHint", "Click to remove")}
                >
                  {#if iconBuff}
                    <img
                      src={`/images/buff/${iconBuff.spriteFile}`}
                      alt={buffName(buffId)}
                      class="w-8 h-8 rounded object-contain bg-muted/20"
                    />
                  {/if}
                  <span>{buffName(buffId)}</span>
                </button>
              {/each}
            </div>
          {:else}
            <div class="text-xs text-muted-foreground">{t("noneSelected", "No buffs selected yet")}</div>
          {/if}
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
      <div class="space-y-1">
        <h2 class="text-base font-semibold text-foreground">{t("displayNames", "Display Names")}</h2>
      </div>

      {#if combinedBuffIds.length > 0}
        <div class="grid gap-3">
          {#each combinedBuffIds as buffId (buffId)}
            <div class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
              <div class="text-sm text-foreground">{defaultBuffName(buffId)}</div>
              <input
                type="text"
                value={getDirectBuffOverlayAlias(buffId) || buffAliases[String(buffId)] || ""}
                placeholder={defaultBuffName(buffId)}
                class="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
                onchange={(event) =>
                  void setAlias(
                    buffId,
                    (event.currentTarget as HTMLInputElement).value,
                  )}
              />
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-sm text-muted-foreground">{t("displayNamesEmpty", "Select monster buffs to monitor first, then you can set aliases here.")}</div>
      {/if}
    </section>

    <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
      <div class="space-y-1">
        <h2 class="text-base font-semibold text-foreground">{t("buffPriorityTitle", "Display Priority")}</h2>
        <p class="text-sm text-muted-foreground">{t("buffPriorityDescription", "Keep important monster monitor rows above other tracked buffs.")}</p>
      </div>

      <div class="space-y-3">
        <input
          type="text"
          bind:value={prioritySearchKeyword}
          placeholder={t("buffPriorityPlaceholder", "Search selected monster buffs to prioritize")}
          class="w-full max-w-md px-3 py-2.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
        />
        {#if prioritySearchKeyword.trim().length > 0}
          <BuffSearchResultGrid
            items={getFilteredPrioritySearchResults()}
            {availableBuffMap}
            onSelect={toggleMonsterBuffPriority}
            emptyMessage={t("buffPriorityEmptySearch", "No selected monster buffs available for priority")}
          />
        {/if}

        {#if buffPriorityIds.length > 0}
          <div class="space-y-2">
            {#each buffPriorityIds as buffId, idx (buffId)}
              <div class="flex flex-wrap items-center gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2">
                <span class="w-6 text-center text-xs text-muted-foreground">{idx + 1}</span>
                <span class="min-w-0 flex-1 truncate text-sm text-foreground">{buffName(buffId)}</span>
                <button type="button" class="mini-button" onclick={() => toggleMonsterBuffPriority(buffId)}>{t("remove", "Remove")}</button>
                <button type="button" class="mini-button" onclick={() => moveMonsterBuffPriority(buffId, "up")} disabled={idx === 0}>{t("moveUp", "Move Up")}</button>
                <button type="button" class="mini-button" onclick={() => moveMonsterBuffPriority(buffId, "down")} disabled={idx === buffPriorityIds.length - 1}>{t("moveDown", "Move Down")}</button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-sm text-muted-foreground">{t("buffPriorityEmpty", "No monster buff priority configured.")}</div>
        {/if}
      </div>
    </section>

    <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
      <div class="space-y-1">
        <h2 class="text-base font-semibold text-foreground">{t("buffAlertTitle", "Buff Countdown Alerts")}</h2>
        <p class="text-sm text-muted-foreground">{t("buffAlertDescription", "Highlight monster monitor rows when their remaining timer drops below the configured threshold.")}</p>
      </div>

      <div class="space-y-3">
        <input
          type="text"
          bind:value={alertSearchKeyword}
          placeholder={t("buffAlertPlaceholder", "Search selected monster buffs to add an alert")}
          class="w-full max-w-md px-3 py-2.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
        />
        {#if alertSearchKeyword.trim().length > 0}
          <BuffSearchResultGrid
            items={getFilteredAlertSearchResults()}
            {availableBuffMap}
            onSelect={(buffId) => upsertMonsterBuffAlert(buffId, {})}
            emptyMessage={t("buffAlertEmptySearch", "No selected monster buffs available for alerts")}
          />
        {/if}

        {#if configuredAlertBuffIds.length > 0}
          <div class="space-y-2">
            {#each configuredAlertBuffIds as buffId (buffId)}
              {@const rule = buffAlerts[String(buffId)]!}
              <div class="rounded border border-border/60 bg-muted/20 p-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-medium text-foreground">{buffName(buffId)}</div>
                    <div class="text-xs text-muted-foreground">{defaultBuffName(buffId)}</div>
                  </div>
                  <button type="button" class="mini-button danger" onclick={() => removeMonsterBuffAlert(buffId)}>
                    {t("remove", "Remove")}
                  </button>
                </div>

                <div class="mt-3 grid gap-3 md:grid-cols-5">
                  <label class="style-field">
                    <span>{t("buffAlertThreshold", "Threshold")} ({t("seconds", "s")})</span>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      step="1"
                      value={rule.thresholdSeconds}
                      oninput={(event) =>
                        upsertMonsterBuffAlert(buffId, {
                          thresholdSeconds: Number((event.currentTarget as HTMLInputElement).value),
                        })}
                    />
                  </label>
                  <label class="style-field">
                    <span>{t("buffAlertFlashMs", "Flash ms")}</span>
                    <input
                      type="number"
                      min="100"
                      step="50"
                      value={rule.flashIntervalMs ?? 600}
                      oninput={(event) =>
                        upsertMonsterBuffAlert(buffId, {
                          flashIntervalMs: Number((event.currentTarget as HTMLInputElement).value),
                        })}
                    />
                  </label>
                  <label class="color-field">
                    <span>{t("buffAlertColor", "Alert Color")}</span>
                    <input
                      type="color"
                      value={rule.highlightColor}
                      oninput={(event) =>
                        upsertMonsterBuffAlert(buffId, {
                          highlightColor: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                  </label>
                  <label class="check-field">
                    <input
                      type="checkbox"
                      checked={rule.flash}
                      onchange={(event) =>
                        upsertMonsterBuffAlert(buffId, {
                          flash: (event.currentTarget as HTMLInputElement).checked,
                        })}
                    />
                    {t("buffAlertFlash", "Flash")}
                  </label>
                  <label class="check-field">
                    <input
                      type="checkbox"
                      checked={rule.applyToProgress ?? true}
                      onchange={(event) =>
                        upsertMonsterBuffAlert(buffId, {
                          applyToProgress: (event.currentTarget as HTMLInputElement).checked,
                        })}
                    />
                    {t("buffAlertProgress", "Progress")}
                  </label>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-sm text-muted-foreground">{t("buffAlertEmpty", "No monster buff countdown alerts configured.")}</div>
        {/if}
      </div>
    </section>

    <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
      <div class="space-y-1">
        <h2 class="text-base font-semibold text-foreground">{t("panelStyle", "Text Panel Style")}</h2>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <label class="style-field">
          <span>{t("rowGap", "Row Gap")}</span>
          <input
            type="range"
            min="0"
            max="24"
            value={monsterMonitor.panelStyle.gap}
            oninput={(event) =>
              updatePanelStyle(
                "gap",
                Number.parseInt((event.currentTarget as HTMLInputElement).value, 10),
              )}
          />
          <strong>{monsterMonitor.panelStyle.gap}px</strong>
        </label>

        <label class="style-field">
          <span>{t("columnGap", "Column Gap")}</span>
          <input
            type="range"
            min="0"
            max="40"
            value={monsterMonitor.panelStyle.columnGap}
            oninput={(event) =>
              updatePanelStyle(
                "columnGap",
                Number.parseInt((event.currentTarget as HTMLInputElement).value, 10),
              )}
          />
          <strong>{monsterMonitor.panelStyle.columnGap}px</strong>
        </label>

        <label class="style-field">
          <span>{t("fontSize", "Font Size")}</span>
          <input
            type="range"
            min="10"
            max="28"
            value={monsterMonitor.panelStyle.fontSize}
            oninput={(event) =>
              updatePanelStyle(
                "fontSize",
                Number.parseInt((event.currentTarget as HTMLInputElement).value, 10),
              )}
          />
          <strong>{monsterMonitor.panelStyle.fontSize}px</strong>
        </label>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label class="color-field">
          <span>{t("nameColor", "Name Color")}</span>
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
          <span>{t("valueColor", "Value Color")}</span>
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
          <span>{t("progressColor", "Progress Bar Color")}</span>
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
          <span>{t("progressOpacity", "Progress Bar Opacity")}</span>
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
          <strong>{Math.round((monsterMonitor.panelStyle.progressOpacity ?? 0.4) * 100)}%</strong>
        </label>
      </div>
    </section>
  {:else}
    <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
      <div class="space-y-1">
        <h2 class="text-base font-semibold text-foreground">{t("hateDisplay", "Hate List Display")}</h2>
        <p class="text-sm text-muted-foreground">{t("hateDisplayDescription", "Enable the monster hate panel separately and configure its style independently.")}</p>
      </div>

      <div class="flex justify-start">
        <div class="min-w-[220px]">
          <SettingsSwitch
            label={t("enableHateList", "Enable Hate List")}
            bind:checked={SETTINGS.monsterMonitor.state.hateListEnabled}
          />
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <label class="style-field">
          <span>{t("maxCharacters", "Maximum Characters Shown")}</span>
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

    <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
      <div class="space-y-1">
        <h2 class="text-base font-semibold text-foreground">{t("hatePanelStyle", "Hate Panel Style")}</h2>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <label class="style-field">
          <span>{t("rowGap", "Row Gap")}</span>
          <input
            type="range"
            min="0"
            max="24"
            value={hatePanelStyle.gap}
            oninput={(event) =>
              updateHatePanelStyle(
                "gap",
                Number.parseInt((event.currentTarget as HTMLInputElement).value, 10),
              )}
          />
          <strong>{hatePanelStyle.gap}px</strong>
        </label>

        <label class="style-field">
          <span>{t("columnGap", "Column Gap")}</span>
          <input
            type="range"
            min="0"
            max="40"
            value={hatePanelStyle.columnGap}
            oninput={(event) =>
              updateHatePanelStyle(
                "columnGap",
                Number.parseInt((event.currentTarget as HTMLInputElement).value, 10),
              )}
          />
          <strong>{hatePanelStyle.columnGap}px</strong>
        </label>

        <label class="style-field">
          <span>{t("fontSize", "Font Size")}</span>
          <input
            type="range"
            min="10"
            max="28"
            value={hatePanelStyle.fontSize}
            oninput={(event) =>
              updateHatePanelStyle(
                "fontSize",
                Number.parseInt((event.currentTarget as HTMLInputElement).value, 10),
              )}
          />
          <strong>{hatePanelStyle.fontSize}px</strong>
        </label>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label class="color-field">
          <span>{t("nameColor", "Name Color")}</span>
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
          <span>{t("valueColor", "Value Color")}</span>
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
          <span>{t("progressColor", "Progress Bar Color")}</span>
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
          <span>{t("progressOpacity", "Progress Bar Opacity")}</span>
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
          <strong>{Math.round((hatePanelStyle.progressOpacity ?? 0.4) * 100)}%</strong>
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

  .mini-button {
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 4px 8px;
    font-size: 12px;
    color: var(--foreground, #fff);
    background: rgba(15, 23, 42, 0.22);
    cursor: pointer;
  }

  .mini-button:hover {
    background: rgba(30, 41, 59, 0.55);
  }

  .mini-button:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .mini-button.danger {
    color: var(--destructive, #ef4444);
  }

  .check-field {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(15, 23, 42, 0.22);
    font-size: 13px;
    color: var(--foreground, #fff);
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
