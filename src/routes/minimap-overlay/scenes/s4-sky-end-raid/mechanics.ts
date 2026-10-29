import type {
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import { t } from "$lib/i18n/index.svelte";
import { overlayNow } from "../../../game-overlay/overlay-clock.svelte.js";
import type {
  MapIcon,
  MechanicRegion,
  MechanicRow,
  MinimapVoiceCueDef,
  MinimapVoiceCueFire,
} from "../../scene-types";
import {
  buffInstanceKey,
  resolveBuffVoiceCues,
  resolveSkillVoiceCues,
} from "../../voice-cue-utils";
import { addCelestialCollision } from "./celestial";
import {
  activeAt,
  activeBuffs,
  addRow,
  type BuildContext,
  circle,
  type DisplayName,
  latestCast,
  maxDuration,
  playerTargets,
} from "./context";
import { addErosion } from "./erosion";
import { addEvilRitual, ritualSides } from "./ritual";
import { addShare, shareOrder } from "./share";
import { addSin } from "./sin";
import { bossRuneBuff, type RuneNumber, turntableRuneIcons } from "./turntable";

export type LapsisMechanicView = {
  regions: MechanicRegion[];
  icons: MapIcon[];
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
};

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
/** 死刑换T (45 s, 老二): armour broken, auto attacks hit much harder. */
const BUFF_TANK_SWAP = 829654;
/** 追踪球目标 (3 s, 老三): the fog orb (+5 erosion) is chasing this player. */
const BUFF_FOG_ORB_TARGET = 829725;

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
const COLOR_FOG_ORB = 11;

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
  runeWheel: "minimap.s4SkyEndRaid.runeWheel",
  bossRune: "minimap.s4SkyEndRaid.bossRune",
  runeShape1: "minimap.s4SkyEndRaid.runeShape1",
  runeShape4: "minimap.s4SkyEndRaid.runeShape4",
  tankSwap: "minimap.s4SkyEndRaid.tankSwap",
  fogOrbTarget: "minimap.s4SkyEndRaid.fogOrbTarget",
  fogOrbSpawn: "minimap.s4SkyEndRaid.fogOrbSpawn",
  sin: "minimap.s4SkyEndRaid.sin",
  extremeSin: "minimap.s4SkyEndRaid.extremeSin",
  shareFirst: "minimap.s4SkyEndRaid.shareFirst",
  shareSecond: "minimap.s4SkyEndRaid.shareSecond",
  shareVulnerable: "minimap.s4SkyEndRaid.shareVulnerable",
  evilRitual: "minimap.s4SkyEndRaid.evilRitual",
  ritualLight: "minimap.s4SkyEndRaid.ritualLight",
  ritualDark: "minimap.s4SkyEndRaid.ritualDark",
  erosion: "minimap.s4SkyEndRaid.erosion",
  selfDestruct: "minimap.s4SkyEndRaid.selfDestruct",
  celestial: "minimap.s4SkyEndRaid.celestial",
} as const;

type TextKey = (typeof textKeys)[keyof typeof textKeys];

/** The boss only ever holds rune 1 or rune 4; slots match the glyph colours. */
const BOSS_RUNE_ROWS: Partial<
  Record<RuneNumber, { colorSlot: number; shapeKey: TextKey }>
> = {
  1: { colorSlot: 1, shapeKey: textKeys.runeShape1 },
  4: { colorSlot: 0, shapeKey: textKeys.runeShape4 },
};

const voiceCueIds = {
  lightTrack: "s4-sky-end-raid.lightTrack",
  sprout: "s4-sky-end-raid.sprout",
  eternalDay: "s4-sky-end-raid.eternalDay",
  shadow: "s4-sky-end-raid.shadow",
  rainVulnerable: "s4-sky-end-raid.rainVulnerable",
  outerLight: "s4-sky-end-raid.outerLight",
  prayer: "s4-sky-end-raid.prayer",
  runeWheel: "s4-sky-end-raid.runeWheel",
  sin: "s4-sky-end-raid.sin",
  extremeSin: "s4-sky-end-raid.extremeSin",
  shareFirst: "s4-sky-end-raid.shareFirst",
  shareSecond: "s4-sky-end-raid.shareSecond",
  shareVulnerable: "s4-sky-end-raid.shareVulnerable",
  tankSwap: "s4-sky-end-raid.tankSwap",
  evilRitual: "s4-sky-end-raid.evilRitual",
  ritualLight: "s4-sky-end-raid.ritualLight",
  ritualDark: "s4-sky-end-raid.ritualDark",
  erosion: "s4-sky-end-raid.erosion",
  selfDestruct: "s4-sky-end-raid.selfDestruct",
  fogOrbTarget: "s4-sky-end-raid.fogOrbTarget",
  fogOrbSpawn: "s4-sky-end-raid.fogOrbSpawn",
  celestial: "s4-sky-end-raid.celestial",

  fullBurst: "s4-sky-end-raid.fullBurst",
  lightSpear: "s4-sky-end-raid.lightSpear",
  rain: "s4-sky-end-raid.rain",
  wish: "s4-sky-end-raid.wish",
  chaserTarget: "s4-sky-end-raid.chaserTarget",
} as const;

export const S4_SKY_END_RAID_VOICE_CUES: MinimapVoiceCueDef[] = [
  {
    id: voiceCueIds.lightTrack,
    labelKey: textKeys.lightTrack,
    autoText: "指生苍轨",
  },
  { id: voiceCueIds.sprout, labelKey: textKeys.sprout, autoText: "金石生芽" },
  {
    id: voiceCueIds.eternalDay,
    labelKey: textKeys.eternalDay,
    autoText: "谒彼诸天",
  },
  { id: voiceCueIds.shadow, labelKey: textKeys.shadow, autoText: "影似澄炼" },
  {
    id: voiceCueIds.rainVulnerable,
    labelKey: textKeys.rainVulnerable,
    autoText: "死刑易伤",
  },
  {
    id: voiceCueIds.outerLight,
    labelKey: textKeys.outerLight,
    autoText: "化光眷属出现",
  },
  {
    id: voiceCueIds.prayer,
    labelKey: textKeys.prayer,
    autoText: "祈光人形出现",
  },
  {
    id: voiceCueIds.runeWheel,
    labelKey: textKeys.runeWheel,
    autoText: "符文轮盘",
  },
  { id: voiceCueIds.sin, labelKey: textKeys.sin, autoText: "罪罚层数变化" },
  {
    id: voiceCueIds.extremeSin,
    labelKey: textKeys.extremeSin,
    autoText: "极罪",
  },
  {
    id: voiceCueIds.shareFirst,
    labelKey: textKeys.shareFirst,
    autoText: "第一次分摊点名",
  },
  {
    id: voiceCueIds.shareSecond,
    labelKey: textKeys.shareSecond,
    autoText: "第二次分摊点名",
  },
  {
    id: voiceCueIds.shareVulnerable,
    labelKey: textKeys.shareVulnerable,
    autoText: "分摊易伤",
  },
  {
    id: voiceCueIds.tankSwap,
    labelKey: textKeys.tankSwap,
    autoText: "死刑换T",
  },
  {
    id: voiceCueIds.evilRitual,
    labelKey: textKeys.evilRitual,
    autoText: "邪恶仪式",
  },
  {
    id: voiceCueIds.ritualLight,
    labelKey: textKeys.ritualLight,
    autoText: "你是光球",
  },
  {
    id: voiceCueIds.ritualDark,
    labelKey: textKeys.ritualDark,
    autoText: "你是暗球",
  },
  {
    id: voiceCueIds.erosion,
    labelKey: textKeys.erosion,
    autoText: "暗之侵蚀层数变化",
  },
  {
    id: voiceCueIds.selfDestruct,
    labelKey: textKeys.selfDestruct,
    autoText: "自我毁灭",
  },
  {
    id: voiceCueIds.fogOrbTarget,
    labelKey: textKeys.fogOrbTarget,
    autoText: "虚雾球点名",
  },
  {
    id: voiceCueIds.fogOrbSpawn,
    labelKey: textKeys.fogOrbSpawn,
    autoText: "虚雾球出现",
  },
  {
    id: voiceCueIds.celestial,
    labelKey: textKeys.celestial,
    autoText: "天体碰撞",
  },

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

/** Casts announce arena mechanics; player debuffs only announce local targets. */
export function resolveLapsisVoiceCues(
  snapshot: MinimapSnapshot,
  skillCasts: MinimapSkillCast[],
): MinimapVoiceCueFire[] {
  const fires = resolveSkillVoiceCues(skillCasts, {
    [SKILL_FULL_BURST]: voiceCueIds.fullBurst,
    [SKILL_LIGHT_SPEAR]: voiceCueIds.lightSpear,
    [SKILL_RAIN]: voiceCueIds.rain,
    [SKILL_WISH]: voiceCueIds.wish,
    [SKILL_LIGHT_TRACK]: voiceCueIds.lightTrack,
    [SKILL_SPROUT]: voiceCueIds.sprout,
    [SKILL_ETERNAL_DAY]: voiceCueIds.eternalDay,
    [SKILL_SHADOW]: voiceCueIds.shadow,
    [10360011]: voiceCueIds.celestial,
  });
  fires.push(
    ...resolveBuffVoiceCues(
      snapshot,
      {
        [BUFF_RAIN_VULNERABLE]: voiceCueIds.rainVulnerable,
        [BUFF_TANK_SWAP]: voiceCueIds.tankSwap,
        [BUFF_FOG_ORB_TARGET]: voiceCueIds.fogOrbTarget,
        829602: voiceCueIds.sin,
        829603: voiceCueIds.extremeSin,
        829650: voiceCueIds.shareVulnerable,
        829721: voiceCueIds.erosion,
        829722: voiceCueIds.selfDestruct,
      },
      "localTarget",
    ),
  );
  fires.push(
    ...resolveBuffVoiceCues(
      snapshot,
      {
        829506: voiceCueIds.runeWheel,
        [BUFF_FOG_ORB_TARGET]: voiceCueIds.fogOrbSpawn,
        829509: voiceCueIds.runeWheel,
      },
      "global",
    ),
  );
  for (const entity of snapshot.entities) {
    const cueId =
      entity.monsterId === OUTER_LIGHT_MONSTER_ID
        ? voiceCueIds.outerLight
        : entity.monsterId === PRAYER_MONSTER_ID
          ? voiceCueIds.prayer
          : undefined;
    if (cueId && !entity.isDead) {
      fires.push({ cueId, instanceKey: entity.entityUuid });
    }
  }
  const marks = snapshot.buffs.filter((buff) => buff.baseId === 829649);
  const { first, second } = shareOrder(
    marks,
    snapshot.buffs.filter((buff) => buff.baseId === 829650),
  );
  for (const [buffs, cueId] of [
    [first, voiceCueIds.shareFirst],
    [second, voiceCueIds.shareSecond],
  ] as const) {
    for (const buff of buffs) {
      if (buff.targetEntityUuid === snapshot.localPlayerUuid) {
        fires.push({ cueId, instanceKey: buffInstanceKey(buff) });
      }
    }
  }
  const ritual = snapshot.buffs.filter((buff) => buff.baseId === 829712);
  // A shared instance announces the ritual once, regardless of party size.
  if (ritual.length > 0) {
    fires.push({
      cueId: voiceCueIds.evilRitual,
      instanceKey: String(Math.min(...ritual.map((buff) => buff.createTimeMs))),
    });
  }
  const side = ritualSides(ritual).get(snapshot.localPlayerUuid ?? "");
  const localRitual = ritual.find(
    (buff) => buff.targetEntityUuid === snapshot.localPlayerUuid,
  );
  if (localRitual && (side === "light" || side === "dark")) {
    fires.push({
      cueId:
        side === "light" ? voiceCueIds.ritualLight : voiceCueIds.ritualDark,
      instanceKey: buffInstanceKey(localRitual),
    });
  }
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
  // Group party-wide marks, simultaneous summons and refreshed personal marks
  // into one announcement for each uninterrupted activation of the mechanic.
  const onceWhileActive: ReadonlySet<string> = new Set([
    voiceCueIds.fogOrbSpawn,
    voiceCueIds.fogOrbTarget,
    voiceCueIds.runeWheel,
    voiceCueIds.outerLight,
    voiceCueIds.prayer,
    voiceCueIds.evilRitual,
    voiceCueIds.ritualLight,
    voiceCueIds.ritualDark,
    voiceCueIds.rainVulnerable,
    voiceCueIds.tankSwap,
    voiceCueIds.extremeSin,
    voiceCueIds.shareVulnerable,
    voiceCueIds.shareFirst,
    voiceCueIds.shareSecond,
    voiceCueIds.selfDestruct,
  ]);
  return fires.map((fire) =>
    onceWhileActive.has(fire.cueId) ? { ...fire, onceWhileActive: true } : fire,
  );
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
  addBossRune(ctx);
  addSin(ctx);
  addShare(ctx);
  addBuffRow(ctx, BUFF_TANK_SWAP, "tankSwap", textKeys.tankSwap, COLOR_RAIN);
  addEvilRitual(ctx);
  // After the ritual so a self-destruct holder's colour wins.
  addErosion(ctx);
  addBuffRow(
    ctx,
    BUFF_FOG_ORB_TARGET,
    "fogOrbTarget",
    textKeys.fogOrbTarget,
    COLOR_FOG_ORB,
  );
  addCelestialCollision(ctx);

  return {
    regions: ctx.regions,
    icons: turntableRuneIcons(snapshot, ctx.entitiesByUuid),
    rows: [...ctx.rows.values()],
    entityColorSlots: ctx.entityColorSlots,
  };
}

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

function addBossRune(ctx: BuildContext) {
  const held = bossRuneBuff(ctx.snapshot);
  const style = held && BOSS_RUNE_ROWS[held.rune];
  if (!held || !style) return;
  addRow(ctx, {
    key: "runeWheel:bossRune",
    group: t(textKeys.runeWheel),
    label: t(textKeys.bossRune, { rune: held.rune, shape: t(style.shapeKey) }),
    colorSlot: style.colorSlot,
    createTimeMs: held.createTimeMs,
    durationMs: 0,
    targets: [],
    hideTimer: true,
  });
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

function bossCenter(ctx: BuildContext): { x: number; z: number } {
  return { x: ctx.boss?.x ?? 0, z: ctx.boss?.z ?? 0 };
}

function hpPercent(entity: MinimapEntity): number | null {
  if (entity.currentHp == null || entity.maxHp == null || entity.maxHp <= 0) {
    return null;
  }
  return Math.round((entity.currentHp / entity.maxHp) * 100);
}
