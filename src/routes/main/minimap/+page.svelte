<script lang="ts">
  import { SETTINGS } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import SettingsColor from "../dps/settings/settings-color.svelte";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";

  const minimapSettings = $derived(SETTINGS.minimap.state);

  function visibilityState(value: boolean): string {
    return value
      ? t("minimap.overlay.state.show")
      : t("minimap.overlay.state.hide");
  }
</script>

<div class="space-y-6">
  <section
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div>
      <h2 class="text-foreground text-base font-semibold">
        {t("minimap.settings.display.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("minimap.settings.display.description")}
      </p>
    </div>

    <SettingsSwitch
      bind:checked={minimapSettings.hideNormalTeammates}
      label={t("minimap.settings.hideNormalTeammates.label")}
      description={t("minimap.settings.hideNormalTeammates.description")}
    />
  </section>

  <section
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div>
      <h2 class="text-foreground text-base font-semibold">
        {t("minimap.overlay.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("minimap.overlay.description")}
      </p>
    </div>

    <div class="space-y-2">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {minimapSettings.showMapPanel
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border/60 bg-muted/30 text-foreground hover:bg-muted/50'}"
          onclick={() =>
            (minimapSettings.showMapPanel = !minimapSettings.showMapPanel)}
        >
          {t("minimap.overlay.mapPanel", {
            state: visibilityState(minimapSettings.showMapPanel),
          })}
        </button>
        <button
          type="button"
          class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {minimapSettings.showInfoPanel
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border/60 bg-muted/30 text-foreground hover:bg-muted/50'}"
          onclick={() =>
            (minimapSettings.showInfoPanel = !minimapSettings.showInfoPanel)}
        >
          {t("minimap.overlay.infoPanel", {
            state: visibilityState(minimapSettings.showInfoPanel),
          })}
        </button>
      </div>
      <p class="text-muted-foreground text-xs">
        {t("minimap.overlay.help")}
      </p>
    </div>
  </section>

  <section
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div>
      <h2 class="text-foreground text-base font-semibold">
        {t("minimap.settings.colors.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("minimap.settings.colors.description")}
      </p>
    </div>

    <div class="grid gap-2 lg:grid-cols-2">
      <SettingsColor
        bind:value={minimapSettings.entityColors.local}
        label={t("minimap.settings.colors.local")}
      />
      <SettingsColor
        bind:value={minimapSettings.entityColors.teammate}
        label={t("minimap.settings.colors.teammate")}
      />
    </div>
  </section>
</div>
