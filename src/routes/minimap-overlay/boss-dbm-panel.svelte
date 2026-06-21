<script lang="ts">
  import TextBuffRow from "$lib/components/TextBuffRow.svelte";
  import { resolveDbmSkillName } from "$lib/config/dbm-table";
  import { createDefaultBossDbmStyle, SETTINGS } from "$lib/settings-store";
  import { formatTimerText } from "../game-overlay/overlay-utils";
  import { overlayNow } from "../game-overlay/overlay-clock.svelte.js";
  import { minimapBossDbmEvents } from "./minimap-runtime.svelte.js";

  type BossDbmRow = {
    key: string;
    label: string;
    valueText: string;
    progressPercent: number;
    createTimeMs: number;
  };

  const rows = $derived.by<BossDbmRow[]>(() => {
    const now = overlayNow();
    return Array.from(minimapBossDbmEvents().values())
      .map((event) => {
        const remainingMs = Math.max(
          0,
          event.createTimeMs + event.durationMs - now,
        );
        if (remainingMs <= 0) return null;
        return {
          key: `${event.baseSkillId}:${event.skillEffectId}`,
          label: resolveDbmSkillName(event.skillEffectId, event.baseSkillId),
          valueText: formatTimerText(remainingMs),
          progressPercent: Math.min(
            100,
            Math.max(0, (remainingMs / event.durationMs) * 100),
          ),
          createTimeMs: event.createTimeMs,
        };
      })
      .filter((row): row is BossDbmRow => row !== null)
      .sort((a, b) => a.createTimeMs - b.createTimeMs);
  });

  const styleConfig = $derived(
    SETTINGS.minimap.state.bossDbmStyle ?? createDefaultBossDbmStyle(),
  );
</script>

{#if rows.length > 0}
  <div class="boss-dbm-panel" style:gap={`${styleConfig.gap}px`}>
    {#each rows as row (row.key)}
      <TextBuffRow
        label={row.label}
        valueText={row.valueText}
        progressPercent={row.progressPercent}
        showProgress={true}
        nameColor={styleConfig.nameColor}
        valueColor={styleConfig.valueColor}
        progressColor={styleConfig.progressColor}
        progressOpacity={styleConfig.progressOpacity}
        fontSize={styleConfig.fontSize}
        columnGap={styleConfig.columnGap}
      />
    {/each}
  </div>
{/if}

<style>
  .boss-dbm-panel {
    display: flex;
    flex-direction: column;
    max-height: min(72vh, 520px);
    padding: 0;
    overflow-y: auto;
    background: transparent;
    border: none;
  }
</style>
