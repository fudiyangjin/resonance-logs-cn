import type {
  MinimapBuffFact,
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import { overlayNow } from "../../../game-overlay/overlay-clock.svelte.js";
import { entityFirstSeen } from "../../minimap-runtime.svelte.js";
import type {
  MechanicRegion,
  MechanicRow,
  MinimapVoiceCueDef,
  MinimapVoiceCueFire,
} from "../../scene-types";
import {
  resolveBuffVoiceCues,
  resolveSkillVoiceCues,
} from "../../voice-cue-utils";
import { arenaWorldRect, type ArenaPoint } from "./arena";

export type CursedTombMechanicView = {
  regions: MechanicRegion[];
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
};

const BOSS_MONSTER_ID = 33901;
const TOWER_MONSTER_IDS = new Set([33904, 33905]);
const LEFT_CLONE_MONSTER_IDS = new Set([33908, 33921]);
const RIGHT_CLONE_MONSTER_IDS = new Set([33909, 33922]);
const CLONE_MONSTER_IDS = new Set([
  ...LEFT_CLONE_MONSTER_IDS,
  ...RIGHT_CLONE_MONSTER_IDS,
]);

const TOWER_ACTIVATION_DURATION_MS = 40_000;
const CHARGE_DANGER_DURATION_MS = 10_000;
const HALF_PLANE_EPSILON = 0.0001;

const COLOR_SLOT_BOSS = 3;
const COLOR_SLOT_CLONE_IDLE = 5;
const COLOR_SLOT_DANGER = 3;

const textKeys = {
  towerGroup: "minimap.s3CursedTomb.tower.group",
  towerActivating: "minimap.s3CursedTomb.tower.activating",
  energyGroup: "minimap.s3CursedTomb.energy.group",
  energyPillar: "minimap.s3CursedTomb.energy.pillar",
  energyPillarShort: "minimap.s3CursedTomb.energy.pillarShort",
  chargeTargetGroup: "minimap.s3CursedTomb.chargeTarget.group",
  chargeTargetLeft: "minimap.s3CursedTomb.chargeTarget.left",
  chargeTargetRight: "minimap.s3CursedTomb.chargeTarget.right",
  chargeTargetRandom: "minimap.s3CursedTomb.chargeTarget.random",
  cloneGroup: "minimap.s3CursedTomb.clone.group",
  cloneLeft: "minimap.s3CursedTomb.clone.left",
  cloneRight: "minimap.s3CursedTomb.clone.right",
  puzzleGroup: "minimap.s3CursedTomb.puzzle.group",
  puzzle1: "minimap.s3CursedTomb.puzzle.piece1",
  puzzle2: "minimap.s3CursedTomb.puzzle.piece2",
} satisfies Record<string, MessageKey>;

enum TowerState {
  Activating,
  BlueComplete,
  GoldComplete,
}

type TowerStyle = {
  colorSlot: number;
};

const TOWER_STYLES: Record<TowerState, TowerStyle> = {
  [TowerState.Activating]: {
    colorSlot: 7,
  },
  [TowerState.BlueComplete]: {
    colorSlot: 4,
  },
  [TowerState.GoldComplete]: {
    colorSlot: 0,
  },
};

const TOWER_BUFF_IDS = {
  activating: new Set([884101, 884106, 884122]),
  blueComplete: 884102,
  goldComplete: 884103,
};

const CALLOUT_BUFFS: Record<
  number,
  { groupKey: MessageKey; labelKey: MessageKey; colorSlot: number }
> = {
  884129: {
    groupKey: textKeys.energyGroup,
    labelKey: textKeys.energyPillar,
    colorSlot: 5,
  },
  884141: {
    groupKey: textKeys.energyGroup,
    labelKey: textKeys.energyPillarShort,
    colorSlot: 11,
  },
  884162: {
    groupKey: textKeys.chargeTargetGroup,
    labelKey: textKeys.chargeTargetLeft,
    colorSlot: 1,
  },
  884163: {
    groupKey: textKeys.chargeTargetGroup,
    labelKey: textKeys.chargeTargetRight,
    colorSlot: 2,
  },
  884168: {
    groupKey: textKeys.chargeTargetGroup,
    labelKey: textKeys.chargeTargetRandom,
    colorSlot: 6,
  },
  884169: {
    groupKey: textKeys.puzzleGroup,
    labelKey: textKeys.puzzle1,
    colorSlot: 8,
  },
  884170: {
    groupKey: textKeys.puzzleGroup,
    labelKey: textKeys.puzzle2,
    colorSlot: 9,
  },
};

type ChargeHand = "left" | "right";

const CHARGE_SKILLS: Record<
  number,
  { hand: ChargeHand; labelKey: MessageKey }
> = {
  3390117: { hand: "left", labelKey: textKeys.cloneLeft },
  3390118: { hand: "right", labelKey: textKeys.cloneRight },
  3390123: { hand: "left", labelKey: textKeys.cloneLeft },
  3390124: { hand: "right", labelKey: textKeys.cloneRight },
};

const voiceCueIds = {
  tower: "s3-cursed-tomb.tower",
  energy: "s3-cursed-tomb.energy",
  chargeTarget: "s3-cursed-tomb.chargeTarget",
  chargeClone: "s3-cursed-tomb.chargeClone",
  puzzle: "s3-cursed-tomb.puzzle",
} as const;

export const S3_CURSED_TOMB_VOICE_CUES: MinimapVoiceCueDef[] = [
  {
    id: voiceCueIds.tower,
    labelKey: textKeys.towerGroup,
    autoText: "蓝塔激活",
  },
  {
    id: voiceCueIds.energy,
    labelKey: textKeys.energyGroup,
    autoText: "能量柱点名",
  },
  {
    id: voiceCueIds.chargeTarget,
    labelKey: textKeys.chargeTargetGroup,
    autoText: "半场冲锋点名",
  },
  {
    id: voiceCueIds.chargeClone,
    labelKey: textKeys.cloneGroup,
    autoText: "冲锋分身",
  },
  {
    id: voiceCueIds.puzzle,
    labelKey: textKeys.puzzleGroup,
    autoText: "拼图点名",
  },
];

const LOCAL_CALLOUT_VOICE_CUES: Record<number, string> = {
  884129: voiceCueIds.energy,
  884141: voiceCueIds.energy,
  884162: voiceCueIds.chargeTarget,
  884163: voiceCueIds.chargeTarget,
  884168: voiceCueIds.chargeTarget,
  884169: voiceCueIds.puzzle,
  884170: voiceCueIds.puzzle,
};

const CHARGE_SKILL_VOICE_CUES = Object.fromEntries(
  Object.keys(CHARGE_SKILLS).map((skillId) => [
    skillId,
    voiceCueIds.chargeClone,
  ]),
);

export function resolveCursedTombVoiceCues(
  snapshot: MinimapSnapshot,
  skillCasts: MinimapSkillCast[],
): MinimapVoiceCueFire[] {
  const fires = [
    ...resolveBuffVoiceCues(snapshot, LOCAL_CALLOUT_VOICE_CUES, "localTarget"),
    ...resolveSkillVoiceCues(skillCasts, CHARGE_SKILL_VOICE_CUES),
  ];
  const buffsByTarget = groupBuffsByTarget(snapshot.buffs);
  const activatingTimes = snapshot.entities
    .filter(
      (entity) =>
        entity.monsterId != null &&
        TOWER_MONSTER_IDS.has(entity.monsterId) &&
        towerState(buffsByTarget.get(entity.entityUuid) ?? []) ===
          TowerState.Activating,
    )
    .map((entity) =>
      towerCreateTimeMs(entity, buffsByTarget.get(entity.entityUuid) ?? []),
    );
  if (activatingTimes.length > 0) {
    fires.push({
      cueId: voiceCueIds.tower,
      instanceKey: `tower:${Math.min(...activatingTimes)}`,
    });
  }
  return fires;
}

export function buildMechanicView(
  snapshot: MinimapSnapshot,
  displayName: (entity: MinimapEntity) => string,
  skillCasts: MinimapSkillCast[],
): CursedTombMechanicView {
  const regions: MechanicRegion[] = [];
  const rows = new Map<string, MechanicRow>();
  const entityColorSlots = new Map<string, number>();
  const entitiesByUuid = new Map(
    snapshot.entities.map((entity) => [entity.entityUuid, entity]),
  );
  const buffsByTarget = groupBuffsByTarget(snapshot.buffs);

  addSpecifiedEntityMarkers(snapshot.entities, entityColorSlots);
  addCalloutRows(snapshot, entitiesByUuid, rows, entityColorSlots, displayName);
  addTowerRows(snapshot.entities, buffsByTarget, rows, entityColorSlots);
  addChargeCloneRegions(
    entitiesByUuid,
    skillCasts,
    regions,
    rows,
    entityColorSlots,
  );

  return {
    regions: dedupeRegions(regions),
    rows: [...rows.values()],
    entityColorSlots,
  };
}

function addSpecifiedEntityMarkers(
  entities: MinimapEntity[],
  entityColorSlots: Map<string, number>,
) {
  for (const entity of entities) {
    if (entity.monsterId === BOSS_MONSTER_ID) {
      entityColorSlots.set(entity.entityUuid, COLOR_SLOT_BOSS);
      continue;
    }
    if (entity.monsterId != null && CLONE_MONSTER_IDS.has(entity.monsterId)) {
      entityColorSlots.set(entity.entityUuid, COLOR_SLOT_CLONE_IDLE);
    }
  }
}

function addCalloutRows(
  snapshot: MinimapSnapshot,
  entitiesByUuid: Map<string, MinimapEntity>,
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
  displayName: (entity: MinimapEntity) => string,
) {
  for (const buff of snapshot.buffs) {
    const mapping = CALLOUT_BUFFS[buff.baseId];
    if (!mapping) continue;

    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (target) entityColorSlots.set(target.entityUuid, mapping.colorSlot);
    upsertRow(rows, {
      key: `cursedTomb:callout:${buff.baseId}:${buff.layer}`,
      group: t(mapping.groupKey),
      label: t(mapping.labelKey),
      colorSlot: mapping.colorSlot,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: target ? [displayName(target)] : [],
    });
  }
}

function addTowerRows(
  entities: MinimapEntity[],
  buffsByTarget: Map<string, MinimapBuffFact[]>,
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
) {
  const activatingCreateTimes: number[] = [];
  for (const entity of entities) {
    if (entity.monsterId == null || !TOWER_MONSTER_IDS.has(entity.monsterId)) {
      continue;
    }

    const buffs = buffsByTarget.get(entity.entityUuid) ?? [];
    const state = towerState(buffs);
    const style = TOWER_STYLES[state];
    entityColorSlots.set(entity.entityUuid, style.colorSlot);
    if (state === TowerState.Activating) {
      activatingCreateTimes.push(towerCreateTimeMs(entity, buffs));
    }
  }

  if (activatingCreateTimes.length > 0) {
    upsertRow(rows, {
      key: "cursedTomb:tower:activating",
      group: t(textKeys.towerGroup),
      label: t(textKeys.towerActivating),
      colorSlot: TOWER_STYLES[TowerState.Activating].colorSlot,
      createTimeMs: Math.min(...activatingCreateTimes),
      durationMs: TOWER_ACTIVATION_DURATION_MS,
      targets: [],
      hideTimer: false,
    });
  }
}

function addChargeCloneRegions(
  entitiesByUuid: Map<string, MinimapEntity>,
  skillCasts: MinimapSkillCast[],
  regions: MechanicRegion[],
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
) {
  const now = overlayNow();
  for (const cast of activeChargeCasts(skillCasts, now)) {
    const entity = entitiesByUuid.get(cast.entityUuid);
    if (entity?.monsterId != null && CLONE_MONSTER_IDS.has(entity.monsterId)) {
      entityColorSlots.set(entity.entityUuid, COLOR_SLOT_DANGER);
    }
    regions.push(chargeSidePolygon(cast));
    upsertRow(rows, {
      key: `cursedTomb:chargeClone:${cast.entityUuid}:${cast.skillId}:${cast.timeMs}`,
      group: t(textKeys.cloneGroup),
      label: t(cast.labelKey),
      colorSlot: COLOR_SLOT_DANGER,
      createTimeMs: cast.timeMs,
      durationMs: CHARGE_DANGER_DURATION_MS,
      targets: [],
    });
  }
}

function groupBuffsByTarget(
  buffs: MinimapBuffFact[],
): Map<string, MinimapBuffFact[]> {
  const out = new Map<string, MinimapBuffFact[]>();
  for (const buff of buffs) {
    const list = out.get(buff.targetEntityUuid) ?? [];
    list.push(buff);
    out.set(buff.targetEntityUuid, list);
  }
  return out;
}

function towerState(buffs: MinimapBuffFact[]): TowerState {
  if (buffs.some((buff) => buff.baseId === TOWER_BUFF_IDS.goldComplete)) {
    return TowerState.GoldComplete;
  }
  if (buffs.some((buff) => buff.baseId === TOWER_BUFF_IDS.blueComplete)) {
    return TowerState.BlueComplete;
  }
  return TowerState.Activating;
}

function towerCreateTimeMs(
  entity: MinimapEntity,
  buffs: MinimapBuffFact[],
): number {
  const candidates: number[] = [];
  const firstSeen = entityFirstSeen(entity.entityUuid);
  if (firstSeen !== undefined) candidates.push(firstSeen);

  for (const buff of buffs) {
    if (TOWER_BUFF_IDS.activating.has(buff.baseId)) {
      candidates.push(buff.createTimeMs);
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : overlayNow();
}

type ActiveChargeCast = MinimapSkillCast & {
  hand: ChargeHand;
  labelKey: MessageKey;
  x: number;
  z: number;
  facing: number;
};

function activeChargeCasts(
  skillCasts: MinimapSkillCast[],
  now: number,
): ActiveChargeCast[] {
  const active: ActiveChargeCast[] = [];
  for (const cast of skillCasts) {
    const mapping = CHARGE_SKILLS[cast.skillId];
    if (!mapping) continue;
    const ageMs = now - cast.timeMs;
    if (ageMs < -500 || ageMs > CHARGE_DANGER_DURATION_MS) continue;
    const { x, z, facing } = cast;
    if (!isFiniteNumber(x) || !isFiniteNumber(z) || !isFiniteNumber(facing)) {
      continue;
    }
    active.push({
      ...cast,
      ...mapping,
      x,
      z,
      facing: normalizedDeg(facing),
    });
  }
  return active;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizedDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function chargeSidePolygon(cast: ActiveChargeCast): MechanicRegion {
  return {
    kind: "polygon",
    points: clipArenaRectToHand(cast),
    colorSlot: COLOR_SLOT_DANGER,
  };
}

function forwardVector(facing: number): ArenaPoint {
  const rad = (facing * Math.PI) / 180;
  return {
    x: Math.sin(rad),
    z: Math.cos(rad),
  };
}

function clipArenaRectToHand(cast: ActiveChargeCast): ArenaPoint[] {
  const forward = forwardVector(cast.facing);
  const anchor = { x: cast.x, z: cast.z };
  return clipPolygonByHalfPlane(
    arenaWorldRect(),
    (point) => {
      const cross =
        forward.x * (point.z - anchor.z) - forward.z * (point.x - anchor.x);
      return cast.hand === "left"
        ? cross >= -HALF_PLANE_EPSILON
        : cross <= HALF_PLANE_EPSILON;
    },
    (from, to) => splitLineIntersection(from, to, anchor, forward),
  );
}

function clipPolygonByHalfPlane(
  polygon: ArenaPoint[],
  isInside: (point: ArenaPoint) => boolean,
  intersection: (from: ArenaPoint, to: ArenaPoint) => ArenaPoint,
): ArenaPoint[] {
  if (polygon.length === 0) return [];
  const clipped: ArenaPoint[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i]!;
    const previous = polygon[(i + polygon.length - 1) % polygon.length]!;
    const currentInside = isInside(current);
    const previousInside = isInside(previous);

    if (currentInside) {
      if (!previousInside) clipped.push(intersection(previous, current));
      clipped.push(current);
    } else if (previousInside) {
      clipped.push(intersection(previous, current));
    }
  }
  return clipped;
}

function splitLineIntersection(
  from: ArenaPoint,
  to: ArenaPoint,
  anchor: ArenaPoint,
  forward: ArenaPoint,
): ArenaPoint {
  const fromValue =
    forward.x * (from.z - anchor.z) - forward.z * (from.x - anchor.x);
  const toValue = forward.x * (to.z - anchor.z) - forward.z * (to.x - anchor.x);
  const denominator = fromValue - toValue;
  if (Math.abs(denominator) < HALF_PLANE_EPSILON) return from;
  const t = fromValue / denominator;
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
  };
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
  if (existing.hideTimer || next.hideTimer) {
    existing.hideTimer = Boolean(existing.hideTimer && next.hideTimer);
  }
  for (const target of next.targets) {
    if (!existing.targets.includes(target)) existing.targets.push(target);
  }
}

function dedupeRegions(regions: MechanicRegion[]): MechanicRegion[] {
  const seen = new Set<string>();
  const out: MechanicRegion[] = [];
  for (const region of regions) {
    const key = regionKey(region);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(region);
  }
  return out;
}

function regionKey(region: MechanicRegion): string {
  switch (region.kind) {
    case "ring":
      return `ring:${region.rInner}:${region.rOuter}:${region.colorSlot}`;
    case "rect":
      return `rect:${region.x}:${region.z}:${region.halfX}:${region.halfZ}:${region.colorSlot}:${region.label ?? ""}`;
    case "sector":
      return `sector:${region.x}:${region.z}:${region.radius}:${region.startDeg}:${region.endDeg}:${region.colorSlot}:${region.label ?? ""}`;
    case "polygon":
      return `polygon:${region.points.map((point) => `${point.x}:${point.z}`).join("|")}:${region.colorSlot}:${region.label ?? ""}`;
    case "line":
      return `line:${region.x1}:${region.z1}:${region.x2}:${region.z2}:${region.colorSlot}:${region.widthPx ?? ""}:${region.label ?? ""}`;
  }
}
