<script lang="ts">
	/**
	 * @file This component provides an autocomplete input for boss names.
	 */
	import { onMount } from 'svelte';
	import { uiT } from '$lib/i18n';
	import { SETTINGS } from '$lib/settings-store';

	const t = uiT('shell', () => SETTINGS.live.general.state.language);

	let {
		value = $bindable(''),
		placeholder,
		disabled = false,
		availableBossNames = [],
		onSelect = () => {},
		id
	}: {
		value: string;
		placeholder?: string;
		disabled?: boolean;
		availableBossNames: string[];
		onSelect: (bossName: string) => void;
		id?: string;
	} = $props();

	let showDropdown = $state(false);
	let filteredBossNames = $state<string[]>([]);
	let localizedPlaceholder = $derived(placeholder ?? t('search.filterBossName', 'Filter by boss name...'));

	function handleInput() {
		if (value.trim() === '') {
			filteredBossNames = [];
			showDropdown = false;
		} else {
			filteredBossNames = availableBossNames.filter((name: string) =>
				name.toLowerCase().includes(value.toLowerCase())
			);
			showDropdown = filteredBossNames.length > 0;
		}
	}

	function selectBoss(bossName: string) {
		// Clear the input after selecting a boss (original behaviour)
		value = '';
		showDropdown = false;
		onSelect(bossName);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			showDropdown = false;
		}
	}

	function handleFocus() {
		if (value.trim() !== '') {
			handleInput();
		}
	}

	function handleBlur() {
		// Delay hiding dropdown to allow click on dropdown items
		setTimeout(() => {
			showDropdown = false;
		}, 200);
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.boss-autocomplete-container')) {
			showDropdown = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<div class="boss-autocomplete-container relative">
	<input
		type="text"
		bind:value={value}
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		onkeydown={handleKeydown}
		placeholder={localizedPlaceholder}
		{disabled}
		{id}
		class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-300 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
	/>

	{#if showDropdown && filteredBossNames.length > 0}
		<div class="absolute z-10 w-full mt-1 bg-neutral-800 border border-neutral-700 rounded shadow-lg max-h-48 overflow-y-auto">
			{#each filteredBossNames as bossName}
				<button
					onclick={() => selectBoss(bossName)}
					class="w-full px-3 py-2 text-left text-neutral-300 hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none transition-colors"
				>
					{bossName}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.boss-autocomplete-container {
		/* ensure the container establishes a positioning context */
		position: relative;
	}
</style>
