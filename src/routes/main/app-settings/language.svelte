<script lang="ts">
  /**
   * @file Language picker for the application settings page. Mirrors the
   * sidebar Popover so the setting is reachable from both places.
   */
  import { t, setLocale } from "$lib/i18n/index.svelte";
  import { SETTINGS } from "$lib/settings-store";
  import {
    APP_LOCALES,
    LOCALE_NATIVE_NAMES,
    type AppLocale,
  } from "$lib/i18n/locales";

  function selectLocale(locale: AppLocale) {
    SETTINGS.i18n.state.locale = locale;
    setLocale(locale);
  }
</script>

<div class="space-y-3">
  <div
    class="border-border/60 bg-card/40 overflow-hidden rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="px-4 py-3">
      <h2 class="text-foreground mb-1 text-base font-semibold">
        {t("appSettings.language.title")}
      </h2>
      <p class="text-muted-foreground mb-3 text-xs">
        {t("appSettings.language.description")}
      </p>
      <div class="flex flex-wrap gap-2">
        {#each APP_LOCALES as locale (locale)}
          <button
            type="button"
            class="rounded border px-3 py-1.5 text-sm transition-colors {SETTINGS
              .i18n.state.locale === locale
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border/60 text-foreground hover:bg-muted/40'}"
            onclick={() => selectLocale(locale)}
          >
            {LOCALE_NATIVE_NAMES[locale]}
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>
