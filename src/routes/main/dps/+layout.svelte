<script lang="ts">
  /**
   * @file Layout for the DPS detection tool.
   * Contains the launch button for Live window and tabs for sub-sections.
   */
  import { page } from "$app/state";
  import ActivityIcon from "virtual:icons/lucide/activity";
  import { uiT } from "$lib/i18n";
  import { SETTINGS } from "$lib/settings-store";
  import { DPS_SUB_ROUTES } from "../routes.svelte";

  let { children } = $props();

  const t = uiT("dps/general", () => SETTINGS.live.general.state.language);

  function isActiveTab(tabPath: string): boolean {
    const pathname = page.url.pathname;
    return pathname === tabPath || pathname.startsWith(tabPath + "/");
  }

  function getDefaultTabPath(): string {
    return Object.keys(DPS_SUB_ROUTES)[0] || "/main/dps/history";
  }

  function getDpsSubRouteLabel(href: string, fallback: string): string {
    const keyMap: Record<string, string> = {
      "/main/dps/history": "history",
      "/main/dps/settings": "meterSettings",
    };

    const key = keyMap[href];
    return key ? t(key, fallback) : fallback;
  }

  let isBasePath = $derived(page.url.pathname === "/main/dps" || page.url.pathname === "/main/dps/");
</script>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
      <ActivityIcon class="w-5 h-5" />
    </div>
    <div>
      <h1 class="text-xl font-bold text-foreground">{t("title", "DPS检测")}</h1>
      <p class="text-sm text-muted-foreground">{t("subtitle", "实时监测战斗数据和DPS统计")}</p>
    </div>
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
