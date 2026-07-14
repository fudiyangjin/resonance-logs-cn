import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import { entityFirstSeen } from "../../minimap-runtime.svelte.js";
import { overlayNow } from "../../../game-overlay/overlay-clock.svelte.js";
import type {
  MechanicRegion,
  MechanicRow,
  MinimapVoiceCueDef,
  MinimapVoiceCueFire,
} from "../../scene-types";
import { resolveBuffVoiceCues } from "../../voice-cue-utils";
import { PIZZA_OUTER_RADIUS } from "./arena";

export type TinaMindrealmMechanicView = {
  regions: MechanicRegion[];
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
};

const BOSS_MONSTER_ID = 33701;
// Pizza danger-sector dummies. 300087 (fake/safe sector) is intentionally not
// listed: per spec the safe sector is not drawn.
const PIZZA_SLOW_MONSTER_ID = 300086; // real-damage (slow) wave
const PIZZA_FAST_MONSTER_ID = 300089; // fast wave
const PIZZA_HALF_ANGLE = 22.5; // each pizza sector spans 45 degrees
// Pizza dummies spawn in batches of 8 (same instant, <10ms apart); batches are
// ≥1.7s apart. Only the newest batch is drawn, so a new batch cancels the
// previous batch's sectors instead of overlapping.
const PIZZA_BATCH_TOLERANCE_MS = 1_000;

const COLOR_SLOT_BOSS = 3; // red
const COLOR_SLOT_PIZZA_SLOW = 3; // red  (slow / real-damage wave)
const COLOR_SLOT_PIZZA_FAST = 5; // orange (fast wave)

// 841509 (S3 wudi-slash mark): the first PlayEffect effect_id of each marked
// player's buff encodes that player's slash order, 0-indexed (0 = 1st). A
// second shared PlayEffect (effect_id 5) is a common slash VFX at index 1.
const WUDI_SLASH_BUFF_ID = 841509;
const COLOR_SLOT_WUDI_UNKNOWN = 11; // amber; sorts after real orders (0..10)

const textKeys = {
  buffGroup: "minimap.s3TinaMindrealm.buffGroup",
  heavyWound: "minimap.s3TinaMindrealm.heavyWound",
  redBind: "minimap.s3TinaMindrealm.redBind",
  wudiSlash: "minimap.s3TinaMindrealm.wudiSlash",
  wudiSlashOrder: "minimap.s3TinaMindrealm.wudiSlashOrder",
  pizzaGroup: "minimap.s3TinaMindrealm.pizzaGroup",
  pizzaSlow: "minimap.s3TinaMindrealm.pizzaSlow",
  pizzaFast: "minimap.s3TinaMindrealm.pizzaFast",
} satisfies Record<string, MessageKey>;

const MECHANIC_BUFFS: Record<
  number,
  { labelKey: MessageKey; colorSlot: number }
> = {
  510571: { labelKey: textKeys.heavyWound, colorSlot: 3 }, // E-class heavy wound 100%
  841519: { labelKey: textKeys.redBind, colorSlot: 6 }, // S3 red-light bind
  // 841509 (wudi-slash mark) is handled by addWudiSlashRows, not here: each
  // marked player gets its own row keyed by slash order, not an aggregated row.
};

const PIZZA_MONSTER_IDS: Record<
  number,
  { labelKey: MessageKey; colorSlot: number }
> = {
  [PIZZA_SLOW_MONSTER_ID]: {
    labelKey: textKeys.pizzaSlow,
    colorSlot: COLOR_SLOT_PIZZA_SLOW,
  },
  [PIZZA_FAST_MONSTER_ID]: {
    labelKey: textKeys.pizzaFast,
    colorSlot: COLOR_SLOT_PIZZA_FAST,
  },
};

const voiceCueIds = {
  pizza: "s3-tina-mindrealm.pizza",
  heavyWound: "s3-tina-mindrealm.heavyWound",
  redBind: "s3-tina-mindrealm.redBind",
  wudiSlash: "s3-tina-mindrealm.wudiSlash",
} as const;

export const S3_TINA_MINDREALM_VOICE_CUES: MinimapVoiceCueDef[] = [
  {
    id: voiceCueIds.pizza,
    labelKey: textKeys.pizzaGroup,
    autoText: "披萨危险区",
  },
  {
    id: voiceCueIds.heavyWound,
    labelKey: textKeys.heavyWound,
    autoText: "重伤点名",
  },
  {
    id: voiceCueIds.redBind,
    labelKey: textKeys.redBind,
    autoText: "红光束缚点名",
  },
  {
    id: voiceCueIds.wudiSlash,
    labelKey: textKeys.wudiSlash,
    autoText: "无敌斩点名",
  },
];

export function resolveTinaMindrealmVoiceCues(
  snapshot: MinimapSnapshot,
): MinimapVoiceCueFire[] {
  const fires = resolveBuffVoiceCues(
    snapshot,
    {
      510571: voiceCueIds.heavyWound,
      841519: voiceCueIds.redBind,
      [WUDI_SLASH_BUFF_ID]: voiceCueIds.wudiSlash,
    },
    "localTarget",
  );
  const activePizza = activePizzaDummies(snapshot.entities);
  if (activePizza.length > 0) {
    fires.push({
      cueId: voiceCueIds.pizza,
      instanceKey: `pizza:${Math.min(...activePizza.map((entry) => entry.firstSeen))}`,
    });
  }
  return fires;
}

export function buildMechanicView(
  snapshot: MinimapSnapshot,
  displayName: (entity: MinimapEntity) => string,
): TinaMindrealmMechanicView {
  const regions: MechanicRegion[] = [];
  const rows = new Map<string, MechanicRow>();
  const entityColorSlots = new Map<string, number>();
  const entitiesByUuid = new Map(
    snapshot.entities.map((entity) => [entity.entityUuid, entity]),
  );

  addBossMarker(snapshot.entities, entityColorSlots);
  addPizzaDangerRegions(snapshot.entities, regions, rows, entityColorSlots);
  addWudiSlashRows(
    snapshot,
    entitiesByUuid,
    rows,
    entityColorSlots,
    displayName,
  );
  addBuffRows(snapshot, entitiesByUuid, rows, entityColorSlots, displayName);

  return {
    regions: dedupeRegions(regions),
    rows: [...rows.values()],
    entityColorSlots,
  };
}

function addBossMarker(
  entities: MinimapEntity[],
  entityColorSlots: Map<string, number>,
) {
  for (const entity of entities) {
    if (entity.monsterId === BOSS_MONSTER_ID) {
      entityColorSlots.set(entity.entityUuid, COLOR_SLOT_BOSS);
    }
  }
}

function addPizzaDangerRegions(
  entities: MinimapEntity[],
  regions: MechanicRegion[],
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
) {
  const active = activePizzaDummies(entities);
  if (active.length === 0) return;

  const activeWaves = new Set<number>();
  for (const { entity, mapping } of active) {
    entityColorSlots.set(entity.entityUuid, mapping.colorSlot);
    activeWaves.add(entity.monsterId!);
    const facing = entity.facing;
    if (facing === null || facing === undefined || !Number.isFinite(facing)) {
      // Without a facing we cannot orient the 45-degree sector; still mark the
      // dummy so it stays visible, but skip drawing a region.
      continue;
    }
    regions.push(pizzaSectorRegion(entity, facing, mapping.colorSlot));
  }

  for (const monsterId of activeWaves) {
    const mapping = PIZZA_MONSTER_IDS[monsterId]!;
    upsertRow(rows, {
      key: `tina:pizza:${monsterId}`,
      group: t(textKeys.pizzaGroup),
      label: t(mapping.labelKey),
      colorSlot: mapping.colorSlot,
      createTimeMs: 0,
      durationMs: 0,
      targets: [],
      hideTimer: true,
    });
  }
}

function activePizzaDummies(entities: MinimapEntity[]) {
  const dummies = entities
    .filter(
      (entity) =>
        entity.monsterId != null && PIZZA_MONSTER_IDS[entity.monsterId],
    )
    .map((entity) => ({
      entity,
      mapping: PIZZA_MONSTER_IDS[entity.monsterId!]!,
      firstSeen: entityFirstSeen(entity.entityUuid) ?? overlayNow(),
    }));
  if (dummies.length === 0) return [];
  const maxFirstSeen = Math.max(...dummies.map((entry) => entry.firstSeen));
  return dummies.filter(
    (entry) => maxFirstSeen - entry.firstSeen <= PIZZA_BATCH_TOLERANCE_MS,
  );
}

function pizzaSectorRegion(
  entity: MinimapEntity,
  facing: number,
  colorSlot: number,
): MechanicRegion {
  return {
    kind: "sector",
    x: entity.x,
    z: entity.z,
    radius: PIZZA_OUTER_RADIUS,
    startDeg: facing - PIZZA_HALF_ANGLE,
    endDeg: facing + PIZZA_HALF_ANGLE,
    colorSlot,
  };
}

function addWudiSlashRows(
  snapshot: MinimapSnapshot,
  entitiesByUuid: Map<string, MinimapEntity>,
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
  displayName: (entity: MinimapEntity) => string,
) {
  for (const buff of snapshot.buffs) {
    if (buff.baseId !== WUDI_SLASH_BUFF_ID) continue;

    // effect_ids[0] is the 0-indexed slash order: the backend pushes 0 for a
    // null / payload-less PlayEffect, so wire order is preserved and the
    // shared slash VFX (id 5) stays at index 1, never index 0. order is null
    // only when the buff carries no PlayEffect at all.
    const first = buff.effectIds[0];
    const order = first == null ? null : first; // 0..N-1
    const orderDisplay = order != null ? order + 1 : "?"; // 1..N

    // colorSlot = order % 12 is strictly increasing with order, so the
    // infobar's colorSlot sort renders rows in slash order; each order also
    // gets a distinct palette color.
    const colorSlot = order != null ? order % 12 : COLOR_SLOT_WUDI_UNKNOWN;

    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (target) entityColorSlots.set(target.entityUuid, colorSlot);

    upsertRow(rows, {
      key: `tina:buff:${WUDI_SLASH_BUFF_ID}:${buff.targetEntityUuid}`,
      group: t(textKeys.buffGroup),
      label: t(textKeys.wudiSlashOrder, { n: orderDisplay }),
      colorSlot,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: target ? [displayName(target)] : [],
    });
  }
}

function addBuffRows(
  snapshot: MinimapSnapshot,
  entitiesByUuid: Map<string, MinimapEntity>,
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
  displayName: (entity: MinimapEntity) => string,
) {
  for (const buff of snapshot.buffs) {
    const mapping = MECHANIC_BUFFS[buff.baseId];
    if (!mapping) continue;

    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (target) entityColorSlots.set(target.entityUuid, mapping.colorSlot);
    upsertRow(rows, {
      key: `tina:buff:${buff.baseId}:${buff.layer}`,
      group: t(textKeys.buffGroup),
      label: t(mapping.labelKey),
      colorSlot: mapping.colorSlot,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: target ? [displayName(target)] : [],
    });
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
