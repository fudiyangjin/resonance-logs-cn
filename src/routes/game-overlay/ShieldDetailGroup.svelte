<script lang="ts">
  import { resolveBuffDisplayName } from "$lib/config/buff-name-table";
  import { untrack } from "svelte";
  import {
    buffAliases,
    getGroupPosition,
    getGroupScale,
    isEditing,
    shieldDetailEntries,
    shieldDetailHp,
    shieldDetailStyle,
    startDrag,
    startResize,
    overlayNow,
  } from "./overlay-state.svelte.js";

  const editing = $derived(isEditing());
  const groupPos = $derived(getGroupPosition("shieldDetailGroup"));
  const groupScale = $derived(getGroupScale("shieldDetailGroupScale"));
  const hp = $derived(shieldDetailHp());
  const entries = $derived(shieldDetailEntries());
  const style = $derived(shieldDetailStyle());
  const now = $derived(overlayNow());
  const aliases = $derived(buffAliases());

  const totalShield = $derived(
    entries.reduce((sum, e) => sum + e.current, 0),
  );
  const hasData = $derived(hp.max > 0 || entries.length > 0);

  // Track previous shield values to detect which buff was recently reduced
  let prevShieldMap = $state<Map<number, number>>(new Map());
  let lastReducedUuid = $state<number | null>(null);

  $effect(() => {
    // Subscribe to entries, but read prevShieldMap without tracking
    const currentEntries = entries;
    untrack(() => {
      const newMap = new Map<number, number>();
      for (const entry of currentEntries) {
        const prev = prevShieldMap.get(entry.buffUuid);
        if (prev !== undefined && entry.current < prev) {
          lastReducedUuid = entry.buffUuid;
        }
        newMap.set(entry.buffUuid, entry.current);
      }
      prevShieldMap = newMap;
    });
  });

  // Sort entries: last reduced buff first, then by current descending
  const sortedEntries = $derived(
    [...entries].sort((a, b) => {
      if (a.buffUuid === lastReducedUuid) return -1;
      if (b.buffUuid === lastReducedUuid) return 1;
      return b.current - a.current;
    }),
  );

  // Total shield bar layers (each layer = hp.max capacity)
  // Returns layers from bottom (lightest) to top (darkest for overflow)
  function shieldLayers(total: number, maxHp: number): { pct: number; darken: number }[] {
    if (maxHp <= 0 || total <= 0) return [];
    const layers: { pct: number; darken: number }[] = [];
    let remaining = total;
    let layerIndex = 0;
    while (remaining > 0) {
      const portion = Math.min(remaining, maxHp);
      const pct = (portion / maxHp) * 100;
      // darken increases per layer: 0, 0.25, 0.45, 0.6...
      layers.push({ pct, darken: layerIndex === 0 ? 0 : 0.15 + layerIndex * 0.15 });
      remaining -= portion;
      layerIndex++;
      if (layerIndex > 10) break; // safety limit
    }
    return layers;
  }

  function formatNum(v: number): string {
    return v.toLocaleString();
  }

  function hpPct(current: number, max: number): number {
    return max > 0 ? Math.min(100, (current / max) * 100) : 0;
  }

  function entryPct(current: number, max: number): number {
    return max > 0 ? Math.min(100, (current / max) * 100) : 0;
  }

  function entryColor(displayType: number): string {
    return displayType === 12 ? style.healShieldColor : style.shieldColor;
  }

  function entryName(baseId: number, buffUuid: number, displayType: number): string {
    if (baseId > 0) {
      return resolveBuffDisplayName(baseId, aliases);
    }
    // base_id unknown, show buff_uuid so user can identify
    const typeSuffix = displayType === 12 ? "奶转盾" : "护盾";
    return `${typeSuffix}#${buffUuid}`;
  }

  function remainingText(expireTimeMs: number): string {
    if (expireTimeMs <= 0) return "";
    const remaining = Math.max(0, expireTimeMs - now);
    if (remaining <= 0) return "";
    return `${(remaining / 1000).toFixed(1)}s`;
  }
</script>

{#if hasData || editing}
  <div
    class="overlay-group shield-detail-group"
    class:editable={editing}
    style:left={`${groupPos.x}px`}
    style:top={`${groupPos.y}px`}
    style:transform={`scale(${groupScale})`}
    style:transform-origin="top left"
    onpointerdown={(e) => startDrag(e, { kind: "group", key: "shieldDetailGroup" }, groupPos)}
  >
    {#if editing}
      <div class="group-tag">血量护盾区</div>
    {/if}

    <div class="shield-detail-list" style:gap={`${style.gap}px`} style:font-size={`${style.fontSize}px`}>
      <!-- HP bar (health only, red unfilled) -->
      {#if hasData}
        {@const hpPercent = hpPct(hp.current, hp.max)}
        <div class="detail-row">
          <span class="row-label hp-label">HP</span>
          <div class="bar-container" style:width={`${style.barWidth}px`}>
            <div class="bar-bg hp-bar-bg">
              <div class="bar-fill" style:width={`${hpPercent}%`} style:background={style.hpColor}></div>
            </div>
            <span class="bar-text">
              {formatNum(hp.current)} / {formatNum(hp.max)}
            </span>
          </div>
        </div>

        <!-- Total shield bar (multi-layer if exceeds HP max) -->
        {#if totalShield > 0}
          {@const layers = shieldLayers(totalShield, hp.max)}
          <div class="detail-row">
            <span class="row-label hp-label">盾</span>
            <div class="bar-container" style:width={`${style.barWidth}px`}>
              <div class="bar-bg">
                {#each layers as layer, i}
                  <div
                    class="bar-fill shield-layer"
                    style:width={`${layer.pct}%`}
                    style:background={style.shieldColor}
                    style:z-index={i + 1}
                  ></div>
                  {#if layer.darken > 0}
                    <div
                      class="bar-fill shield-layer-darken"
                      style:width={`${layer.pct}%`}
                      style:background={`rgba(0,0,0,${layer.darken})`}
                      style:z-index={i + 1}
                    ></div>
                  {/if}
                {/each}
              </div>
              <span class="bar-text" style:z-index={layers.length + 2}>
                {formatNum(totalShield)} / {formatNum(hp.max)}
                {#if totalShield > hp.max}
                  <span class="shield-val">({(totalShield / hp.max * 100).toFixed(0)}%)</span>
                {/if}
              </span>
            </div>
          </div>
        {/if}

        <!-- Per-buff shield entries (sorted: recently reduced first) -->
        {#each sortedEntries as entry (entry.buffUuid)}
          {@const pct = entryPct(entry.current, entry.maxShield)}
          {@const name = entryName(entry.baseId, entry.buffUuid, entry.displayType)}
          {@const timeText = remainingText(entry.expireTimeMs)}
          <div class="detail-row entry-row">
            <span class="row-label entry-label" title={`UUID: ${entry.buffUuid} · baseId: ${entry.baseId}`}>
              {name}
            </span>
            <div class="bar-container" style:width={`${style.barWidth}px`}>
              <div class="bar-bg">
                <div class="bar-fill" style:width={`${pct}%`} style:background={entryColor(entry.displayType)}></div>
              </div>
              <span class="bar-text">
                {formatNum(entry.current)} / {formatNum(entry.maxShield)}
              </span>
            </div>
            {#if timeText}
              <span class="time-text">{timeText}</span>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    {#if editing}
      <div
        class="resize-handle"
        onpointerdown={(e) =>
          startResize(e, { kind: "group", key: "shieldDetailGroupScale" }, groupScale)}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .shield-detail-group.editable {
    border: 2px solid rgba(102, 204, 255, 0.9);
    border-radius: 10px;
    background: rgba(20, 36, 56, 0.45);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    padding: 8px;
    min-width: 260px;
    min-height: 80px;
  }

  .shield-detail-list {
    display: flex;
    flex-direction: column;
  }

  .detail-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }

  .row-label {
    color: rgba(220, 220, 255, 0.95);
    width: 96px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
    flex-shrink: 0;
    text-align: right;
  }

  .hp-label {
    font-weight: 600;
  }

  .entry-label {
    font-size: 0.9em;
    opacity: 0.85;
  }

  .bar-container {
    position: relative;
    height: 1.4em;
    flex-shrink: 0;
  }

  .bar-bg {
    position: absolute;
    inset: 0;
    background: rgba(30, 30, 40, 0.65);
    border-radius: 3px;
    overflow: hidden;
  }

  .hp-bar-bg {
    background: rgba(180, 40, 40, 0.55);
  }

  .bar-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 3px;
    transition: width 0.15s ease;
  }

  .bar-text {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.95);
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
    font-size: 0.85em;
    line-height: 1;
    white-space: nowrap;
    pointer-events: none;
  }

  .shield-val {
    color: rgba(253, 230, 138, 0.95);
    margin-left: 2px;
  }

  .time-text {
    color: rgba(220, 220, 255, 0.85);
    font-size: 0.85em;
    white-space: nowrap;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
    flex-shrink: 0;
    min-width: 32px;
    text-align: right;
  }

  .resize-handle {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 14px;
    height: 14px;
    background: rgba(102, 204, 255, 0.9);
    border-radius: 50%;
    cursor: nwse-resize;
  }
</style>
