export const MAX_MONITORED_SKILLS = 10;
export const MAX_SKILL_CD_GRID_SIZE = 10;

export type SkillCdPosition = { row: number; column: number };
export type SkillCdLayout = {
  rows: number;
  columns: number;
  positions: Record<number, SkillCdPosition>;
};
export type SkillCdSelection = {
  monitoredSkillIds: readonly number[];
  skillCdLayout?: SkillCdLayout | undefined;
};
export type SkillCdEntry = SkillCdPosition & { skillId: number };

function copyPosition({ row, column }: SkillCdPosition): SkillCdPosition {
  return { row, column };
}

export function createDefaultSkillCdLayout(): SkillCdLayout {
  return { rows: 2, columns: 5, positions: {} };
}

export function skillCdIds(ids: readonly number[]): number[] {
  return [
    ...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ].slice(0, MAX_MONITORED_SKILLS);
}

function gridSize(value: number | undefined, fallback: number): number {
  return Number.isFinite(value)
    ? Math.max(1, Math.min(MAX_SKILL_CD_GRID_SIZE, Math.round(value!)))
    : fallback;
}

export function sameSkillCdPosition(
  a: SkillCdPosition | undefined | null,
  b: SkillCdPosition | undefined | null,
): boolean {
  return !!a && !!b && a.row === b.row && a.column === b.column;
}

export function isSkillCdPositionInBounds(
  position: SkillCdPosition | undefined | null,
  layout: Pick<SkillCdLayout, "rows" | "columns">,
): position is SkillCdPosition {
  return (
    !!position &&
    Number.isInteger(position.row) &&
    Number.isInteger(position.column) &&
    position.row >= 0 &&
    position.column >= 0 &&
    position.row < layout.rows &&
    position.column < layout.columns
  );
}

export function skillCdAt(
  layout: SkillCdLayout,
  position: SkillCdPosition,
): number | null {
  const entry = Object.entries(layout.positions).find(([, cell]) =>
    sameSkillCdPosition(cell, position),
  );
  return entry ? Number(entry[0]) : null;
}

function firstEmptyCell(layout: SkillCdLayout): SkillCdPosition | undefined {
  for (let row = 0; row < layout.rows; row++) {
    for (let column = 0; column < layout.columns; column++) {
      const cell = { row, column };
      if (skillCdAt(layout, cell) === null) return cell;
    }
  }
  return undefined;
}

/** Preserve valid coordinates before assigning missing skills, even when a
 * missing skill precedes a positioned skill in the legacy membership list. */
export function normalizeSkillCdLayout(
  selection: SkillCdSelection,
): SkillCdLayout {
  const current = selection.skillCdLayout;
  const ids = skillCdIds(selection.monitoredSkillIds);
  const layout: SkillCdLayout = {
    rows: gridSize(current?.rows, 2),
    columns: gridSize(current?.columns, 5),
    positions: {},
  };
  for (const id of ids) {
    const position = current?.positions?.[id];
    if (
      isSkillCdPositionInBounds(position, layout) &&
      skillCdAt(layout, position) === null
    ) {
      layout.positions[id] = copyPosition(position);
    }
  }
  // Reading persisted settings may repair insufficient capacity. Interactive
  // resize below rejects overflow instead of silently moving a user's skills.
  layout.rows = Math.max(layout.rows, Math.ceil(ids.length / layout.columns));
  for (const id of ids) {
    if (layout.positions[id]) continue;
    const cell = firstEmptyCell(layout);
    if (cell) layout.positions[id] = cell;
  }
  return layout;
}

export function skillCdEntries(
  layout: SkillCdLayout,
  ids: readonly number[],
): SkillCdEntry[] {
  return skillCdIds(ids).flatMap((skillId) => {
    const position = layout.positions[skillId];
    return position ? [{ skillId, ...copyPosition(position) }] : [];
  });
}

/** Keep the grid origin and internal gaps; only trim trailing rows/columns. */
export function skillCdBounds(layout: SkillCdLayout): {
  rows: number;
  columns: number;
} {
  const positions = Object.values(layout.positions);
  return {
    rows: Math.max(0, ...positions.map((position) => position.row + 1)),
    columns: Math.max(0, ...positions.map((position) => position.column + 1)),
  };
}

export type SkillCdAction =
  | {
      kind: "toggle";
      skillId: number;
      preferredCell?: SkillCdPosition | undefined;
    }
  | { kind: "remove"; skillId: number }
  | { kind: "clear" }
  | { kind: "compact" }
  | { kind: "resize"; rows: number; columns: number }
  | {
      kind: "move";
      skillId: number;
      from: SkillCdPosition;
      to: SkillCdPosition;
      targetSkillId: number | null;
      rows: number;
      columns: number;
    };

export type SkillCdChange =
  | { ok: true; monitoredSkillIds: number[]; skillCdLayout: SkillCdLayout }
  | {
      ok: false;
      reason: "limit" | "full" | "invalidSize" | "overflow" | "stale";
      skillIds: number[];
    };

/** All membership and layout changes commit together through the profile writer. */
export function changeSkillCdSelection(
  selection: SkillCdSelection,
  action: SkillCdAction,
): SkillCdChange {
  let ids = skillCdIds(selection.monitoredSkillIds);
  const layout = normalizeSkillCdLayout(selection);
  const error = (
    reason: Extract<SkillCdChange, { ok: false }>["reason"],
    skillIds: number[] = [],
  ): SkillCdChange => ({ ok: false, reason, skillIds });

  switch (action.kind) {
    case "toggle":
    case "remove": {
      if (ids.includes(action.skillId)) {
        ids = ids.filter((id) => id !== action.skillId);
        delete layout.positions[action.skillId];
      } else if (action.kind === "toggle") {
        if (!Number.isSafeInteger(action.skillId) || action.skillId <= 0)
          return error("stale");
        if (ids.length >= MAX_MONITORED_SKILLS) return error("limit");
        const preferred = action.preferredCell;
        const cell =
          isSkillCdPositionInBounds(preferred, layout) &&
          skillCdAt(layout, preferred) === null
            ? preferred
            : firstEmptyCell(layout);
        if (!cell) return error("full");
        ids.push(action.skillId);
        layout.positions[action.skillId] = copyPosition(cell);
      }
      break;
    }
    case "clear":
      ids = [];
      layout.positions = {};
      break;
    case "resize": {
      if (
        ![action.rows, action.columns].every(
          (n) => Number.isInteger(n) && n >= 1 && n <= MAX_SKILL_CD_GRID_SIZE,
        )
      ) {
        return error("invalidSize");
      }
      const overflow = ids.filter(
        (id) => !isSkillCdPositionInBounds(layout.positions[id], action),
      );
      if (overflow.length) return error("overflow", overflow);
      layout.rows = action.rows;
      layout.columns = action.columns;
      break;
    }
    case "compact": {
      const ordered = skillCdEntries(layout, ids).sort(
        (a, b) => a.row - b.row || a.column - b.column,
      );
      layout.columns = Math.max(1, Math.min(layout.columns, ids.length));
      layout.rows = Math.max(1, Math.ceil(ids.length / layout.columns));
      layout.positions = Object.fromEntries(
        ordered.map(({ skillId }, index) => [
          skillId,
          {
            row: Math.floor(index / layout.columns),
            column: index % layout.columns,
          },
        ]),
      );
      break;
    }
    case "move": {
      if (
        action.rows !== layout.rows ||
        action.columns !== layout.columns ||
        !sameSkillCdPosition(layout.positions[action.skillId], action.from) ||
        !isSkillCdPositionInBounds(action.to, layout) ||
        skillCdAt(layout, action.to) !== action.targetSkillId
      )
        return error("stale");
      if (action.targetSkillId !== null)
        layout.positions[action.targetSkillId] = copyPosition(action.from);
      layout.positions[action.skillId] = copyPosition(action.to);
      break;
    }
  }
  return { ok: true, monitoredSkillIds: ids, skillCdLayout: layout };
}
