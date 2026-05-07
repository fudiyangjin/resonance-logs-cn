<script lang="ts">
  import { openUrl } from '@tauri-apps/plugin-opener';
  import MarkdownContent from './MarkdownContent.svelte';
  import { uiT } from '$lib/i18n';
  import { SETTINGS } from '$lib/settings-store';

  const t = uiT('shell', () => SETTINGS.live.general.state.language);

  export interface UpdateInfo {
    version: string;
    body: string;
    downloadUrl: string;
  }

  let {
    info,
    currentVersion,
    onclose,
  }: {
    info: UpdateInfo;
    currentVersion: string;
    onclose?: () => void;
  } = $props();

  function close() {
    onclose?.();
  }

  async function openDownloadPage() {
    try {
      await openUrl(info.downloadUrl);
    } catch (err) {
      console.error('Failed to open update URL:', info.downloadUrl, err);
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center">
  <button
    class="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
    onclick={close}
    type="button"
    aria-label={t('modal.close', 'Close modal')}
  >
  </button>

  <div class="relative z-10 flex h-[85vh] w-[90vw] max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
    <div class="flex items-center justify-between border-b border-border px-6 py-4">
      <div>
        <h2 class="text-xl font-semibold">{t('update.title', 'New Version Available')}</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {t('update.versionLine', 'Current version v{currentVersion}, latest version v{latestVersion}')
            .replace('{currentVersion}', currentVersion)
            .replace('{latestVersion}', info.version)}
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
      <MarkdownContent source={info.body} emptyText={t('update.emptyNotes', 'No release notes are available for this version.')} />
    </div>

    <div class="space-y-3 border-t border-border px-6 py-4">
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
          onclick={close}
        >
          {t('common.close', 'Close')}
        </button>
        <button
          type="button"
          class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          onclick={openDownloadPage}
        >
          {t('update.downloadGithub', 'Download from GitHub')}
        </button>
      </div>
    </div>
  </div>
</div>
