export const MAX_MONITORED_SKILLS = 10;
export const MAX_SKILL_CD_GRID_SIZE = 10;
/** Every region must be able to hold a skill, so the skill cap bounds it. */
export const MAX_SKILL_CD_REGIONS = MAX_MONITORED_SKILLS;
export const DEFAULT_SKILL_CD_REGION_ID = "skill_cd_region_1";
export const SKILL_CD_REGION_SCALE_MIN = 0.5;
export const SKILL_CD_REGION_SCALE_MAX = 2.5;
export const SKILL_CD_GAP_MAX = 24;
export const DEFAULT_SKILL_CD_GAP = 2;

// Mirrors DEFAULT_OVERLAY_POSITIONS.skillCdGroup; settings-store imports this
// module at runtime, so it cannot import the overlay constants back.
const DEFAULT_REGION_POSITION: SkillCdPoint = { x: 40, y: 40 };
const REGION_OFFSET = 40;

export type SkillCdPosition = { row: number; column: number };
export type SkillCdLayout = {
  rows: number;
  columns: number;
  positions: Record<number, SkillCdPosition>;
};
export type SkillCdPoint = { x: number; y: number };
/** One overlay grid of the skill CD HUD. A monitored skill sits in exactly
 * one region; `name` "" displays as the region's ordinal. */
export type SkillCdRegion = SkillCdLayout & {
  id: string;
  name: string;
  position: SkillCdPoint;
  scale: number;
  /** Space between icons in px, before `scale`. */
  gap: number;
};
export type SkillCdSelection = {
  monitoredSkillIds: readonly number[];
  skillCdRegions?: readonly SkillCdRegion[] | undefined;
  /** @deprecated Single-grid layout, read only to build region 1. */
  skillCdLayout?: SkillCdLayout | undefined;
  /** Legacy single-grid overlay placement, the fallback for region 1. */
  overlayPositions?: { skillCdGroup?: SkillCdPoint } | undefined;
  overlaySizes?: { skillCdGroupScale?: number } | undefined;
};
export type SkillCdEntry = SkillCdPosition & { skillId: number };

function copyPosition({ row, column }: SkillCdPosition): SkillCdPosition {
  return { row, column };
}

export function createDefaultSkillCdRegion(
  id = DEFAULT_SKILL_CD_REGION_ID,
  position: SkillCdPoint = DEFAULT_REGION_POSITION,
): SkillCdRegion {
  return {
    id,
    name: "",
    rows: 2,
    columns: 5,
    positions: {},
    position: { ...position },
    scale: 1,
    gap: DEFAULT_SKILL_CD_GAP,
  };
}

export function skillCdIds(ids: readonly number[]): number[] {
  return [
    ...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ].slice(0, MAX_MONITORED_SKILLS);
}

function gridSize(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(MAX_SKILL_CD_GRID_SIZE, Math.round(value)))
    : fallback;
}

export function clampSkillCdRegionScale(value: number): number {
  return Math.max(
    SKILL_CD_REGION_SCALE_MIN,
    Math.min(SKILL_CD_REGION_SCALE_MAX, value),
  );
}

function finitePoint(value: unknown): SkillCdPoint | null {
  if (!value || typeof value !== "object") return null;
  const { x, y } = value as Partial<SkillCdPoint>;
  return typeof x === "number" &&
    typeof y === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y)
    ? { x, y }
    : null;
}

function finiteScale(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? clampSkillCdRegionScale(value)
    : null;
}

function gapSize(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(SKILL_CD_GAP_MAX, Math.round(value)))
    : DEFAULT_SKILL_CD_GAP;
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

/** The preferred cell when it is free, else the first free cell. */
function freeCell(
  layout: SkillCdLayout,
  preferred: SkillCdPosition | undefined,
): SkillCdPosition | undefined {
  return isSkillCdPositionInBounds(preferred, layout) &&
    skillCdAt(layout, preferred) === null
    ? copyPosition(preferred)
    : firstEmptyCell(layout);
}

function rawRegions(selection: SkillCdSelection): Partial<SkillCdRegion>[] {
  const regions = Array.isArray(selection.skillCdRegions)
    ? selection.skillCdRegions
    : [];
  const source: unknown[] =
    regions.length > 0
      ? regions
      : [
          {
            id: DEFAULT_SKILL_CD_REGION_ID,
            rows: selection.skillCdLayout?.rows,
            columns: selection.skillCdLayout?.columns,
            positions: selection.skillCdLayout?.positions,
          },
        ];
  return source
    .slice(0, MAX_SKILL_CD_REGIONS)
    .map((region) =>
      region && typeof region === "object"
        ? (region as Partial<SkillCdRegion>)
        : {},
    );
}

/** Explicit unique ids keep their value; blank or repeated ones get the
 * first free `skill_cd_region_<n>` from their ordinal, so repeated
 * normalization is stable across windows. */
function regionIds(raw: readonly Partial<SkillCdRegion>[]): string[] {
  const explicit = raw.map((region) =>
    typeof region.id === "string" ? region.id.trim() : "",
  );
  const reserved = new Set<string>();
  const kept = explicit.map((id) => {
    if (!id || reserved.has(id)) return false;
    reserved.add(id);
    return true;
  });
  return explicit.map((id, index) => {
    if (kept[index]) return id;
    let ordinal = index + 1;
    while (reserved.has(`skill_cd_region_${ordinal}`)) ordinal++;
    const fallback = `skill_cd_region_${ordinal}`;
    reserved.add(fallback);
    return fallback;
  });
}

function rawCell(
  region: Partial<SkillCdRegion>,
  skillId: number,
): SkillCdPosition | undefined {
  const positions = region.positions;
  if (!positions || typeof positions !== "object") return undefined;
  const cell: unknown = positions[skillId];
  return cell && typeof cell === "object"
    ? (cell as SkillCdPosition)
    : undefined;
}

/**
 * Deterministic, idempotent repair of the persisted regions. Valid cells are
 * kept first (a skill belongs to the first region holding a valid free cell
 * for it), then each remaining monitored skill fills its home region: the
 * first region that referenced it, else region 1. Only a home region grows.
 */
export function normalizeSkillCdRegions(
  selection: SkillCdSelection,
): SkillCdRegion[] {
  const raw = rawRegions(selection);
  const ids = regionIds(raw);
  const basePosition =
    finitePoint(selection.overlayPositions?.skillCdGroup) ??
    DEFAULT_REGION_POSITION;
  const baseScale = finiteScale(selection.overlaySizes?.skillCdGroupScale) ?? 1;
  const regions: SkillCdRegion[] = raw.map((region, index) => ({
    id: ids[index]!,
    name: typeof region.name === "string" ? region.name : "",
    rows: gridSize(region.rows, 2),
    columns: gridSize(region.columns, 5),
    positions: {},
    position: finitePoint(region.position) ?? {
      x: basePosition.x + index * REGION_OFFSET,
      y: basePosition.y + index * REGION_OFFSET,
    },
    scale: finiteScale(region.scale) ?? (index === 0 ? baseScale : 1),
    gap: gapSize(region.gap),
  }));

  const monitored = skillCdIds(selection.monitoredSkillIds);
  const homes = new Map<number, number>();
  for (const skillId of monitored) {
    for (const [index, region] of regions.entries()) {
      const cell = rawCell(raw[index]!, skillId);
      if (!cell) continue;
      if (!homes.has(skillId)) homes.set(skillId, index);
      if (
        isSkillCdPositionInBounds(cell, region) &&
        skillCdAt(region, cell) === null
      ) {
        region.positions[skillId] = copyPosition(cell);
        homes.set(skillId, -1);
        break;
      }
    }
  }

  // Reading persisted settings may repair insufficient capacity. Interactive
  // resize rejects overflow instead of silently moving a user's skills.
  const pending = monitored.filter((skillId) => homes.get(skillId) !== -1);
  for (const [index, region] of regions.entries()) {
    const own = pending.filter(
      (skillId) => (homes.get(skillId) ?? 0) === index,
    );
    if (own.length === 0) continue;
    const needed = Object.keys(region.positions).length + own.length;
    region.rows = Math.max(region.rows, Math.ceil(needed / region.columns));
    for (const skillId of own) {
      const cell = firstEmptyCell(region);
      if (cell) region.positions[skillId] = cell;
    }
  }
  return regions;
}

export function skillCdRegionIndexOf(
  regions: readonly SkillCdRegion[],
  skillId: number,
): number {
  return regions.findIndex((region) => region.positions[skillId] !== undefined);
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

/** Edits of one region's grid, as the layout editor emits them. */
export type SkillCdGridAction =
  | {
      kind: "toggle";
      skillId: number;
      preferredCell?: SkillCdPosition | undefined;
    }
  | { kind: "remove"; skillId: number }
  | { kind: "clear" }
  | { kind: "compact" }
  | { kind: "resize"; rows: number; columns: number }
  | { kind: "gap"; gap: number }
  | {
      kind: "move";
      skillId: number;
      from: SkillCdPosition;
      to: SkillCdPosition;
      targetSkillId: number | null;
      rows: number;
      columns: number;
    };

export type SkillCdAction =
  | (SkillCdGridAction & { regionId: string })
  | { kind: "addRegion"; id: string }
  | { kind: "renameRegion"; regionId: string; name: string }
  | { kind: "removeRegion"; regionId: string };

export type SkillCdChange =
  | {
      ok: true;
      monitoredSkillIds: number[];
      skillCdRegions: SkillCdRegion[];
    }
  | {
      ok: false;
      reason:
        | "limit"
        | "full"
        | "invalidSize"
        | "invalidGap"
        | "overflow"
        | "stale"
        | "lastRegion";
      skillIds: number[];
    };

/** All membership and layout changes commit together through the profile writer. */
export function changeSkillCdSelection(
  selection: SkillCdSelection,
  action: SkillCdAction,
): SkillCdChange {
  let ids = skillCdIds(selection.monitoredSkillIds);
  let regions = normalizeSkillCdRegions(selection);
  const error = (
    reason: Extract<SkillCdChange, { ok: false }>["reason"],
    skillIds: number[] = [],
  ): SkillCdChange => ({ ok: false, reason, skillIds });
  const done = (): SkillCdChange => ({
    ok: true,
    monitoredSkillIds: ids,
    skillCdRegions: regions,
  });

  if (action.kind === "addRegion") {
    const id = action.id.trim();
    if (
      !id ||
      regions.length >= MAX_SKILL_CD_REGIONS ||
      regions.some((region) => region.id === id)
    )
      return error("stale");
    const last = regions[regions.length - 1]!;
    regions.push(
      createDefaultSkillCdRegion(id, {
        x: last.position.x + REGION_OFFSET,
        y: last.position.y + REGION_OFFSET,
      }),
    );
    return done();
  }

  const index = regions.findIndex((region) => region.id === action.regionId);
  if (index === -1) return error("stale");
  const region = regions[index]!;
  const regionSkillIds = ids.filter(
    (skillId) => region.positions[skillId] !== undefined,
  );

  switch (action.kind) {
    case "renameRegion":
      region.name = action.name.trim();
      break;
    case "removeRegion":
      if (regions.length <= 1) return error("lastRegion");
      ids = ids.filter((skillId) => !regionSkillIds.includes(skillId));
      regions = regions.filter((_, i) => i !== index);
      break;
    case "toggle":
    case "remove": {
      const source = skillCdRegionIndexOf(regions, action.skillId);
      if (source === -1) {
        if (action.kind === "remove") break;
        if (!Number.isSafeInteger(action.skillId) || action.skillId <= 0)
          return error("stale");
        if (ids.length >= MAX_MONITORED_SKILLS) return error("limit");
        const cell = freeCell(region, action.preferredCell);
        if (!cell) return error("full");
        ids.push(action.skillId);
        region.positions[action.skillId] = cell;
      } else if (action.kind === "remove" || source === index) {
        ids = ids.filter((id) => id !== action.skillId);
        delete regions[source]!.positions[action.skillId];
      } else {
        // In another region: move it here, membership order unchanged.
        const cell = freeCell(region, action.preferredCell);
        if (!cell) return error("full");
        delete regions[source]!.positions[action.skillId];
        region.positions[action.skillId] = cell;
      }
      break;
    }
    case "clear":
      ids = ids.filter((skillId) => !regionSkillIds.includes(skillId));
      region.positions = {};
      break;
    case "resize": {
      if (
        ![action.rows, action.columns].every(
          (n) => Number.isInteger(n) && n >= 1 && n <= MAX_SKILL_CD_GRID_SIZE,
        )
      ) {
        return error("invalidSize");
      }
      const overflow = regionSkillIds.filter(
        (id) => !isSkillCdPositionInBounds(region.positions[id], action),
      );
      if (overflow.length) return error("overflow", overflow);
      region.rows = action.rows;
      region.columns = action.columns;
      break;
    }
    case "gap":
      if (
        !Number.isInteger(action.gap) ||
        action.gap < 0 ||
        action.gap > SKILL_CD_GAP_MAX
      )
        return error("invalidGap");
      region.gap = action.gap;
      break;
    case "compact": {
      const ordered = skillCdEntries(region, regionSkillIds).sort(
        (a, b) => a.row - b.row || a.column - b.column,
      );
      region.columns = Math.max(
        1,
        Math.min(region.columns, regionSkillIds.length),
      );
      region.rows = Math.max(
        1,
        Math.ceil(regionSkillIds.length / region.columns),
      );
      region.positions = Object.fromEntries(
        ordered.map(({ skillId }, i) => [
          skillId,
          {
            row: Math.floor(i / region.columns),
            column: i % region.columns,
          },
        ]),
      );
      break;
    }
    case "move": {
      if (
        action.rows !== region.rows ||
        action.columns !== region.columns ||
        !sameSkillCdPosition(region.positions[action.skillId], action.from) ||
        !isSkillCdPositionInBounds(action.to, region) ||
        skillCdAt(region, action.to) !== action.targetSkillId
      )
        return error("stale");
      if (action.targetSkillId !== null)
        region.positions[action.targetSkillId] = copyPosition(action.from);
      region.positions[action.skillId] = copyPosition(action.to);
      break;
    }
  }
  return done();
}

/** Overlay drag / resize of one region; the other regions are untouched. */
export function setSkillCdRegionLayout(
  selection: SkillCdSelection,
  regionId: string,
  patch: { position?: SkillCdPoint; scale?: number },
): SkillCdRegion[] {
  return normalizeSkillCdRegions(selection).map((region) =>
    region.id !== regionId
      ? region
      : {
          ...region,
          position: patch.position ? { ...patch.position } : region.position,
          scale:
            patch.scale === undefined
              ? region.scale
              : clampSkillCdRegionScale(patch.scale),
        },
  );
}

export function resetSkillCdRegionPositions(
  selection: SkillCdSelection,
): SkillCdRegion[] {
  return normalizeSkillCdRegions(selection).map((region, index) => ({
    ...region,
    position: {
      x: DEFAULT_REGION_POSITION.x + index * REGION_OFFSET,
      y: DEFAULT_REGION_POSITION.y + index * REGION_OFFSET,
    },
  }));
}

export function resetSkillCdRegionScales(
  selection: SkillCdSelection,
): SkillCdRegion[] {
  return normalizeSkillCdRegions(selection).map((region) => ({
    ...region,
    scale: 1,
  }));
}
