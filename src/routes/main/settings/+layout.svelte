<script lang="ts">
  /**
   * @file Layout for global application settings.
   * Contains tabs for themes, network, hotkeys, locale, and debug settings.
   */
  import { page } from "$app/state";
  import SettingsIcon from "virtual:icons/lucide/settings";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import { SETTINGS_SUB_ROUTES } from "../routes.svelte";

  let { children } = $props();

  const tShell = uiT("shell", () => SETTINGS.live.general.state.language);
  const tDps = uiT("dps/general", () => SETTINGS.live.general.state.language);

  function isActiveTab(tabPath: string): boolean {
    const pathname = page.url.pathname;
    return pathname === tabPath || pathname.startsWith(tabPath + "/");
  }

  function getDefaultTabPath(): string {
    return Object.keys(SETTINGS_SUB_ROUTES)[0] || "/main/settings/themes";
  }

  function getSettingsSubRouteLabel(href: string, fallback: string): string {
    const keyMap: Record<string, { scope: "shell" | "dps"; key: string }> = {
      "/main/settings/themes": { scope: "shell", key: "themes" },
      "/main/settings/network": { scope: "dps", key: "settings.network" },
      "/main/settings/hotkeys": { scope: "dps", key: "settings.shortcuts" },
      "/main/settings/profile": { scope: "shell", key: "settings.profile" },
      "/main/settings/overlay": { scope: "shell", key: "settings.overlay" },
      "/main/settings/locales": { scope: "shell", key: "settings.locales" },
      "/main/settings/debug": { scope: "dps", key: "settings.debug" },
    };

    const key = keyMap[href];
    if (!key) return fallback;
    return key.scope === "shell" ? tShell(key.key, fallback) : tDps(key.key, fallback);
  }

  let isBasePath = $derived(page.url.pathname === "/main/settings" || page.url.pathname === "/main/settings/");
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
        <SettingsIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">{tShell("settings", "Settings")}</h1>
        <p class="text-sm text-muted-foreground">{tShell("settings.subtitle", "Configure themes, networking, hotkeys, locale handling, and global debug tools")}</p>
      </div>
    </div>
  </div>

  <div class="border-b border-border/60">
    <nav class="flex gap-1 -mb-px flex-wrap">
      {#each Object.entries(SETTINGS_SUB_ROUTES) as [href, route] (route.label)}
        <a
          {href}
          class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors {isActiveTab(href)
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}"
        >
          <route.icon class="w-4 h-4" />
          <span>{getSettingsSubRouteLabel(href, route.label)}</span>
        </a>
      {/each}
    </nav>
  </div>

  <div class="min-h-0">
    {#if isBasePath}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground mb-4">{tShell("settings.selectTabPrompt", "Please select a tab above to view global settings")}</p>
        <a
          href={getDefaultTabPath()}
          class="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors"
        >
          {tShell("settings.viewThemes", "View Themes")}
        </a>
      </div>
    {:else}
      {@render children()}
    {/if}
  </div>
</div>
