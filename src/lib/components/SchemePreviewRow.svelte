<script lang="ts">
  /**
   * A static imitation of one HUD text row (name on the left, value on the
   * right, progress bar behind), drawn the way `TextBuffRow` draws it, for
   * previewing scheme colors in the settings window.
   */
  import type { PanelColorPatch } from "$lib/hud-color-schemes";

  interface Props {
    colors: PanelColorPatch;
    name: string;
    value: string;
    /** Bar fill, 0–1. */
    fill?: number | undefined;
    compact?: boolean | undefined;
  }

  let { colors, name, value, fill = 0.62, compact = false }: Props = $props();
</script>

<div class="preview-row" class:compact>
  {#if colors.progressColor}
    <div class="track">
      <div
        class="fill"
        style:width={`${Math.round(fill * 100)}%`}
        style:background={colors.progressColor}
        style:opacity={colors.progressOpacity ?? 0.4}
      ></div>
    </div>
  {/if}
  <span class="name" style:color={colors.nameColor ?? "#ffffff"}>{name}</span>
  <span
    class="value"
    style:color={colors.valueColor ?? colors.nameColor ?? "#ffffff"}
    >{value}</span
  >
</div>

<style>
  .preview-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    padding: 2px 6px;
    border-radius: 5px;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.25;
    text-shadow:
      0 0 3px rgba(0, 0, 0, 1),
      0 1px 2px rgba(0, 0, 0, 0.9);
  }

  .preview-row.compact {
    gap: 4px;
    padding: 1px 4px;
    font-size: 11px;
  }

  .track {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.16);
  }

  .fill {
    height: 100%;
  }

  .name,
  .value {
    position: relative;
    white-space: nowrap;
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
