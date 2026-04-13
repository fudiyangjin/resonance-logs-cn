<script lang="ts">
  /**
   * @file Layout for the DPS detection tool.
   * Contains the launch button for Live window and tabs for sub-sections.
   */
  import { page } from "$app/state";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import ActivityIcon from "virtual:icons/lucide/activity";
  import ExternalLinkIcon from "virtual:icons/lucide/external-link";
  import PlayIcon from "virtual:icons/lucide/play";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import { DPS_SUB_ROUTES } from "../routes.svelte";

  let { children } = $props();

  const t = uiT("dps/general", () => SETTINGS.live.general.state.language);

  // Check if current path matches the tab
  function isActiveTab(tabPath: string): boolean {
    const pathname = page.url.pathname;
    return pathname === tabPath || pathname.startsWith(tabPath + "/");
  }

  // Get the default tab path for redirect
  function getDefaultTabPath(): string {
    return Object.keys(DPS_SUB_ROUTES)[0] || "/main/dps/history";
  }

  function getDpsSubRouteLabel(href: string, fallback: string): string {
    const keyMap: Record<string, string> = {
      "/main/dps/history": "history",
      "/main/dps/themes": "themes",
      "/main/dps/settings": "settings",
    };

    const key = keyMap[href];
    return key ? t(key, fallback) : fallback;
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
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
        <ActivityIcon class="w-5 h-5" />
      </div>
      <div>
        <h1 class="text-xl font-bold text-foreground">{t("title", "DPS检测")}</h1>
        <p class="text-sm text-muted-foreground">{t("subtitle", "实时监测战斗数据和DPS统计")}</p>
      </div>
    </div>

    <button
      type="button"
      class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
      onclick={toggleLiveWindow}
    >
      <PlayIcon class="w-4 h-4" />
      <span>{t("toggleWindow", "切换 DPS 窗口")}</span>
      <ExternalLinkIcon class="w-3.5 h-3.5 opacity-70" />
    </button>
  </div>

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
          <span>{getDpsSubRouteLabel(href, route.label)}</span>
        </a>
      {/each}
    </nav>
  </div>

  <div class="min-h-0">
    {#if isBasePath}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground mb-4">{t("selectTabPrompt", "请选择上方的选项卡查看详细设置")}</p>
        <a
          href={getDefaultTabPath()}
          class="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors"
        >
          {t("viewHistory", "查看历史记录")}
        </a>
      </div>
    {:else}
      {@render children()}
    {/if}
  </div>
</div>
