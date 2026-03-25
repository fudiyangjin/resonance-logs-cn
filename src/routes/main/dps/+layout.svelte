<script lang="ts">
  /**
   * @file Layout for the DPS detection tool.
   * Contains the launch button for Live window and tabs for sub-sections.
   */
  import { page } from "$app/state";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { tl } from "$lib/i18n/index.svelte";
  import { DPS_SUB_ROUTES } from "../routes.svelte";
  import ActivityIcon from "virtual:icons/lucide/activity";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PlayIcon from "virtual:icons/lucide/play";

  let { children } = $props();

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
  let isBasePath = $derived(page.url.pathname === "/main/dps" || page.url.pathname === "/main/dps/");

  async function toggleLiveWindow() {
    try {
      const liveWindow = await WebviewWindow.getByLabel("live");
      if (liveWindow !== null) {
        const isVisible = await liveWindow.isVisible();
        
        if (isVisible) {
          await liveWindow.hide();
        } else {
          await liveWindow.setIgnoreCursorEvents(true);
          await liveWindow.show();
          await liveWindow.unminimize();
        }
      } else {
        console.warn("Live window not found");
      }
    } catch (err) {
      console.error("Failed to toggle live window:", err);
    }
  }
</script>

<div class="space-y-6">
  <!-- Tool Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
        <ActivityIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">{tl("DPS Meter")}</h1>
        <p class="text-sm text-muted-foreground">{tl("Monitor combat data and DPS statistics in real time")}</p>
      </div>
    </div>
    
    <!-- Launch Live Window Button -->
    <button
      type="button"
      class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
      onclick={toggleLiveWindow}
    >
      <PlayIcon class="w-4 h-4" />
      <span>{tl("Toggle DPS Window")}</span>
      <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
    </button>
  </div>

  <!-- Tabs Navigation -->
  <div class="border-b border-border/60">
    <nav class="flex gap-1 -mb-px">
      {#each Object.entries(DPS_SUB_ROUTES) as [href, route] (route.labelKey)}
        <a
          {href}
          class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors {isActiveTab(href)
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}"
        >
          <route.icon class="w-4 h-4" />
          <span>{tl(route.labelKey)}</span>
        </a>
      {/each}
    </nav>
  </div>

  <!-- Tab Content -->
  <div class="min-h-0">
    {#if isBasePath}
      <!-- Default content when on base path - prompt to select a tab -->
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground mb-4">{tl("Select a tab above to view detailed settings")}</p>
        <a
          href={getDefaultTabPath()}
          class="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors"
        >
          {tl("View encounter history")}
        </a>
      </div>
    {:else}
      {@render children()}
    {/if}
  </div>
</div>
