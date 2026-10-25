import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
import type { MapIcon } from "../../scene-types";

export type RuneNumber = 1 | 2 | 3 | 4;

type RuneLayout = {
  radius: number;
  /** Local bearing of each rune, degrees clockwise from the ring's +Z. */
  bearings: Record<RuneNumber, number>;
};

const RUNES: readonly RuneNumber[] = [1, 2, 3, 4];

const ALTERNATE_BEARINGS: Record<RuneNumber, number> = {
  1: 0,
  2: 270,
  3: 180,
  4: 90,
};

/**
 * Glyph slots keyed by the layout buff a ring carries. They come from that
 * buff's show effects in the client `show_data` (EffectDataShare.offset from
 * the ring's lookat_point), so a glyph turns with its ring: world bearing =
 * local bearing + ring facing (attr 50).
 */
const RUNE_LAYOUTS: ReadonlyMap<number, RuneLayout> = new Map([
  // 转盘内/中/外圈符文（排布1）
  [829502, { radius: 7.52, bearings: { 1: 180, 2: 0, 3: 90, 4: 270 } }],
  [829503, { radius: 17.4, bearings: { 1: 0, 2: 90, 3: 270, 4: 180 } }],
  [829504, { radius: 27.7, bearings: { 1: 270, 2: 90, 3: 180, 4: 0 } }],
  // 转盘内/中/外圈: a second layout, not yet seen in a log.
  [829541, { radius: 7.5, bearings: ALTERNATE_BEARINGS }],
  [829542, { radius: 17.53, bearings: ALTERNATE_BEARINGS }],
  [829543, { radius: 27.53, bearings: ALTERNATE_BEARINGS }],
]);

/** boss符文1 / boss符文4: the shape the three rings must line up. */
const BOSS_TARGET_RUNE: ReadonlyMap<number, RuneNumber> = new Map([
  [829506, 1],
  [829509, 4],
]);

/** Ring glyph material base colours, scaled so the brightest channel is 1. */
const RUNE_COLORS: Record<RuneNumber, string> = {
  1: "#5FFF60",
  2: "#A8F9FF",
  3: "#FF5831",
  4: "#FFBF3A",
};

const RUNE_SIZE_PX = 22;

export function turntableRuneIcons(
  snapshot: MinimapSnapshot,
  entitiesByUuid: ReadonlyMap<string, MinimapEntity>,
): MapIcon[] {
  const icons: MapIcon[] = [];
  for (const buff of snapshot.buffs) {
    const layout = RUNE_LAYOUTS.get(buff.baseId);
    if (!layout) continue;
    const ring = entitiesByUuid.get(buff.targetEntityUuid);
    if (!ring) continue;
    const facing = ring.facing ?? 0;
    for (const rune of RUNES) {
      const rad = ((layout.bearings[rune] + facing) * Math.PI) / 180;
      icons.push({
        x: ring.x + Math.sin(rad) * layout.radius,
        z: ring.z + Math.cos(rad) * layout.radius,
        src: `/images/lapsis_rune/rune_0${rune}.png`,
        sizePx: RUNE_SIZE_PX,
        fallbackColor: RUNE_COLORS[rune],
        fallbackLabel: String(rune),
      });
    }
  }
  return icons;
}

/** The boss's own rune buff, i.e. the shape the three rings must line up. */
export function bossRuneBuff(
  snapshot: MinimapSnapshot,
): { rune: RuneNumber; createTimeMs: number } | null {
  for (const buff of snapshot.buffs) {
    const rune = BOSS_TARGET_RUNE.get(buff.baseId);
    if (rune) return { rune, createTimeMs: buff.createTimeMs };
  }
  return null;
}
