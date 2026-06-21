<script lang="ts">
  import { createDefaultMinimapConfig, SETTINGS } from "$lib/settings-store";
  import { t } from "$lib/i18n/index.svelte";
  import SettingsColor from "../dps/settings/settings-color.svelte";
  import SettingsSlider from "../dps/settings/settings-slider.svelte";
  import SettingsSwitch from "../dps/settings/settings-switch.svelte";

  const defaultMinimapConfig = createDefaultMinimapConfig();
  let activeTab = $state<"minimap" | "bossDbm">("minimap");

  type LegacyMinimapConfig = typeof defaultMinimapConfig & {
    showBoss?: boolean;
    showBossDbmPanel?: boolean;
    bossDbmPanel?: typeof defaultMinimapConfig.bossDbmPanel;
    bossDbmStyle?: Partial<typeof defaultMinimapConfig.bossDbmStyle>;
    entityColors?: Partial<typeof defaultMinimapConfig.entityColors>;
    localRing?: Partial<typeof defaultMinimapConfig.localRing>;
  };

  function ensureMinimapSettingsDefaults() {
    const state = SETTINGS.minimap.state as LegacyMinimapConfig;
    state.showBoss ??= defaultMinimapConfig.showBoss;
    state.showBossDbmPanel ??= defaultMinimapConfig.showBossDbmPanel;
    state.bossDbmPanel ??= { ...defaultMinimapConfig.bossDbmPanel };
    state.bossDbmStyle ??= { ...defaultMinimapConfig.bossDbmStyle };
    state.bossDbmStyle.gap ??= defaultMinimapConfig.bossDbmStyle.gap;
    state.bossDbmStyle.columnGap ??=
      defaultMinimapConfig.bossDbmStyle.columnGap;
    state.bossDbmStyle.fontSize ??= defaultMinimapConfig.bossDbmStyle.fontSize;
    state.bossDbmStyle.nameColor ??=
      defaultMinimapConfig.bossDbmStyle.nameColor;
    state.bossDbmStyle.valueColor ??=
      defaultMinimapConfig.bossDbmStyle.valueColor;
    state.bossDbmStyle.progressColor ??=
      defaultMinimapConfig.bossDbmStyle.progressColor;
    state.bossDbmStyle.progressOpacity ??=
      defaultMinimapConfig.bossDbmStyle.progressOpacity;
    state.entityColors ??= { ...defaultMinimapConfig.entityColors };
    state.entityColors.boss ??= defaultMinimapConfig.entityColors.boss;
    state.localRing ??= { ...defaultMinimapConfig.localRing };
    state.localRing.enabled ??= defaultMinimapConfig.localRing.enabled;
    state.localRing.color ??= defaultMinimapConfig.localRing.color;
    state.localRing.width ??= defaultMinimapConfig.localRing.width;
  }

  ensureMinimapSettingsDefaults();

  const minimapSettings = $derived(SETTINGS.minimap.state);

  $effect(() => {
    void minimapSettings.showBoss;
    void minimapSettings.showBossDbmPanel;
    void minimapSettings.bossDbmPanel;
    void minimapSettings.bossDbmStyle;
    void minimapSettings.entityColors;
    void minimapSettings.localRing;
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
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'minimap'
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border/60 bg-muted/30 text-foreground hover:bg-muted/50'}"
        onclick={() => (activeTab = "minimap")}
      >
        {t("minimap.tabs.minimap")}
      </button>
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        'bossDbm'
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border/60 bg-muted/30 text-foreground hover:bg-muted/50'}"
        onclick={() => (activeTab = "bossDbm")}
      >
        {t("minimap.tabs.bossDbm")}
      </button>
    </div>
  </section>

  {#if activeTab === "minimap"}
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
  {:else if minimapSettings.bossDbmStyle}
    <section
      class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <div>
        <h2 class="text-foreground text-base font-semibold">
          {t("minimap.bossDbm.title")}
        </h2>
        <p class="text-muted-foreground text-xs">
          {t("minimap.bossDbm.description")}
        </p>
      </div>

      <SettingsSwitch
        bind:checked={minimapSettings.showBossDbmPanel}
        label={t("minimap.overlay.bossDbmPanel", {
          state: visibilityState(minimapSettings.showBossDbmPanel),
        })}
        description={t("minimap.bossDbm.enableDescription")}
      />
    </section>

    <section
      class="border-border/60 bg-card/40 space-y-4 rounded-lg border p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      <div>
        <h2 class="text-foreground text-base font-semibold">
          {t("minimap.bossDbm.style.title")}
        </h2>
        <p class="text-muted-foreground text-xs">
          {t("minimap.bossDbm.style.description")}
        </p>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <SettingsSlider
          bind:value={minimapSettings.bossDbmStyle.fontSize}
          label={t("minimap.bossDbm.style.fontSize")}
          min={10}
          max={28}
          step={1}
          unit="px"
        />
        <SettingsSlider
          bind:value={minimapSettings.bossDbmStyle.gap}
          label={t("minimap.bossDbm.style.gap")}
          min={0}
          max={24}
          step={1}
          unit="px"
        />
        <SettingsSlider
          bind:value={minimapSettings.bossDbmStyle.columnGap}
          label={t("minimap.bossDbm.style.columnGap")}
          min={0}
          max={240}
          step={1}
          unit="px"
        />
        <SettingsSlider
          bind:value={minimapSettings.bossDbmStyle.progressOpacity}
          label={t("minimap.bossDbm.style.progressOpacity")}
          min={0}
          max={1}
          step={0.01}
          unit=""
        />
      </div>

      <div class="grid gap-2 lg:grid-cols-3">
        <SettingsColor
          bind:value={minimapSettings.bossDbmStyle.nameColor}
          label={t("minimap.bossDbm.style.nameColor")}
        />
        <SettingsColor
          bind:value={minimapSettings.bossDbmStyle.valueColor}
          label={t("minimap.bossDbm.style.valueColor")}
        />
        <SettingsColor
          bind:value={minimapSettings.bossDbmStyle.progressColor}
          label={t("minimap.bossDbm.style.progressColor")}
        />
      </div>
    </section>
  {/if}
</div>
