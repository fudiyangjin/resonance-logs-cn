import type { MinimapEntity } from "$lib/api";
import { t } from "$lib/i18n/index.svelte";
import type { ArenaPoint } from "./arena";
import {
  addRow,
  type BuildContext,
  circle,
  labeledDisc,
  latestCast,
} from "./context";

const LIGHT_BALL_MONSTER_ID = 103602;
const DARK_BALL_MONSTER_ID = 103603;
/** 控制球: the balls start moving 1.5 s after the cast. */
const SKILL_CONTROL_BALLS = 10360011;

// Measured on two 90° pairs (logs 1792922485907, 1792922825153): both balls
// run clockwise (bearing increasing), the dark one twice as fast; they stop
// 13.4° apart once it catches up and explode 0.5 s later.
const LIGHT_DEG_PER_S = 14.9;
const DARK_DEG_PER_S = 30.4;
const CONTACT_GAP_DEG = 13.4;
const MOVE_DELAY_MS = 1_500;
const EXPLODE_DELAY_MS = 500;
/** Midpoint of the two stop positions (light at 34.7 m, dark at 33.9 m). */
const COLLISION_RADIUS = 34.3;
/** Players were hit at ≤ 47.85 m from the collision, spared at ≥ 49.51 m. */
const EXPLOSION_RADIUS = 48.7;
/** Players spared on the far side stood at 19–33 m. */
const SPOT_RADIUS = 27;
const SPAWN_RADIUS = 35;
const SPAWN_TOLERANCE = 0.3;
/** Balls of one summon appear within milliseconds of each other. */
const SPAWN_GROUP_MS = 2_000;
const SPAWN_TTL_MS = 90_000;
/** Longest chase the model allows (dark 90° ahead) ends ~18 s after the cast. */
const CAST_WINDOW_MS = 20_000;
const PATH_STEP_DEG = 15;

const COLOR_LIGHT_BALL = 0;
const COLOR_SAFE = 1;
const COLOR_DARK_BALL = 2;
const COLOR_DANGER = 3;
const COLOR_NEXT = 4;
const SPOT_MARK_RADIUS = 3;
const COLLISION_MARK_RADIUS = 2;

const textKeys = {
  celestial: "minimap.s4SkyEndRaid.celestial",
  celestialPair: "minimap.s4SkyEndRaid.celestialPair",
  celestialTriple: "minimap.s4SkyEndRaid.celestialTriple",
  safeSpot: "minimap.s4SkyEndRaid.safeSpot",
  firstSpot: "minimap.s4SkyEndRaid.firstSpot",
  secondSpot: "minimap.s4SkyEndRaid.secondSpot",
} as const;

export type PairPrediction = {
  /** Clockwise distance from the dark ball forward to the light ball. */
  gapDeg: number;
  /** From the balls' current positions until they stop. */
  moveMs: number;
  collision: ArenaPoint;
  safe: ArenaPoint;
};

/** Dark chases light clockwise and stops on catching up ("追上才停"). */
export function predictPair(
  light: ArenaPoint,
  dark: ArenaPoint,
): PairPrediction {
  const lightBearing = bearingOf(light);
  const gapDeg = normalize(lightBearing - bearingOf(dark));
  const moveS =
    Math.max(0, gapDeg - CONTACT_GAP_DEG) / (DARK_DEG_PER_S - LIGHT_DEG_PER_S);
  const collisionBearing =
    lightBearing + LIGHT_DEG_PER_S * moveS - CONTACT_GAP_DEG / 2;
  return {
    gapDeg,
    moveMs: moveS * 1_000,
    collision: pointAt(collisionBearing, COLLISION_RADIUS),
    safe: pointAt(collisionBearing + 180, SPOT_RADIUS),
  };
}

export type TripleGuide = { firstBearing: number; secondBearing: number };

/**
 * Three balls, from the raid guide (no log yet): clockwise from the widest
 * gap, stand between the first two balls; after the first explosion walk
 * clockwise along the edge to the second ball's spawn.
 */
export function tripleGuide(bearings: readonly number[]): TripleGuide | null {
  if (bearings.length !== 3) return null;
  const sorted = [...bearings].sort((left, right) => left - right);
  let start = 0;
  let widest = -1;
  for (let i = 0; i < 3; i++) {
    const next = (i + 1) % 3;
    const gap = normalize(sorted[next]! - sorted[i]!);
    if (gap > widest) {
      widest = gap;
      start = next;
    }
  }
  const first = sorted[start]!;
  const second = sorted[(start + 1) % 3]!;
  return {
    firstBearing: normalize(first + normalize(second - first) / 2),
    secondBearing: second,
  };
}

type Spawn = { bearing: number; seenMs: number };

/**
 * Spawn bearings, kept after the balls start moving: the three-ball guide
 * needs where they appeared. A plain map, not reactive state; recording the
 * same snapshot twice changes nothing.
 */
const spawns = new Map<string, Spawn>();

export function resetCelestialSpawns() {
  spawns.clear();
}

/** Lapsis eternal night (老三) 天体碰撞. */
export function addCelestialCollision(ctx: BuildContext) {
  const balls = ctx.snapshot.entities.filter(
    (entity) =>
      !entity.isDead &&
      (entity.monsterId === LIGHT_BALL_MONSTER_ID ||
        entity.monsterId === DARK_BALL_MONSTER_ID),
  );
  rememberSpawns(balls, ctx.nowMs);
  for (const ball of balls) {
    ctx.entityColorSlots.set(
      ball.entityUuid,
      ball.monsterId === LIGHT_BALL_MONSTER_ID
        ? COLOR_LIGHT_BALL
        : COLOR_DARK_BALL,
    );
  }

  const group = latestSpawnGroup();
  const alive = balls.filter((ball) => group.has(ball.entityUuid));
  if (group.size === 3 && alive.length > 0) {
    addTriple(ctx, group, alive.length);
    return;
  }
  const light = balls.filter(
    (ball) => ball.monsterId === LIGHT_BALL_MONSTER_ID,
  );
  const dark = balls.filter((ball) => ball.monsterId === DARK_BALL_MONSTER_ID);
  if (light.length === 1 && dark.length === 1) {
    addPair(ctx, light[0]!, dark[0]!);
  }
}

function addPair(ctx: BuildContext, light: MinimapEntity, dark: MinimapEntity) {
  const prediction = predictPair(light, dark);
  const timer = pairTimer(ctx, light, dark, prediction);
  if (timer) {
    ctx.regions.push(
      circle(prediction.collision, EXPLOSION_RADIUS, COLOR_DANGER),
    );
  }
  ctx.regions.push(
    circle(prediction.collision, COLLISION_MARK_RADIUS, COLOR_DANGER),
    labeledDisc(
      prediction.safe,
      SPOT_MARK_RADIUS,
      COLOR_SAFE,
      t(textKeys.safeSpot),
    ),
  );
  addRow(ctx, {
    key: "celestial",
    group: t(textKeys.celestial),
    label: t(textKeys.celestialPair, { gap: Math.round(prediction.gapDeg) }),
    colorSlot: COLOR_DANGER,
    createTimeMs: timer?.castMs ?? 0,
    durationMs: timer ? timer.explodeAtMs - timer.castMs : 0,
    targets: [],
    hideTimer: !timer,
  });
}

/**
 * From the 控制球 cast to the explosion, or null before the cast and after
 * the explosion. Timed from the spawn gap when known, so the countdown
 * doesn't drift while the balls move.
 */
function pairTimer(
  ctx: BuildContext,
  light: MinimapEntity,
  dark: MinimapEntity,
  live: PairPrediction,
): { castMs: number; explodeAtMs: number } | null {
  const cast = castFor(ctx, [light.entityUuid, dark.entityUuid]);
  if (!cast) return null;
  const lightSpawn = spawns.get(light.entityUuid);
  const darkSpawn = spawns.get(dark.entityUuid);
  let explodeAtMs: number;
  if (lightSpawn && darkSpawn) {
    const fromSpawn = predictPair(
      pointAt(lightSpawn.bearing, SPAWN_RADIUS),
      pointAt(darkSpawn.bearing, SPAWN_RADIUS),
    );
    explodeAtMs =
      cast.timeMs + MOVE_DELAY_MS + fromSpawn.moveMs + EXPLODE_DELAY_MS;
  } else if (atSpawn(light) && atSpawn(dark)) {
    explodeAtMs = cast.timeMs + MOVE_DELAY_MS + live.moveMs + EXPLODE_DELAY_MS;
  } else {
    explodeAtMs = ctx.nowMs + live.moveMs + EXPLODE_DELAY_MS;
  }
  if (ctx.nowMs > explodeAtMs + 500) return null;
  return { castMs: cast.timeMs, explodeAtMs };
}

function addTriple(
  ctx: BuildContext,
  group: Map<string, Spawn>,
  aliveCount: number,
) {
  const guide = tripleGuide([...group.values()].map((spawn) => spawn.bearing));
  if (!guide) return;
  const firstPhase = aliveCount === 3;
  const spotBearing = firstPhase ? guide.firstBearing : guide.secondBearing;
  if (castFor(ctx, [...group.keys()])) {
    ctx.regions.push(
      circle(
        pointAt(spotBearing + 180, COLLISION_RADIUS),
        EXPLOSION_RADIUS,
        COLOR_DANGER,
      ),
    );
  }
  if (firstPhase) {
    const arc = normalize(guide.secondBearing - guide.firstBearing);
    const steps = Math.max(2, Math.ceil(arc / PATH_STEP_DEG));
    for (let i = 0; i < steps; i++) {
      const from = pointAt(guide.firstBearing + (arc * i) / steps, SPOT_RADIUS);
      const to = pointAt(
        guide.firstBearing + (arc * (i + 1)) / steps,
        SPOT_RADIUS,
      );
      ctx.regions.push({
        kind: "line",
        x1: from.x,
        z1: from.z,
        x2: to.x,
        z2: to.z,
        colorSlot: COLOR_SAFE,
        widthPx: 2,
      });
    }
    ctx.regions.push(
      labeledDisc(
        pointAt(guide.firstBearing, SPOT_RADIUS),
        SPOT_MARK_RADIUS,
        COLOR_SAFE,
        t(textKeys.firstSpot),
      ),
    );
  }
  ctx.regions.push(
    labeledDisc(
      pointAt(guide.secondBearing, SPOT_RADIUS),
      SPOT_MARK_RADIUS,
      firstPhase ? COLOR_NEXT : COLOR_SAFE,
      t(textKeys.secondSpot),
    ),
  );
  addRow(ctx, {
    key: "celestial",
    group: t(textKeys.celestial),
    label: t(textKeys.celestialTriple),
    colorSlot: COLOR_DANGER,
    createTimeMs: 0,
    durationMs: 0,
    targets: [],
    hideTimer: true,
  });
}

/** The latest 控制球 cast, if it came after these balls spawned. */
function castFor(ctx: BuildContext, uuids: readonly string[]) {
  const cast = latestCast(ctx, SKILL_CONTROL_BALLS, CAST_WINDOW_MS);
  if (!cast) return undefined;
  const spawnedMs = Math.max(
    ...uuids.map((uuid) => spawns.get(uuid)?.seenMs ?? 0),
  );
  return cast.timeMs + SPAWN_GROUP_MS >= spawnedMs ? cast : undefined;
}

function rememberSpawns(balls: readonly MinimapEntity[], nowMs: number) {
  for (const [uuid, spawn] of spawns) {
    if (nowMs - spawn.seenMs > SPAWN_TTL_MS) spawns.delete(uuid);
  }
  for (const ball of balls) {
    if (spawns.has(ball.entityUuid) || !atSpawn(ball)) continue;
    spawns.set(ball.entityUuid, { bearing: bearingOf(ball), seenMs: nowMs });
  }
}

/** The balls of the most recent summon, by spawn time. */
function latestSpawnGroup(): Map<string, Spawn> {
  const latest = Math.max(
    0,
    ...[...spawns.values()].map((spawn) => spawn.seenMs),
  );
  return new Map(
    [...spawns].filter(([, spawn]) => latest - spawn.seenMs <= SPAWN_GROUP_MS),
  );
}

function atSpawn(ball: ArenaPoint): boolean {
  return Math.abs(Math.hypot(ball.x, ball.z) - SPAWN_RADIUS) <= SPAWN_TOLERANCE;
}

/** Degrees clockwise from +Z, the minimap's clockwise. */
function bearingOf(point: ArenaPoint): number {
  return normalize((Math.atan2(point.x, point.z) * 180) / Math.PI);
}

function pointAt(bearing: number, radius: number): ArenaPoint {
  const rad = (bearing * Math.PI) / 180;
  return { x: Math.sin(rad) * radius, z: Math.cos(rad) * radius };
}

function normalize(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
