<script lang="ts">
  import { marked } from 'marked';
  import { openUrl } from '@tauri-apps/plugin-opener';

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

  let html = $state('');

  $effect(() => {
    void (async () => {
      try {
        html = info.body ? (await marked.parse(info.body) as string) : '';
      } catch (err) {
        console.error('Failed to parse update notes:', err);
        html = info.body ? `<pre>${info.body}</pre>` : '';
      }
    })();
  });

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
    aria-label="Close modal"
  >
  </button>

  <div class="relative z-10 flex h-[85vh] w-[90vw] max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
    <div class="flex items-center justify-between border-b border-border px-6 py-4">
      <div>
        <h2 class="text-xl font-semibold">发现新版本</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          当前版本 v{currentVersion}，最新版本 v{info.version}
        </p>
      </div>
      <button
        class="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        type="button"
        onclick={close}
        aria-label="Close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-auto p-6">
      {#if html}
        <div class="prose max-w-none space-y-2 dark:prose-invert">
          {@html html}
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">该版本暂无更新说明。</p>
      {/if}
    </div>

    <div class="space-y-3 border-t border-border px-6 py-4">
      <p class="text-sm text-muted-foreground">
        若 GitHub 下载较慢，也可前往 QQ 群（1084866292）获取最新版本安装包。
      </p>
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
          onclick={close}
        >
          关闭
        </button>
        <button
          type="button"
          class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          onclick={openDownloadPage}
        >
          前往 GitHub 下载
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  :global(.prose p) { margin: 0 0 0.75rem 0; }
  :global(.prose ul) { margin: 0 0 0.75rem 0; padding-left: 1.25rem; }
  :global(.prose h1) { margin-bottom: 0.5rem; font-size: 1.25rem; }
  :global(.prose h2) { margin-bottom: 0.4rem; font-size: 1.125rem; }
  :global(.prose h3) { margin-bottom: 0.3rem; font-size: 1rem; }
</style>
