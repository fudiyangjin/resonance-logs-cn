<script lang="ts">
  import {
    setLocale,
    t,
    type AppLocale,
    type MessageKey,
  } from "$lib/i18n/index.svelte";
  import { APP_LOCALES } from "$lib/i18n/locales";
  import { SETTINGS } from "$lib/settings-store";

  const localeLabelKeys: Record<AppLocale, MessageKey> = {
    "zh-CN": "settings.language.zhCN",
    "en-US": "settings.language.enUS",
  };

  function selectLocale(locale: AppLocale) {
    SETTINGS.i18n.state.locale = locale;
    setLocale(locale);
  }
</script>

<div class="space-y-3">
  <div
    class="rounded-lg border bg-card/40 border-border/60 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div class="px-4 py-3 space-y-3">
      <div>
        <h2 class="text-base font-semibold text-foreground mb-2">
          {t("settings.language.title")}
        </h2>
        <p class="text-sm text-muted-foreground">
          {t("settings.language.description")}
        </p>
      </div>

      <div class="flex items-start gap-3 py-2.5">
        <div class="flex-1 min-w-0 space-y-2">
          <div>
            <div class="text-sm font-medium text-foreground">
              {t("settings.language.current")}
            </div>
            <div class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {t("settings.language.note")}
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            {#each APP_LOCALES as locale (locale)}
              <button
                type="button"
                onclick={() => selectLocale(locale)}
                class="px-3 py-1.5 rounded-md text-xs font-medium transition-all {SETTINGS
                  .i18n.state.locale === locale
                  ? 'bg-muted text-foreground shadow-sm border border-border'
                  : 'bg-popover/50 text-muted-foreground hover:bg-popover/70 hover:text-foreground border border-border/60'}"
                style="background: {SETTINGS.i18n.state.locale === locale
                  ? 'var(--muted)'
                  : 'color-mix(in oklab, var(--popover) 50%, transparent)'}; color: {SETTINGS
                  .i18n.state.locale === locale
                  ? 'var(--foreground)'
                  : 'var(--muted-foreground)'}; border-color: var(--border);"
              >
                {t(localeLabelKeys[locale])}
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
