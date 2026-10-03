<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import { SETTINGS, type TeammateCdSlotKind } from "$lib/settings-store";
  import { findAnySkillByBaseId, getClassConfigs } from "$lib/skill-mappings";
  import {
    liveMonsterStore,
    liveTeamStore,
  } from "$lib/stores/live-topics.svelte";
  import { overlayNow } from "../game-overlay/overlay-clock.svelte.js";
  import { computeDisplay } from "../game-overlay/overlay-utils";
  import SkillCdCell from "../game-overlay/SkillCdCell.svelte";
  import {
    getTeammateCdSlotsPosition,
    isMonsterEditing,
    startMonsterDrag,
    teammateCdPanelStyle,
  } from "./monster-state.svelte.js";
  import {
    buildTeammateCdSlots,
    teammateCdGridSlots,
    teammateCdSlotPlacement,
  } from "./monster-teammate-cd";

  /** Empty icons per editor placeholder, enough to line a row up. */
  const PLACEHOLDER_CELLS = [0, 1, 2];

  const editing = $derived(isMonsterEditing());
  const slotLayout = $derived(teammateCdPanelStyle().slots);
  const team = $derived(liveTeamStore.data);
  // The editor shows the grid picked in the settings tab; otherwise the
  // current team decides which panel the game draws.
  const kind = $derived<TeammateCdSlotKind>(
    editing
      ? slotLayout.previewKind
      : (team?.layout?.kind ?? slotLayout.previewKind),
  );
  const layout = $derived(team?.layout?.kind === kind ? team.layout : null);
  const position = $derived(getTeammateCdSlotsPosition(kind));
  const classKeyById = $derived(
    new Map(
      getClassConfigs().map((config) => [config.classId, config.classKey]),
    ),
  );
  const dead = $derived(new Set(liveMonsterStore.data?.deadTeammates ?? []));

  const slots = $derived.by(() =>
    buildTeammateCdSlots({
      teammates: team?.teammates ?? [],
      linkOnline: team?.linkOnline ?? false,
      layout,
      selection: SETTINGS.monsterMonitor.state.teammateCdSkills ?? {},
      classKeyOf: (classId) => classKeyById.get(classId),
      skillInfo: (classKey, skillId) => findAnySkillByBaseId(classKey, skillId),
      dead,
      now: overlayNow(),
      display: computeDisplay,
    }),
  );

  const occupied = $derived(
    new Set(slots.map((slot) => `${slot.group}:${slot.row}`)),
  );
  const placeholders = $derived(
    editing
      ? teammateCdGridSlots(kind).filter(
          (slot) => !occupied.has(`${slot.group}:${slot.row}`),
        )
      : [],
  );
</script>

{#if slots.length > 0 || editing}
  <div
    class="overlay-group teammate-cd-slots"
    class:editable={editing}
    style:left={`${position.x}px`}
    style:top={`${position.y}px`}
    style:--icon-gap={`${slotLayout.iconGap}px`}
    onpointerdown={(event) =>
      startMonsterDrag(
        event,
        { kind: "teammateCdSlots", grid: kind },
        position,
      )}
  >
    {#if editing}
      <div class="group-tag">
        {t("monsterOverlay.teammateCdGroupTag")} · {t(
          `monsterOverlay.teammateCd.slotKind.${kind}`,
        )}
      </div>
    {/if}

    {#each placeholders as slot (slot.number)}
      {@const placement = teammateCdSlotPlacement(
        slotLayout,
        kind,
        slot.group,
        slot.row,
      )}
      <div
        class="slot-row placeholder"
        class:left={placement.side === "left"}
        style:left={`${placement.left}px`}
        style:top={`${placement.top}px`}
      >
        {#each PLACEHOLDER_CELLS as cell (cell)}
          <SkillCdCell size={slotLayout.iconSize} />
        {/each}
        <span class="slot-number">{slot.number}</span>
      </div>
    {/each}

    {#each slots as slot (slot.teammateEntityUuid)}
      {@const placement = teammateCdSlotPlacement(
        slotLayout,
        kind,
        slot.group,
        slot.row,
      )}
      <div
        class="slot-row"
        class:left={placement.side === "left"}
        class:stale={slot.isStale}
        class:dead={slot.isDead}
        style:left={`${placement.left}px`}
        style:top={`${placement.top}px`}
      >
        {#each slot.cells as cell (cell.skillId)}
          <SkillCdCell
            skillId={cell.skillId}
            name={cell.name}
            imagePath={cell.imagePath}
            display={cell.display}
            size={slotLayout.iconSize}
          />
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .teammate-cd-slots.editable {
    cursor: move;
  }

  .slot-row {
    position: absolute;
    display: flex;
    gap: var(--icon-gap);
  }

  /* Grows away from the team panel, first skill nearest to it. */
  .slot-row.left {
    flex-direction: row-reverse;
    transform: translateX(-100%);
  }

  .slot-row.stale,
  .slot-row.placeholder {
    opacity: 0.55;
  }

  .slot-row.dead {
    opacity: 0.35;
  }

  .slot-row.placeholder {
    outline: 1px dashed var(--overlay-edit-panel-border);
    outline-offset: 1px;
  }

  .slot-number {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    text-shadow:
      0 0 3px rgba(0, 0, 0, 1),
      0 1px 2px rgba(0, 0, 0, 0.9);
    pointer-events: none;
  }
</style>
