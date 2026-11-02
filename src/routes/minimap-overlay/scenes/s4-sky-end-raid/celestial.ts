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
/** 控制球: starts the chase. */
const SKILL_CONTROL_BALLS = 10360011;

// Fitted on eight explosions in three logs (1792922485907, 1793021651371,
// 1793362959357; spawn gaps 90°, 180° and 270°): every ball runs clockwise
// (bearing increasing), the dark one twice as fast. With three balls the
// dark one chases each light ball in turn and only stops at the last one.
const LIGHT_DEG_PER_S = 15.15;
const DARK_DEG_PER_S = 31;
const LIGHT_RUN_RADIUS = 34.72;
const DARK_RUN_RADIUS = 33.92;
/**
 * The chase is checked once a second after the start: a light ball stops
 * 0.1 s before the first whole second the dark one is within reach, so a
 * spawn gap of 90°, 180° or 270° stops after 4.9, 10.9 or 16.9 s.
 */
const CATCH_GAP_DEG = 13.4;
const STOP_LEAD_MS = 100;
/** 控制球 cast to the start buff (1.50–1.63 s logged). */
const MOVE_DELAY_MS = 1_550;
/** The balls visibly set off ~0.1 s after the start buff. */
const MOTION_LAG_MS = 100;
const EXPLODE_DELAY_MS = 520;
/** Players were hit at ≤ 47.85 m from the collision, spared at ≥ 49.51 m. */
const EXPLOSION_RADIUS = 48.7;
/** Players spared on the far side stood at 19–33 m. */
const SPOT_RADIUS = 27;
const SPAWN_RADIUS = 35;
const SPAWN_TOLERANCE = 0.3;
/** Balls of one summon appear within milliseconds of each other. */
const SPAWN_GROUP_MS = 2_000;
const SPAWN_TTL_MS = 90_000;
/** The longest chase (270° gap) explodes ~19 s after the cast. */
const CAST_WINDOW_MS = 20_000;
/** A finished explosion's countdown lingers this long before moving on. */
const EXPLODED_GRACE_MS = 500;
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

export type ChasePrediction = {
  /** Clockwise distance from the dark ball forward to the light ball. */
  gapDeg: number;
  /** From the 控制球 cast to this light ball's explosion. */
  explodeAfterCastMs: number;
  /** Midpoint of where the two balls stop. */
  collision: ArenaPoint;
  safe: ArenaPoint;
};

/**
 * The dark ball chasing one light ball from their spawn positions ("追上才
 * 停"). The light ball always stops where it is caught, whether or not the
 * dark one stops with it.
 */
export function predictChase(
  lightSpawn: ArenaPoint,
  darkSpawn: ArenaPoint,
): ChasePrediction {
  const lightBearing = bearingOf(lightSpawn);
  const darkBearing = bearingOf(darkSpawn);
  const gapDeg = normalize(lightBearing - darkBearing);
  const checks = Math.max(
    1,
    Math.ceil((gapDeg - CATCH_GAP_DEG) / (DARK_DEG_PER_S - LIGHT_DEG_PER_S)),
  );
  const stopAfterStartMs = checks * 1_000 - STOP_LEAD_MS;
  const movedS = (stopAfterStartMs - MOTION_LAG_MS) / 1_000;
  const light = pointAt(
    lightBearing + LIGHT_DEG_PER_S * movedS,
    LIGHT_RUN_RADIUS,
  );
  const dark = pointAt(darkBearing + DARK_DEG_PER_S * movedS, DARK_RUN_RADIUS);
  const collision = { x: (light.x + dark.x) / 2, z: (light.z + dark.z) / 2 };
  return {
    gapDeg,
    explodeAfterCastMs: MOVE_DELAY_MS + stopAfterStartMs + EXPLODE_DELAY_MS,
    collision,
    safe: pointAt(bearingOf(collision) + 180, SPOT_RADIUS),
  };
}

export type TripleGuide = { firstBearing: number; secondBearing: number };

/**
 * Three balls, from the challenge-mode guide (colours don't matter): clockwise
 * from the widest gap, stand between the first two balls; after the first
 * explosion walk clockwise along the edge to the second ball's spawn.
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

/**
 * Both explosions of a three-ball summon, earliest first, as delays after the
 * 控制球 cast. Only for the logged make-up of two light balls and one dark.
 */
export function tripleExplosions(
  balls: readonly { light: boolean; bearing: number }[],
): [number, number] | null {
  const dark = balls.filter((ball) => !ball.light);
  const [a, b, ...rest] = balls.filter((ball) => ball.light);
  if (dark.length !== 1 || !a || !b || rest.length > 0) return null;
  const darkSpawn = pointAt(dark[0]!.bearing, SPAWN_RADIUS);
  const delay = (ball: { bearing: number }) =>
    predictChase(pointAt(ball.bearing, SPAWN_RADIUS), darkSpawn)
      .explodeAfterCastMs;
  const [first, second] = [delay(a), delay(b)].sort((x, y) => x - y);
  return [first!, second!];
}

type Spawn = { bearing: number; light: boolean; seenMs: number };

/**
 * Spawn positions, kept after the balls start moving: every prediction is
 * made from where they appeared. A plain map rather than reactive state, so
 * the view builder can record into it while it runs; recording the same
 * snapshot twice changes nothing.
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

/** Nothing is predicted for balls first seen already moving. */
function addPair(ctx: BuildContext, light: MinimapEntity, dark: MinimapEntity) {
  const lightSpawn = spawns.get(light.entityUuid);
  const darkSpawn = spawns.get(dark.entityUuid);
  if (!lightSpawn || !darkSpawn) return;
  const prediction = predictChase(
    pointAt(lightSpawn.bearing, SPAWN_RADIUS),
    pointAt(darkSpawn.bearing, SPAWN_RADIUS),
  );
  const timer = pairTimer(ctx, [light.entityUuid, dark.entityUuid], prediction);
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

/** From the 控制球 cast to the explosion; null before the cast and after it. */
function pairTimer(
  ctx: BuildContext,
  uuids: readonly string[],
  prediction: ChasePrediction,
): { castMs: number; explodeAtMs: number } | null {
  const cast = castFor(ctx, uuids);
  if (!cast) return null;
  const explodeAtMs = cast.timeMs + prediction.explodeAfterCastMs;
  if (ctx.nowMs > explodeAtMs + EXPLODED_GRACE_MS) return null;
  return { castMs: cast.timeMs, explodeAtMs };
}

/**
 * The guide's two stops, and a countdown to whichever explosion is next.
 * Where the explosions land is left undrawn: their reach was only inferred
 * from who got hit.
 */
function addTriple(
  ctx: BuildContext,
  group: Map<string, Spawn>,
  aliveCount: number,
) {
  const guide = tripleGuide([...group.values()].map((spawn) => spawn.bearing));
  if (!guide) return;
  // The first caught light ball leaves the field right after its explosion.
  const firstPhase = aliveCount === 3;
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

  const next = nextTripleExplosion(ctx, group, firstPhase);
  addRow(ctx, {
    key: "celestial",
    group: t(textKeys.celestial),
    label: t(textKeys.celestialTriple, {
      n: next?.number ?? (firstPhase ? 1 : 2),
    }),
    colorSlot: COLOR_DANGER,
    createTimeMs: next?.fromMs ?? 0,
    durationMs: next ? next.atMs - next.fromMs : 0,
    targets: [],
    hideTimer: !next,
  });
}

function nextTripleExplosion(
  ctx: BuildContext,
  group: Map<string, Spawn>,
  firstPhase: boolean,
): { number: 1 | 2; fromMs: number; atMs: number } | null {
  const cast = castFor(ctx, [...group.keys()]);
  const delays = tripleExplosions([...group.values()]);
  if (!cast || !delays) return null;
  const first = cast.timeMs + delays[0];
  const second = cast.timeMs + delays[1];
  if (firstPhase && ctx.nowMs <= first + EXPLODED_GRACE_MS) {
    return { number: 1, fromMs: cast.timeMs, atMs: first };
  }
  if (ctx.nowMs <= second + EXPLODED_GRACE_MS) {
    return { number: 2, fromMs: first, atMs: second };
  }
  return null;
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
    spawns.set(ball.entityUuid, {
      bearing: bearingOf(ball),
      light: ball.monsterId === LIGHT_BALL_MONSTER_ID,
      seenMs: nowMs,
    });
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
