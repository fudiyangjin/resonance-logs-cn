import type {
  MinimapBuffFact,
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import type {
  MechanicRegion,
  MechanicRow,
  MechanicRowTargetStatus,
} from "../../../scene-types";
import { arenaBounds, arenaCenter, type S3SeaRingedReefArena } from "../arena";
import type { SeaRingedReefMechanicView } from "./matrix";

const ICE_WAVE_MONSTER_ID = 3340219;
const WATER_WAVE_MONSTER_ID = 3340220;
// Each wave band is 4 units wide. The two perpendicular bands overlap in a
// 4x4 square at their intersection — that overlap is the safe zone.
const WAVE_BAND_HALF_WIDTH = 2;
const SAFE_HALF = WAVE_BAND_HALF_WIDTH;
// Player collision radius. A player is only "safe" when the entire circle
// fits inside the safe rect, so we shrink the rect by this radius. Touching
// the edge counts as dangerous (strict <).
const PLAYER_RADIUS = 0.25;

// Boss-phase orbs (attr `10` / monsterId): players must track their positions.
const ICE_BALL_MONSTER_ID = 4604;
const WATER_BUBBLE_MONSTER_ID = 4605;
const ORB_COLOR_SLOTS: Record<number, number> = {
  [ICE_BALL_MONSTER_ID]: 7, // blue
  [WATER_BUBBLE_MONSTER_ID]: 4, // cyan
};

const PIZZA_INDICATOR_SKILL_ID = 3340245;
const PIZZA_HALF_ANGLE = 45; // each sector spans 90 degrees
const PIZZA_OUTER_RADIUS = 20; // min(boss halfX 33, halfZ 27) / 2
const PIZZA_ORANGE_BUFF_ID = 883633; // "标记-Rock橙色板子"
const PIZZA_PURPLE_BUFF_ID = 883634; // "标记-Rock紫色板子"
const PIZZA_PURPLE_DIAGONAL_OFFSET = 90; // purple danger diagonal is rotated 90deg
const PIZZA_COLOR_ORANGE = 5; // orange
const PIZZA_COLOR_PURPLE = 9; // purple
const PIZZA_COLOR_DEFAULT = 3; // red danger (fallback when no marker buff)

const textKeys = {
  dualGroup: "minimap.s3SeaRingedReef.boss.dualGroup",
  iceDual: "minimap.s3SeaRingedReef.boss.iceDual",
  waterDual: "minimap.s3SeaRingedReef.boss.waterDual",
  waveGroup: "minimap.s3SeaRingedReef.boss.waveGroup",
  iceWave: "minimap.s3SeaRingedReef.boss.iceWave",
  waterWave: "minimap.s3SeaRingedReef.boss.waterWave",
  crossSafe: "minimap.s3SeaRingedReef.boss.crossSafe",
  singleWaveSafe: "minimap.s3SeaRingedReef.boss.singleWaveSafe",
  vertical: "minimap.s3SeaRingedReef.boss.vertical",
  horizontal: "minimap.s3SeaRingedReef.boss.horizontal",
  pizzaGroup: "minimap.s3SeaRingedReef.boss.pizzaGroup",
  pizzaOrange: "minimap.s3SeaRingedReef.boss.pizzaOrange",
  pizzaPurple: "minimap.s3SeaRingedReef.boss.pizzaPurple",
} satisfies Record<string, MessageKey>;

const DUAL_BUFFS: Record<number, { labelKey: MessageKey; colorSlot: number }> =
  {
    883602: { labelKey: textKeys.iceDual, colorSlot: 7 },
    883603: { labelKey: textKeys.waterDual, colorSlot: 4 },
  };

type WaveAxis = "vertical" | "horizontal";

type WaveLine = {
  key: "ice" | "water";
  entity: MinimapEntity;
  axis: WaveAxis;
  colorSlot: number;
  labelKey: MessageKey;
};

export function buildBossMechanicView(
  snapshot: MinimapSnapshot,
  displayName: (entity: MinimapEntity) => string,
  arena: S3SeaRingedReefArena,
  skillCasts: MinimapSkillCast[],
): SeaRingedReefMechanicView {
  const regions: MechanicRegion[] = [];
  const rows: MechanicRow[] = [];
  const entityColorSlots = new Map<string, number>();
  const waveSafeStatus = new Map<string, boolean>();
  const entitiesByUuid = new Map(
    snapshot.entities.map((entity) => [entity.entityUuid, entity]),
  );

  addDualBuffRows(
    snapshot,
    entitiesByUuid,
    rows,
    entityColorSlots,
    displayName,
  );
  addWaveSafeRegions(snapshot, arena, regions, rows, displayName, waveSafeStatus);
  addOrbMarkers(snapshot, entityColorSlots);
  addPizzaDangerRegions(
    skillCasts,
    snapshot.buffs,
    entitiesByUuid,
    regions,
    rows,
    entityColorSlots,
  );

  return {
    regions,
    rows,
    entityColorSlots,
    waveSafeStatus,
  };
}

function addDualBuffRows(
  snapshot: MinimapSnapshot,
  entitiesByUuid: Map<string, MinimapEntity>,
  rows: MechanicRow[],
  entityColorSlots: Map<string, number>,
  displayName: (entity: MinimapEntity) => string,
) {
  const dualRows = new Map<string, MechanicRow>();
  for (const buff of snapshot.buffs) {
    const mapping = DUAL_BUFFS[buff.baseId];
    if (!mapping) continue;

    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (!target) continue;

    entityColorSlots.set(target.entityUuid, mapping.colorSlot);
    upsertRow(dualRows, {
      key: `dual:${buff.baseId}`,
      group: t(textKeys.dualGroup),
      label: t(mapping.labelKey),
      colorSlot: mapping.colorSlot,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: [displayName(target)],
    });
  }
  rows.push(...dualRows.values());
}

// Assign color slots to ice-ball / water-bubble orbs so they survive the
// scene's `visibleEntities` filter and render in their themed color. Position
// only — no info-bar row is added.
function addOrbMarkers(
  snapshot: MinimapSnapshot,
  entityColorSlots: Map<string, number>,
) {
  for (const entity of snapshot.entities) {
    if (entity.monsterId == null) continue;
    const colorSlot = ORB_COLOR_SLOTS[entity.monsterId];
    if (colorSlot === undefined) continue;
    entityColorSlots.set(entity.entityUuid, colorSlot);
  }
}

type PizzaIndicator = {
  entity: MinimapEntity;
  timeMs: number;
};

type PizzaColorStyle = {
  offset: number;
  colorSlot: number;
  labelKey: MessageKey;
};

function addPizzaDangerRegions(
  skillCasts: MinimapSkillCast[],
  buffs: MinimapBuffFact[],
  entitiesByUuid: Map<string, MinimapEntity>,
  regions: MechanicRegion[],
  rows: MechanicRow[],
  entityColorSlots: Map<string, number>,
) {
  // The pizza rotation indicator (skill 3340245) is a generic EntDummy
  // (monsterId 1000), identified by its skill cast id. It appears ~5.7s before
  // the damage sectors and spins its `attr50` facing before locking. Drawing
  // two opposing sectors from the live entity gives a real warning: the sector
  // heading follows `entity.facing` while it spins, and the sectors vanish when
  // the indicator leaves the snapshot.
  const indicators: PizzaIndicator[] = [];
  for (const cast of skillCasts) {
    if (cast.skillId !== PIZZA_INDICATOR_SKILL_ID) continue;
    const entity = entitiesByUuid.get(cast.entityUuid);
    if (!entity) continue;
    indicators.push({ entity, timeMs: cast.timeMs });
  }
  if (indicators.length === 0) return;

  // Only one indicator is alive at a time (rounds are 15-19s apart, lifecycle
  // ~7.6s). If stale casts survive in the log, the entity-presence filter above
  // already dropped them; pick the newest just in case.
  const indicator = indicators.reduce((a, b) =>
    a.timeMs >= b.timeMs ? a : b,
  );

  const facing = indicator.entity.facing;
  if (facing === null || facing === undefined || !Number.isFinite(facing)) {
    // First frame after spawn has no attr50 yet; wait for the rotation Delta.
    return;
  }

  // The active pizza color is marked by 883633 (orange) / 883634 (purple),
  // carried on the boss and the indicator from the start of the rotation.
  // Purple shifts the danger diagonal 90 degrees off the indicator heading.
  // Only one pizza round is active at a time, so any matching buff pins the
  // color; purple takes priority to avoid an orange fallback masking it.
  const style = pizzaColorStyle(buffs);

  const base = normalizedDeg(facing + style.offset);
  regions.push(pizzaSectorRegion(indicator.entity, base, style.colorSlot));
  regions.push(
    pizzaSectorRegion(
      indicator.entity,
      normalizedDeg(base + 180),
      style.colorSlot,
    ),
  );
  entityColorSlots.set(indicator.entity.entityUuid, style.colorSlot);

  const pizzaRows = new Map<string, MechanicRow>();
  upsertRow(pizzaRows, {
    key: "pizza:indicator",
    group: t(textKeys.pizzaGroup),
    label: t(style.labelKey),
    colorSlot: style.colorSlot,
    createTimeMs: 0,
    durationMs: 0,
    targets: [],
    hideTimer: true,
  });
  rows.push(...pizzaRows.values());
}

function pizzaColorStyle(buffs: MinimapBuffFact[]): PizzaColorStyle {
  const isPurple = buffs.some((b) => b.baseId === PIZZA_PURPLE_BUFF_ID);
  if (isPurple) {
    return {
      offset: PIZZA_PURPLE_DIAGONAL_OFFSET,
      colorSlot: PIZZA_COLOR_PURPLE,
      labelKey: textKeys.pizzaPurple,
    };
  }
  const isOrange = buffs.some((b) => b.baseId === PIZZA_ORANGE_BUFF_ID);
  if (isOrange) {
    return {
      offset: 0,
      colorSlot: PIZZA_COLOR_ORANGE,
      labelKey: textKeys.pizzaOrange,
    };
  }
  return {
    offset: 0,
    colorSlot: PIZZA_COLOR_DEFAULT,
    labelKey: textKeys.pizzaGroup,
  };
}

function pizzaSectorRegion(
  entity: MinimapEntity,
  facingDeg: number,
  colorSlot: number,
): MechanicRegion {
  return {
    kind: "sector",
    x: entity.x,
    z: entity.z,
    radius: PIZZA_OUTER_RADIUS,
    startDeg: facingDeg - PIZZA_HALF_ANGLE,
    endDeg: facingDeg + PIZZA_HALF_ANGLE,
    colorSlot,
  };
}

function normalizedDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function upsertRow(rows: Map<string, MechanicRow>, next: MechanicRow) {
  const existing = rows.get(next.key);
  if (!existing) {
    rows.set(next.key, { ...next, targets: [...next.targets] });
    return;
  }
  existing.createTimeMs =
    existing.createTimeMs <= 0
      ? next.createTimeMs
      : Math.min(existing.createTimeMs, next.createTimeMs);
  existing.durationMs = Math.max(existing.durationMs, next.durationMs);
  for (const target of next.targets) {
    if (!existing.targets.includes(target)) existing.targets.push(target);
  }
}

function addWaveSafeRegions(
  snapshot: MinimapSnapshot,
  arena: S3SeaRingedReefArena,
  regions: MechanicRegion[],
  rows: MechanicRow[],
  displayName: (entity: MinimapEntity) => string,
  waveSafeStatus: Map<string, boolean>,
) {
  const waves = latestWaves(snapshot.entities);
  if (waves.length === 0) return;

  const center = arenaCenter(arena);
  const bounds = arenaBounds(arena);
  const innerHalf = Math.max(0, SAFE_HALF - PLAYER_RADIUS);

  const localPlayer = snapshot.entities.find(
    (entity) => entity.entityUuid === snapshot.localPlayerUuid,
  );

  for (const wave of waves) {
    const axisLabelKey =
      wave.axis === "vertical" ? textKeys.vertical : textKeys.horizontal;

    const axisCoord =
      wave.axis === "vertical" ? wave.entity.x : wave.entity.z;
    const playerCoord =
      wave.axis === "vertical" ? localPlayer?.x : localPlayer?.z;
    const inBand =
      localPlayer !== undefined &&
      !localPlayer.isDead &&
      playerCoord !== undefined &&
      Math.abs(playerCoord - axisCoord) < innerHalf;

    regions.push(waveRegion(wave, center, bounds, inBand ? 1 : 3));

    rows.push({
      key: `wave:${wave.key}:${wave.entity.entityUuid}`,
      group: t(textKeys.waveGroup),
      label: `${t(wave.labelKey)}：${t(axisLabelKey)}`,
      colorSlot: wave.colorSlot,
      createTimeMs: 0,
      durationMs: 0,
      targets: [],
      hideTimer: true,
    });
  }

  const vertical = waves.find((wave) => wave.axis === "vertical");
  const horizontal = waves.find((wave) => wave.axis === "horizontal");

  // The wave bands are SAFE lanes (not danger). A player is safe when their
  // whole collision circle (radius PLAYER_RADIUS) fits inside a band, so we
  // test against the band shrunk by the radius. Strict <: touching the edge
  // counts as dangerous.
  // - Both waves: the overlap square of the two perpendicular safe bands
  //   (the cross center) is the only spot safe from both.
  // - Only one wave: inside that wave's band is safe; outside is danger.
  // `innerHalf` is computed above (shared with the per-wave band coloring).

  let safePredicate: ((entity: MinimapEntity) => boolean) | null = null;
  let safeRow: MechanicRow | null = null;

  if (vertical && horizontal) {
    const cx = vertical.entity.x;
    const cz = horizontal.entity.z;
    safePredicate = (entity) =>
      Math.abs(entity.x - cx) < innerHalf &&
      Math.abs(entity.z - cz) < innerHalf;
    safeRow = {
      key: `wave:cross:${vertical.entity.entityUuid}:${horizontal.entity.entityUuid}`,
      group: t(textKeys.waveGroup),
      label: t(textKeys.crossSafe),
      colorSlot: 1,
      createTimeMs: 0,
      durationMs: 0,
      targets: [],
      hideTimer: true,
    };
  } else {
    const wave = vertical ?? horizontal ?? null;
    if (wave) {
      const axisCoord = vertical ? wave.entity.x : wave.entity.z;
      safePredicate = (entity) =>
        Math.abs((vertical ? entity.x : entity.z) - axisCoord) < innerHalf;
      safeRow = {
        key: `wave:single:${wave.key}:${wave.entity.entityUuid}`,
        group: t(textKeys.waveGroup),
        label: `${t(wave.labelKey)}：${t(textKeys.singleWaveSafe)}`,
        colorSlot: 1,
        createTimeMs: 0,
        durationMs: 0,
        targets: [],
        hideTimer: true,
      };
    }
  }

  if (safePredicate && safeRow) {
    const teamEntities = snapshot.entities.filter(
      (entity) =>
        (entity.kind === "local" || entity.kind === "teammate") &&
        !entity.isDead,
    );

    const targetStatus: MechanicRowTargetStatus[] = teamEntities
      .map((entity) => {
        const safe = safePredicate!(entity);
        waveSafeStatus.set(entity.entityUuid, safe);
        return {
          name: displayName(entity),
          isLocal: entity.entityUuid === snapshot.localPlayerUuid,
          safe,
        };
      })
      .sort((a, b) => Number(b.isLocal) - Number(a.isLocal));

    rows.push({ ...safeRow, targetStatus });
  }
}

function latestWaves(entities: MinimapEntity[]): WaveLine[] {
  const out = new Map<"ice" | "water", WaveLine>();
  for (const entity of entities) {
    const mapping = waveMapping(entity);
    if (!mapping) continue;
    const axis = axisFromFacing(entity.facing ?? 0);
    if (!axis) continue;
    out.set(mapping.key, {
      key: mapping.key,
      entity,
      axis,
      colorSlot: mapping.colorSlot,
      labelKey: mapping.labelKey,
    });
  }
  return [...out.values()];
}

function waveMapping(
  entity: MinimapEntity,
): { key: "ice" | "water"; colorSlot: number; labelKey: MessageKey } | null {
  switch (entity.monsterId) {
    case ICE_WAVE_MONSTER_ID:
      return { key: "ice", colorSlot: 7, labelKey: textKeys.iceWave };
    case WATER_WAVE_MONSTER_ID:
      return { key: "water", colorSlot: 4, labelKey: textKeys.waterWave };
    default:
      return null;
  }
}

function axisFromFacing(facing: number | null | undefined): WaveAxis | null {
  if (facing === null || facing === undefined || !Number.isFinite(facing)) {
    return null;
  }
  const normalized = ((facing % 360) + 360) % 360;
  const distanceToVertical = Math.min(
    normalized,
    Math.abs(normalized - 180),
    360 - normalized,
  );
  const distanceToHorizontal = Math.min(
    Math.abs(normalized - 90),
    Math.abs(normalized - 270),
  );
  return distanceToVertical <= distanceToHorizontal ? "vertical" : "horizontal";
}

function waveRegion(
  wave: WaveLine,
  center: { x: number; z: number },
  bounds: { halfX: number; halfZ: number },
  displayColorSlot: number,
): MechanicRegion {
  if (wave.axis === "vertical") {
    return {
      kind: "rect",
      x: wave.entity.x,
      z: center.z,
      halfX: WAVE_BAND_HALF_WIDTH,
      halfZ: bounds.halfZ,
      colorSlot: displayColorSlot,
    };
  }

  return {
    kind: "rect",
    x: center.x,
    z: wave.entity.z,
    halfX: bounds.halfX,
    halfZ: WAVE_BAND_HALF_WIDTH,
    colorSlot: displayColorSlot,
  };
}