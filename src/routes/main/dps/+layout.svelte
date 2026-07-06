<script lang="ts">
  /**
   * @file Layout for the DPS detection tool.
   * Contains the launch button for Live window and tabs for sub-sections.
   */
  import { page } from "$app/state";
  import { t } from "$lib/i18n/index.svelte";
  import { DPS_SUB_ROUTES } from "../routes.svelte";
  import ActivityIcon from "virtual:icons/lucide/activity";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PlayIcon from "virtual:icons/lucide/play";
  import PauseIcon from "virtual:icons/lucide/pause";
  import {
    isOverlayWindowVisible,
    toggleOverlayWindow,
  } from "$lib/overlay-window-visibility.svelte";

  let { children } = $props();

  const liveVisible = $derived(isOverlayWindowVisible("live"));

  // Check if current path matches the tab
  function isActiveTab(tabPath: string): boolean {
    const pathname = page.url.pathname;
    return pathname === tabPath || pathname.startsWith(tabPath + "/");
  }

  // Get the default tab path for redirect
  function getDefaultTabPath(): string {
    return Object.keys(DPS_SUB_ROUTES)[0] || "/main/dps/history";
  }

  // Check if we're on the base DPS path (need to show default content or redirect)
  let isBasePath = $derived(
    page.url.pathname === "/main/dps" || page.url.pathname === "/main/dps/",
  );

</script>

<div class="space-y-6">
  <!-- Tool Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div
        class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary"
      >
        <ActivityIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">{t("dps.title")}</h1>
        <p class="text-sm text-muted-foreground">{t("dps.description")}</p>
      </div>
    </div>

    <!-- Launch Live Window Button -->
    <button
      type="button"
      aria-pressed={liveVisible}
      class="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm shadow-sm transition-colors {liveVisible
        ? 'border border-border/60 bg-muted/30 text-foreground hover:bg-muted/50'
        : 'bg-primary text-primary-foreground hover:bg-primary/90'}"
      onclick={() => toggleOverlayWindow("live")}
    >
      {#if liveVisible}
        <PauseIcon class="w-4 h-4" />
      {:else}
        <PlayIcon class="w-4 h-4" />
      {/if}
      <span>{t("dps.live.toggle")}</span>
      <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
    </button>
  </div>

  <!-- Tabs Navigation -->
  <div class="border-b border-border/60">
    <nav class="flex gap-1 -mb-px">
      {#each Object.entries(DPS_SUB_ROUTES) as [href, route] (href)}
        <a
          {href}
          class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors {isActiveTab(
            href,
          )
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}"
        >
          <route.icon class="w-4 h-4" />
          <span>{t(route.labelKey)}</span>
        </a>
      {/each}
    </nav>
  </div>

  <!-- Tab Content -->
  <div class="min-h-0">
    {#if isBasePath}
      <!-- Default content when on base path - prompt to select a tab -->
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground mb-4">{t("dps.default.prompt")}</p>
        <a
          href={getDefaultTabPath()}
          class="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors"
        >
          {t("dps.default.history")}
        </a>
      </div>
    {:else}
      {@render children()}
    {/if}
  </div>
</div>
