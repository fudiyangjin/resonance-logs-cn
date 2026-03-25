<script lang="ts">
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";
  import BuffSearchResultGrid from "$lib/components/BuffSearchResultGrid.svelte";
  import { tl, tm } from "$lib/i18n/index.svelte";
  import {
    getAvailableBuffDefinitions,
    lookupDefaultBuffName,
    resolveBuffDisplayName,
    searchBuffsByName,
    type BuffDefinition,
    type BuffNameInfo,
  } from "$lib/config/buff-name-table";
  import { SETTINGS, ensureBuffAliases } from "$lib/settings-store";

  type SearchTarget = "global" | "self";
  type MonsterMonitorTab = "buff" | "hate";

  const availableBuffDefinitions = getAvailableBuffDefinitions();
  const availableBuffMap = new Map<number, BuffDefinition>(
    availableBuffDefinitions.map((buff) => [buff.baseId, buff]),
  );

  let searchKeyword = $state("");
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
  const searchResults = $derived.by(() =>
    searchKeyword.trim().length > 0
      ? searchBuffsByName(searchKeyword, buffAliases)
      : ([] as BuffNameInfo[]),
  );

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

      return {
        ...state,
        monitoredBuffIds: searchTarget === "global" ? nextTargetIds : nextGlobal,
        selfAppliedBuffIds: searchTarget === "self" ? nextTargetIds : nextSelf,
      };
    });
  }

  function removeBuff(target: SearchTarget, buffId: number) {
    updateMonsterMonitor((state) => ({
      ...state,
      monitoredBuffIds: target === "global"
        ? state.monitoredBuffIds.filter((id) => id !== buffId)
        : state.monitoredBuffIds,
      selfAppliedBuffIds: target === "self"
        ? state.selfAppliedBuffIds.filter((id) => id !== buffId)
        : state.selfAppliedBuffIds,
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

  function searchStatusLabel(buffId: number): string | null {
    if (searchTarget === "global") {
      if (globalBuffIds.includes(buffId)) return tl("Added globally");
      if (selfAppliedBuffIds.includes(buffId)) return tl("Currently in self-applied");
      return null;
    }
    if (selfAppliedBuffIds.includes(buffId)) return tl("Added to self-applied");
    if (globalBuffIds.includes(buffId)) return tl("Currently global");
    return null;
  }

  function buffName(buffId: number) {
    return resolveBuffDisplayName(buffId, buffAliases);
  }

  function defaultBuffName(buffId: number) {
    return lookupDefaultBuffName(buffId) ?? tm("Buff {{id}}", { id: buffId });
  }
</script>

<div class="space-y-6">
  <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-4">
    <div class="flex justify-start">
      <div class="min-w-[220px]">
        <SettingsSwitch
          label={tl("Enable Monster Monitor")}
          bind:checked={SETTINGS.monsterMonitor.state.enabled}
        />
      </div>
    </div>
  </section>

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
        {tl("Buff Monitor")}
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
        {tl("Threat List")}
      </button>
    </div>
  </section>

  {#if activeTab === "buff"}
    <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
    <div class="space-y-1">
      <h2 class="text-base font-semibold text-foreground">{tl("Buff Search and Selection")}</h2>
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
        {tl("Search and add to self-applied")}
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
        {tl("Search and add to global monitor")}
      </button>
    </div>

    <div class="space-y-3">
      <input
        type="text"
        bind:value={searchKeyword}
        placeholder={searchTarget === "global"
          ? tl("Search boss buffs to add to global monitor")
          : tl("Search boss buffs to add to self-applied")}
        class="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
      />

      {#if searchKeyword.trim().length > 0}
        <BuffSearchResultGrid
          items={searchResults}
          {availableBuffMap}
          onSelect={toggleSelectedBuff}
          isSelected={isSelectedInCurrentTarget}
          getStatusLabel={searchStatusLabel}
          emptyMessage={tl("No matching boss buffs")}
        />
      {/if}
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <div class="rounded-lg border border-border/60 bg-background/50 p-4 space-y-3">
        <div>
          <div class="text-sm font-semibold text-foreground">{tl("Self Applied Only")}</div>
          <div class="text-xs text-muted-foreground">{tl("Only track buffs applied by your character to the boss")}</div>
        </div>
        {#if selfAppliedBuffIds.length > 0}
          <div class="flex flex-wrap gap-2">
            {#each selfAppliedBuffIds as buffId (buffId)}
              {@const iconBuff = availableBuffMap.get(buffId)}
              <button
                type="button"
                class="selected-buff"
                onclick={() => removeBuff("self", buffId)}
                title={tl("Click to remove")}
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
          <div class="text-xs text-muted-foreground">{tl("No buffs selected yet")}</div>
        {/if}
      </div>

      <div class="rounded-lg border border-border/60 bg-background/50 p-4 space-y-3">
        <div>
          <div class="text-sm font-semibold text-foreground">{tl("Global Monitor")}</div>
          <div class="text-xs text-muted-foreground">{tl("Show whenever the boss has the buff, regardless of who applied it")}</div>
        </div>
        {#if globalBuffIds.length > 0}
          <div class="flex flex-wrap gap-2">
            {#each globalBuffIds as buffId (buffId)}
              {@const iconBuff = availableBuffMap.get(buffId)}
              <button
                type="button"
                class="selected-buff"
                onclick={() => removeBuff("global", buffId)}
                title={tl("Click to remove")}
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
          <div class="text-xs text-muted-foreground">{tl("No buffs selected yet")}</div>
        {/if}
      </div>
    </div>
  </section>

  <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
    <div class="space-y-1">
      <h2 class="text-base font-semibold text-foreground">{tl("Display Name")}</h2>
    </div>

    {#if combinedBuffIds.length > 0}
      <div class="grid gap-3">
        {#each combinedBuffIds as buffId (buffId)}
          <div class="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
            <div class="text-sm text-foreground">{defaultBuffName(buffId)}</div>
            <input
              type="text"
              value={buffAliases[buffId] ?? ""}
              placeholder={defaultBuffName(buffId)}
              class="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
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
      <div class="text-sm text-muted-foreground">{tl("Select monster buffs to monitor first, then set aliases here.")}</div>
    {/if}
  </section>

  <section class="rounded-xl border border-border/60 bg-card/60 p-5 space-y-5">
    <div class="space-y-1">
      <h2 class="text-base font-semibold text-foreground">{tl("Text Panel Style")}</h2>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <label class="style-field">
        <span>{tl("Row Gap")}</span>
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
        <span>{tl("Column Gap")}</span>
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
        <span>{tl("Font Size")}</span>
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
        <span>{tl("Name Color")}</span>
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
        <span>{tl("Value Color")}</span>
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
        <span>{tl("Progress Color")}</span>
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
        <span>{tl("Progress Opacity")}</span>
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
        <h2 class="text-base font-semibold text-foreground">{tl("Threat List")}</h2>
        <p class="text-sm text-muted-foreground">{tl("Enable the monster threat panel separately and configure its style independently.")}</p>
      </div>

      <div class="flex justify-start">
        <div class="min-w-[220px]">
          <SettingsSwitch
            label={tl("Enable Threat List")}
            bind:checked={SETTINGS.monsterMonitor.state.hateListEnabled}
          />
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <label class="style-field">
          <span>{tl("Maximum Characters to Show")}</span>
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
        <h2 class="text-base font-semibold text-foreground">{tl("Threat Panel Style")}</h2>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <label class="style-field">
          <span>{tl("Row Gap")}</span>
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
          <span>{tl("Column Gap")}</span>
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
          <span>{tl("Font Size")}</span>
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
          <span>{tl("Name Color")}</span>
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
          <span>{tl("Value Color")}</span>
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
          <span>{tl("Progress Color")}</span>
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
          <span>{tl("Progress Opacity")}</span>
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

  .color-field input[type="color"] {
    width: 100%;
    height: 42px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }
</style>
