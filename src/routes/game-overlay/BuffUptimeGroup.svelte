<script lang="ts">
  import { SETTINGS } from "$lib/settings-store";
  import { uiT } from "$lib/i18n";
  import { buffUptimeDisplayRows } from "./overlay-display.svelte.js";
  import { buffUptimeTextStyle } from "./overlay-profile.svelte.js";
  import {
    getGroupPosition,
    getGroupScale,
    getOverlaySizes,
    isEditing,
    startDrag,
    startResize,
  } from "./overlay-state.svelte.js";

  const t = uiT("skill-monitor/buff-monitor", () => SETTINGS.live.general.state.language);
  const editing = $derived(isEditing());
  const rows = $derived(buffUptimeDisplayRows());
  const groupPos = $derived(getGroupPosition("buffUptimeGroup"));
  const groupScale = $derived(getGroupScale("buffUptimeGroupScale"));
  const sizes = $derived(getOverlaySizes());
  const textStyle = $derived(buffUptimeTextStyle());
  const showTitle = $derived(textStyle.showTitle !== false);

  const textShadowCss = $derived.by(() => {
    if (!textStyle.useOutline || textStyle.outlineStrength <= 0) return undefined;
    const strength = Math.max(1, Math.round(textStyle.outlineStrength));
    const color = textStyle.outlineColor || "#000000";
    return [
      `${-strength}px 0 ${color}`,
      `${strength}px 0 ${color}`,
      `0 ${-strength}px ${color}`,
      `0 ${strength}px ${color}`,
      `${-strength}px ${-strength}px ${color}`,
      `${strength}px ${-strength}px ${color}`,
      `${-strength}px ${strength}px ${color}`,
      `${strength}px ${strength}px ${color}`,
    ].join(", ");
  });

  const labelColumnWidthCss = $derived.by(() => {
    const maxLabelLength = rows.reduce((maxLength, row) => Math.max(maxLength, row.label.length + 1), 11);
    return `calc(${Math.max(11, Math.min(22, maxLabelLength))}ch + ${sizes.buffUptimeNameColumnAdjust}px)`;
  });

  const encounterWidthCss = $derived.by(() => `calc(4ch + ${sizes.buffUptimeEncounterColumnAdjust}px)`);
  const trueWidthCss = $derived.by(() => `calc(7ch + ${sizes.buffUptimeTrueColumnAdjust}px)`);
  const rowGapCss = $derived.by(() => `${sizes.buffUptimeColumnGap}px`);
  const sourceFontSizePx = $derived.by(() => Math.max(9, Math.min(sizes.buffUptimeFontSize, sizes.buffUptimeEncounterFontSize, sizes.buffUptimeTrueFontSize) - 2));

  function darkenHexColor(color: string | undefined, amount = 0.42): string {
    const normalized = (color || "#ffffff").trim();
    const hex = normalized.replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color || "#d9d9d9";

    const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    const factor = Math.max(0, Math.min(1, 1 - amount));
    const r = clamp(parseInt(hex.slice(0, 2), 16) * factor);
    const g = clamp(parseInt(hex.slice(2, 4), 16) * factor);
    const b = clamp(parseInt(hex.slice(4, 6), 16) * factor);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
</script>

{#if rows.length > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="overlay-group buff-uptime-group"
    class:editable={editing}
    style:left={`${groupPos.x}px`}
    style:top={`${groupPos.y}px`}
    style:transform={`scale(${groupScale})`}
    style:transform-origin="top left"
    onpointerdown={(e) => startDrag(e, { kind: "group", key: "buffUptimeGroup" }, groupPos)}
  >
    {#if editing}
      <div class="group-tag">{t("uptime.title", "Buff Uptime")}</div>
    {/if}

    {#if showTitle}
      <div
        class="buff-uptime-title"
        style:font-size={`${Math.max(12, sizes.buffUptimeFontSize + 1)}px`}
        style:text-shadow={textShadowCss}
      >
        {t("uptime.title", "Buff Uptime")}
      </div>
    {/if}
    <div class="buff-uptime-list" style:gap={`${sizes.buffUptimeGap}px`}>
      {#each rows as row (row.key)}
        <div
          class="buff-uptime-row"
          style:--label-width={labelColumnWidthCss}
          style:--enc-width={encounterWidthCss}
          style:--true-width={trueWidthCss}
          style:--row-gap={rowGapCss}
        >
          <div class="buff-uptime-name-cell">
            <span class="buff-uptime-indicator" aria-hidden="true">
              {#if row.showActiveIndicator}
                <span class="buff-uptime-indicator-dot" class:active={row.isActive}></span>
              {/if}
            </span>
            <span
              class="buff-uptime-label"
              style:font-size={`${sizes.buffUptimeFontSize}px`}
              style:color={row.color ?? "#ffffff"}
              style:text-shadow={textShadowCss}
            >
              {row.label}:
            </span>
          </div>
          <span
            class="buff-uptime-encounter buff-uptime-number"
            style:font-size={`${sizes.buffUptimeEncounterFontSize}px`}
            style:color={row.color ?? "#ffffff"}
            style:text-shadow={textShadowCss}
          >{row.encounterPercentText}</span>
          {#if row.truePercentText !== undefined}
            <span
              class="buff-uptime-true buff-uptime-number"
              style:font-size={`${sizes.buffUptimeTrueFontSize}px`}
              style:color={darkenHexColor(row.color ?? "#ffffff")}
              style:text-shadow={textShadowCss}
            >[{row.truePercentText}]</span>
          {:else}
            <span class="buff-uptime-true buff-uptime-number"></span>
          {/if}
          <span
            class="buff-uptime-source"
            style:font-size={`${sourceFontSizePx}px`}
            style:text-shadow={textShadowCss}
          >
            {row.sourceText ?? ""}
          </span>
        </div>
      {/each}
    </div>

    {#if editing}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="resize-handle"
        onpointerdown={(e) => startResize(e, { kind: "group", key: "buffUptimeGroupScale" }, groupScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .buff-uptime-group.editable {
    outline: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.45);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
  }

  .buff-uptime-title {
    margin-bottom: 4px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.1;
  }

  .buff-uptime-list {
    display: flex;
    flex-direction: column;
    min-width: 220px;
  }

  .buff-uptime-row {
    display: grid;
    grid-template-columns: minmax(0, max-content) var(--enc-width) var(--true-width) minmax(0, max-content);
    align-items: center;
    column-gap: var(--row-gap);
  }

  .buff-uptime-name-cell {
    display: grid;
    grid-template-columns: 12px minmax(0, var(--label-width));
    align-items: center;
    column-gap: 4px;
  }

  .buff-uptime-indicator {
    width: 12px;
    min-width: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .buff-uptime-indicator-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: rgba(226, 232, 240, 0.22);
    border: 1.5px solid rgba(255, 255, 255, 0.42);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.32);
  }

  .buff-uptime-indicator-dot.active {
    background: radial-gradient(circle at 35% 35%, #bbf7d0 0%, #4ade80 45%, #16a34a 100%);
    border-color: rgba(236, 253, 245, 0.95);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.4),
      0 0 8px rgba(74, 222, 128, 0.92),
      0 0 14px rgba(34, 197, 94, 0.55);
  }

  .buff-uptime-label {
    color: #ffffff;
    font-weight: 600;
    min-width: 0;
    white-space: nowrap;
  }

  .buff-uptime-number {
    display: block;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    min-width: 0;
  }

  .buff-uptime-encounter {
    text-align: right;
    font-weight: 700;
  }

  .buff-uptime-true {
    text-align: right;
    white-space: nowrap;
    font-weight: 800;
  }

  .buff-uptime-source {
    min-width: 0;
    color: #d4d4d8;
    font-style: italic;
    white-space: nowrap;
  }
</style>
