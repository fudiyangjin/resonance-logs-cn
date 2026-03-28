<script lang="ts">
  /**
   * @file Tool sidebar component for the toolbox layout.
   * Displays the list of available tools in the left panel.
   */
  import { page } from "$app/state";
  import { TOOL_ROUTES } from "./routes.svelte";
  import { getVersion } from "@tauri-apps/api/app";
  import { resolveNavigationTranslation } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";

  let languageMenuOpen = $state(false);

  const languageOptions = [
    { value: "zh-CN", label: "CN" },
    { value: "en", label: "EN" },
    { value: "ja", label: "JP" },
  ] as const;

  function isActiveRoute(toolPath: string): boolean {
    const pathname = page.url.pathname;
    return pathname === toolPath || pathname.startsWith(toolPath + "/");
  }

  function getToolRouteLabel(href: string, fallback: string): string {
    const keyMap: Record<string, string> = {
      "/main/dps": "tool.dps",
      "/main/module-calc": "tool.moduleOptimizer",
      "/main/skill-monitor": "tool.skillMonitor",
      "/main/monster-monitor": "tool.monsterTracker",
    };

    const key = keyMap[href];
    if (!key) return fallback;

    return resolveNavigationTranslation(
      key,
      SETTINGS.live.general.state.language,
      fallback,
    );
  }

  function setLanguage(locale: "zh-CN" | "en" | "ja") {
    SETTINGS.live.general.state.language = locale;
    languageMenuOpen = false;
  }

  function getLanguageLabel(locale: string): string {
    return languageOptions.find((option) => option.value === locale)?.label ?? "CN";
  }
</script>

<style>
  summary::-webkit-details-marker {
    display: none;
  }
</style>

<aside class="flex flex-col w-56 shrink-0 bg-card/50 border-r border-border/50 h-full">
  <div class="px-4 py-4 border-b border-border/50">
    <h1 class="text-lg font-bold text-foreground tracking-tight">Resonance Logs</h1>
    <p class="text-xs text-muted-foreground mt-0.5">
      {resolveNavigationTranslation(
        "sidebar.toolbox",
        SETTINGS.live.general.state.language,
        "工具箱",
      )}
    </p>
  </div>

  <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
    <p class="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {resolveNavigationTranslation(
        "sidebar.tools",
        SETTINGS.live.general.state.language,
        "工具",
      )}
    </p>

    {#each Object.entries(TOOL_ROUTES) as [href, route] (route.label)}
      <a
        {href}
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 {isActiveRoute(href)
          ? 'bg-muted text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-popover/50'}"
      >
        <route.icon class="w-5 h-5 shrink-0" />
        <span>{getToolRouteLabel(href, route.label)}</span>
      </a>
    {/each}
  </nav>

  <div class="p-3 border-t border-border/50">
    <div class="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <span>v{#await getVersion()}...{:then version}{version}{/await}</span>

      <span aria-hidden="true" class="opacity-40">|</span>

      <details bind:open={languageMenuOpen} class="relative">
        <summary
          class="list-none cursor-pointer select-none rounded-md border border-border/60 bg-card/60 px-2 py-1 text-foreground hover:bg-popover/60 transition-colors"
        >
          <span class="flex items-center gap-1.5">
            <span class="shrink-0 text-[13px] leading-none">🌐</span>
            <span>{getLanguageLabel(SETTINGS.live.general.state.language)}</span>
          </span>
        </summary>

        <div class="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 min-w-[72px] rounded-lg border border-border/60 bg-card shadow-lg overflow-hidden">
          {#each languageOptions as option}
            <button
              type="button"
              class="block w-full px-3 py-2 text-center text-xs transition-colors {SETTINGS.live.general.state.language === option.value
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-popover/60'}"
              onclick={() => setLanguage(option.value)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </details>
    </div>
  </div>
</aside>