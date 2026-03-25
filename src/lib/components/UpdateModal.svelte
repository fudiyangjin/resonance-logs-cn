<script lang="ts">
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { tl, tm } from '$lib/i18n/index.svelte';
  import MarkdownContent from './MarkdownContent.svelte';

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
    aria-label={tl("Close Dialog")}
  >
  </button>

  <div class="relative z-10 flex h-[85vh] w-[90vw] max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
    <div class="flex items-center justify-between border-b border-border px-6 py-4">
      <div>
        <h2 class="text-xl font-semibold">{tl("New Version Available")}</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {tm("Current version v{{currentVersion}}, latest version v{{version}}", {
            currentVersion,
            version: info.version,
          })}
        </p>
      </div>
      <button
        class="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        type="button"
        onclick={close}
        aria-label={tl("Close")}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-auto px-6 py-6">
      <MarkdownContent source={info.body} emptyText={tl("No changelog for this release yet.")} />
    </div>

    <div class="space-y-3 border-t border-border px-6 py-4">
      <p class="text-sm text-muted-foreground">
        {tl("If GitHub is slow, you can also get the latest installer from the QQ group (1084866292).")}
      </p>
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
          onclick={close}
        >
          {tl("Close")}
        </button>
        <button
          type="button"
          class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          onclick={openDownloadPage}
        >
          {tl("Download on GitHub")}
        </button>
      </div>
    </div>
  </div>
</div>
