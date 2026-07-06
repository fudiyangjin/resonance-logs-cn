<script lang="ts">
  import {
    createDefaultMinimapConfig,
    SETTINGS,
  } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import SettingsColor from "../dps/settings/settings-color.svelte";
  import SettingsSlider from "../dps/settings/settings-slider.svelte";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";

  const defaultMinimapConfig = createDefaultMinimapConfig();

  type LegacyMinimapConfig = typeof defaultMinimapConfig & {
    autoHideInDailyScenes?: boolean;
    hideAllTeammates?: boolean;
    showBoss?: boolean;
    showMarkers?: boolean;
    entityColors?: Partial<typeof defaultMinimapConfig.entityColors>;
    entitySizes?: Partial<typeof defaultMinimapConfig.entitySizes>;
    markerColors?: Partial<typeof defaultMinimapConfig.markerColors>;
    localRing?: Partial<typeof defaultMinimapConfig.localRing>;
    localFacing?: Partial<typeof defaultMinimapConfig.localFacing>;
    infoPanelStyle?: Partial<typeof defaultMinimapConfig.infoPanelStyle>;
  };

  function ensureMinimapSettingsDefaults() {
    const state = SETTINGS.minimap.state as LegacyMinimapConfig;
    state.autoHideInDailyScenes ??= defaultMinimapConfig.autoHideInDailyScenes;
    state.hideAllTeammates ??= defaultMinimapConfig.hideAllTeammates;
    state.showBoss ??= defaultMinimapConfig.showBoss;
    state.showMarkers ??= defaultMinimapConfig.showMarkers;
    state.entityColors ??= { ...defaultMinimapConfig.entityColors };
    state.entityColors.boss ??= defaultMinimapConfig.entityColors.boss;
    state.entitySizes ??= { ...defaultMinimapConfig.entitySizes };
    state.entitySizes.local ??= defaultMinimapConfig.entitySizes.local;
    state.entitySizes.teammate ??= defaultMinimapConfig.entitySizes.teammate;
    state.entitySizes.boss ??= defaultMinimapConfig.entitySizes.boss;
    state.entitySizes.other ??= defaultMinimapConfig.entitySizes.other;
    state.markerColors ??= { ...defaultMinimapConfig.markerColors };
    state.markerColors.m1 ??= defaultMinimapConfig.markerColors.m1;
    state.markerColors.m2 ??= defaultMinimapConfig.markerColors.m2;
    state.markerColors.m3 ??= defaultMinimapConfig.markerColors.m3;
    state.markerColors.m4 ??= defaultMinimapConfig.markerColors.m4;
    state.markerColors.m5 ??= defaultMinimapConfig.markerColors.m5;
    state.markerColors.m6 ??= defaultMinimapConfig.markerColors.m6;
    state.localRing ??= { ...defaultMinimapConfig.localRing };
    state.localRing.enabled ??= defaultMinimapConfig.localRing.enabled;
    state.localRing.color ??= defaultMinimapConfig.localRing.color;
    state.localRing.width ??= defaultMinimapConfig.localRing.width;
    state.localFacing ??= { ...defaultMinimapConfig.localFacing };
    state.localFacing.enabled ??= defaultMinimapConfig.localFacing.enabled;
    state.infoPanelStyle ??= { ...defaultMinimapConfig.infoPanelStyle };
    state.infoPanelStyle.backgroundOpacity ??=
      defaultMinimapConfig.infoPanelStyle.backgroundOpacity;
  }

  ensureMinimapSettingsDefaults();

  const minimapSettings = $derived(SETTINGS.minimap.state);

  $effect(() => {
    void minimapSettings.showBoss;
    void minimapSettings.showMarkers;
    void minimapSettings.autoHideInDailyScenes;
    void minimapSettings.entityColors;
    void minimapSettings.entitySizes;
    void minimapSettings.markerColors;
    void minimapSettings.localRing;
    void minimapSettings.localFacing;
    void minimapSettings.infoPanelStyle;
    ensureMinimapSettingsDefaults();
  });

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
      bind:checked={minimapSettings.autoHideInDailyScenes}
      label={t("minimap.settings.autoHideInDailyScenes.label")}
      description={t("minimap.settings.autoHideInDailyScenes.description")}
    />

    <SettingsSwitch
      bind:checked={minimapSettings.hideNormalTeammates}
      label={t("minimap.settings.hideNormalTeammates.label")}
      description={t("minimap.settings.hideNormalTeammates.description")}
    />

    <SettingsSwitch
      bind:checked={minimapSettings.hideAllTeammates}
      label={t("minimap.settings.hideAllTeammates.label")}
      description={t("minimap.settings.hideAllTeammates.description")}
    />

    {#if minimapSettings.showBoss !== undefined}
      <SettingsSwitch
        bind:checked={minimapSettings.showBoss}
        label={t("minimap.settings.showBoss.label")}
        description={t("minimap.settings.showBoss.description")}
      />
    {/if}
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

    <div class="space-y-3 border-t border-border/40 pt-3">
      <label class="text-muted-foreground block text-xs">
        {t("overlay.style.backgroundOpacity", {
          value: Math.round(
            (minimapSettings.infoPanelStyle?.backgroundOpacity ?? 0.76) * 100,
          ),
        })}
        <input
          class="mt-1 w-full"
          type="range"
          min="0"
          max="1"
          step="0.02"
          value={minimapSettings.infoPanelStyle?.backgroundOpacity ?? 0.76}
          oninput={(event) =>
            (minimapSettings.infoPanelStyle = {
              ...minimapSettings.infoPanelStyle,
              backgroundOpacity: Number(
                (event.currentTarget as HTMLInputElement).value,
              ),
            })}
        />
      </label>
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
      {#if minimapSettings.entityColors.boss}
        <SettingsColor
          bind:value={minimapSettings.entityColors.boss}
          label={t("minimap.settings.colors.boss")}
        />
      {/if}
    </div>
  </section>

  <section
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div>
      <h2 class="text-foreground text-base font-semibold">
        {t("minimap.settings.sizes.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("minimap.settings.sizes.description")}
      </p>
    </div>

    {#if minimapSettings.entitySizes}
      <div class="grid gap-2 lg:grid-cols-2">
        <SettingsSlider
          bind:value={minimapSettings.entitySizes.local}
          label={t("minimap.settings.sizes.local")}
          min={1}
          max={20}
          step={1}
          unit="px"
        />
        <SettingsSlider
          bind:value={minimapSettings.entitySizes.teammate}
          label={t("minimap.settings.sizes.teammate")}
          min={1}
          max={20}
          step={1}
          unit="px"
        />
        <SettingsSlider
          bind:value={minimapSettings.entitySizes.boss}
          label={t("minimap.settings.sizes.boss")}
          min={1}
          max={24}
          step={1}
          unit="px"
        />
        <SettingsSlider
          bind:value={minimapSettings.entitySizes.other}
          label={t("minimap.settings.sizes.other")}
          min={1}
          max={24}
          step={1}
          unit="px"
        />
      </div>
    {/if}
  </section>

  <section
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div>
      <h2 class="text-foreground text-base font-semibold">
        {t("minimap.settings.showMarkers.label")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("minimap.settings.showMarkers.description")}
      </p>
    </div>

    {#if minimapSettings.showMarkers !== undefined}
      <SettingsSwitch
        bind:checked={minimapSettings.showMarkers}
        label={t("minimap.overlay.state.show")}
      />
    {/if}

    {#if minimapSettings.markerColors}
      <div class="grid gap-2 lg:grid-cols-2">
        <SettingsColor
          bind:value={minimapSettings.markerColors.m1}
          label={t("minimap.settings.colors.marker1")}
        />
        <SettingsColor
          bind:value={minimapSettings.markerColors.m2}
          label={t("minimap.settings.colors.marker2")}
        />
        <SettingsColor
          bind:value={minimapSettings.markerColors.m3}
          label={t("minimap.settings.colors.marker3")}
        />
        <SettingsColor
          bind:value={minimapSettings.markerColors.m4}
          label={t("minimap.settings.colors.marker4")}
        />
        <SettingsColor
          bind:value={minimapSettings.markerColors.m5}
          label={t("minimap.settings.colors.marker5")}
        />
        <SettingsColor
          bind:value={minimapSettings.markerColors.m6}
          label={t("minimap.settings.colors.marker6")}
        />
      </div>
    {/if}
  </section>

  <section
    class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
  >
    <div>
      <h2 class="text-foreground text-base font-semibold">
        {t("minimap.settings.localRing.title")}
      </h2>
      <p class="text-muted-foreground text-xs">
        {t("minimap.settings.localRing.description")}
      </p>
    </div>

    {#if minimapSettings.localRing && minimapSettings.localRing.enabled !== undefined && minimapSettings.localRing.color && minimapSettings.localRing.width !== undefined}
      <div class="space-y-4">
        <SettingsSwitch
          bind:checked={minimapSettings.localRing.enabled}
          label={t("minimap.settings.localRing.enabled.label")}
          description={t("minimap.settings.localRing.enabled.description")}
        />
        {#if minimapSettings.localFacing && minimapSettings.localFacing.enabled !== undefined}
          <SettingsSwitch
            bind:checked={minimapSettings.localFacing.enabled}
            label={t("minimap.settings.localFacing.label")}
            description={t("minimap.settings.localFacing.description")}
          />
        {/if}
        <div class="grid gap-2 lg:grid-cols-2">
          <SettingsColor
            bind:value={minimapSettings.localRing.color}
            label={t("minimap.settings.localRing.color")}
          />
          <SettingsSlider
            bind:value={minimapSettings.localRing.width}
            label={t("minimap.settings.localRing.width")}
            min={1}
            max={6}
            step={1}
            unit="px"
          />
        </div>
      </div>
    {/if}
  </section>
</div>
