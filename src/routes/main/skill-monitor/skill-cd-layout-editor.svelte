<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "$lib/i18n/index.svelte";
  import type { SkillDisplayInfo } from "$lib/skill-mappings";
  import {
    MAX_SKILL_CD_GRID_SIZE,
    isSkillCdPositionInBounds,
    sameSkillCdPosition,
    skillCdAt,
    type SkillCdAction,
    type SkillCdLayout,
    type SkillCdPosition,
  } from "$lib/skill-cd-layout";

  interface Props {
    layout: SkillCdLayout;
    skills: readonly SkillDisplayInfo[];
    selectedCell: SkillCdPosition | null;
    onSelect: (cell: SkillCdPosition | null) => void;
    onAction: (action: SkillCdAction) => boolean;
  }
  let { layout, skills, selectedCell, onSelect, onAction }: Props = $props();
  let grid = $state<HTMLDivElement>();
  let drag = $state<{
    pointerId: number;
    element: HTMLButtonElement;
    from: SkillCdPosition;
    skillId: number;
    startX: number;
    startY: number;
    active: boolean;
    target: SkillCdPosition | null;
    signature: string;
  } | null>(null);
  let suppressClick = false;
  const signature = $derived(JSON.stringify(layout));
  const skillById = $derived(
    new Map(skills.map((skill) => [skill.skillId, skill])),
  );
  const cells = $derived.by(() =>
    Array.from({ length: layout.rows * layout.columns }, (_, index) => {
      const position = {
        row: Math.floor(index / layout.columns),
        column: index % layout.columns,
      };
      const skillId = skillCdAt(layout, position);
      const skill = skillId === null ? undefined : skillById.get(skillId);
      return {
        ...position,
        key: `${position.row}:${position.column}`,
        skillId,
        skill,
      };
    }),
  );
  const selectedSkillId = $derived(
    selectedCell ? skillCdAt(layout, selectedCell) : null,
  );

  function skillName(skillId: number | null): string {
    return skillId === null
      ? t("skillMonitor.common.empty")
      : skillById.get(skillId)?.name || `#${skillId}`;
  }

  function cancelDrag() {
    const current = drag;
    drag = null;
    if (current?.element.hasPointerCapture(current.pointerId)) {
      current.element.releasePointerCapture(current.pointerId);
    }
    if (current) suppressClick = true;
  }
  onDestroy(cancelDrag);

  function pointerCell(event: PointerEvent): SkillCdPosition | null {
    const element = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-skill-cd-cell]");
    if (!element || !grid?.contains(element)) return null;
    return {
      row: Number(element.dataset["row"]),
      column: Number(element.dataset["column"]),
    };
  }

  function beginDrag(
    event: PointerEvent,
    from: SkillCdPosition,
    skillId: number | null,
  ) {
    if (event.button !== 0) return;
    suppressClick = false;
    if (skillId === null) return;
    const element = event.currentTarget as HTMLButtonElement;
    event.preventDefault();
    element.focus();
    element.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      element,
      from,
      skillId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: from,
      signature,
    };
  }

  function movePointer(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.signature !== signature) {
      cancelDrag();
      return;
    }
    if (
      !drag.active &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4
    ) {
      drag.active = true;
    }
    if (drag.active) drag.target = pointerCell(event);
  }

  function finishDrag(event: PointerEvent) {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    const target = pointerCell(event);
    cancelDrag();
    if (!current.active) {
      if (current.signature === signature) onSelect(current.from);
      return;
    }
    if (target && current.signature === signature)
      moveSkill(current.skillId, current.from, target);
  }

  function moveSkill(
    skillId: number,
    from: SkillCdPosition,
    to: SkillCdPosition,
  ) {
    if (!isSkillCdPositionInBounds(to, layout)) return;
    if (
      onAction({
        kind: "move",
        skillId,
        from,
        to,
        targetSkillId: skillCdAt(layout, to),
        rows: layout.rows,
        columns: layout.columns,
      })
    ) {
      onSelect(to);
      grid
        ?.querySelector<HTMLButtonElement>(
          `[data-row="${to.row}"][data-column="${to.column}"]`,
        )
        ?.focus();
    }
  }

  function cellKeydown(
    event: KeyboardEvent,
    cell: SkillCdPosition,
    skillId: number | null,
  ) {
    if (drag) return;
    if (event.key === "Enter" || event.key === " ") suppressClick = false;
    if (event.key === "Delete" && skillId !== null) {
      event.preventDefault();
      onSelect(cell);
      onAction({ kind: "remove", skillId });
    }
    const directions: Record<string, SkillCdPosition> = {
      ArrowUp: { row: -1, column: 0 },
      ArrowDown: { row: 1, column: 0 },
      ArrowLeft: { row: 0, column: -1 },
      ArrowRight: { row: 0, column: 1 },
    };
    const delta = directions[event.key];
    if (event.altKey && delta && skillId !== null) {
      event.preventDefault();
      event.stopPropagation();
      moveSkill(skillId, cell, {
        row: cell.row + delta.row,
        column: cell.column + delta.column,
      });
    }
  }

  function resize(event: Event, dimension: "rows" | "columns") {
    cancelDrag();
    const input = event.currentTarget as HTMLInputElement;
    onAction({
      kind: "resize",
      rows: layout.rows,
      columns: layout.columns,
      [dimension]: input.valueAsNumber,
    });
    // Restore a rejected edit even when the controlled prop did not change.
    input.value = String(layout[dimension]);
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape") {
      cancelDrag();
      onSelect(null);
    }
  }}
/>

<div class="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4">
  <div>
    <h2 class="text-base font-semibold text-foreground">
      {t("skillMonitor.skillCd.preview.title")}
    </h2>
    <p class="text-xs text-muted-foreground">
      {t("skillMonitor.skillCd.preview.description")}
    </p>
  </div>
  <div class="flex flex-wrap items-end gap-3">
    {#each ["rows", "columns"] as dimension (dimension)}
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        {t(
          dimension === "rows"
            ? "skillMonitor.skillCd.layout.rows"
            : "skillMonitor.skillCd.layout.columns",
        )}
        <input
          type="number"
          min="1"
          max={MAX_SKILL_CD_GRID_SIZE}
          step="1"
          class="w-20 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          value={dimension === "rows" ? layout.rows : layout.columns}
          onchange={(event) =>
            resize(event, dimension === "rows" ? "rows" : "columns")}
        />
      </label>
    {/each}
    <button
      type="button"
      class="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted/40"
      onclick={() => {
        cancelDrag();
        onAction({ kind: "compact" });
        onSelect(null);
      }}
    >
      {t("skillMonitor.skillCd.layout.compact")}
    </button>
  </div>
  <p class="text-xs text-muted-foreground">
    {t("skillMonitor.skillCd.layout.help")}
  </p>
  <div class="overflow-x-auto p-1">
    <div
      bind:this={grid}
      class="layout-grid"
      style:grid-template-columns={`repeat(${layout.columns}, 56px)`}
    >
      {#each cells as cell (cell.key)}
        <button
          type="button"
          data-skill-cd-cell
          data-row={cell.row}
          data-column={cell.column}
          class="layout-cell relative overflow-hidden rounded-md border border-border/60 bg-muted/20 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          class:selected={sameSkillCdPosition(selectedCell, cell)}
          class:drop-target={drag?.active &&
            sameSkillCdPosition(drag.target, cell)}
          class:drag-source={drag?.active && drag.skillId === cell.skillId}
          class:occupied={cell.skillId !== null}
          aria-label={t("skillMonitor.skillCd.layout.cell", {
            row: cell.row + 1,
            column: cell.column + 1,
            skill: skillName(cell.skillId),
          })}
          aria-pressed={sameSkillCdPosition(selectedCell, cell)}
          title={skillName(cell.skillId)}
          onpointerdown={(event) =>
            beginDrag(
              event,
              { row: cell.row, column: cell.column },
              cell.skillId,
            )}
          onpointermove={movePointer}
          onpointerup={finishDrag}
          onpointercancel={cancelDrag}
          onlostpointercapture={cancelDrag}
          onkeydown={(event) => cellKeydown(event, cell, cell.skillId)}
          onclick={() => {
            if (suppressClick) {
              suppressClick = false;
              return;
            }
            onSelect({ row: cell.row, column: cell.column });
          }}
        >
          {#if cell.skill?.imagePath}
            <img
              src={cell.skill.imagePath}
              alt=""
              draggable="false"
              class="pointer-events-none size-full object-cover"
            />
          {:else if cell.skillId !== null}
            #{cell.skillId}
          {:else}
            <span aria-hidden="true">{cell.row + 1},{cell.column + 1}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
  <div
    class="flex min-h-8 flex-wrap items-center gap-3 text-xs text-muted-foreground"
    aria-live="polite"
  >
    {#if selectedCell}
      <span
        >{t("skillMonitor.skillCd.layout.cell", {
          row: selectedCell.row + 1,
          column: selectedCell.column + 1,
          skill: skillName(selectedSkillId),
        })}</span
      >
      {#if selectedSkillId !== null}
        <button
          type="button"
          class="rounded border border-border px-2 py-1 hover:bg-muted/40"
          onclick={() => {
            if (selectedSkillId !== null)
              onAction({ kind: "remove", skillId: selectedSkillId });
          }}
        >
          {t("skillMonitor.common.remove")}
        </button>
      {/if}
    {:else}
      <span>{t("skillMonitor.skillCd.layout.selectHint")}</span>
    {/if}
  </div>
</div>

<style>
  .layout-grid {
    display: grid;
    gap: 8px;
    width: max-content;
  }
  .layout-cell {
    width: 56px;
    height: 56px;
    touch-action: none;
    user-select: none;
  }
  .occupied {
    cursor: grab;
  }
  .selected {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .drop-target {
    box-shadow: inset 0 0 0 3px var(--primary);
    border-color: var(--primary);
  }
  .drag-source {
    opacity: 0.5;
    cursor: grabbing;
  }
</style>
