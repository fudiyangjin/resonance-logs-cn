<script lang="ts">
  import Check from "virtual:icons/lucide/check";
  import Plus from "virtual:icons/lucide/plus";
  import IdSearchResultGrid, {
    type IdSearchResultItem,
  } from "$lib/components/IdSearchResultGrid.svelte";
  import { resolveMonsterName } from "$lib/config/game-names";
  import { searchMonsters } from "$lib/config/monster-search";
  import {
    addExcludedDamageMonster,
    DAMAGE_EXCLUSION_PRESETS,
    removeExcludedDamageMonster,
  } from "$lib/damage-exclusion";
  import { getLocale, t } from "$lib/i18n/index.svelte";

  interface Props {
    /** Excluded monster ids in the order the player added them. */
    ids: number[];
    onchange: (ids: number[]) => void;
  }

  let { ids, onchange }: Props = $props();

  let searchKeyword = $state("");

  const excludedSet = $derived(new Set(ids));

  const searchItems = $derived(
    searchMonsters(searchKeyword, getLocale()).map(
      (monster): IdSearchResultItem => ({
        key: String(monster.monsterId),
        name: monster.name ?? `#${monster.monsterId}`,
        detail: `#${monster.monsterId}`,
      }),
    ),
  );

  function add(monsterId: number) {
    if (excludedSet.has(monsterId)) return;
    onchange(addExcludedDamageMonster(ids, monsterId));
  }

  function remove(monsterId: number) {
    onchange(removeExcludedDamageMonster(ids, monsterId));
  }

  const inputClass =
    "border-border bg-background focus:border-primary w-full rounded-lg border px-3 py-2.5 text-sm outline-none";
</script>

<div class="space-y-4">
  <p class="text-muted-foreground text-xs">
    {t("settings.live.excludedMonstersDescription")}
  </p>

  <div class="space-y-2">
    <h3 class="text-foreground text-sm font-semibold">
      {t("settings.live.excludedMonsters.presets")}
    </h3>
    <div class="flex flex-wrap gap-2">
      {#each DAMAGE_EXCLUSION_PRESETS as preset (preset.key)}
        {@const added = excludedSet.has(preset.monsterId)}
        <button
          type="button"
          onclick={() => add(preset.monsterId)}
          disabled={added}
          class="border-border/60 bg-muted/30 hover:bg-muted/60 text-foreground inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-60"
        >
          {#if added}
            <Check class="h-3 w-3" />
          {:else}
            <Plus class="h-3 w-3" />
          {/if}
          <span class="max-w-[20rem] truncate">{t(preset.labelKey)}</span>
          <span class="text-muted-foreground font-normal">
            #{preset.monsterId}
          </span>
          {#if added}
            <span class="text-muted-foreground font-normal">
              {t("settings.live.excludedMonsters.presetAdded")}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="space-y-2">
    <h3 class="text-foreground text-sm font-semibold">
      {t("settings.live.excludedMonsters.listTitle")}
    </h3>
    {#if ids.length === 0}
      <p class="text-muted-foreground text-sm">
        {t("settings.live.excludedMonsters.empty")}
      </p>
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each ids as monsterId (monsterId)}
          <button
            type="button"
            class="excluded-chip"
            title={t("settings.live.excludedMonsters.remove")}
            onclick={() => remove(monsterId)}
          >
            <span class="text-foreground">{resolveMonsterName(monsterId)}</span>
            <span class="text-muted-foreground text-xs">#{monsterId}</span>
            <span class="text-muted-foreground" aria-hidden="true">×</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="space-y-2">
    <h3 class="text-foreground text-sm font-semibold">
      {t("settings.live.excludedMonsters.searchTitle")}
    </h3>
    <input
      type="text"
      bind:value={searchKeyword}
      placeholder={t("settings.live.excludedMonsters.searchPlaceholder")}
      class={inputClass}
    />
    {#if searchKeyword.trim().length > 0}
      <IdSearchResultGrid
        items={searchItems}
        onSelect={(key) => add(Number(key))}
        isAdded={(key) => excludedSet.has(Number(key))}
        addedLabel={t("settings.live.excludedMonsters.added")}
        emptyMessage={t("settings.live.excludedMonsters.searchEmpty")}
      />
    {/if}
  </div>
</div>

<style>
  .excluded-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 4px 10px;
    font-size: 13px;
    transition:
      border-color 120ms ease,
      background 120ms ease;
  }

  .excluded-chip:hover {
    border-color: rgba(248, 113, 113, 0.55);
    background: rgba(127, 29, 29, 0.24);
  }
</style>
