<script lang="ts">
	/**
	 * @file This component provides a unified search input for bosses, players, player UIDs and encounters.
	 */
	import { onMount } from 'svelte';
	import { commands } from '$lib/bindings';
	import type { NameOption } from '$lib/config/game-names';
	import { t } from '$lib/i18n/index.svelte';
	import { parsePlayerUid, uidCandidateDetail } from '$lib/live-history-query';

	type SearchType = 'boss' | 'player' | 'encounter' | 'uid';
	type SearchOption =
		| NameOption
		| { label: string; ids: [] }
		| { label: string; ids: []; uid: number; detail: string };

	const PAGE_SIZE = 50;
	const LOOKUP_DELAY_MS = 250;

	let {
		value = $bindable(''),
		searchType = $bindable<SearchType>('encounter'),
		placeholder,
		disabled = false,
		availableBossOptions = [],
		availableEncounterOptions = [],
		onSelect,
		id
		} = $props<{
			value: string;
			searchType: SearchType;
			placeholder?: string;
			disabled?: boolean;
			availableBossOptions: NameOption[];
			availableEncounterOptions: NameOption[];
			onSelect: (option: SearchOption, type: SearchType) => void;
			id?: string;
		}>();

	let showDropdown = $state(false);
	let filteredOptions = $state<SearchOption[]>([]);
	let isLoading = $state(false);
	let showTypeDropdown = $state(false);
	let visibleCount = $state(PAGE_SIZE);
	let lookupTimer: ReturnType<typeof setTimeout> | undefined;
	let lookupGeneration = 0;

	const visibleOptions = $derived(filteredOptions.slice(0, visibleCount));
	const remainingCount = $derived(filteredOptions.length - visibleCount);

	const searchTypeDisplay = $derived(
		searchType === 'boss'
			? t('components.unifiedSearch.type.boss')
			: searchType === 'player'
				? t('components.unifiedSearch.type.player')
				: searchType === 'uid'
					? t('components.unifiedSearch.type.uid')
					: t('components.unifiedSearch.type.encounter')
	);

	const computedPlaceholder = $derived(
		placeholder ||
			(searchType === 'boss'
				? t('components.unifiedSearch.placeholder.boss')
				: searchType === 'encounter'
					? t('components.unifiedSearch.placeholder.encounter')
					: searchType === 'uid'
						? t('components.unifiedSearch.placeholder.uid')
						: t('components.unifiedSearch.placeholder.player'))
	);

	// Drops a pending or in-flight lookup so its result cannot land later
	function cancelLookup() {
		clearTimeout(lookupTimer);
		lookupGeneration++;
		isLoading = false;
	}

	function handleInput() {
		const trimmedValue = value.trim();
		cancelLookup();
		visibleCount = PAGE_SIZE;

		if (trimmedValue === '') {
			filteredOptions = [];
			showDropdown = false;
		} else if (searchType === 'boss' || searchType === 'encounter') {
			// Boss / scene filtering - every local match, paged in the dropdown
			const source = searchType === 'boss' ? availableBossOptions : availableEncounterOptions;
			filteredOptions = source.filter((option: NameOption) =>
				option.label.toLowerCase().includes(trimmedValue.toLowerCase())
			);
			showDropdown = filteredOptions.length > 0;
		} else if (searchType === 'uid' && parsePlayerUid(trimmedValue) === null) {
			filteredOptions = [];
			showDropdown = false;
		} else {
			// Player names and UIDs come from the backend; wait for typing to pause
			const lookupType = searchType;
			const generation = lookupGeneration;
			isLoading = true;
			lookupTimer = setTimeout(() => void lookupPlayers(trimmedValue, lookupType, generation), LOOKUP_DELAY_MS);
		}
	}

	async function lookupPlayers(query: string, lookupType: SearchType, generation: number) {
		try {
			const res = await commands.searchHistoryPlayers(query);
			if (generation !== lookupGeneration) return;
			if (res.status === 'ok') {
				filteredOptions =
					lookupType === 'uid'
						? res.data.uids.map((candidate) => ({
								label: `#${candidate.uid}`,
								ids: [],
								uid: candidate.uid,
								detail: uidCandidateDetail(
									candidate.names,
									t('common.encounterCount', { count: candidate.encounterCount })
								)
							}))
						: res.data.names.map((name) => ({ label: name, ids: [] }));
				showDropdown = filteredOptions.length > 0;
			} else {
				console.error('Failed to search players:', res.error);
				filteredOptions = [];
				showDropdown = false;
			}
		} catch (error) {
			if (generation !== lookupGeneration) return;
			console.error('Error searching players:', error);
			filteredOptions = [];
			showDropdown = false;
		} finally {
			if (generation === lookupGeneration) isLoading = false;
		}
	}

	function selectOption(option: SearchOption) {
		cancelLookup();
		value = '';
		showDropdown = false;
		filteredOptions = [];
		onSelect(option, searchType);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			showDropdown = false;
		} else if (event.key === 'Enter' && searchType === 'uid') {
			const option = filteredOptions[0];
			if (option) {
				event.preventDefault();
				selectOption(option);
			}
		}
	}

	function handleFocus() {
		if (value.trim().length >= 1) {
			handleInput();
		}
	}

	function handleBlur() {
		// Delay hiding dropdown to allow click on dropdown items
		setTimeout(() => {
			showDropdown = false;
		}, 200);
	}

	function toggleTypeDropdown() {
		showTypeDropdown = !showTypeDropdown;
	}

	function selectSearchType(type: SearchType) {
		cancelLookup();
		searchType = type;
		showTypeDropdown = false;
		filteredOptions = [];
		showDropdown = false;
		if (value.trim().length >= 1) {
			handleInput();
		}
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.unified-search-container')) {
			showDropdown = false;
		}
		if (!target.closest('.type-dropdown-container')) {
			showTypeDropdown = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
			cancelLookup();
		};
	});
</script>

<div class="unified-search-container relative flex items-stretch gap-0">
	<!-- Type Selector Dropdown -->
	<div class="type-dropdown-container relative">
		<button
			type="button"
			onclick={toggleTypeDropdown}
			class="h-full px-3 py-1.5 bg-popover border border-border border-r-0 rounded-l text-muted-foreground hover:bg-muted/40 hover:text-foreground focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed min-w-[90px] flex items-center justify-between gap-2 text-sm transition-colors"
			{disabled}
		>
			<span class="capitalize">{searchTypeDisplay}</span>
			<svg
				class="w-3.5 h-3.5 transition-transform {showTypeDropdown ? 'rotate-180' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if showTypeDropdown}
			<div
				class="absolute left-0 top-full mt-1 z-20 bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-lg overflow-hidden min-w-[120px] animate-in fade-in-0 zoom-in-95"
			>
				<button
					type="button"
					onclick={() => selectSearchType('boss')}
					class="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 focus:bg-muted/50 focus:outline-none transition-colors {searchType === 'boss' ? 'bg-muted/60 text-foreground' : ''}"
				>
					{t('components.unifiedSearch.type.boss')}
				</button>
				<button
					type="button"
					onclick={() => selectSearchType('player')}
					class="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 focus:bg-muted/50 focus:outline-none transition-colors {searchType === 'player' ? 'bg-muted/60 text-foreground' : ''}"
				>
					{t('components.unifiedSearch.type.player')}
				</button>
				<button
					type="button"
					onclick={() => selectSearchType('encounter')}
					class="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 focus:bg-muted/50 focus:outline-none transition-colors {searchType === 'encounter' ? 'bg-muted/60 text-foreground' : ''}"
				>
					{t('components.unifiedSearch.type.encounter')}
				</button>
				<button
					type="button"
					onclick={() => selectSearchType('uid')}
					class="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 focus:bg-muted/50 focus:outline-none transition-colors {searchType === 'uid' ? 'bg-muted/60 text-foreground' : ''}"
				>
					{t('components.unifiedSearch.type.uid')}
				</button>
			</div>
		{/if}
	</div>

	<!-- Search Input -->
	<div class="flex-1 relative">
		<input
			type="text"
			bind:value={value}
			oninput={handleInput}
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeydown}
			placeholder={computedPlaceholder}
			{disabled}
			{id}
			autocomplete="off"
			class="w-full px-3 py-1.5 text-sm bg-popover border border-border rounded-r text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
		/>

		{#if isLoading}
			<div
				class="absolute z-10 w-full mt-1 bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-lg px-3 py-2 animate-in fade-in-0 zoom-in-95"
			>
				<div class="text-muted-foreground text-sm">{t('components.unifiedSearch.loading')}</div>
			</div>
		{:else if showDropdown && filteredOptions.length > 0}
			<div
				class="absolute z-10 w-full mt-1 bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-lg max-h-48 overflow-y-auto animate-in fade-in-0 zoom-in-95"
			>
				{#each visibleOptions as option}
					<button
						type="button"
						onclick={() => selectOption(option)}
						class="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 focus:bg-muted/50 focus:outline-none transition-colors"
					>
						<span class="shrink-0">{option.label}</span>
						{#if 'detail' in option}
							<span class="truncate text-xs opacity-70">{option.detail}</span>
						{/if}
					</button>
				{/each}
				{#if remainingCount > 0}
					<!-- mousedown keeps focus in the input so blur does not close the dropdown -->
					<button
						type="button"
						onmousedown={(event) => event.preventDefault()}
						onclick={() => (visibleCount += PAGE_SIZE)}
						class="w-full border-t border-border/60 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground focus:outline-none transition-colors"
					>
						{t('common.showMore', { remaining: remainingCount })}
					</button>
				{/if}
			</div>
		{:else if searchType === 'player' && value.trim().length >= 1 && !isLoading && filteredOptions.length === 0}
			<div
				class="absolute z-10 w-full mt-1 bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-lg px-3 py-2 animate-in fade-in-0 zoom-in-95"
			>
				<div class="text-muted-foreground text-sm">{t('components.unifiedSearch.noPlayers')}</div>
			</div>
		{:else if searchType === 'uid' && value.trim().length >= 1 && !isLoading && filteredOptions.length === 0}
			<div
				class="absolute z-10 w-full mt-1 bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-lg px-3 py-2 animate-in fade-in-0 zoom-in-95"
			>
				<div class="text-muted-foreground text-sm">
					{parsePlayerUid(value) === null
						? t('components.unifiedSearch.invalidUid')
						: t('components.unifiedSearch.noUid')}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.unified-search-container {
		/* ensure the container establishes a positioning context */
		position: relative;
	}
</style>
