<script lang="ts">
  /**
   * Style section shared by the monster-monitor HUD panels: size sliders,
   * the panel's colors (with its scheme row) and the text style switches.
   * Panel-specific fields come in through snippets.
   */
  import type { Snippet } from "svelte";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import type { CustomPanelStyle } from "$lib/settings-store";
  import type {
    HudPanelKey,
    PanelColorPatch,
    PanelColors,
  } from "$lib/hud-color-schemes";
  import PanelColorFields from "$lib/components/PanelColorFields.svelte";
  import OverlayTextStyleFields from "../skill-monitor/overlay-text-style-fields.svelte";

  interface Props {
    /** Omitted when the tab already titles the section. */
    titleKey?: MessageKey | undefined;
    panelStyle: CustomPanelStyle;
    updatePanelStyle: <K extends keyof CustomPanelStyle>(
      key: K,
      value: CustomPanelStyle[K],
    ) => void;
    schemePanel?: HudPanelKey | undefined;
    columnGapMax?: number | undefined;
    /** False for panels that draw no progress bar. */
    showProgress?: boolean | undefined;
    /** More layout fields, appended to the slider grid. */
    extraFields?: Snippet | undefined;
    /** More color fields, after the name color. */
    extraColors?: Snippet | undefined;
    /** Rendered between the colors and the text style switches. */
    footer?: Snippet | undefined;
  }

  let {
    titleKey,
    panelStyle,
    updatePanelStyle,
    schemePanel,
    columnGapMax = 40,
    showProgress = true,
    extraFields,
    extraColors,
    footer,
  }: Props = $props();

  function applyColors(patch: PanelColorPatch) {
    // Synchronous writes land in one persisted store update.
    for (const key of Object.keys(patch) as (keyof PanelColors)[]) {
      const value = patch[key];
      if (value !== undefined) updatePanelStyle(key, value);
    }
  }

  const sliders = $derived([
    { key: "gap", label: "monsterMonitor.style.gap", min: 0, max: 24 },
    {
      key: "columnGap",
      label: "monsterMonitor.style.columnGap",
      min: 0,
      max: columnGapMax,
    },
    {
      key: "fontSize",
      label: "monsterMonitor.style.fontSize",
      min: 10,
      max: 28,
    },
  ] as const);
</script>

<section class="border-border/60 bg-card/60 space-y-5 rounded-xl border p-5">
  {#if titleKey}
    <h2 class="text-foreground text-base font-semibold">{t(titleKey)}</h2>
  {/if}
  <div class="grid gap-4 lg:grid-cols-3">
    {#each sliders as slider (slider.key)}
      <label class="style-field">
        <span>{t(slider.label)}</span>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          value={panelStyle[slider.key]}
          oninput={(event) =>
            updatePanelStyle(
              slider.key,
              Number.parseInt(event.currentTarget.value, 10),
            )}
        />
        <strong>{panelStyle[slider.key]}px</strong>
      </label>
    {/each}
    {@render extraFields?.()}
  </div>

  <PanelColorFields
    style={panelStyle}
    {schemePanel}
    {showProgress}
    {extraColors}
    onchange={applyColors}
  />
  {@render footer?.()}
  <OverlayTextStyleFields
    textShadowEnabled={panelStyle.textShadowEnabled}
    backgroundEnabled={panelStyle.backgroundEnabled}
    backgroundOpacity={panelStyle.backgroundOpacity}
    onTextShadowEnabled={(v) => updatePanelStyle("textShadowEnabled", v)}
    onBackgroundEnabled={(v) => updatePanelStyle("backgroundEnabled", v)}
    onBackgroundOpacity={(v) => updatePanelStyle("backgroundOpacity", v)}
  />
</section>

<style>
  .style-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(15, 23, 42, 0.22);
    font-size: 13px;
    color: var(--foreground, #fff);
  }

  .style-field strong {
    font-size: 12px;
    color: var(--muted-foreground, rgba(255, 255, 255, 0.72));
  }
</style>
