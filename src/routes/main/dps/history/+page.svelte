<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { page as pageStore } from "$app/stores";
	import { commands } from "$lib/bindings";
	import type {
		EncounterSummaryDto,
		EncounterFiltersDto,
	} from "$lib/bindings";
		import { CLASS_MAP, getClassIcon, tooltip } from "$lib/utils.svelte";
	import { resolveNavigationTranslation } from "$lib/i18n";
	import { SETTINGS } from "$lib/settings-store";
	import { localizeRawSceneName } from "$lib/scene-mappings";
  import { localizeRawMonsterName } from "$lib/monster-mappings";

	let encounters = $state<EncounterSummaryDto[]>([]);
	let errorMsg = $state<string | null>(null);

	// Pagination
	let pageSize = $state(10);
	let page = $state(0); // 0-indexed, page 0 = newest
	let totalCount = $state(0);
	let isRefreshing = $state(false);

	function t(key: string, fallback: string): string {
		return resolveNavigationTranslation(
			key,
			SETTINGS.live.general.state.language,
			fallback,
		);
	}

	function deleteTitle(count: number): string {
		return t("dps.historyPage.deleteRecords", "Delete {count} Record(s)").replace("{count}", String(count));
	}

	function parseNonNegativeInt(raw: string | null, fallback: number) {
		if (raw === null) return fallback;
		const n = Number.parseInt(raw, 10);
		return Number.isFinite(n) && n >= 0 ? n : fallback;
	}

	function buildHistorySearchParams(next: {
		page: number;
		pageSize: number;
	}) {
		const sp = new URLSearchParams();
		sp.set("page", String(next.page));
		sp.set("pageSize", String(next.pageSize));
		if (selectedBosses.length > 0) sp.set("bosses", selectedBosses.join(","));
		if (selectedPlayerNames.length > 0) {
			sp.set("players", selectedPlayerNames.join(","));
		}
		if (selectedEncounters.length > 0) {
			sp.set("encounters", selectedEncounters.join(","));
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
		encounters.length > 0 &&
			encounters.every((enc) => selectedIds.has(enc.id)),
	);
	const someSelected = $derived(selectedIds.size > 0);

	function toggleSelectAll() {
		if (allSelected) {
			const visibleIds = new Set(encounters.map((e) => e.id));
			selectedIds = new Set(
				[...selectedIds].filter((id) => !visibleIds.has(id)),
			);
		} else {
			selectedIds = new Set([
				...selectedIds,
				...encounters.map((e) => e.id),
			]);
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
				await loadEncounters(page);
			} else {
				errorMsg = `${t("dps.historyPage.deleteFailed", "Delete failed: ")}${res.error}`;
			}
		} catch (e) {
			console.error("Delete error", e);
			errorMsg = String(e);
		} finally {
			isDeleting = false;
		}
	}

	let availableBossNames = $state<string[]>([]);
	let availableEncounterNames = $state<string[]>([]);
	let selectedBosses = $state<string[]>([]);
	let selectedEncounters = $state<string[]>([]);
	let selectedPlayerNames = $state<string[]>([]);
	let searchValue = $state("");
	let searchType = $state<"boss" | "player" | "encounter">("encounter");
	let availablePlayerNames = $state<string[]>([]);
	let isLoadingBossNames = $state(false);

	type SearchOption = {
		raw: string;
		label: string;
	};

	function updateAvailablePlayerNames(rows: EncounterSummaryDto[]) {
		const merged = new Set(availablePlayerNames);
		for (const row of rows) {
			for (const player of row.players ?? []) {
				if (player?.name) merged.add(player.name);
			}
		}
		availablePlayerNames = [...merged].sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: "base" }),
		);
	}

	const searchPlaceholder = $derived.by(() => {
		switch (searchType) {
			case "boss":
				return t("dps.historyPage.searchBoss", "Search bosses...");
			case "player":
				return t("dps.historyPage.searchPlayer", "Search players...");
			default:
				return t("dps.historyPage.searchScene", "Search scenes...");
		}
	});

	const searchOptions = $derived.by((): SearchOption[] => {
		const source =
			searchType === "boss"
				? availableBossNames
				: searchType === "player"
					? availablePlayerNames
					: availableEncounterNames;
		const needle = searchValue.trim().toLowerCase();
		const mapped = source.map((item) => ({
			raw: item,
			label:
				searchType === "encounter"
					? localizeRawSceneName(item, item)
					: item,
		}));
		const filtered = needle
			? mapped.filter(
				(option) =>
					option.raw.toLowerCase().includes(needle) ||
					option.label.toLowerCase().includes(needle),
			)
			: mapped;
		return filtered.slice(0, 100);
	});

	function resolveSearchSelectionValue(
		value: string,
		type: "boss" | "player" | "encounter",
	): string {
		const trimmed = value.trim();
		if (!trimmed) return trimmed;
		const lowered = trimmed.toLowerCase();
		const exact = searchOptions.find(
			(option) =>
				option.raw.toLowerCase() === lowered ||
				option.label.toLowerCase() === lowered,
		);
		if (exact) return exact.raw;
		if (type !== "encounter") return trimmed;
		const partialMatches = searchOptions.filter(
			(option) =>
				option.raw.toLowerCase().includes(lowered) ||
				option.label.toLowerCase().includes(lowered),
		);
		if (partialMatches.length === 1) {
			return partialMatches[0]!.raw;
		}
		return trimmed;
	}

	function applySearchValue() {
		const value = searchValue.trim();
		if (!value) return;
		const resolvedValue = resolveSearchSelectionValue(value, searchType);
		handleSearchSelect(resolvedValue, searchType);
		searchValue = "";
	}

	function maybeApplySearchValue() {
		const value = searchValue.trim();
		if (!value) return;
		if (searchType === "player") {
			applySearchValue();
			return;
		}
		const lowered = value.toLowerCase();
		if (
			searchOptions.some(
				(option) =>
					option.raw.toLowerCase() === lowered ||
					option.label.toLowerCase() === lowered,
			)
		) {
			applySearchValue();
		}
	}

	let showFavoritesOnly = $state(false);

	async function loadSceneNames() {
		try {
			const res = await commands.getUniqueSceneNames();
			if (res.status === "ok") {
				availableEncounterNames = res.data.names ?? [];
			} else {
				availableEncounterNames = [];
			}
		} catch (e) {
			console.error("loadSceneNames error", e);
			availableEncounterNames = [];
		}
	}

	async function loadBossNames() {
		isLoadingBossNames = true;
		try {
			const res = await commands.getUniqueBossNames();
			if (res.status === "ok") {
				availableBossNames = res.data.names ?? [];
			} else {
				throw new Error(String(res.error));
			}
		} catch (e) {
			console.error("loadBossNames error", e);
			availableBossNames = [];
		} finally {
			isLoadingBossNames = false;
		}
	}

	async function loadEncounters(p: number = page) {
		isRefreshing = true;
		try {
			const offset = p * pageSize;

			const filterPayload: EncounterFiltersDto = {
				bossNames: selectedBosses.length > 0 ? selectedBosses : null,
				playerName: null,
				encounterNames:
					selectedEncounters.length > 0 ? selectedEncounters : null,
				playerNames:
					selectedPlayerNames.length > 0 ? selectedPlayerNames : null,
				dateFromMs: null,
				dateToMs: null,
				isFavorite: showFavoritesOnly ? true : null,
			};

			const hasFilters =
				filterPayload.bossNames !== null ||
				filterPayload.encounterNames !== null ||
				filterPayload.playerNames !== null ||
				filterPayload.isFavorite !== null;

			const res = await commands.getRecentEncountersFiltered(
				pageSize,
				offset,
				hasFilters ? filterPayload : null,
			);

			if (res.status === "ok") {
				encounters = res.data.rows ?? [];
				updateAvailablePlayerNames(encounters);
				totalCount = res.data.totalCount ?? 0;
				errorMsg = null;
				page = p;

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
			errorMsg = String(e);
			encounters = [];
			totalCount = 0;
		} finally {
			isRefreshing = false;
		}
	}

	function handleSearchSelect(
		name: string,
		type: "boss" | "player" | "encounter",
	) {
		if (type === "boss") {
			if (!selectedBosses.includes(name)) {
				selectedBosses = [...selectedBosses, name];
				loadEncounters(0);
			}
		} else if (type === "encounter") {
			if (!selectedEncounters.includes(name)) {
				selectedEncounters = [...selectedEncounters, name];
				loadEncounters(0);
			}
		} else {
			if (!selectedPlayerNames.includes(name)) {
				selectedPlayerNames = [...selectedPlayerNames, name];
				loadEncounters(0);
			}
		}
	}

	function removeBossFilter(bossName: string) {
		selectedBosses = selectedBosses.filter((name) => name !== bossName);
		loadEncounters(0);
	}

	function removeEncounterFilter(encounterName: string) {
		selectedEncounters = selectedEncounters.filter(
			(name) => name !== encounterName,
		);
		loadEncounters(0);
	}

	function removePlayerNameFilter(playerName: string) {
		selectedPlayerNames = selectedPlayerNames.filter(
			(name) => name !== playerName,
		);
		loadEncounters(0);
	}

	function clearAllFilters() {
		selectedBosses = [];
		selectedPlayerNames = [];
		selectedEncounters = [];
		showFavoritesOnly = false;
		loadEncounters(0);
	}

	const hasActiveFilters = $derived(
		selectedBosses.length > 0 ||
			selectedPlayerNames.length > 0 ||
			selectedEncounters.length > 0 ||
			showFavoritesOnly,
	);

	onMount(() => {
		loadBossNames();
		loadSceneNames();

		const sp = $pageStore.url.searchParams;

		const initialPage = parseNonNegativeInt(
			sp.get("page"),
			0,
		);
		const initialPageSize = parseNonNegativeInt(
			sp.get("pageSize"),
			pageSize,
		);

		const bossesParam = sp.get("bosses");
		if (bossesParam) {
			selectedBosses = bossesParam.split(",").filter(Boolean);
		}

		const playersParam = sp.get("players");
		if (playersParam) {
			selectedPlayerNames = playersParam.split(",").filter(Boolean);
		}

		const encountersParam = sp.get("encounters");
		if (encountersParam) {
			selectedEncounters = encountersParam.split(",").filter(Boolean);
		}

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
		try {
			const date = new Date(ms);
			return date.toLocaleDateString("en-CA");
		} catch {
			return String(ms);
		}
	}

	function fmtTime(ms: number) {
		try {
			const date = new Date(ms);
			return date.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
				hour12: true,
			});
		} catch {
			return String(ms);
		}
	}

	async function onView(enc: EncounterSummaryDto) {
		goto(`/main/dps/history/${enc.id}${$pageStore.url.search}`);
	}
</script>

<div class="">
	{#if errorMsg}
		<div class="text-red-400 mb-3 text-sm">{errorMsg}</div>
	{/if}

	<div class="mb-2 space-y-2">
		<div class="flex items-center gap-2">
			<div class="flex-1 max-w-md">
				<div class="flex items-center gap-2">
					<select
						bind:value={searchType}
						class="h-8 min-w-[96px] rounded-md border border-border bg-popover px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
						aria-label={t("dps.historyPage.searchType", "Search type")}
					>
						<option value="encounter">{t("dps.historyPage.scene", "Scene")}</option>
						<option value="boss">{t("dps.historyPage.boss", "Boss")}</option>
						<option value="player">{t("dps.historyPage.player", "Player")}</option>
					</select>

					<input
						bind:value={searchValue}
						list="history-search-options"
						class="h-8 flex-1 rounded-md border border-border bg-popover px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
						placeholder={searchPlaceholder}
						disabled={isLoadingBossNames}
						onchange={maybeApplySearchValue}
						onkeydown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								applySearchValue();
							}
						}}
						aria-label={searchPlaceholder}
					/>

					<datalist id="history-search-options">
						{#each searchOptions as option}
							<option value={option.label}></option>
						{/each}
					</datalist>
				</div>
			</div>

			<button
				onclick={() => {
					showFavoritesOnly = !showFavoritesOnly;
					loadEncounters(0);
				}}
				class="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border transition-colors text-sm {showFavoritesOnly
					? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-500'
					: 'bg-popover text-muted-foreground hover:bg-muted/40 hover:text-foreground'}"
				title={t("dps.historyPage.favoriteOnly", "Favorites Only")}
			>
				<svg
					class="w-4 h-4"
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
				<span>{t("dps.historyPage.favoriteOnly", "Favorites Only")}</span>
			</button>

			{#if hasActiveFilters}
				<button
					onclick={clearAllFilters}
					class="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-destructive transition-colors"
					title={t("dps.historyPage.clearAllTitle", "Clear all filters")}
				>
					{t("dps.historyPage.clearAll", "Clear All")}
				</button>
			{/if}
		</div>

		{#if hasActiveFilters}
			<div class="flex flex-wrap items-center gap-1.5">
				{#if showFavoritesOnly}
					<span
						class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/10 text-yellow-500 leading-tight border border-yellow-500/30"
					>
						<span>{t("dps.historyPage.favoriteOnly", "Favorites Only")}</span>
						<button
							onclick={() => {
								showFavoritesOnly = false;
								loadEncounters(0);
							}}
							class="hover:text-yellow-600 transition-colors"
							aria-label={t("dps.historyPage.removeFavoriteFilter", "Remove favorites filter")}
						>
							✕
						</button>
					</span>
				{/if}
				{#each selectedBosses as boss}
					<span
						class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-popover text-muted-foreground leading-tight border border-border/60"
					>
						<span class="text-muted-foreground/70">{t("dps.historyPage.bossPrefix", "Boss: ")}</span>
						{localizeRawMonsterName(boss, boss)}
						<button
							onclick={() => removeBossFilter(boss)}
							class="text-muted-foreground/70 hover:text-destructive transition-colors"
							aria-label={`${t("dps.historyPage.clearAll", "Clear")} ${localizeRawMonsterName(boss, boss)}`}
						>
							✕
						</button>
					</span>
				{/each}
				{#each selectedPlayerNames as player}
					<span
						class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-popover text-muted-foreground leading-tight border border-border/60"
					>
						<span class="text-muted-foreground/70">{t("dps.historyPage.playerPrefix", "Player: ")}</span>
						{player}
						<button
							onclick={() => removePlayerNameFilter(player)}
							class="text-muted-foreground/70 hover:text-destructive transition-colors"
							aria-label={`${t("dps.historyPage.clearAll", "Clear")} ${player}`}
						>
							✕
						</button>
					</span>
				{/each}
				{#each selectedEncounters as encounter}
					<span
						class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-popover text-muted-foreground leading-tight border border-border/60"
					>
						<span class="text-muted-foreground/70">{t("dps.historyPage.scenePrefix", "Scene: ")}</span>
						{localizeRawSceneName(encounter, encounter)}
						<button
							onclick={() => removeEncounterFilter(encounter)}
							class="text-muted-foreground/70 hover:text-destructive transition-colors"
							aria-label={`${t("dps.historyPage.clearAll", "Clear")} ${encounter}`}
						>
							✕
						</button>
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<div class="overflow-x-auto rounded border border-border/60 bg-card/30 relative">
		<div class="absolute top-2 right-3 z-10">
			<button
				onclick={() => loadEncounters(page)}
				class="text-neutral-400 hover:text-neutral-200 transition-colors"
				disabled={isRefreshing}
				aria-label={t("dps.historyPage.refreshEncounterList", "Refresh encounter list")}
			>
				<svg
					class:animate-spin={isRefreshing}
					class="w-4 h-4"
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
					<th class="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-10">
						<button
							onclick={toggleSelectAll}
							class="flex items-center justify-center w-5 h-5 rounded border transition-colors {allSelected
								? 'bg-primary border-primary'
								: someSelected && encounters.some((e) => selectedIds.has(e.id))
									? 'bg-primary/50 border-primary'
									: 'border-border hover:border-primary/50'}"
							aria-label={allSelected ? t("dps.historyPage.deselectAll", "Deselect all") : t("dps.historyPage.selectAll", "Select all")}
							title={allSelected ? t("dps.historyPage.deselectAll", "Deselect all") : t("dps.historyPage.selectAll", "Select all")}
						>
							{#if allSelected}
								<svg class="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
								</svg>
							{:else if encounters.some((e) => selectedIds.has(e.id))}
								<svg class="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M18 12H6" />
								</svg>
							{/if}
						</button>
					</th>
					<th class="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-10">{t("dps.historyPage.id", "ID")}</th>
					<th class="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-80">{t("dps.historyPage.encounter", "Encounter")}</th>
					<th class="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-[400px]">{t("dps.historyPage.players", "Players")}</th>
					<th class="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-12">{t("dps.historyPage.duration", "Duration")}</th>
					<th class="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-48">{t("dps.historyPage.date", "Date")}</th>
				</tr>
			</thead>
			<tbody class="bg-background/40">
				{#each encounters as enc (enc.id)}
					<tr
						class="border-t border-border/40 hover:bg-muted/60 transition-colors cursor-pointer {selectedIds.has(enc.id) ? 'bg-primary/5' : ''}"
						onclick={() => onView(enc)}
					>
						<td class="px-3 py-2 text-sm text-muted-foreground">
							<button
								onclick={(e) => toggleSelect(enc.id, e)}
								class="flex items-center justify-center w-5 h-5 rounded border transition-colors {selectedIds.has(enc.id)
									? 'bg-primary border-primary'
									: 'border-border hover:border-primary/50'}"
								aria-label={selectedIds.has(enc.id) ? t("dps.historyPage.deselect", "Deselect") : t("dps.historyPage.select", "Select")}
							>
								{#if selectedIds.has(enc.id)}
									<svg class="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
									</svg>
								{/if}
							</button>
						</td>
						<td class="px-3 py-2 text-sm text-muted-foreground">
							<span class="inline-flex items-center gap-1">
								{enc.id}
								{#if enc.isFavorite}
									<svg class="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
										<path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
									</svg>
								{/if}
							</span>
						</td>
						<td class="px-3 py-2 text-sm text-muted-foreground">
							<div class="space-y-1">
								<div>
									{#if enc.sceneName}
										<span class="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">{localizeRawSceneName(enc.sceneName, enc.sceneName)}</span>
									{:else}
										<span class="text-muted-foreground text-xs opacity-70">{t("dps.historyPage.openSceneNone", "No Scene")}</span>
									{/if}
								</div>
								<div>
									{#if enc.bosses.length > 0}
										<div class="flex flex-wrap gap-1">
											<span class="text-xs py-0.5 rounded px-1.5">{localizeRawMonsterName(enc.bosses[0]?.monsterName, enc.bosses[0]?.monsterName)}</span>
										</div>
									{:else}
										<span class="inline-block text-muted-foreground text-xs opacity-70 py-0.5 px-1.5">{t("dps.historyPage.noBoss", "No Boss")}</span>
									{/if}
								</div>
							</div>
						</td>
						<td class="px-3 py-2 text-sm text-muted-foreground">
							{#if enc.players.length > 0}
								{@const sortedPlayers = [...enc.players].sort((a, b) => {
									const aHasClass = a.classId !== 0;
									const bHasClass = b.classId !== 0;
									if (aHasClass && !bHasClass) return -1;
									if (!aHasClass && bHasClass) return 1;
									return 0;
								})}
								<div class="flex gap-1 items-center">
									{#each sortedPlayers.slice(0, 8) as player}
										<img
											class="size-5 object-contain flex-shrink-0"
											src={getClassIcon(CLASS_MAP[player.classId] ?? "")}
											alt="Class icon"
											{@attach tooltip(() => player.name)}
										/>
									{/each}
									{#if enc.players.length > 8}
										<span class="text-xs text-muted-foreground">+{enc.players.length - 8}</span>
									{/if}
								</div>
							{/if}
						</td>
						<td class="px-3 py-2 text-sm text-muted-foreground">{fmtDuration(enc.duration)}</td>
						<td class="px-3 py-2 text-sm text-muted-foreground">
							<div class="leading-snug">
								<div>{fmtDate(enc.startedAtMs)}</div>
								<div class="text-xs text-muted-foreground opacity-70">{fmtTime(enc.startedAtMs)}</div>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex items-center justify-between mt-4 gap-4">
		<div class="flex items-center gap-3 text-sm text-muted-foreground">
			<span>{t("dps.historyPage.rowsPerPage", "Rows per page:")}</span>
			<input
				type="number"
				bind:value={pageSize}
				min="5"
				max="100"
				class="w-16 px-2 py-1 bg-popover border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
				onchange={() => loadEncounters(0)}
			/>
			<span>{t("dps.historyPage.showing", "Showing")} {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalCount)} / {totalCount}</span>
		</div>

		<div class="flex items-center gap-1 ml-auto">
			<button onclick={() => loadEncounters(0)} disabled={page === 0} class="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label={t("dps.historyPage.firstPage", "First page")}>
				<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
				</svg>
			</button>
			<button onclick={() => loadEncounters(page - 1)} disabled={page === 0} class="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label={t("dps.historyPage.previousPage", "Previous page")}>
				<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</button>
			<button onclick={() => loadEncounters(page + 1)} disabled={(page + 1) * pageSize >= totalCount} class="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label={t("dps.historyPage.nextPage", "Next page")}>
				<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</button>
			<button onclick={() => loadEncounters(Math.floor((totalCount - 1) / pageSize))} disabled={(page + 1) * pageSize >= totalCount} class="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label={t("dps.historyPage.lastPage", "Last page")}>
				<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
				</svg>
			</button>
		</div>
	</div>
</div>

{#if someSelected}
	<div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
		<div class="flex items-center gap-4 px-5 py-3 rounded-xl border border-border bg-popover/95 backdrop-blur-sm shadow-xl">
			<div class="flex items-center gap-2 text-sm">
				<span class="text-primary font-semibold">{selectedIds.size}</span>
				<span class="text-muted-foreground">{t("dps.historyPage.recordsSelected", "record(s) selected")}</span>
			</div>

			<div class="w-px h-5 bg-border"></div>

			<div class="flex items-center gap-2">
				<button onclick={clearSelection} class="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
					{t("dps.historyPage.clear", "Clear")}
				</button>
				<button onclick={openDeleteModal} class="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
					</svg>
					{t("dps.historyPage.delete", "Delete")}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showDeleteModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
		<button class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={closeDeleteModal} aria-label={t("dps.historyPage.closeModal", "Close dialog")}></button>

		<div class="relative z-10 w-full max-w-md mx-4 p-6 rounded-xl border border-border bg-popover shadow-2xl animate-in fade-in zoom-in-95 duration-200">
			<div class="flex items-center gap-3 mb-4">
				<div class="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
					<svg class="w-5 h-5 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
				</div>
				<div>
					<h3 id="delete-modal-title" class="text-lg font-semibold text-foreground">{deleteTitle(selectedIds.size)}</h3>
					<p class="text-sm text-muted-foreground">{t("dps.historyPage.actionCannotUndo", "This action cannot be undone")}</p>
				</div>
			</div>

			<p class="text-sm text-muted-foreground mb-6">
				{selectedIds.size === 1
					? t("dps.historyPage.confirmDeleteOne", "Are you sure you want to permanently delete this encounter? All related data, including player stats, skill stats, and death events, will also be deleted.")
					: t("dps.historyPage.confirmDeleteMany", "Are you sure you want to permanently delete these encounters? All related data, including player stats, skill stats, and death events, will also be deleted.")}
			</p>

			<div class="flex justify-end gap-3">
				<button onclick={closeDeleteModal} disabled={isDeleting} class="px-4 py-2 text-sm rounded-md border border-border bg-popover text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
					{t("common.cancel", "Cancel")}
				</button>
				<button onclick={confirmDeleteSelected} disabled={isDeleting} class="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
					{#if isDeleting}
						<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						{t("dps.historyPage.deleting", "Deleting...")}
					{:else}
						{t("dps.historyPage.delete", "Delete")}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
