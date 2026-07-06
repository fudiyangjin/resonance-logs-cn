<script lang="ts">
  /**
   * @file Tool sidebar component for the toolbox layout.
   * Displays the list of available tools in the left panel.
   */
  import { t, setLocale } from "$lib/i18n/index.svelte";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { TOOL_ROUTES } from "./routes.svelte";
  import { getVersion } from "@tauri-apps/api/app";
  import {
    APP_LOCALES,
    LOCALE_NATIVE_NAMES,
    type AppLocale,
  } from "$lib/i18n/locales";
  import { SETTINGS } from "$lib/settings-store";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import ChevronDown from "virtual:icons/lucide/chevron-down";
  import Languages from "virtual:icons/lucide/languages";

  // Check if current path matches or starts with the tool path
  function isActiveRoute(toolPath: string): boolean {
    const pathname = page.url.pathname;
    return pathname === toolPath || pathname.startsWith(toolPath + "/");
  }

  function selectLocale(locale: AppLocale) {
    SETTINGS.i18n.state.locale = locale;
    setLocale(locale);
  }

  let appVersion = $state("");
  onMount(() => {
    getVersion()
      .then((v) => (appVersion = v))
      .catch((err) => console.error("Failed to get app version", err));
  });
</script>

<aside
  class="flex flex-col w-56 shrink-0 bg-card/50 border-r border-border/50 h-full"
>
  <!-- Header with logo -->
  <div class="px-4 py-4 border-b border-border/50">
    <h1 class="text-lg font-bold text-foreground tracking-tight">
      {t("app.name")}
    </h1>
    <p class="text-xs text-muted-foreground mt-0.5">{t("toolbox.subtitle")}</p>
  </div>

  <!-- Tool list -->
  <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
    <p
      class="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider"
    >
      {t("toolbox.section.tools")}
    </p>
    {#each Object.entries(TOOL_ROUTES) as [href, route] (href)}
      <a
        {href}
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 {isActiveRoute(
          href,
        )
          ? 'bg-muted text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-popover/50'}"
      >
        <route.icon class="w-5 h-5 shrink-0" />
        <span>{t(route.labelKey)}</span>
      </a>
    {/each}
  </nav>

  <!-- Footer with version + language switcher -->
  <div class="p-3 border-t border-border/50">
    <div class="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
      <span>v{appVersion || t("toolbox.versionLoading")}</span>
      <div class="flex items-center gap-1.5">
        <span class="opacity-60">language:</span>
        <Popover.Root>
          <Popover.Trigger
            class="group inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border/60 bg-popover/50 cursor-pointer transition-colors hover:bg-muted hover:border-border hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <Languages class="w-3.5 h-3.5 opacity-70" />
            {LOCALE_NATIVE_NAMES[SETTINGS.i18n.state.locale]}
            <ChevronDown
              class="w-3 h-3 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </Popover.Trigger>
          <Popover.Content class="w-36 p-1" align="center" side="top" sideOffset={6}>
            {#each APP_LOCALES as locale (locale)}
              <button
                type="button"
                onclick={() => selectLocale(locale)}
                class="w-full text-left px-2 py-1.5 rounded text-xs transition-colors {SETTINGS
                  .i18n.state.locale === locale
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-popover/70 hover:text-foreground'}"
              >
                {LOCALE_NATIVE_NAMES[locale]}
              </button>
            {/each}
          </Popover.Content>
        </Popover.Root>
      </div>
    </div>
  </div>
</aside>
