<script lang="ts">
	/**
	 * @file This component provides a unified search input for bosses, players, and encounters.
	 */
	import { onMount } from 'svelte';
	import { commands } from '$lib/bindings';
	import { tl } from '$lib/i18n/index.svelte';

	let {
		value = $bindable(''),
		searchType = $bindable<'boss' | 'player' | 'encounter'>('encounter'),
		placeholder,
		disabled = false,
		availableBossNames = [],
		availableEncounterNames = [],
		onSelect,
		id
		} = $props<{
			value: string;
			searchType: 'boss' | 'player' | 'encounter';
			placeholder?: string;
			disabled?: boolean;
			availableBossNames: string[];
			availableEncounterNames: string[];
			onSelect: (name: string, type: 'boss' | 'player' | 'encounter') => void;
			id?: string;
		}>();

	let showDropdown = $state(false);
	let filteredNames = $state<string[]>([]);
	let isLoading = $state(false);
	let showTypeDropdown = $state(false);

	const searchTypeDisplay = $derived(
		searchType === 'boss' ? tl('Boss') : searchType === 'player' ? tl('Player') : tl('Scene')
	);

	const computedPlaceholder = $derived(
		placeholder ||
			(searchType === 'boss'
				? tl('Search bosses...')
				: searchType === 'encounter'
				? tl('Search scenes...')
				: tl('Search players...'))
	);

	async function handleInput() {
		const trimmedValue = value.trim();

		if (searchType === 'boss' || searchType === 'encounter') {
			// Boss filtering - filter locally from available names
			if (trimmedValue === '') {
				filteredNames = [];
				showDropdown = false;
			} else {
				const source = searchType === 'boss' ? availableBossNames : availableEncounterNames;
				// Limit local filter results to at most 5 items for responsiveness
				const matches = source.filter((name: string) =>
					name.toLowerCase().includes(trimmedValue.toLowerCase())
				);
				filteredNames = matches.slice(0, 5);
				// show dropdown if any matches exist (even if we only display the first 5)
				showDropdown = matches.length > 0;
			}
		} else {
			// Player filtering - query backend with 1-char minimum
			if (trimmedValue.length < 1) {
				filteredNames = [];
				showDropdown = false;
				isLoading = false;
				return;
			}

			isLoading = true;
			try {
				const res = await commands.getPlayerNamesFiltered(trimmedValue);
				if (res.status === 'ok') {
					// Limit backend results shown to the user to improve UX and avoid huge lists
					const names = res.data.names ?? [];
					filteredNames = names.slice(0, 5);
					// show dropdown if any results exist
					showDropdown = names.length > 0;
				} else {
					console.error('Failed to load player names:', res.error);
					filteredNames = [];
					showDropdown = false;
				}
			} catch (error) {
				console.error('Error loading player names:', error);
				filteredNames = [];
				showDropdown = false;
			} finally {
				isLoading = false;
			}
		}
	}

	function selectName(name: string) {
		value = '';
		showDropdown = false;
		filteredNames = [];
		onSelect(name, searchType);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			showDropdown = false;
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

	function selectSearchType(type: 'boss' | 'player' | 'encounter') {
		searchType = type;
		showTypeDropdown = false;
		filteredNames = [];
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
					{tl('Boss')}
				</button>
				<button
					type="button"
					onclick={() => selectSearchType('player')}
					class="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 focus:bg-muted/50 focus:outline-none transition-colors {searchType === 'player' ? 'bg-muted/60 text-foreground' : ''}"
				>
					{tl('Player')}
				</button>
				<button
					type="button"
					onclick={() => selectSearchType('encounter')}
					class="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 focus:bg-muted/50 focus:outline-none transition-colors {searchType === 'encounter' ? 'bg-muted/60 text-foreground' : ''}"
				>
					{tl('Scene')}
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
				<div class="text-muted-foreground text-sm">{tl('Loading...')}</div>
			</div>
		{:else if showDropdown && filteredNames.length > 0}
			<div
				class="absolute z-10 w-full mt-1 bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-lg max-h-48 overflow-y-auto animate-in fade-in-0 zoom-in-95"
			>
				{#each filteredNames as name}
					<button
						type="button"
						onclick={() => selectName(name)}
						class="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 focus:bg-muted/50 focus:outline-none transition-colors"
					>
						{name}
					</button>
				{/each}
			</div>
		{:else if searchType === 'player' && value.trim().length >= 1 && !isLoading && filteredNames.length === 0}
			<div
				class="absolute z-10 w-full mt-1 bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-lg px-3 py-2 animate-in fade-in-0 zoom-in-95"
			>
				<div class="text-muted-foreground text-sm">{tl('No matching players')}</div>
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
