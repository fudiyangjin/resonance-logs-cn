<script lang="ts">
  /**
   * @file Tool sidebar component for the toolbox layout.
   * Displays the list of available tools in the left panel.
   */
  import { page } from "$app/state";
  import { tl } from "$lib/i18n/index.svelte";
  import { TOOL_ROUTES } from "./routes.svelte";
  import { getVersion } from "@tauri-apps/api/app";

  // Check if current path matches or starts with the tool path
  function isActiveRoute(toolPath: string): boolean {
    const pathname = page.url.pathname;
    return pathname === toolPath || pathname.startsWith(toolPath + "/");
  }
</script>

<aside class="flex flex-col w-56 shrink-0 bg-card/50 border-r border-border/50 h-full">
  <!-- Header with logo -->
  <div class="px-4 py-4 border-b border-border/50">
    <h1 class="text-lg font-bold text-foreground tracking-tight">{tl("Resonance Logs")}</h1>
    <p class="text-xs text-muted-foreground mt-0.5">{tl("Toolbox")}</p>
  </div>

  <!-- Tool list -->
  <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
    <p class="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">{tl("Tools")}</p>
    {#each Object.entries(TOOL_ROUTES) as [href, route] (route.labelKey)}
      <a
        {href}
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 {isActiveRoute(href)
          ? 'bg-muted text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-popover/50'}"
      >
        <route.icon class="w-5 h-5 shrink-0" />
        <span>{tl(route.labelKey)}</span>
      </a>
    {/each}
  </nav>

  <!-- Footer with version -->
  <div class="p-3 border-t border-border/50 space-y-3">
    <div class="text-center text-xs text-muted-foreground">
      v{#await getVersion()}...{:then version}{version}{/await}
    </div>
  </div>
</aside>
