<script lang="ts">
  import changelogRaw from '../../../CHANGELOG.md?raw';
  import MarkdownContent from './MarkdownContent.svelte';
  import { uiT } from '$lib/i18n';
  import { SETTINGS } from '$lib/settings-store';

  const t = uiT('shell', () => SETTINGS.live.general.state.language);

  let { onclose }: { onclose?: () => void } = $props();

  function close() {
    onclose?.();
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center">
  <!-- Backdrop -->
  <button
    class="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
    onclick={close}
    type="button"
    aria-label={t('modal.close', 'Close modal')}
  >
  </button>

  <div class="relative z-10 flex h-[85vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
    <div class="flex items-start justify-between border-b border-border px-6 py-4">
      <div>
        <h2 class="text-xl font-semibold">{t('changelog.title', 'Changelog')}</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {t('changelog.subtitle', 'Review the additions, fixes, and compatibility notes for this version.')}
        </p>
      </div>
      <button
        class="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        type="button"
        onclick={close}
        aria-label={t('common.close', 'Close')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="flex-1 overflow-auto px-6 py-6">
      <MarkdownContent source={changelogRaw} loadingText={t('changelog.loading', 'Loading changelog...')} />
    </div>
  </div>
</div>
