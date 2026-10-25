import type { MinimapBuffFact } from "$lib/api";
import { t } from "$lib/i18n/index.svelte";
import { mergeMechanicTargets, toMechanicTargets } from "../../mechanic-row";
import type { MechanicRowTarget } from "../../scene-types";
import { activeBuffs, addRow, type BuildContext, labeledDisc } from "./context";

/** 玩家持有光暗球: every player gets one when 邪恶仪式 starts. */
const BUFF_RITUAL = 829712;
/**
 * The server added the buff to the light players first: in the one ritual
 * logged (1792922825153) the four earliest CreateTimes were exactly the four
 * lights. Not yet confirmed on another fight.
 */
const LIGHT_COUNT = 4;
/** Buff added → settlement, measured 30.44 s. */
const RITUAL_DURATION_MS = 30_450;
const LIGHT_POINT = { x: 20, z: 0 };
const DARK_POINT = { x: -20, z: 0 };
/** Passed at 5.16 m from the light point, failed at 5.79 m. */
const POINT_RADIUS = 5;

const COLOR_LIGHT = 0;
const COLOR_DARK = 2;
const COLOR_UNKNOWN = 4;

const textKeys = {
  evilRitual: "minimap.s4SkyEndRaid.evilRitual",
  ritualLight: "minimap.s4SkyEndRaid.ritualLight",
  ritualDark: "minimap.s4SkyEndRaid.ritualDark",
  ritualUnknown: "minimap.s4SkyEndRaid.ritualUnknown",
  lightPoint: "minimap.s4SkyEndRaid.lightPoint",
  darkPoint: "minimap.s4SkyEndRaid.darkPoint",
} as const;

export type RitualSide = "light" | "dark" | "unknown";

/**
 * Light = the `LIGHT_COUNT` earliest CreateTimes. Ties inside either group
 * don't matter; when the last light and the first dark share a millisecond,
 * everyone on that millisecond is unknown.
 */
export function ritualSides(
  buffs: readonly MinimapBuffFact[],
): Map<string, RitualSide> {
  const sides = new Map<string, RitualSide>();
  if (buffs.length <= LIGHT_COUNT) return sides;
  const sorted = [...buffs].sort(
    (left, right) =>
      left.createTimeMs - right.createTimeMs ||
      left.targetEntityUuid.localeCompare(right.targetEntityUuid),
  );
  const lastLight = sorted[LIGHT_COUNT - 1]!.createTimeMs;
  const firstDark = sorted[LIGHT_COUNT]!.createTimeMs;
  for (const buff of sorted) {
    const time = buff.createTimeMs;
    const side: RitualSide =
      time < lastLight
        ? "light"
        : time > lastLight
          ? "dark"
          : lastLight < firstDark
            ? "light"
            : "unknown";
    sides.set(buff.targetEntityUuid, side);
  }
  return sides;
}

const SIDE_ROWS: Record<
  RitualSide,
  { labelKey: (typeof textKeys)[keyof typeof textKeys]; colorSlot: number }
> = {
  light: { labelKey: textKeys.ritualLight, colorSlot: COLOR_LIGHT },
  dark: { labelKey: textKeys.ritualDark, colorSlot: COLOR_DARK },
  unknown: { labelKey: textKeys.ritualUnknown, colorSlot: COLOR_UNKNOWN },
};

/** Lapsis eternal night (老三) 邪恶仪式: who is light, who is dark. */
export function addEvilRitual(ctx: BuildContext) {
  // Order over every holder, visible or not: the split is count-based.
  const buffs = activeBuffs(ctx, BUFF_RITUAL);
  const sides = ritualSides(buffs);
  if (sides.size === 0) return;

  const targets: Record<RitualSide, MechanicRowTarget[]> = {
    light: [],
    dark: [],
    unknown: [],
  };
  for (const [uuid, side] of sides) {
    const entity = ctx.entitiesByUuid.get(uuid);
    if (!entity || (entity.kind !== "local" && entity.kind !== "teammate")) {
      continue;
    }
    mergeMechanicTargets(
      targets[side],
      toMechanicTargets(entity, ctx.snapshot.localPlayerUuid, ctx.displayName),
    );
    if (side !== "unknown") {
      ctx.entityColorSlots.set(uuid, SIDE_ROWS[side].colorSlot);
    }
  }

  const createTimeMs = Math.min(...buffs.map((buff) => buff.createTimeMs));
  for (const side of ["light", "dark", "unknown"] as const) {
    if (targets[side].length === 0) continue;
    addRow(ctx, {
      key: `evilRitual:${side}`,
      group: t(textKeys.evilRitual),
      label: t(SIDE_ROWS[side].labelKey),
      colorSlot: SIDE_ROWS[side].colorSlot,
      createTimeMs,
      durationMs: RITUAL_DURATION_MS,
      targets: targets[side],
    });
  }
  ctx.regions.push(
    labeledDisc(LIGHT_POINT, POINT_RADIUS, COLOR_LIGHT, t(textKeys.lightPoint)),
    labeledDisc(DARK_POINT, POINT_RADIUS, COLOR_DARK, t(textKeys.darkPoint)),
  );
}
