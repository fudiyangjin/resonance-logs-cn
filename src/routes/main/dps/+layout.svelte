<script lang="ts">
  /**
   * @file Layout for the DPS detection tool.
   * Contains the launch button for Live window and tabs for sub-sections.
   */
  import { page } from "$app/state";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { DPS_SUB_ROUTES } from "../routes.svelte";
  import ActivityIcon from "virtual:icons/lucide/activity";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PlayIcon from "virtual:icons/lucide/play";

  let { children } = $props();

  function isActiveTab(tabPath: string): boolean {
    const pathname = page.url.pathname;
    return pathname === tabPath || pathname.startsWith(tabPath + "/");
  }

  function getDefaultTabPath(): string {
    return Object.keys(DPS_SUB_ROUTES)[0] || "/main/dps/history";
  }

  let isBasePath = $derived(page.url.pathname === "/main/dps" || page.url.pathname === "/main/dps/");

  async function toggleLiveWindow() {
    try {
      const liveWindow = await WebviewWindow.getByLabel("live");
      if (liveWindow !== null) {
        const isVisible = await liveWindow.isVisible();
        if (isVisible) {
          await liveWindow.hide();
        } else {
          await liveWindow.show();
          await liveWindow.unminimize();
          await liveWindow.setFocus();
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
        <h1 class="text-xl font-bold text-foreground">DPS Meter</h1>
        <p class="text-sm text-muted-foreground">Real-time combat data and DPS statistics</p>
      </div>
    </div>

    <!-- Launch Live Window Button -->
    <button
      type="button"
      class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
      onclick={toggleLiveWindow}
    >
      <PlayIcon class="w-4 h-4" />
      <span>Toggle DPS Window</span>
      <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
    </button>
  </div>

  <!-- Tabs Navigation -->
  <div class="border-b border-border/60">
    <nav class="flex gap-1 -mb-px">
      {#each Object.entries(DPS_SUB_ROUTES) as [href, route] (route.label)}
        <a
          {href}
          class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors {isActiveTab(href)
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}"
        >
          <route.icon class="w-4 h-4" />
          <span>{route.label}</span>
        </a>
      {/each}
    </nav>
  </div>

  <!-- Tab Content -->
  <div class="min-h-0">
    {#if isBasePath}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground mb-4">Select a tab above to view settings</p>
        <a
          href={getDefaultTabPath()}
          class="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors"
        >
          View History
        </a>
      </div>
    {:else}
      {@render children()}
    {/if}
  </div>
</div>
