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
  import LiveProfileSwitcher from "./profile-switcher.svelte";

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
        class="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg"
      >
        <ActivityIcon class="h-5 w-5" />
      </div>
      <div>
        <h1 class="text-foreground text-xl font-bold">{t("dps.title")}</h1>
        <p class="text-muted-foreground text-sm">{t("dps.description")}</p>
      </div>
    </div>

    <!-- Launch Live Window Button -->
    <button
      type="button"
      aria-pressed={liveVisible}
      class="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-colors {liveVisible
        ? 'border-border/60 bg-muted/30 text-foreground hover:bg-muted/50 border'
        : 'bg-primary text-primary-foreground hover:bg-primary/90'}"
      onclick={() => toggleOverlayWindow("live")}
    >
      {#if liveVisible}
        <PauseIcon class="h-4 w-4" />
      {:else}
        <PlayIcon class="h-4 w-4" />
      {/if}
      <span>{t("dps.live.toggle")}</span>
      <ExternalLinkIcon class="h-3.5 w-3.5 opacity-70" />
    </button>
  </div>

  <!-- Tabs Navigation -->
  <div class="border-border/60 border-b">
    <nav class="-mb-px flex gap-1">
      {#each Object.entries(DPS_SUB_ROUTES) as [href, route] (href)}
        <a
          {href}
          class="flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors {isActiveTab(
            href,
          )
            ? 'border-primary text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:border-border border-transparent'}"
        >
          <route.icon class="h-4 w-4" />
          <span>{t(route.labelKey)}</span>
        </a>
      {/each}
    </nav>
  </div>

  <!-- Live profile switcher: settings/themes tabs edit the active live profile (mirror). -->
  {#if isActiveTab("/main/dps/settings") || isActiveTab("/main/dps/themes")}
    <LiveProfileSwitcher />
  {/if}

  <!-- Tab Content -->
  <div class="min-h-0">
    {#if isBasePath}
      <!-- Default content when on base path - prompt to select a tab -->
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground mb-4">{t("dps.default.prompt")}</p>
        <a
          href={getDefaultTabPath()}
          class="bg-muted hover:bg-muted/80 text-foreground rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {t("dps.default.history")}
        </a>
      </div>
    {:else}
      {@render children()}
    {/if}
  </div>
</div>
