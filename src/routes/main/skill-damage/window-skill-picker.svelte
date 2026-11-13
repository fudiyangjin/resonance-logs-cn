<script lang="ts">
  import { getLocale, t } from "$lib/i18n/index.svelte";
  import { searchSkillDamage } from "$lib/config/skill-damage-search";
  import { lookupDamageIdName } from "$lib/config/recount-table";
  import MonsterSkillSearchGrid from "$lib/components/MonsterSkillSearchGrid.svelte";
  let {
    value = $bindable([]),
    label,
    empty,
  }: {
    value: number[];
    label: string;
    empty: string;
  } = $props();
  let keyword = $state("");
  const results = $derived(searchSkillDamage(keyword, {}, getLocale()));
</script>

<div class="space-y-2 rounded border p-3">
  <label class="block space-y-2 text-sm">
    <span>{label}</span>
    <input
      class="bg-background w-full rounded border p-2"
      bind:value={keyword}
      placeholder={t("skillDamage.searchHint")}
    />
  </label>
  <div class="flex flex-wrap items-center gap-2 text-sm">
    {#if value.length === 0}<span>{empty}</span>{/if}
    {#each value as id (id)}
      <button
        type="button"
        class="rounded border px-2 py-1"
        onclick={() => (value = value.filter((selected) => selected !== id))}
        aria-label={`${t("skillDamage.windowClear")} ${lookupDamageIdName(id)} #${id}`}
      >
        {lookupDamageIdName(id)} #{id} &times;
      </button>
    {/each}
  </div>
  {#if keyword.trim()}
    <MonsterSkillSearchGrid
      items={results}
      onSelect={(id) => {
        if (!value.includes(id)) value = [...value, id];
      }}
      isAdded={(id) => value.includes(id)}
      emptyMessage={t("skillDamage.emptySearch")}
    />
  {/if}
</div>
