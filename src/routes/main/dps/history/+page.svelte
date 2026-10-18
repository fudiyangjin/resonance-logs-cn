<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page as pageStore } from "$app/stores";
  import { commands } from "$lib/bindings";
  import type { EncounterSummaryDto, EncounterFiltersDto } from "$lib/bindings";
  import UnifiedSearch from "$lib/components/unified-search.svelte";
  import {
    getBossOptions,
    getSceneOptions,
    resolveMonsterName,
    resolveSceneName,
    type NameOption,
  } from "$lib/config/game-names";
  import { formatDateTime, t } from "$lib/i18n/index.svelte";
  import { CLASS_MAP, getClassIcon, tooltip } from "$lib/utils.svelte";

  let encounters = $state<EncounterSummaryDto[]>([]);
  let errorMsg = $state<string | null>(null);

  // Pagination
  let pageSize = $state(10);
  let page = $state(0); // 0-indexed, page 0 = newest
  let totalCount = $state(0);
  let isRefreshing = $state(false);

  function parseNonNegativeInt(raw: string | null, fallback: number) {
    if (raw === null) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function parsePositiveIntList(raw: string | null): number[] {
    if (!raw) return [];
    return [
      ...new Set(
        raw
          .split(",")
          .map((part) => Number.parseInt(part, 10))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    ].sort((left, right) => left - right);
  }

  function mergeIds(current: number[], ids: number[]): number[] {
    return [...new Set([...current, ...ids])].sort(
      (left, right) => left - right,
    );
  }

  function buildHistorySearchParams(next: { page: number; pageSize: number }) {
    const sp = new URLSearchParams();
    sp.set("page", String(next.page));
    sp.set("pageSize", String(next.pageSize));
    if (selectedBossMonsterIds.length > 0) {
      sp.set("bossIds", selectedBossMonsterIds.join(","));
    }
    if (selectedPlayerNames.length > 0) {
      sp.set("players", selectedPlayerNames.join(","));
    }
    if (selectedPlayerUids.length > 0) {
      sp.set("uids", selectedPlayerUids.join(","));
    }
    if (selectedSceneIds.length > 0) {
      sp.set("sceneIds", selectedSceneIds.join(","));
    }
    if (showFavoritesOnly) sp.set("fav", "1");
    return sp;
  }

  // Multi-select state
  let selectedIds = $state<Set<number>>(new Set());
  let showDeleteModal = $state(false);
  let isDeleting = $state(false);

  // Derived: check if all visible items are selected
  const allSelected = $derived(
    encounters.length > 0 && encounters.every((enc) => selectedIds.has(enc.id)),
  );
  const someSelected = $derived(selectedIds.size > 0);

  function toggleSelectAll() {
    if (allSelected) {
      // Deselect all visible
      const visibleIds = new Set(encounters.map((e) => e.id));
      selectedIds = new Set(
        [...selectedIds].filter((id) => !visibleIds.has(id)),
      );
    } else {
      // Select all visible
      selectedIds = new Set([...selectedIds, ...encounters.map((e) => e.id)]);
    }
  }

  function toggleSelect(id: number, event: MouseEvent) {
    event.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    selectedIds = newSet;
  }

  function clearSelection() {
    selectedIds = new Set();
  }

  function openDeleteModal() {
    showDeleteModal = true;
  }

  function closeDeleteModal() {
    showDeleteModal = false;
  }

  async function confirmDeleteSelected() {
    if (selectedIds.size === 0) return;
    isDeleting = true;
    try {
      const idsToDelete = [...selectedIds];
      const res = await commands.deleteEncounters(idsToDelete);
      if (res.status === "ok") {
        selectedIds = new Set();
        showDeleteModal = false;
        // Reload encounters
        await loadEncounters(page);
      } else {
        errorMsg = t("history.list.error.deleteFailed", {
          error: String(res.error),
        });
      }
    } catch (e) {
      console.error("Delete error", e);
      errorMsg = t("history.list.error.deleteFailed", {
        error: String(e),
      });
    } finally {
      isDeleting = false;
    }
  }

  // Unified search (boss, player and encounter names, player UIDs)
  let availableBossOptions = $state<NameOption[]>([]);
  let availableEncounterOptions = $state<NameOption[]>([]);
  let selectedBossMonsterIds = $state<number[]>([]);
  let selectedSceneIds = $state<number[]>([]);
  let selectedPlayerNames = $state<string[]>([]);
  let selectedPlayerUids = $state<number[]>([]);
  let searchValue = $state("");
  let searchType = $state<"boss" | "player" | "encounter" | "uid">("encounter");
  let isLoadingBossNames = $state(false);

  let showFavoritesOnly = $state(false);
  const selectedBossFilterOptions = $derived(
    getBossOptions(selectedBossMonsterIds),
  );
  const selectedSceneFilterOptions = $derived(
    getSceneOptions(selectedSceneIds),
  );

  async function loadSceneNames() {
    try {
      const res = await commands.getUniqueSceneIds();
      if (res.status === "ok") {
        availableEncounterOptions = getSceneOptions(res.data.ids ?? []);
      } else {
        availableEncounterOptions = [];
      }
    } catch (e) {
      console.error("loadSceneNames error", e);
      availableEncounterOptions = [];
    }
  }

  async function loadBossNames() {
    isLoadingBossNames = true;
    try {
      const res = await commands.getUniqueBossMonsterIds();
      if (res.status === "ok") {
        availableBossOptions = getBossOptions(res.data.ids ?? []);
      } else {
        throw new Error(String(res.error));
      }
    } catch (e) {
      console.error("loadBossNames error", e);
      availableBossOptions = [];
    } finally {
      isLoadingBossNames = false;
    }
  }

  async function loadEncounters(p: number = page) {
    isRefreshing = true;
    try {
      const offset = p * pageSize;

      const filterPayload: EncounterFiltersDto = {
        bossMonsterIds:
          selectedBossMonsterIds.length > 0 ? selectedBossMonsterIds : null,
        playerName: null,
        sceneIds: selectedSceneIds.length > 0 ? selectedSceneIds : null,
        playerNames:
          selectedPlayerNames.length > 0 ? selectedPlayerNames : null,
        playerUids: selectedPlayerUids.length > 0 ? selectedPlayerUids : null,
        dateFromMs: null,
        dateToMs: null,
        isFavorite: showFavoritesOnly ? true : null,
      };

      const hasFilters =
        filterPayload.bossMonsterIds !== null ||
        filterPayload.sceneIds !== null ||
        filterPayload.playerNames !== null ||
        filterPayload.playerUids !== null ||
        filterPayload.isFavorite !== null;

      const res = await commands.getRecentEncountersFiltered(
        pageSize,
        offset,
        hasFilters ? filterPayload : null,
      );

      if (res.status === "ok") {
        console.log("encounter data", res.data);
        encounters = res.data.rows ?? [];
        totalCount = res.data.totalCount ?? 0;
        errorMsg = null;
        page = p;

        // Persist pagination in the URL so browser back/forward restores it.
        const sp = buildHistorySearchParams({ page: p, pageSize });
        await goto(`/main/dps/history?${sp.toString()}`, {
          replaceState: true,
          keepFocus: true,
          noScroll: true,
        });
      } else {
        throw new Error(String(res.error));
      }
    } catch (e) {
      console.error("loadEncounters error", e);
      errorMsg = t("history.list.error.loadFailed", {
        error: String(e),
      });
      encounters = [];
      totalCount = 0;
    } finally {
      isRefreshing = false;
    }
  }

  function handleSearchSelect(
    option:
      | NameOption
      | { label: string; ids: [] }
      | { label: string; ids: []; uid: number },
    type: "boss" | "player" | "encounter" | "uid",
  ) {
    if ("uid" in option) {
      if (!selectedPlayerUids.includes(option.uid)) {
        selectedPlayerUids = [...selectedPlayerUids, option.uid];
        loadEncounters(0);
      }
    } else if (type === "boss") {
      const nextIds = mergeIds(selectedBossMonsterIds, option.ids);
      if (nextIds.length !== selectedBossMonsterIds.length) {
        selectedBossMonsterIds = nextIds;
        loadEncounters(0);
      }
    } else if (type === "encounter") {
      const nextIds = mergeIds(selectedSceneIds, option.ids);
      if (nextIds.length !== selectedSceneIds.length) {
        selectedSceneIds = nextIds;
        loadEncounters(0);
      }
    } else {
      const name = option.label;
      if (!selectedPlayerNames.includes(name)) {
        selectedPlayerNames = [...selectedPlayerNames, name];
        loadEncounters(0);
      }
    }
  }

  function removeBossFilter(ids: number[]) {
    const removeIds = new Set(ids);
    selectedBossMonsterIds = selectedBossMonsterIds.filter(
      (id) => !removeIds.has(id),
    );
    loadEncounters(0);
  }

  function removeEncounterFilter(ids: number[]) {
    const removeIds = new Set(ids);
    selectedSceneIds = selectedSceneIds.filter((id) => !removeIds.has(id));
    loadEncounters(0);
  }

  function removePlayerNameFilter(playerName: string) {
    selectedPlayerNames = selectedPlayerNames.filter(
      (name) => name !== playerName,
    );
    loadEncounters(0);
  }

  function removePlayerUidFilter(uid: number) {
    selectedPlayerUids = selectedPlayerUids.filter(
      (playerUid) => playerUid !== uid,
    );
    loadEncounters(0);
  }

  function clearAllFilters() {
    selectedBossMonsterIds = [];
    selectedPlayerNames = [];
    selectedPlayerUids = [];
    selectedSceneIds = [];
    showFavoritesOnly = false;
    loadEncounters(0);
  }

  const hasActiveFilters = $derived(
    selectedBossMonsterIds.length > 0 ||
      selectedPlayerNames.length > 0 ||
      selectedPlayerUids.length > 0 ||
      selectedSceneIds.length > 0 ||
      showFavoritesOnly,
  );

  onMount(() => {
    loadBossNames();
    loadSceneNames();

    const sp = $pageStore.url.searchParams;

    // Restore pagination from query params (e.g. /main/dps/history?page=4&pageSize=10)
    const initialPage = parseNonNegativeInt(sp.get("page"), 0);
    const initialPageSize = parseNonNegativeInt(sp.get("pageSize"), pageSize);

    selectedBossMonsterIds = parsePositiveIntList(sp.get("bossIds"));

    const playersParam = sp.get("players");
    if (playersParam) {
      selectedPlayerNames = playersParam.split(",").filter(Boolean);
    }

    selectedPlayerUids = parsePositiveIntList(sp.get("uids"));

    selectedSceneIds = parsePositiveIntList(sp.get("sceneIds"));

    showFavoritesOnly = sp.get("fav") === "1";

    pageSize = initialPageSize;
    loadEncounters(initialPage);
  });

  function fmtDuration(durationSeconds: number) {
    const secs = Math.max(0, Math.round(durationSeconds));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function fmtDate(ms: number) {
    return (
      formatDateTime(ms, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }) || String(ms)
    );
  }

  function fmtTime(ms: number) {
    return (
      formatDateTime(ms, {
        hour: "numeric",
        minute: "2-digit",
      }) || String(ms)
    );
  }

  async function onView(enc: EncounterSummaryDto) {
    // Carry the current pagination state into the detail URL so the
    // in-app "back" button can return you to the same page.
    goto(`/main/dps/history/${enc.id}${$pageStore.url.search}`);
  }
</script>

<div class="">
  {#if errorMsg}
    <div class="mb-3 text-sm text-red-400">{errorMsg}</div>
  {/if}

  <!-- Filters Section -->
  <div class="mb-2 space-y-2">
    <!-- Search and Filter Row -->
    <div class="flex items-center gap-2">
      <div class="max-w-md flex-1">
        <UnifiedSearch
          id="unified-search"
          bind:value={searchValue}
          bind:searchType
          {availableBossOptions}
          {availableEncounterOptions}
          onSelect={handleSearchSelect}
          disabled={isLoadingBossNames}
        />
      </div>

      <!-- Favorites Toggle -->
      <button
        onclick={() => {
          showFavoritesOnly = !showFavoritesOnly;
          loadEncounters(0);
        }}
        class="border-border flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors {showFavoritesOnly
          ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-500'
          : 'bg-popover text-muted-foreground hover:bg-muted/40 hover:text-foreground'}"
        title={t("history.list.filters.favoriteOnlyTitle")}
      >
        <svg
          class="h-4 w-4"
          fill={showFavoritesOnly ? "currentColor" : "none"}
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
        <span>{t("history.list.filters.favorite")}</span>
      </button>

      <!-- Clear All Filters Button -->
      {#if hasActiveFilters}
        <button
          onclick={clearAllFilters}
          class="text-muted-foreground hover:text-destructive rounded-md px-3 py-1.5 text-sm transition-colors"
          title={t("history.list.filters.clearAllTitle")}
        >
          {t("history.list.filters.clearAll")}
        </button>
      {/if}
    </div>

    <!-- Active Filters Chips -->
    {#if hasActiveFilters}
      <div class="flex flex-wrap items-center gap-1.5">
        {#if showFavoritesOnly}
          <span
            class="inline-flex items-center gap-1 rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] leading-tight text-yellow-500"
          >
            <span>{t("history.list.filters.favoriteOnly")}</span>
            <button
              onclick={() => {
                showFavoritesOnly = false;
                loadEncounters(0);
              }}
              class="transition-colors hover:text-yellow-600"
              aria-label={t("history.list.filters.removeFavoriteAria")}
            >
              ✕
            </button>
          </span>
        {/if}
        {#each selectedBossFilterOptions as boss}
          <span
            class="bg-popover text-muted-foreground border-border/60 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-tight"
          >
            <span class="text-muted-foreground/70"
              >{t("history.list.filters.bossPrefix")}</span
            >
            {boss.label}
            <button
              onclick={() => removeBossFilter(boss.ids)}
              class="text-muted-foreground/70 hover:text-destructive transition-colors"
              aria-label={t("history.list.filters.removeAria", {
                name: boss.label,
              })}
            >
              ✕
            </button>
          </span>
        {/each}
        {#each selectedPlayerNames as player}
          <span
            class="bg-popover text-muted-foreground border-border/60 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-tight"
          >
            <span class="text-muted-foreground/70"
              >{t("history.list.filters.playerPrefix")}</span
            >
            {player}
            <button
              onclick={() => removePlayerNameFilter(player)}
              class="text-muted-foreground/70 hover:text-destructive transition-colors"
              aria-label={t("history.list.filters.removeAria", {
                name: player,
              })}
            >
              ✕
            </button>
          </span>
        {/each}
        {#each selectedPlayerUids as uid (uid)}
          <span
            class="bg-popover text-muted-foreground border-border/60 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-tight"
          >
            <span class="text-muted-foreground/70"
              >{t("history.list.filters.uidPrefix")}</span
            >
            #{uid}
            <button
              onclick={() => removePlayerUidFilter(uid)}
              class="text-muted-foreground/70 hover:text-destructive transition-colors"
              aria-label={t("history.list.filters.removeAria", {
                name: `#${uid}`,
              })}
            >
              ✕
            </button>
          </span>
        {/each}
        {#each selectedSceneFilterOptions as encounter}
          <span
            class="bg-popover text-muted-foreground border-border/60 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-tight"
          >
            <span class="text-muted-foreground/70"
              >{t("history.list.filters.scenePrefix")}</span
            >
            {encounter.label}
            <button
              onclick={() => removeEncounterFilter(encounter.ids)}
              class="text-muted-foreground/70 hover:text-destructive transition-colors"
              aria-label={t("history.list.filters.removeAria", {
                name: encounter.label,
              })}
            >
              ✕
            </button>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <div
    class="border-border/60 bg-card/30 relative overflow-x-auto rounded border"
  >
    <div class="absolute top-2 right-3 z-10">
      <button
        onclick={() => loadEncounters(page)}
        class="text-neutral-400 transition-colors hover:text-neutral-200"
        disabled={isRefreshing}
        aria-label={t("history.list.actions.refreshAria")}
      >
        <svg
          class:animate-spin={isRefreshing}
          class="h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </div>

    <table class="w-full border-collapse" style="min-width: 780px;">
      <thead>
        <tr class="bg-popover/60">
          <th
            class="text-muted-foreground w-10 px-3 py-2.5 text-left text-xs font-medium tracking-wider uppercase"
          >
            <button
              onclick={toggleSelectAll}
              class="flex h-5 w-5 items-center justify-center rounded border transition-colors {allSelected
                ? 'bg-primary border-primary'
                : someSelected && encounters.some((e) => selectedIds.has(e.id))
                  ? 'bg-primary/50 border-primary'
                  : 'border-border hover:border-primary/50'}"
              aria-label={allSelected
                ? t("history.list.table.deselectAll")
                : t("history.list.table.selectAll")}
              title={allSelected
                ? t("history.list.table.deselectAll")
                : t("history.list.table.selectAll")}
            >
              {#if allSelected}
                <svg
                  class="text-primary-foreground h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              {:else if encounters.some((e) => selectedIds.has(e.id))}
                <svg
                  class="text-primary-foreground h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M18 12H6"
                  />
                </svg>
              {/if}
            </button>
          </th>
          <th
            class="text-muted-foreground w-10 px-3 py-2.5 text-left text-xs font-medium tracking-wider uppercase"
            >{t("history.list.table.id")}</th
          >
          <th
            class="text-muted-foreground w-80 px-3 py-2.5 text-left text-xs font-medium tracking-wider uppercase"
            >{t("history.list.table.encounter")}</th
          >
          <th
            class="text-muted-foreground w-[400px] px-3 py-2.5 text-left text-xs font-medium tracking-wider uppercase"
            >{t("history.list.table.players")}</th
          >
          <th
            class="text-muted-foreground w-12 px-3 py-2.5 text-left text-xs font-medium tracking-wider uppercase"
            >{t("history.list.table.duration")}</th
          >
          <th
            class="text-muted-foreground w-48 px-3 py-2.5 text-left text-xs font-medium tracking-wider uppercase"
            >{t("history.list.table.date")}</th
          >
        </tr>
      </thead>
      <tbody class="bg-background/40">
        {#each encounters as enc (enc.id)}
          <tr
            class="border-border/40 hover:bg-muted/60 cursor-pointer border-t transition-colors {selectedIds.has(
              enc.id,
            )
              ? 'bg-primary/5'
              : ''}"
            onclick={() => onView(enc)}
          >
            <td class="text-muted-foreground px-3 py-2 text-sm">
              <button
                onclick={(e) => toggleSelect(enc.id, e)}
                class="flex h-5 w-5 items-center justify-center rounded border transition-colors {selectedIds.has(
                  enc.id,
                )
                  ? 'bg-primary border-primary'
                  : 'border-border hover:border-primary/50'}"
                aria-label={selectedIds.has(enc.id)
                  ? t("history.list.table.deselect")
                  : t("history.list.table.select")}
              >
                {#if selectedIds.has(enc.id)}
                  <svg
                    class="text-primary-foreground h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="3"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                {/if}
              </button>
            </td>
            <td class="text-muted-foreground px-3 py-2 text-sm">
              <span class="inline-flex items-center gap-1">
                {enc.displayIndex}
                {#if enc.isFavorite}
                  <svg
                    class="h-3.5 w-3.5 flex-shrink-0 text-yellow-500"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                {/if}
              </span>
            </td>
            <td class="text-muted-foreground px-3 py-2 text-sm">
              <div class="space-y-1">
                <div>
                  {#if enc.sceneId !== null}
                    <span
                      class="bg-muted text-foreground rounded px-1.5 py-0.5 text-xs"
                      >{resolveSceneName(
                        enc.sceneId,
                        enc.dungeonDifficulty,
                      )}</span
                    >
                  {:else}
                    <span class="text-muted-foreground text-xs opacity-70"
                      >{t("history.list.table.noScene")}</span
                    >
                  {/if}
                </div>
                <div
                  class="max-w-72 truncate px-1.5 py-0.5 text-xs"
                  title={enc.note || undefined}
                >
                  {#if enc.bosses.length > 0}
                    <span
                      >{enc.bosses[0]
                        ? resolveMonsterName(enc.bosses[0].monsterId)
                        : ""}</span
                    >
                  {:else}
                    <span class="opacity-70"
                      >{t("history.list.table.noBoss")}</span
                    >
                  {/if}
                  {#if enc.note}
                    <span class="opacity-70"> ({enc.note})</span>
                  {/if}
                </div>
              </div>
            </td>
            <td class="text-muted-foreground px-3 py-2 text-sm">
              {#if enc.players.length > 0}
                {@const sortedPlayers = [...enc.players].sort((a, b) => {
                  const aHasClass = a.classId !== 0;
                  const bHasClass = b.classId !== 0;
                  if (aHasClass && !bHasClass) return -1;
                  if (!aHasClass && bHasClass) return 1;
                  return 0;
                })}
                <div class="flex items-center gap-1">
                  {#each sortedPlayers.slice(0, 8) as player}
                    <img
                      class="size-5 flex-shrink-0 object-contain"
                      src={getClassIcon(CLASS_MAP[player.classId] ?? "")}
                      alt={t("history.list.table.classIconAlt")}
                      {@attach tooltip(() => player.name)}
                    />
                  {/each}
                  {#if enc.players.length > 8}
                    <span class="text-muted-foreground text-xs"
                      >+{enc.players.length - 8}</span
                    >
                  {/if}
                </div>
              {/if}
            </td>
            <td class="text-muted-foreground px-3 py-2 text-sm"
              >{fmtDuration(enc.duration)}</td
            >
            <td class="text-muted-foreground px-3 py-2 text-sm">
              <div class="leading-snug">
                <div>{fmtDate(enc.startedAtMs)}</div>
                <div class="text-muted-foreground text-xs opacity-70">
                  {fmtTime(enc.startedAtMs)}
                </div>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Pagination controls -->
  <div class="mt-4 flex items-center justify-between gap-4">
    <div class="text-muted-foreground flex items-center gap-3 text-sm">
      <span>{t("history.list.pagination.rowsPerPage")}</span>
      <input
        type="number"
        bind:value={pageSize}
        min="5"
        max="100"
        class="bg-popover border-border text-foreground placeholder:text-muted-foreground focus:ring-primary w-16 rounded border px-2 py-1 focus:ring-2 focus:outline-none"
        onchange={() => loadEncounters(0)}
      />
      <span
        >{t("history.list.pagination.range", {
          start: page * pageSize + 1,
          end: Math.min((page + 1) * pageSize, totalCount),
          total: totalCount,
        })}</span
      >
    </div>

    <div class="ml-auto flex items-center gap-1">
      <button
        onclick={() => loadEncounters(0)}
        disabled={page === 0}
        class="text-muted-foreground hover:text-foreground p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={t("history.list.pagination.firstPage")}
      >
        <svg
          class="h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
          />
        </svg>
      </button>
      <button
        onclick={() => loadEncounters(page - 1)}
        disabled={page === 0}
        class="text-muted-foreground hover:text-foreground p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={t("history.list.pagination.previousPage")}
      >
        <svg
          class="h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
      <button
        onclick={() => loadEncounters(page + 1)}
        disabled={(page + 1) * pageSize >= totalCount}
        class="text-muted-foreground hover:text-foreground p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={t("history.list.pagination.nextPage")}
      >
        <svg
          class="h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
      <button
        onclick={() => loadEncounters(Math.floor((totalCount - 1) / pageSize))}
        disabled={(page + 1) * pageSize >= totalCount}
        class="text-muted-foreground hover:text-foreground p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={t("history.list.pagination.lastPage")}
      >
        <svg
          class="h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 5l7 7-7 7M5 5l7 7-7 7"
          />
        </svg>
      </button>
    </div>
  </div>
</div>

<!-- Floating Action Bar for Multi-select -->
{#if someSelected}
  <div
    class="animate-in slide-in-from-bottom-4 fixed bottom-6 left-1/2 z-50 -translate-x-1/2 duration-200"
  >
    <div
      class="border-border bg-popover/95 flex items-center gap-4 rounded-xl border px-5 py-3 shadow-xl backdrop-blur-sm"
    >
      <div class="flex items-center gap-2 text-sm">
        <span class="text-muted-foreground"
          >{t("history.list.selection.count", {
            count: selectedIds.size,
          })}</span
        >
      </div>

      <div class="bg-border h-5 w-px"></div>

      <div class="flex items-center gap-2">
        <button
          onclick={clearSelection}
          class="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md px-3 py-1.5 text-sm transition-colors"
        >
          {t("history.list.actions.clear")}
        </button>
        <button
          onclick={openDeleteModal}
          class="bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          {t("history.list.actions.delete")}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-modal-title"
  >
    <!-- Backdrop -->
    <button
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={closeDeleteModal}
      aria-label={t("history.list.deleteDialog.closeAria")}
    ></button>

    <!-- Modal Content -->
    <div
      class="border-border bg-popover animate-in fade-in zoom-in-95 relative z-10 mx-4 w-full max-w-md rounded-xl border p-6 shadow-2xl duration-200"
    >
      <div class="mb-4 flex items-center gap-3">
        <div
          class="bg-destructive/10 flex h-10 w-10 items-center justify-center rounded-full"
        >
          <svg
            class="text-destructive h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div>
          <h3
            id="delete-modal-title"
            class="text-foreground text-lg font-semibold"
          >
            {t("history.list.deleteDialog.title", {
              count: selectedIds.size,
            })}
          </h3>
          <p class="text-muted-foreground text-sm">
            {t("history.list.deleteDialog.subtitle")}
          </p>
        </div>
      </div>

      <p class="text-muted-foreground mb-6 text-sm">
        {t(
          selectedIds.size === 1
            ? "history.list.deleteDialog.message.one"
            : "history.list.deleteDialog.message.many",
        )}
      </p>

      <div class="flex justify-end gap-3">
        <button
          onclick={closeDeleteModal}
          disabled={isDeleting}
          class="border-border bg-popover text-foreground hover:bg-muted/40 rounded-md border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("history.list.deleteDialog.cancel")}
        </button>
        <button
          onclick={confirmDeleteSelected}
          disabled={isDeleting}
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if isDeleting}
            <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {t("history.list.actions.deleting")}
          {:else}
            {t("history.list.deleteDialog.confirm")}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
