<script lang="ts">
  /**
   * "Colors" row of one panel's style section: one preview chip per scheme;
   * a click writes that scheme's colors into this panel only. The chip whose
   * colors the panel already has is highlighted.
   */
  import { t } from "$lib/i18n/index.svelte";
  import {
    HUD_COLOR_SCHEMES,
    matchesPatch,
    schemePatch,
    type HudPanelKey,
    type PanelColorPatch,
    type PanelColors,
  } from "$lib/hud-color-schemes";
  import SchemePreviewRow from "./SchemePreviewRow.svelte";

  interface Props {
    panel: HudPanelKey;
    /** Custom panel groups rotate through the scheme's group colors. */
    groupIndex?: number | undefined;
    style: Partial<PanelColors> | null | undefined;
    onapply: (patch: PanelColorPatch) => void;
  }

  let { panel, groupIndex = 0, style, onapply }: Props = $props();

  const chips = $derived(
    HUD_COLOR_SCHEMES.map((scheme) => {
      const patch = schemePatch(scheme, panel, groupIndex);
      return { scheme, patch, active: matchesPatch(style, patch) };
    }),
  );
</script>

<div class="flex flex-wrap items-center gap-2">
  <span class="text-muted-foreground text-xs">{t("hudScheme.chips.label")}</span
  >
  {#each chips as chip (chip.scheme.id)}
    {@const schemeName = t(chip.scheme.nameKey)}
    <button
      type="button"
      class="flex w-[4.75rem] flex-col gap-1 rounded-md border p-1 text-left transition-colors {chip.active
        ? 'border-primary bg-primary/10'
        : 'border-border/60 hover:border-border hover:bg-muted/40'}"
      aria-pressed={chip.active}
      title={t("hudScheme.chips.apply", { name: schemeName })}
      onclick={() => onapply(chip.patch)}
    >
      <div class="rounded bg-[#0b0f17] p-0.5">
        <SchemePreviewRow colors={chip.patch} name="Aa" value="12" compact />
      </div>
      <span class="text-foreground truncate px-0.5 text-[11px]"
        >{schemeName}</span
      >
    </button>
  {/each}
</div>
