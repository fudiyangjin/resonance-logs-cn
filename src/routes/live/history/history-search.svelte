<script lang="ts">
  /**
   * @file Search bar of the live history picker. One input matches scenes
   * and bosses locally, player names and UIDs through the backend;
   * suggestions expand inline instead of floating, because the live window
   * can be very short and the scroll container would clip a dropdown.
   */
  import ArrowLeftIcon from "virtual:icons/lucide/arrow-left";
  import RefreshCwIcon from "virtual:icons/lucide/refresh-cw";
  import SearchIcon from "virtual:icons/lucide/search";
  import StarIcon from "virtual:icons/lucide/star";
  import XIcon from "virtual:icons/lucide/x";
  import { onDestroy, tick } from "svelte";
  import { commands, type HistoryUidCandidateDto } from "$lib/bindings";
  import { getBossOptions, getSceneOptions } from "$lib/config/game-names";
  import { t } from "$lib/i18n/index.svelte";
  import {
    expandOptionIds,
    hasLiveHistoryFilters,
    matchNameOptions,
    uidCandidateDetail,
  } from "$lib/live-history-query";
  import { liveHistoryQuery as query } from "$lib/stores/live-history-query.svelte";
  import { liveView } from "$lib/stores/live-view-source.svelte";

  let { onBack }: { onBack: () => void } = $props();

  const SUGGESTION_PAGE_SIZE = 20;
  const PLAYER_LOOKUP_DELAY_MS = 250;

  type Suggestion =
    | { kind: "scene" | "boss"; label: string; ids: number[] }
    | { kind: "player"; label: string }
    | { kind: "uid"; label: string; uid: number; detail: string };

  let text = $state("");
  let highlighted = $state(0);
  let visibleCount = $state(SUGGESTION_PAGE_SIZE);
  let playerNames = $state.raw<string[]>([]);
  let uidCandidates = $state.raw<HistoryUidCandidateDto[]>([]);
  let playersLoading = $state(false);
  let playerTimer: ReturnType<typeof setTimeout> | undefined;
  let playerGeneration = 0;
  let listbox: HTMLElement | undefined = $state();

  const trimmed = $derived(text.trim());
  // UIDs first: a numeric query rarely matches a scene, boss or name.
  const suggestions = $derived.by((): Suggestion[] => [
    ...uidCandidates
      .filter((candidate) => !query.filters.playerUids.includes(candidate.uid))
      .map((candidate) => ({
        kind: "uid" as const,
        label: `#${candidate.uid}`,
        uid: candidate.uid,
        detail: uidCandidateDetail(
          candidate.names,
          t("common.encounterCount", { count: candidate.encounterCount }),
        ),
      })),
    ...matchNameOptions(query.sceneOptions, trimmed).map((option) => ({
      kind: "scene" as const,
      ...option,
    })),
    ...matchNameOptions(query.bossOptions, trimmed).map((option) => ({
      kind: "boss" as const,
      ...option,
    })),
    ...playerNames
      .filter((name) => !query.filters.players.includes(name))
      .map((name) => ({ kind: "player" as const, label: name })),
  ]);
  const visibleSuggestions = $derived(suggestions.slice(0, visibleCount));
  const remainingCount = $derived(suggestions.length - visibleCount);

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
      query.filters.players.length > 0 ||
      query.filters.playerUids.length > 0,
  );

  function kindLabel(kind: Suggestion["kind"]): string {
    if (kind === "scene") return t("live.history.filter.scene");
    if (kind === "boss") return t("live.history.filter.boss");
    if (kind === "uid") return t("live.history.filter.uid");
    return t("live.history.filter.player");
  }

  function lookupPlayers(query: string) {
    clearTimeout(playerTimer);
    const generation = ++playerGeneration;
    if (!query) {
      playerNames = [];
      uidCandidates = [];
      playersLoading = false;
      return;
    }
    playersLoading = true;
    playerTimer = setTimeout(async () => {
      try {
        const result = await commands.searchHistoryPlayers(query);
        if (generation !== playerGeneration) return;
        playerNames = result.status === "ok" ? result.data.names : [];
        uidCandidates = result.status === "ok" ? result.data.uids : [];
      } catch (error) {
        if (generation !== playerGeneration) return;
        console.error("[live-history] player lookup failed", error);
        playerNames = [];
        uidCandidates = [];
      } finally {
        if (generation === playerGeneration) playersLoading = false;
      }
    }, PLAYER_LOOKUP_DELAY_MS);
  }

  function handleInput() {
    highlighted = 0;
    visibleCount = SUGGESTION_PAGE_SIZE;
    lookupPlayers(text.trim());
  }

  function clearText() {
    text = "";
    highlighted = 0;
    visibleCount = SUGGESTION_PAGE_SIZE;
    lookupPlayers("");
  }

  // The list scrolls inside the sticky header, so keep the keyboard
  // selection in view.
  function moveHighlight(next: number) {
    highlighted = next;
    void tick().then(() =>
      listbox
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" }),
    );
  }

  function select(suggestion: Suggestion) {
    if (suggestion.kind === "player") {
      query.addPlayer(suggestion.label);
    } else if (suggestion.kind === "uid") {
      query.addPlayerUid(suggestion.uid);
    } else {
      query.addIds(
        suggestion.kind === "scene" ? "sceneIds" : "bossIds",
        suggestion.ids,
      );
    }
    clearText();
  }

  function handleKeydown(event: KeyboardEvent) {
    const count = visibleSuggestions.length;
    if (event.key === "ArrowDown" && count > 0) {
      event.preventDefault();
      moveHighlight((highlighted + 1) % count);
    } else if (event.key === "ArrowUp" && count > 0) {
      event.preventDefault();
      moveHighlight((highlighted - 1 + count) % count);
    } else if (event.key === "Enter") {
      const suggestion = visibleSuggestions[highlighted];
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
      {#each query.filters.playerUids as uid (uid)}
        {@render selectedChip(t("live.history.filter.uid"), `#${uid}`, () =>
          query.removePlayerUid(uid),
        )}
      {/each}
    </div>
  {/if}

  {#if trimmed}
    <div
      bind:this={listbox}
      class="border-border/60 bg-background/70 max-h-[50vh] overflow-y-auto rounded-md border text-xs"
      role="listbox"
    >
      {#each visibleSuggestions as suggestion, index (`${suggestion.kind}:${suggestion.label}`)}
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
          {#if suggestion.kind === "uid"}
            <span class="shrink-0">{suggestion.label}</span>
            <span class="truncate text-[10px] opacity-70"
              >{suggestion.detail}</span
            >
          {:else}
            <span class="truncate">{suggestion.label}</span>
          {/if}
        </button>
      {/each}
      {#if remainingCount > 0}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground hover:bg-muted/40 border-border/60 w-full border-t px-2 py-1 text-left text-[11px] transition-colors"
          onclick={() => (visibleCount += SUGGESTION_PAGE_SIZE)}
        >
          {t("common.showMore", { remaining: remainingCount })}
        </button>
      {/if}
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
