<script lang="ts">
  /**
   * @file Tool sidebar component for the toolbox layout.
   * Displays the list of available tools in the left panel.
   */
  import { page } from "$app/state";
  import { getVersion } from "@tauri-apps/api/app";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { LOCALE_OPTIONS, uiT, type LocaleCode } from "$lib/i18n";
  import { commands } from "$lib/bindings";
  import { toggleEventLoggerWindow } from "$lib/event-logger-window";
  import MonitorUpIcon from "virtual:icons/lucide/monitor-up";
  import PanelBottomOpenIcon from "virtual:icons/lucide/panel-bottom-open";
  import ClipboardListIcon from "virtual:icons/lucide/clipboard-list";
  import PenSquareIcon from "virtual:icons/lucide/pen-square";
  import SettingsIcon from "virtual:icons/lucide/settings";
  import { SETTINGS } from "$lib/settings-store";
  import { TOOL_ROUTES } from "./routes.svelte";

  let {
    onOpenChangelog,
  }: {
    onOpenChangelog?: () => void;
  } = $props();

  let languageMenuOpen = $state(false);

  const languageOptions = LOCALE_OPTIONS;

  const tShell = uiT("shell", () => SETTINGS.live.general.state.language);
  const tDps = uiT("dps/general", () => SETTINGS.live.general.state.language);
  const tCustom = uiT("custom-triggers/general", () => SETTINGS.live.general.state.language);
  const tOverlay = uiT("overlay/skill-monitor/general", () => SETTINGS.live.general.state.language);

  function getToolRouteLabel(href: string, fallback: string): string {
    const keyMap: Record<string, string> = {
      "/main/dps": "tool.dps",
      "/main/module-calc": "tool.moduleOptimizer",
      "/main/overlay": "tool.overlay",
      "/main/skill-monitor": "tool.skillMonitor",
      "/main/monster-monitor": "tool.monsterTracker",
      "/main/custom-triggers": "tool.customTriggers",
      "/main/localization": "tool.localization",
      "/main/settings": "tool.settings",
    };

    const key = keyMap[href];
    return key ? tShell(key, fallback) : fallback;
  }

  function setLanguage(locale: LocaleCode) {
    SETTINGS.live.general.state.language = locale;
    languageMenuOpen = false;
  }

  function getLanguageLabel(locale: string): string {
    return languageOptions.find((option) => option.value === locale)?.label ?? "CN";
  }

  function formatAppVersion(version: string): string {
    return version.replace(/-beta\.?(\d+)$/i, "_beta$1");
  }

  async function toggleOverlayWindow() {
    try {
      await commands.toggleGameOverlayWindow();
    } catch (error) {
      console.error("Failed to toggle overlay window from sidebar", error);
    }
  }

  async function toggleDpsWindow() {
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
      }
    } catch (error) {
      console.error("Failed to toggle DPS window from sidebar", error);
    }
  }

  async function toggleLoggerWindow() {
    try {
      await toggleEventLoggerWindow();
    } catch (error) {
      console.error("Failed to toggle event logger from sidebar", error);
    }
  }

  async function toggleOverlayEditMode() {
    try {
      await commands.toggleGameOverlayEditMode();
    } catch (error) {
      console.error("Failed to toggle overlay edit mode from sidebar", error);
    }
  }

  function isActiveRoute(toolPath: string): boolean {
    const pathname = page.url.pathname;
    return pathname === toolPath || pathname.startsWith(toolPath + "/");
  }
</script>

<style>
  summary::-webkit-details-marker {
    display: none;
  }
</style>

<aside class="flex flex-col w-56 shrink-0 bg-card/50 border-r border-border/50 h-full">
  <div class="px-4 py-4 border-b border-border/50 space-y-3">
    <div>
      <h1 class="text-lg font-bold text-foreground tracking-tight">Resonance Logs</h1>
      <p class="text-xs text-muted-foreground mt-0.5">
        {tShell("sidebar.toolbox", "工具箱")}
      </p>
    </div>

    <div class="space-y-2">
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-popover/60"
        onclick={toggleDpsWindow}
      >
        <PanelBottomOpenIcon class="w-4 h-4 shrink-0" />
        <span>{tDps("toggleWindow", "Toggle DPS Window")}</span>
      </button>

      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-popover/60"
        onclick={toggleOverlayWindow}
      >
        <MonitorUpIcon class="w-4 h-4 shrink-0" />
        <span>{tShell("sidebar.toggleOverlay", "Toggle Overlay")}</span>
      </button>

      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-popover/60"
        onclick={toggleOverlayEditMode}
      >
        <PenSquareIcon class="w-4 h-4 shrink-0" />
        <span>{tOverlay("editOverlayLayout", "Edit Overlay")}</span>
      </button>

      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-popover/60"
        onclick={toggleLoggerWindow}
      >
        <ClipboardListIcon class="w-4 h-4 shrink-0" />
        <span>{tCustom("toggleEventLogger", "Toggle Event Logger")}</span>
      </button>
    </div>
  </div>

  <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
    <p class="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {tShell("sidebar.tools", "工具")}
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

  <div class="p-3 border-t border-border/50 space-y-3">
    <a
      href="/main/settings"
      class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 {isActiveRoute('/main/settings')
        ? 'bg-muted text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground hover:bg-popover/50'}"
    >
      <SettingsIcon class="w-5 h-5 shrink-0" />
      <span>{getToolRouteLabel('/main/settings', 'Settings')}</span>
    </a>

    <div class="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <button
        type="button"
        class="rounded px-1 py-0.5 transition-colors hover:bg-popover/60 hover:text-foreground"
        onclick={() => onOpenChangelog?.()}
        title={tShell("sidebar.openChangelog", "View changelog")}
        aria-label={tShell("sidebar.openChangelog", "View changelog")}
      >
        v{#await getVersion()}...{:then version}{formatAppVersion(version)}{/await}
      </button>

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
