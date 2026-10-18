<script lang="ts">
  /**
   * @file Search bar of the live history picker. One input matches scenes
   * and bosses locally and player names through the backend; suggestions
   * expand inline instead of floating, because the live window can be very
   * short and the scroll container would clip a dropdown.
   */
  import ArrowLeftIcon from "virtual:icons/lucide/arrow-left";
  import RefreshCwIcon from "virtual:icons/lucide/refresh-cw";
  import SearchIcon from "virtual:icons/lucide/search";
  import StarIcon from "virtual:icons/lucide/star";
  import XIcon from "virtual:icons/lucide/x";
  import { onDestroy } from "svelte";
  import { commands } from "$lib/bindings";
  import { getBossOptions, getSceneOptions } from "$lib/config/game-names";
  import { t } from "$lib/i18n/index.svelte";
  import {
    expandOptionIds,
    hasLiveHistoryFilters,
    matchNameOptions,
  } from "$lib/live-history-query";
  import { liveHistoryQuery as query } from "$lib/stores/live-history-query.svelte";
  import { liveView } from "$lib/stores/live-view-source.svelte";

  let { onBack }: { onBack: () => void } = $props();

  const SUGGESTIONS_PER_KIND = 3;
  const PLAYER_LOOKUP_DELAY_MS = 250;

  type Suggestion =
    | { kind: "scene" | "boss"; label: string; ids: number[] }
    | { kind: "player"; label: string };

  let text = $state("");
  let highlighted = $state(0);
  let playerNames = $state.raw<string[]>([]);
  let playersLoading = $state(false);
  let playerTimer: ReturnType<typeof setTimeout> | undefined;
  let playerGeneration = 0;

  const trimmed = $derived(text.trim());
  const suggestions = $derived.by((): Suggestion[] => [
    ...matchNameOptions(query.sceneOptions, trimmed, SUGGESTIONS_PER_KIND).map(
      (option) => ({ kind: "scene" as const, ...option }),
    ),
    ...matchNameOptions(query.bossOptions, trimmed, SUGGESTIONS_PER_KIND).map(
      (option) => ({ kind: "boss" as const, ...option }),
    ),
    ...playerNames
      .filter((name) => !query.filters.players.includes(name))
      .slice(0, SUGGESTIONS_PER_KIND)
      .map((name) => ({ kind: "player" as const, label: name })),
  ]);

  // Quick filters follow what the window currently shows (live or history).
  const currentSceneIds = $derived.by(() => {
    const sceneId = liveView.combat?.sceneId;
    return sceneId == null ? [] : expandOptionIds(query.sceneOptions, [sceneId]);
  });
  const currentBossIds = $derived.by(() => {
    const history = liveView.history;
    const ids = history
      ? history.summary.bosses.map((boss) => boss.monsterId)
      : (liveView.combat?.bosses ?? []).flatMap((boss) =>
          boss.monsterId == null ? [] : [boss.monsterId],
        );
    return ids.length === 0 ? [] : expandOptionIds(query.bossOptions, ids);
  });

  const selectedScenes = $derived(getSceneOptions(query.filters.sceneIds));
  const selectedBosses = $derived(getBossOptions(query.filters.bossIds));
  const hasSelectedNames = $derived(
    selectedScenes.length > 0 ||
      selectedBosses.length > 0 ||
      query.filters.players.length > 0,
  );

  function kindLabel(kind: Suggestion["kind"]): string {
    if (kind === "scene") return t("live.history.filter.scene");
    if (kind === "boss") return t("live.history.filter.boss");
    return t("live.history.filter.player");
  }

  function lookupPlayers(prefix: string) {
    clearTimeout(playerTimer);
    const generation = ++playerGeneration;
    if (!prefix) {
      playerNames = [];
      playersLoading = false;
      return;
    }
    playersLoading = true;
    playerTimer = setTimeout(async () => {
      try {
        const result = await commands.getPlayerNamesFiltered(prefix);
        if (generation !== playerGeneration) return;
        playerNames = result.status === "ok" ? (result.data.names ?? []) : [];
      } catch (error) {
        if (generation !== playerGeneration) return;
        console.error("[live-history] player lookup failed", error);
        playerNames = [];
      } finally {
        if (generation === playerGeneration) playersLoading = false;
      }
    }, PLAYER_LOOKUP_DELAY_MS);
  }

  function handleInput() {
    highlighted = 0;
    lookupPlayers(text.trim());
  }

  function clearText() {
    text = "";
    highlighted = 0;
    lookupPlayers("");
  }

  function select(suggestion: Suggestion) {
    if (suggestion.kind === "player") {
      query.addPlayer(suggestion.label);
    } else {
      query.addIds(
        suggestion.kind === "scene" ? "sceneIds" : "bossIds",
        suggestion.ids,
      );
    }
    clearText();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      highlighted = (highlighted + 1) % suggestions.length;
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      highlighted =
        (highlighted - 1 + suggestions.length) % suggestions.length;
    } else if (event.key === "Enter") {
      const suggestion = suggestions[highlighted];
      if (suggestion) {
        event.preventDefault();
        select(suggestion);
      }
    } else if (event.key === "Escape" && text) {
      event.preventDefault();
      clearText();
    }
  }

  onDestroy(() => clearTimeout(playerTimer));
</script>

{#snippet quickChip(
  label: string,
  active: boolean,
  onToggle: () => void,
  favorite = false,
)}
  <button
    type="button"
    aria-pressed={active}
    class="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] leading-none transition-colors {active
      ? favorite
        ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-500'
        : 'border-primary/50 bg-primary/15 text-foreground'
      : 'border-border/60 text-muted-foreground hover:bg-popover/60 hover:text-foreground'}"
    onclick={onToggle}
  >
    {#if favorite}
      <StarIcon class="size-2.5 {active ? 'fill-current' : ''}" />
    {/if}
    {label}
  </button>
{/snippet}

{#snippet selectedChip(prefix: string, label: string, onRemove: () => void)}
  <span
    class="bg-popover text-muted-foreground border-border/60 inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-tight"
  >
    <span class="text-muted-foreground/70 shrink-0">{prefix}</span>
    <span class="truncate">{label}</span>
    <button
      type="button"
      class="hover:text-destructive shrink-0 transition-colors"
      aria-label={t("live.history.filter.remove", { name: label })}
      onclick={onRemove}
    >
      <XIcon class="size-2.5" />
    </button>
  </span>
{/snippet}

<div
  class="bg-popover/90 border-border/40 sticky top-0 z-10 flex flex-col gap-1.5 border-b p-1.5 backdrop-blur-md"
>
  <div class="flex items-center gap-1">
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground hover:bg-popover/60 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
      aria-label={t("live.history.back")}
      onclick={onBack}
    >
      <ArrowLeftIcon class="size-4" />
    </button>
    <div
      class="border-border bg-background/60 focus-within:ring-primary flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 focus-within:ring-1"
    >
      <SearchIcon class="text-muted-foreground size-3.5 shrink-0" />
      <input
        type="text"
        aria-label={t("live.history.searchPlaceholder")}
        bind:value={text}
        oninput={handleInput}
        onkeydown={handleKeydown}
        placeholder={t("live.history.searchPlaceholder")}
        autocomplete="off"
        spellcheck="false"
        class="text-foreground placeholder:text-muted-foreground/70 min-w-0 flex-1 bg-transparent text-xs outline-none"
      />
      {#if text}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground shrink-0"
          aria-label={t("live.history.filter.clearText")}
          onclick={clearText}
        >
          <XIcon class="size-3" />
        </button>
      {/if}
    </div>
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground hover:bg-popover/60 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
      aria-label={t("live.history.refresh")}
      disabled={query.loading}
      onclick={() => query.reload()}
    >
      <RefreshCwIcon class="size-3.5 {query.loading ? 'animate-spin' : ''}" />
    </button>
  </div>

  <div class="flex flex-wrap items-center gap-1">
    {#if currentSceneIds.length > 0}
      {@render quickChip(
        t("live.history.quick.currentScene"),
        query.includesIds("sceneIds", currentSceneIds),
        () => query.toggleIds("sceneIds", currentSceneIds),
      )}
    {/if}
    {#if currentBossIds.length > 0}
      {@render quickChip(
        t("live.history.quick.currentBoss"),
        query.includesIds("bossIds", currentBossIds),
        () => query.toggleIds("bossIds", currentBossIds),
      )}
    {/if}
    {@render quickChip(
      t("live.history.quick.today"),
      query.filters.todayOnly,
      () => query.toggleFlag("todayOnly"),
    )}
    {@render quickChip(
      t("live.history.quick.favorite"),
      query.filters.favoriteOnly,
      () => query.toggleFlag("favoriteOnly"),
      true,
    )}
    {#if hasLiveHistoryFilters(query.filters)}
      <button
        type="button"
        class="text-muted-foreground hover:text-destructive ml-auto px-1 text-[10px] transition-colors"
        onclick={() => query.clearFilters()}
      >
        {t("live.history.filter.clear")}
      </button>
    {/if}
  </div>

  {#if hasSelectedNames}
    <div class="flex flex-wrap items-center gap-1">
      {#each selectedScenes as option (option.label)}
        {@render selectedChip(t("live.history.filter.scene"), option.label, () =>
          query.removeIds("sceneIds", option.ids),
        )}
      {/each}
      {#each selectedBosses as option (option.label)}
        {@render selectedChip(t("live.history.filter.boss"), option.label, () =>
          query.removeIds("bossIds", option.ids),
        )}
      {/each}
      {#each query.filters.players as name (name)}
        {@render selectedChip(t("live.history.filter.player"), name, () =>
          query.removePlayer(name),
        )}
      {/each}
    </div>
  {/if}

  {#if trimmed}
    <div
      class="border-border/60 bg-background/70 overflow-hidden rounded-md border text-xs"
      role="listbox"
    >
      {#each suggestions as suggestion, index (`${suggestion.kind}:${suggestion.label}`)}
        <button
          type="button"
          role="option"
          aria-selected={index === highlighted}
          class="flex w-full items-center gap-2 px-2 py-1 text-left transition-colors {index ===
          highlighted
            ? 'bg-muted/70 text-foreground'
            : 'text-muted-foreground hover:bg-muted/40'}"
          onmouseenter={() => (highlighted = index)}
          onclick={() => select(suggestion)}
        >
          <span class="w-9 shrink-0 text-[10px] opacity-70"
            >{kindLabel(suggestion.kind)}</span
          >
          <span class="truncate">{suggestion.label}</span>
        </button>
      {/each}
      {#if playersLoading}
        <div class="text-muted-foreground px-2 py-1 text-[11px]">
          {t("live.history.suggest.searchingPlayers")}
        </div>
      {:else if suggestions.length === 0}
        <div class="text-muted-foreground px-2 py-1 text-[11px]">
          {t("live.history.suggest.none")}
        </div>
      {/if}
    </div>
  {/if}
</div>
