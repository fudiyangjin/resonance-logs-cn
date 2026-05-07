<script lang="ts">
	/**
	 * @file This component displays a list of filter chips that can be removed.
	 */
	import { uiT } from '$lib/i18n';
	import { SETTINGS } from '$lib/settings-store';

	const t = uiT('shell', () => SETTINGS.live.general.state.language);

	interface Props {
		filters: string[];
		onRemove: (bossName: string) => void;
		onClearAll: () => void;
	}

	let { filters, onRemove, onClearAll }: Props = $props();

	function handleKeydown(event: KeyboardEvent, bossName: string) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onRemove(bossName);
		}
	}
</script>

{#if filters.length > 0}
	<div class="flex flex-wrap gap-2 items-center">
		<span class="text-sm text-neutral-400">{t('filters.label', 'Filters')}:</span>
		{#each filters as bossName}
			<div
				class="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-sm rounded"
				role="button"
				tabindex="0"
				onkeydown={(e) => handleKeydown(e, bossName)}
				aria-label={t('filters.removeNamed', 'Remove {name} filter').replace('{name}', bossName)}
			>
				<span>{bossName}</span>
				<button
					onclick={() => onRemove(bossName)}
					class="ml-1 text-white hover:text-red-300 focus:outline-none focus:text-red-300 transition-colors"
					aria-label={t('filters.removeNamed', 'Remove {name} filter').replace('{name}', bossName)}
				>
					<svg class="w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
		<button
			onclick={onClearAll}
			class="text-sm text-neutral-400 hover:text-neutral-200 transition-colors focus:outline-none focus:text-neutral-200"
			aria-label={t('filters.clearAll', 'Clear all filters')}
		>
			{t('filters.clearAllShort', 'Clear all')}
		</button>
	</div>
{/if}
