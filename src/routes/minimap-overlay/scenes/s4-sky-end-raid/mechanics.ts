import type {
  MinimapBuffFact,
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import { t } from "$lib/i18n/index.svelte";
import { overlayNow } from "../../../game-overlay/overlay-clock.svelte.js";
import { mergeMechanicTargets, toMechanicTargets } from "../../mechanic-row";
import type {
  MechanicRegion,
  MechanicRow,
  MechanicRowTarget,
  MinimapVoiceCueDef,
  MinimapVoiceCueFire,
} from "../../scene-types";
import { resolveSkillVoiceCues } from "../../voice-cue-utils";

export type LapsisMechanicView = {
  regions: MechanicRegion[];
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
};

type DisplayName = (entity: MinimapEntity) => string;

const BOSS_MONSTER_IDS = new Set([103400, 103410, 103420]);
const SPEAR_MONSTER_ID = 103404;
const OUTER_LIGHT_MONSTER_ID = 103421;
const PRAYER_MONSTER_ID = 103422;
const CHASER_MONSTER_ID = 103423;
/** The eternal-day centre dummies reuse the summoning skill id as config id. */
const ETERNAL_DAY_CENTER_MONSTER_ID = 3395177;

const SKILL_FULL_BURST = 3395170;
const SKILL_LIGHT_SPEAR = 3395166;
const SKILL_RAIN = 3395174;
const SKILL_SPROUT = 3395175;
const SKILL_LIGHT_TRACK = 3395176;
const SKILL_ETERNAL_DAY = 3395177;
const SKILL_WISH = 3395178;
const SKILL_SHADOW = 3395179;

/** 点名光矛: the players the giant light spear is aimed at. */
const BUFF_SPEAR_TARGET = 829517;
/** 金石生芽（主要）. */
const BUFF_SPROUT = 829530;
/** 死刑易伤: tank vulnerability left by 四时天光化雨. */
const BUFF_RAIN_VULNERABLE = 829531;
/** 谒彼诸天_易伤. */
const BUFF_ETERNAL_DAY_VULNERABLE = 829535;
/** 喻形成殇_点名: 270° fan callout, shown as a name row only. */
const BUFF_SHADOW_TARGET = 829537;
/** 追人连线: self-applied by a chaser while its chase link is alive. */
const BUFF_CHASE_LINK = 829539;

const FULL_BURST_RADIUS = 28.67;
const WISH_RADIUS = 33.33;
const SPEAR_RADIUS = 2;
const PRAYER_RADIUS = 2;
const ETERNAL_DAY_CENTER_RADIUS = 3;
const LIGHT_TRACK_RADIUS = 6;

const COLOR_BOSS = 3;
const COLOR_SPEAR = 5;
const COLOR_LIGHT_TRACK = 2;
const COLOR_RAIN = 7;
const COLOR_SPROUT = 8;
const COLOR_ETERNAL_DAY = 1;
const COLOR_WISH = 6;
const COLOR_OUTER_LIGHT = 4;
const COLOR_PRAYER = 9;
const COLOR_CHASER = 10;

const textKeys = {
  boss: "minimap.s4SkyEndRaid.boss",
  fullBurst: "minimap.s4SkyEndRaid.fullBurst",
  lightSpear: "minimap.s4SkyEndRaid.lightSpear",
  lightSpearHp: "minimap.s4SkyEndRaid.lightSpearHp",
  lightTrack: "minimap.s4SkyEndRaid.lightTrack",
  rain: "minimap.s4SkyEndRaid.rain",
  rainVulnerable: "minimap.s4SkyEndRaid.rainVulnerable",
  sprout: "minimap.s4SkyEndRaid.sprout",
  eternalDay: "minimap.s4SkyEndRaid.eternalDay",
  eternalDayCenters: "minimap.s4SkyEndRaid.eternalDayCenters",
  wish: "minimap.s4SkyEndRaid.wish",
  shadow: "minimap.s4SkyEndRaid.shadow",
  outerLight: "minimap.s4SkyEndRaid.outerLight",
  prayer: "minimap.s4SkyEndRaid.prayer",
  entityCount: "minimap.s4SkyEndRaid.entityCount",
  chaser: "minimap.s4SkyEndRaid.chaser",
  chaserRow: "minimap.s4SkyEndRaid.chaserRow",
  chaserRowNoHp: "minimap.s4SkyEndRaid.chaserRowNoHp",
  chaserTarget: "minimap.s4SkyEndRaid.chaserTarget",
} as const;

type TextKey = (typeof textKeys)[keyof typeof textKeys];

const voiceCueIds = {
  fullBurst: "s4-sky-end-raid.fullBurst",
  lightSpear: "s4-sky-end-raid.lightSpear",
  rain: "s4-sky-end-raid.rain",
  wish: "s4-sky-end-raid.wish",
  chaserTarget: "s4-sky-end-raid.chaserTarget",
} as const;

export const S4_SKY_END_RAID_VOICE_CUES: MinimapVoiceCueDef[] = [
  {
    id: voiceCueIds.fullBurst,
    labelKey: textKeys.fullBurst,
    autoText: "全屏爆发",
  },
  {
    id: voiceCueIds.lightSpear,
    labelKey: textKeys.lightSpear,
    autoText: "巨型光矛",
  },
  { id: voiceCueIds.rain, labelKey: textKeys.rain, autoText: "天光化雨" },
  { id: voiceCueIds.wish, labelKey: textKeys.wish, autoText: "名启归愿" },
  {
    id: voiceCueIds.chaserTarget,
    labelKey: textKeys.chaserTarget,
    autoText: "小金人追你",
  },
];

/** Each cue has exactly one trigger source so one mechanic speaks once. */
export function resolveLapsisVoiceCues(
  snapshot: MinimapSnapshot,
  skillCasts: MinimapSkillCast[],
): MinimapVoiceCueFire[] {
  const fires = resolveSkillVoiceCues(skillCasts, {
    [SKILL_FULL_BURST]: voiceCueIds.fullBurst,
    [SKILL_LIGHT_SPEAR]: voiceCueIds.lightSpear,
    [SKILL_RAIN]: voiceCueIds.rain,
    [SKILL_WISH]: voiceCueIds.wish,
  });
  const linked = chaseLinkedEntities(snapshot);
  for (const chaser of snapshot.entities) {
    if (
      chaser.monsterId !== CHASER_MONSTER_ID ||
      !linked.has(chaser.entityUuid) ||
      !snapshot.localPlayerUuid ||
      chaser.targetEntityUuid !== snapshot.localPlayerUuid
    ) {
      continue;
    }
    fires.push({
      cueId: voiceCueIds.chaserTarget,
      instanceKey: `${chaser.entityUuid}:${chaser.targetEntityUuid}`,
    });
  }
  return fires;
}

export function buildMechanicView(
  snapshot: MinimapSnapshot,
  displayName: DisplayName,
  skillCasts: readonly MinimapSkillCast[] = [],
  nowMs = overlayNow(),
): LapsisMechanicView {
  const ctx: BuildContext = {
    snapshot,
    displayName,
    skillCasts,
    nowMs,
    entitiesByUuid: new Map(
      snapshot.entities.map((entity) => [entity.entityUuid, entity]),
    ),
    boss: snapshot.entities.find(
      (entity) =>
        entity.monsterId != null && BOSS_MONSTER_IDS.has(entity.monsterId),
    ),
    regions: [],
    rows: new Map(),
    entityColorSlots: new Map(),
  };

  addFullBurst(ctx);
  addLightSpear(ctx);
  addLightTrack(ctx);
  addRain(ctx);
  addSprout(ctx);
  addEternalDay(ctx);
  addWish(ctx);
  addCastRow(ctx, SKILL_SHADOW, "shadow", textKeys.shadow, COLOR_LIGHT_TRACK);
  addBuffRow(
    ctx,
    BUFF_SHADOW_TARGET,
    "shadow",
    textKeys.shadow,
    COLOR_LIGHT_TRACK,
  );
  addOuterLight(ctx);
  addPrayer(ctx);
  addChasers(ctx);

  return {
    regions: ctx.regions,
    rows: [...ctx.rows.values()],
    entityColorSlots: ctx.entityColorSlots,
  };
}

type BuildContext = {
  snapshot: MinimapSnapshot;
  displayName: DisplayName;
  skillCasts: readonly MinimapSkillCast[];
  nowMs: number;
  entitiesByUuid: Map<string, MinimapEntity>;
  boss: MinimapEntity | undefined;
  regions: MechanicRegion[];
  rows: Map<string, MechanicRow>;
  entityColorSlots: Map<string, number>;
};

function addFullBurst(ctx: BuildContext) {
  const cast = latestCast(ctx, SKILL_FULL_BURST, 4_000);
  if (!cast) return;
  const center =
    cast.x != null && cast.z != null
      ? { x: cast.x, z: cast.z }
      : bossCenter(ctx);
  ctx.regions.push(circle(center, FULL_BURST_RADIUS, COLOR_BOSS));
  addRow(ctx, {
    key: "fullBurst",
    group: t(textKeys.boss),
    label: t(textKeys.fullBurst),
    colorSlot: COLOR_BOSS,
    createTimeMs: cast.timeMs,
    durationMs: 4_000,
    targets: [],
  });
}

function addLightSpear(ctx: BuildContext) {
  const cast = latestCast(ctx, SKILL_LIGHT_SPEAR, 5_000);
  const buffs = activeBuffs(ctx, BUFF_SPEAR_TARGET);
  if (cast || buffs.length > 0) {
    addRow(ctx, {
      key: "lightSpear",
      group: t(textKeys.lightSpear),
      label: t(textKeys.lightSpear),
      colorSlot: COLOR_SPEAR,
      createTimeMs:
        cast?.timeMs ?? Math.min(...buffs.map((buff) => buff.createTimeMs)),
      durationMs: cast ? 5_000 : maxDuration(buffs),
      targets: playerTargets(ctx, buffs),
    });
  }

  const percents: number[] = [];
  for (const spear of entitiesOf(ctx, SPEAR_MONSTER_ID)) {
    ctx.entityColorSlots.set(spear.entityUuid, COLOR_SPEAR);
    ctx.regions.push(circle(spear, SPEAR_RADIUS, COLOR_SPEAR));
    const percent = hpPercent(spear);
    if (percent == null) continue;
    percents.push(percent);
  }
  if (percents.length === 0) return;
  percents.sort((left, right) => right - left);
  ctx.rows.set("lightSpear:hp", {
    key: "lightSpear:hp",
    group: t(textKeys.lightSpear),
    label: t(textKeys.lightSpearHp, {
      percents: percents.map((percent) => `${percent}%`).join("  "),
    }),
    colorSlot: COLOR_SPEAR,
    createTimeMs: 0,
    durationMs: 0,
    targets: [],
    hideTimer: true,
  });
}

function addLightTrack(ctx: BuildContext) {
  for (const cast of ctx.skillCasts) {
    if (
      cast.skillId !== SKILL_LIGHT_TRACK ||
      !activeAt(cast.timeMs, 3_000, ctx.nowMs) ||
      cast.x == null ||
      cast.z == null ||
      cast.facing == null
    ) {
      continue;
    }
    for (const halfWidth of [77.5, 15]) {
      ctx.regions.push({
        kind: "sector",
        x: cast.x,
        z: cast.z,
        radius: LIGHT_TRACK_RADIUS,
        startDeg: cast.facing - halfWidth,
        endDeg: cast.facing + halfWidth,
        colorSlot: COLOR_LIGHT_TRACK,
      });
    }
    addRow(ctx, {
      key: "lightTrack",
      group: t(textKeys.boss),
      label: t(textKeys.lightTrack),
      colorSlot: COLOR_LIGHT_TRACK,
      createTimeMs: cast.timeMs,
      durationMs: 3_000,
      targets: [],
    });
  }
}

function addRain(ctx: BuildContext) {
  addCastRow(ctx, SKILL_RAIN, "rain", textKeys.rain, COLOR_RAIN);
  addBuffRow(
    ctx,
    BUFF_RAIN_VULNERABLE,
    "rain:vulnerable",
    textKeys.rainVulnerable,
    COLOR_RAIN,
  );
}

function addSprout(ctx: BuildContext) {
  addCastRow(ctx, SKILL_SPROUT, "sprout", textKeys.sprout, COLOR_SPROUT);
  addBuffRow(ctx, BUFF_SPROUT, "sprout", textKeys.sprout, COLOR_SPROUT);
}

function addEternalDay(ctx: BuildContext) {
  addCastRow(
    ctx,
    SKILL_ETERNAL_DAY,
    "eternalDay",
    textKeys.eternalDay,
    COLOR_ETERNAL_DAY,
    15_000,
  );
  addBuffRow(
    ctx,
    BUFF_ETERNAL_DAY_VULNERABLE,
    "eternalDay",
    textKeys.eternalDay,
    COLOR_ETERNAL_DAY,
  );

  const centers = entitiesOf(ctx, ETERNAL_DAY_CENTER_MONSTER_ID);
  for (const center of centers) {
    ctx.entityColorSlots.set(center.entityUuid, COLOR_ETERNAL_DAY);
    ctx.regions.push(
      circle(center, ETERNAL_DAY_CENTER_RADIUS, COLOR_ETERNAL_DAY),
    );
  }
  if (centers.length > 0) {
    addCountRow(
      ctx,
      "eternalDay:centers",
      textKeys.eternalDay,
      textKeys.eternalDayCenters,
      centers.length,
      COLOR_ETERNAL_DAY,
    );
  }
}

function addWish(ctx: BuildContext) {
  const cast = latestCast(ctx, SKILL_WISH, 5_000);
  if (!cast) return;
  ctx.regions.push(circle(bossCenter(ctx), WISH_RADIUS, COLOR_WISH));
  addCastRow(ctx, SKILL_WISH, "wish", textKeys.wish, COLOR_WISH);
}

function addOuterLight(ctx: BuildContext) {
  const outer = entitiesOf(ctx, OUTER_LIGHT_MONSTER_ID);
  for (const entity of outer) {
    ctx.entityColorSlots.set(entity.entityUuid, COLOR_OUTER_LIGHT);
  }
  if (outer.length > 0) {
    addCountRow(
      ctx,
      "outerLight",
      textKeys.outerLight,
      textKeys.entityCount,
      outer.length,
      COLOR_OUTER_LIGHT,
    );
  }
}

function addPrayer(ctx: BuildContext) {
  const prayer = entitiesOf(ctx, PRAYER_MONSTER_ID);
  for (const entity of prayer) {
    ctx.entityColorSlots.set(entity.entityUuid, COLOR_PRAYER);
    ctx.regions.push(circle(entity, PRAYER_RADIUS, COLOR_PRAYER));
  }
  if (prayer.length > 0) {
    addCountRow(
      ctx,
      "prayer",
      textKeys.prayer,
      textKeys.entityCount,
      prayer.length,
      COLOR_PRAYER,
    );
  }
}

/**
 * Chasers (小金人) lock onto the player in attr 30 when they spawn and
 * explode on contact, on colliding with another chaser, or when their target
 * dies. The link is drawn only while the chase-link buff is alive.
 */
function addChasers(ctx: BuildContext) {
  const linked = chaseLinkedEntities(ctx.snapshot);
  const chases: { chaser: MinimapEntity; target: MinimapEntity }[] = [];
  for (const chaser of entitiesOf(ctx, CHASER_MONSTER_ID)) {
    ctx.entityColorSlots.set(chaser.entityUuid, COLOR_CHASER);
    if (!linked.has(chaser.entityUuid) || !chaser.targetEntityUuid) continue;
    const target = ctx.entitiesByUuid.get(chaser.targetEntityUuid);
    if (!target || target.isDead) continue;
    chases.push({ chaser, target });
  }

  const local = ctx.snapshot.localPlayerUuid;
  chases.sort(
    (left, right) =>
      Number(right.target.entityUuid === local) -
      Number(left.target.entityUuid === local),
  );
  for (const { chaser, target } of chases) {
    ctx.entityColorSlots.set(target.entityUuid, COLOR_CHASER);
    ctx.regions.push({
      kind: "line",
      x1: chaser.x,
      z1: chaser.z,
      x2: target.x,
      z2: target.z,
      colorSlot: COLOR_CHASER,
      widthPx: 3,
    });
    const distance = Math.hypot(chaser.x - target.x, chaser.z - target.z);
    const name = ctx.displayName(target);
    const distanceLabel = distance.toFixed(1);
    const percent = hpPercent(chaser);
    addRow(ctx, {
      key: `chaser:${chaser.entityUuid}`,
      group: t(textKeys.chaser),
      label:
        percent == null
          ? t(textKeys.chaserRowNoHp, { name, distance: distanceLabel })
          : t(textKeys.chaserRow, {
              hp: percent,
              name,
              distance: distanceLabel,
            }),
      colorSlot: COLOR_CHASER,
      createTimeMs: 0,
      durationMs: 0,
      targets: [],
      hideTimer: true,
    });
  }
}

function addCastRow(
  ctx: BuildContext,
  skillId: number,
  key: string,
  labelKey: TextKey,
  colorSlot: number,
  durationMs = 5_000,
) {
  const cast = latestCast(ctx, skillId, durationMs);
  if (!cast) return;
  addRow(ctx, {
    key,
    group: t(textKeys.boss),
    label: t(labelKey),
    colorSlot,
    createTimeMs: cast.timeMs,
    durationMs,
    targets: [],
  });
}

function addBuffRow(
  ctx: BuildContext,
  buffId: number,
  key: string,
  labelKey: TextKey,
  colorSlot: number,
) {
  const buffs = activeBuffs(ctx, buffId);
  if (buffs.length === 0) return;
  addRow(ctx, {
    key,
    group: t(textKeys.boss),
    label: t(labelKey),
    colorSlot,
    createTimeMs: Math.min(...buffs.map((buff) => buff.createTimeMs)),
    durationMs: maxDuration(buffs),
    targets: playerTargets(ctx, buffs),
  });
}

function addCountRow(
  ctx: BuildContext,
  key: string,
  groupKey: TextKey,
  labelKey: TextKey,
  count: number,
  colorSlot: number,
) {
  addRow(ctx, {
    key,
    group: t(groupKey),
    label: t(labelKey, { count }),
    colorSlot,
    createTimeMs: 0,
    durationMs: 0,
    targets: [],
    hideTimer: true,
  });
}

/** Merges rows sharing a key (e.g. a cast and the buff it applies). */
function addRow(ctx: BuildContext, next: MechanicRow) {
  const current = ctx.rows.get(next.key);
  if (!current) {
    ctx.rows.set(next.key, next);
    return;
  }
  const currentEnd = current.createTimeMs + current.durationMs;
  const nextEnd = next.createTimeMs + next.durationMs;
  current.createTimeMs = Math.min(current.createTimeMs, next.createTimeMs);
  current.durationMs = Math.max(currentEnd, nextEnd) - current.createTimeMs;
  mergeMechanicTargets(current.targets, next.targets);
}

function chaseLinkedEntities(snapshot: MinimapSnapshot): Set<string> {
  return new Set(
    snapshot.buffs
      .filter((buff) => buff.baseId === BUFF_CHASE_LINK)
      .map((buff) => buff.targetEntityUuid),
  );
}

function entitiesOf(ctx: BuildContext, monsterId: number): MinimapEntity[] {
  return ctx.snapshot.entities.filter(
    (entity) => entity.monsterId === monsterId && !entity.isDead,
  );
}

function activeBuffs(ctx: BuildContext, buffId: number): MinimapBuffFact[] {
  return ctx.snapshot.buffs.filter(
    (buff) =>
      buff.baseId === buffId &&
      activeAt(buff.createTimeMs, buff.durationMs, ctx.nowMs),
  );
}

function playerTargets(
  ctx: BuildContext,
  buffs: readonly MinimapBuffFact[],
): MechanicRowTarget[] {
  const targets: MechanicRowTarget[] = [];
  for (const buff of buffs) {
    const entity = ctx.entitiesByUuid.get(buff.targetEntityUuid);
    if (!entity || (entity.kind !== "local" && entity.kind !== "teammate")) {
      continue;
    }
    mergeMechanicTargets(
      targets,
      toMechanicTargets(entity, ctx.snapshot.localPlayerUuid, ctx.displayName),
    );
  }
  return targets;
}

function latestCast(
  ctx: BuildContext,
  skillId: number,
  windowMs: number,
): MinimapSkillCast | undefined {
  let latest: MinimapSkillCast | undefined;
  for (const cast of ctx.skillCasts) {
    if (cast.skillId !== skillId || !activeAt(cast.timeMs, windowMs, ctx.nowMs))
      continue;
    if (!latest || cast.timeMs > latest.timeMs) latest = cast;
  }
  return latest;
}

function bossCenter(ctx: BuildContext): { x: number; z: number } {
  return { x: ctx.boss?.x ?? 0, z: ctx.boss?.z ?? 0 };
}

function circle(
  center: { x: number; z: number },
  radius: number,
  colorSlot: number,
): MechanicRegion {
  return {
    kind: "sector",
    x: center.x,
    z: center.z,
    radius,
    startDeg: 0,
    endDeg: 360,
    colorSlot,
  };
}

function hpPercent(entity: MinimapEntity): number | null {
  if (entity.currentHp == null || entity.maxHp == null || entity.maxHp <= 0) {
    return null;
  }
  return Math.round((entity.currentHp / entity.maxHp) * 100);
}

function maxDuration(buffs: readonly MinimapBuffFact[]): number {
  return Math.max(0, ...buffs.map((buff) => buff.durationMs));
}

function activeAt(
  createTimeMs: number,
  durationMs: number,
  nowMs: number,
  graceMs = 500,
): boolean {
  if (nowMs < createTimeMs - graceMs) return false;
  return durationMs <= 0 || nowMs <= createTimeMs + durationMs + graceMs;
}
