import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import type { MechanicRegion, MechanicRow } from "../../../scene-types";
import { arenaBounds, arenaCenter, type S3SeaRingedReefArena } from "../arena";
import type { SeaRingedReefMechanicView } from "./matrix";

const ICE_WAVE_MONSTER_ID = 3340219;
const WATER_WAVE_MONSTER_ID = 3340220;
const WAVE_BAND_HALF_WIDTH = 3.5;
const INTERSECTION_HALF_SIZE = 5;

// Boss-phase orbs (attr `10` / monsterId): players must track their positions.
const ICE_BALL_MONSTER_ID = 4604;
const WATER_BUBBLE_MONSTER_ID = 4605;
const ORB_COLOR_SLOTS: Record<number, number> = {
  [ICE_BALL_MONSTER_ID]: 7, // blue
  [WATER_BUBBLE_MONSTER_ID]: 4, // cyan
};

const textKeys = {
  dualGroup: "minimap.s3SeaRingedReef.boss.dualGroup",
  iceDual: "minimap.s3SeaRingedReef.boss.iceDual",
  waterDual: "minimap.s3SeaRingedReef.boss.waterDual",
  waveGroup: "minimap.s3SeaRingedReef.boss.waveGroup",
  iceWave: "minimap.s3SeaRingedReef.boss.iceWave",
  waterWave: "minimap.s3SeaRingedReef.boss.waterWave",
  crossSafe: "minimap.s3SeaRingedReef.boss.crossSafe",
  vertical: "minimap.s3SeaRingedReef.boss.vertical",
  horizontal: "minimap.s3SeaRingedReef.boss.horizontal",
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
): SeaRingedReefMechanicView {
  const regions: MechanicRegion[] = [];
  const rows: MechanicRow[] = [];
  const entityColorSlots = new Map<string, number>();
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
  addWaveSafeRegions(snapshot, arena, regions, rows);
  addOrbMarkers(snapshot, entityColorSlots);

  return {
    regions,
    rows,
    entityColorSlots,
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
) {
  const waves = latestWaves(snapshot.entities);
  if (waves.length === 0) return;

  const center = arenaCenter(arena);
  const bounds = arenaBounds(arena);

  for (const wave of waves) {
    const axisLabelKey =
      wave.axis === "vertical" ? textKeys.vertical : textKeys.horizontal;
    regions.push(waveRegion(wave, center, bounds));
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
  if (!vertical || !horizontal) return;

  regions.push({
    kind: "rect",
    x: vertical.entity.x,
    z: horizontal.entity.z,
    halfX: INTERSECTION_HALF_SIZE,
    halfZ: INTERSECTION_HALF_SIZE,
    colorSlot: 1,
    label: t(textKeys.crossSafe),
  });
  rows.push({
    key: `wave:cross:${vertical.entity.entityUuid}:${horizontal.entity.entityUuid}`,
    group: t(textKeys.waveGroup),
    label: t(textKeys.crossSafe),
    colorSlot: 1,
    createTimeMs: 0,
    durationMs: 0,
    targets: [],
    hideTimer: true,
  });
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
): MechanicRegion {
  if (wave.axis === "vertical") {
    return {
      kind: "rect",
      x: wave.entity.x,
      z: center.z,
      halfX: WAVE_BAND_HALF_WIDTH,
      halfZ: bounds.halfZ,
      colorSlot: wave.colorSlot,
    };
  }

  return {
    kind: "rect",
    x: center.x,
    z: wave.entity.z,
    halfX: bounds.halfX,
    halfZ: WAVE_BAND_HALF_WIDTH,
    colorSlot: wave.colorSlot,
  };
}