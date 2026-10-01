<script lang="ts">
  import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
  import { SETTINGS } from "$lib/settings-store";
  import { untrack } from "svelte";
  import { minimapSkillCasts } from "./minimap-runtime.svelte.js";
  import { slotColor } from "./colors";
  import { sortLocalFirst } from "./mechanic-row";
  import MinimapTimer from "./MinimapTimer.svelte";
  import { resolveScene } from "./scene-registry";
  import type { MechanicRow, MechanicRowTarget } from "./scene-types";

  let { snapshot }: { snapshot: MinimapSnapshot | null } = $props();

  const infoPanelStyle = $derived(SETTINGS.minimap.state.infoPanelStyle);
  const localRingColor = $derived(
    SETTINGS.minimap.state.localRing?.color ?? "#ffffff",
  );
  const backgroundVar = $derived.by(() => {
    const opacity = Math.max(
      0,
      Math.min(1, Number(infoPanelStyle?.backgroundOpacity ?? 0.76)),
    );
    return `rgba(15, 23, 42, ${opacity})`;
  });

  type SkillGroup = { group: string; rows: MechanicRow[] };
  type ChipTarget = MechanicRowTarget & { safe?: boolean };

  function displayName(entity: MinimapEntity): string {
    if (entity.name) return entity.name;
    return entity.entityUuid.length > 6
      ? `...${entity.entityUuid.slice(-4)}`
      : entity.entityUuid;
  }

  const groups = $derived.by<SkillGroup[]>(() => {
    const currentSnapshot = snapshot;
    if (!currentSnapshot) return [];
    const scene = resolveScene(currentSnapshot.sceneId);
    const skillCasts = minimapSkillCasts();
    const view = untrack(() =>
      scene?.resolveView(currentSnapshot, displayName, skillCasts),
    );
    if (!view) return [];
    const skillRows = untrack(
      () =>
        scene?.resolveSkillRows?.({
          skillCasts,
          displayName,
        }) ?? [],
    );
    const groups: SkillGroup[] = [];
    for (const row of [...view.rows, ...skillRows]) {
      const existing = groups.find((group) => group.group === row.group);
      if (existing) {
        existing.rows.push(row);
      } else {
        groups.push({ group: row.group, rows: [row] });
      }
    }
    return groups.map((group) => ({
      ...group,
      rows: group.rows.sort(
        (a, b) => a.colorSlot - b.colorSlot || a.label.localeCompare(b.label),
      ),
    }));
  });

  function displayTargets(row: MechanicRow): ChipTarget[] {
    if (row.targetStatus && row.targetStatus.length > 0) {
      return sortLocalFirst(row.targetStatus);
    }
    return sortLocalFirst(row.targets);
  }

  function targetText(row: MechanicRow): string {
    return displayTargets(row)
      .map((target) => target.name)
      .join(", ");
  }
</script>

{#snippet targetChip(target: ChipTarget, showStatus: boolean)}
  <span
    class="target-chip"
    class:is-local={target.isLocal}
    class:status-chip={showStatus}
    style:color={showStatus ? (target.safe ? "#22c55e" : "#ef4444") : undefined}
    style:--self-ring={localRingColor}
  >
    {#if showStatus}{target.safe ? "✓" : "✗"}{/if}{target.name}
  </span>
{/snippet}

<div class="infobar" style:background={backgroundVar}>
  {#if groups.length === 0}
    <p class="empty">无机制</p>
  {:else}
    {#each groups as group (group.group)}
      {@const head = slotColor(group.rows[0]?.colorSlot ?? 0)}
      <section class="skill-group" style:--accent={head}>
        <h3>{group.group}</h3>
        {#each group.rows as row (row.key)}
          {@const color = slotColor(row.colorSlot)}
          {@const chips = displayTargets(row)}
          {@const showStatus = Boolean(
            row.targetStatus && row.targetStatus.length > 0,
          )}
          <div class="buff-row">
            <span class="dot" style:background={color} style:color></span>
            <span class="text" title={targetText(row)}>
              <span class="label">{row.label}</span>
              {#if chips.length > 0}
                <span class="targets">
                  {#each chips as chip (chip.uuid)}
                    {@render targetChip(chip, showStatus)}
                  {/each}
                </span>
              {/if}
            </span>
            {#if !row.hideTimer}
              <MinimapTimer {row} />
            {/if}
          </div>
        {/each}
      </section>
    {/each}
  {/if}
</div>

<style>
  .infobar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    color: #e2e8f0;
    font-size: 12px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-radius: 14px;
    box-shadow:
      0 16px 44px rgba(15, 23, 42, 0.32),
      inset 0 1px 0 rgba(248, 250, 252, 0.06);
  }
  .empty {
    margin: 0;
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.5;
  }
  .skill-group {
    padding: 2px 0 2px 8px;
    border-left: 2px solid var(--accent, #fbbf24);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    color: #cbd5e1;
  }
  .buff-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-height: 24px;
  }
  .dot {
    width: 9px;
    height: 9px;
    margin-top: 7px;
    border-radius: 50%;
    flex: none;
    box-shadow: 0 0 8px currentColor;
  }
  .text {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 1px;
    font-size: 13px;
    color: #f1f5f9;
    line-height: 1.25;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }
  .targets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
    min-width: 0;
    color: #cbd5e1;
    font-size: 11px;
  }
  .target-chip {
    max-width: 100%;
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .target-chip.is-local {
    padding: 0 5px;
    border: 1.5px solid var(--self-ring, #fff);
    border-radius: 4px;
    font-weight: 700;
    color: #f8fafc;
    background: rgba(248, 250, 252, 0.08);
  }
  .status-chip {
    font-weight: 700;
  }
</style>
