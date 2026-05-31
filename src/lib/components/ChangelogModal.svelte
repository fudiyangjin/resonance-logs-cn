<script lang="ts">
  import { getLocale, t, type AppLocale } from "$lib/i18n/index.svelte";
  import enUSChangelog from "$lib/changelog/en-US.md?raw";
  import jaJPChangelog from "$lib/changelog/ja-JP.md?raw";
  import zhCNChangelog from "$lib/changelog/zh-CN.md?raw";
  import MarkdownContent from "./MarkdownContent.svelte";

  let { onclose }: { onclose?: () => void } = $props();

  const changelogByLocale = {
    "zh-CN": zhCNChangelog,
    "en-US": enUSChangelog,
    "ja-JP": jaJPChangelog,
  } satisfies Record<AppLocale, string>;
  const changelogRaw = $derived(
    changelogByLocale[getLocale()] ?? zhCNChangelog,
  );

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
    aria-label={t("components.changelogModal.closeAria")}
  >
  </button>

  <div
    class="border-border bg-card relative z-10 flex h-[85vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-xl border shadow-2xl"
  >
    <div
      class="border-border flex items-start justify-between border-b px-6 py-4"
    >
      <div>
        <h2 class="text-xl font-semibold">
          {t("components.changelogModal.title")}
        </h2>
        <p class="text-muted-foreground mt-1 text-sm">
          {t("components.changelogModal.subtitle")}
        </p>
      </div>
      <button
        class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-2 transition-colors"
        type="button"
        onclick={close}
        aria-label={t("components.changelogModal.closeAria")}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="flex-1 overflow-auto px-6 py-6">
      <MarkdownContent
        source={changelogRaw}
        loadingText={t("components.changelogModal.loading")}
      />
    </div>
  </div>
</div>
