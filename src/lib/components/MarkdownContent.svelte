<script lang="ts">
  import { marked } from 'marked';
  import { tl } from '$lib/i18n/index.svelte';

  let {
    source,
    loadingText = tl('Loading content...'),
    emptyText = tl('No content.'),
    contentClass = '',
  }: {
    source: string;
    loadingText?: string;
    emptyText?: string;
    contentClass?: string;
  } = $props();

  let html = $state<string | null>(null);

  function escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  $effect(() => {
    let cancelled = false;

    void (async () => {
      const trimmed = source.trim();
      if (!trimmed) {
        html = '';
        return;
      }

      html = null;

      try {
        const parsed = await marked.parse(source);
        if (!cancelled) {
          html = parsed as string;
        }
      } catch (err) {
        console.error('Failed to parse markdown content:', err);
        if (!cancelled) {
          html = `<pre>${escapeHtml(source)}</pre>`;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  });
</script>

{#if html === null}
  <div class="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
    {loadingText}
  </div>
{:else if html}
  <div class={`markdown-body markdown-body--comfortable ${contentClass}`.trim()}>
    {@html html}
  </div>
{:else}
  <p class="text-sm leading-6 text-muted-foreground">{emptyText}</p>
{/if}
