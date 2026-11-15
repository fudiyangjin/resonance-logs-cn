<script lang="ts">
  /**
   * @file Search panel adding damage ids to one challenge group: by
   * mechanic / damage name or id prefix (`#` optional), paged by
   * IdSearchResultGrid instead of truncating. A typed full id the tables
   * do not list is added with Enter.
   */
  import IdSearchResultGrid, {
    type IdSearchResultItem,
  } from "$lib/components/IdSearchResultGrid.svelte";
  import { isChallengeDamageId } from "$lib/challenge-watch";
  import { searchDamageIds } from "$lib/config/damage-id-search";
  import { getLocale, t } from "$lib/i18n/index.svelte";

  interface Props {
    /** Ids already in the group, shown as added. */
    ids: readonly number[];
    onadd: (ids: number[]) => void;
    onclose: () => void;
  }

  let { ids, onadd, onclose }: Props = $props();

  let search = $state("");

  const results = $derived(
    search.trim() ? searchDamageIds(search, getLocale()) : [],
  );
  // O(1) lookups for the grid's per-row callbacks.
  const idsByKey = $derived(
    new Map(results.map((entry) => [entry.key, entry.ids])),
  );
  const configured = $derived(new Set(ids));
  const items = $derived<IdSearchResultItem[]>(
    results.map((entry) => ({
      key: entry.key,
      name: entry.name,
      detail: entry.isGroup
        ? t("challengeWatch.groupCount", { count: entry.ids.length })
        : `#${entry.ids[0]}`,
    })),
  );
  const typedId = $derived.by(() => {
    const text = search.trim().replace(/^#/, "");
    const value = Number(text);
    return /^\d+$/.test(text) && isChallengeDamageId(value) ? value : null;
  });

  function isAdded(key: string): boolean {
    const keyIds = idsByKey.get(key);
    return (
      !!keyIds && keyIds.length > 0 && keyIds.every((id) => configured.has(id))
    );
  }

  function onSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.isComposing && typedId !== null) {
      event.preventDefault();
      onadd([typedId]);
      search = "";
    } else if (event.key === "Escape") {
      onclose();
    }
  }
</script>

<div class="border-border/60 bg-muted/10 space-y-2 rounded-lg border p-3">
  <input
    type="text"
    class="border-border/60 bg-background/60 text-foreground placeholder:text-muted-foreground/60 focus:ring-ring/40 h-9 w-full rounded-md border px-3 text-sm transition-colors focus:ring-2 focus:outline-none"
    placeholder={t("challengeWatch.searchPlaceholder")}
    value={search}
    oninput={(event) => (search = event.currentTarget.value)}
    onkeydown={onSearchKeydown}
    {@attach (input) => input.focus()}
  />
  <p class="text-muted-foreground/70 text-[11px]">
    {t("challengeWatch.searchHint")}
  </p>

  {#if search.trim()}
    <IdSearchResultGrid
      {items}
      onSelect={(key) => onadd([...(idsByKey.get(key) ?? [])])}
      {isAdded}
      addedLabel={t("challengeWatch.presets.added")}
      emptyMessage={t("challengeWatch.searchNoResults")}
    />
  {/if}

  <div class="flex justify-end">
    <button
      type="button"
      class="border-border/60 hover:bg-muted/40 min-h-8 cursor-pointer rounded border px-3 py-1 text-xs transition-colors"
      onclick={onclose}
    >
      {t("challengeWatch.group.done")}
    </button>
  </div>
</div>
