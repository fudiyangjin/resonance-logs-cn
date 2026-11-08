<script lang="ts">
  /**
   * The color part of a HUD panel's style section: the scheme row, then
   * name / value / progress colors and the progress opacity, each one line
   * of label + control. Every change reaches the parent as a color patch.
   */
  import type { Snippet } from "svelte";
  import { t } from "$lib/i18n/index.svelte";
  import type {
    HudPanelKey,
    PanelColorPatch,
    PanelColors,
  } from "$lib/hud-color-schemes";
  import ColorField from "./ColorField.svelte";
  import OpacityField from "./OpacityField.svelte";
  import HudSchemeChips from "./HudSchemeChips.svelte";

  interface Props {
    style: PanelColors;
    onchange: (patch: PanelColorPatch) => void;
    /** Shows the scheme row for this panel. */
    schemePanel?: HudPanelKey | undefined;
    groupIndex?: number | undefined;
    showValue?: boolean | undefined;
    showProgress?: boolean | undefined;
    /** More color fields of this panel, placed after the name color. */
    extraColors?: Snippet | undefined;
  }

  let {
    style,
    onchange,
    schemePanel,
    groupIndex = 0,
    showValue = true,
    showProgress = true,
    extraColors,
  }: Props = $props();
</script>

<div class="space-y-2">
  {#if schemePanel}
    <HudSchemeChips
      panel={schemePanel}
      {groupIndex}
      {style}
      onapply={onchange}
    />
  {/if}
  <div class="grid gap-x-4 gap-y-0.5 md:grid-cols-2">
    <ColorField
      label={t("monsterMonitor.style.nameColor")}
      value={style.nameColor}
      onchange={(nameColor) => onchange({ nameColor })}
    />
    {@render extraColors?.()}
    {#if showValue}
      <ColorField
        label={t("monsterMonitor.style.valueColor")}
        value={style.valueColor}
        onchange={(valueColor) => onchange({ valueColor })}
      />
    {/if}
    {#if showProgress}
      <ColorField
        label={t("monsterMonitor.style.progressColor")}
        value={style.progressColor}
        onchange={(progressColor) => onchange({ progressColor })}
      />
      <OpacityField
        label={t("monsterMonitor.style.progressOpacity")}
        value={style.progressOpacity}
        onchange={(progressOpacity) => onchange({ progressOpacity })}
      />
    {/if}
  </div>
</div>
