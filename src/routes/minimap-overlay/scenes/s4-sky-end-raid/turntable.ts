import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
import type {
  MapIcon,
  MechanicRegion,
  MechanicRowIcon,
} from "../../scene-types";
import { circle } from "./context";

export type RuneNumber = 1 | 2 | 3 | 4;

type RuneLayout = {
  radius: number;
  /** Local bearing of each rune, degrees clockwise from the ring's +Z. */
  bearings: Record<RuneNumber, number>;
  /**
   * The rune at slot k = 1..4, the number the ring's effect commands use.
   * Only the challenge layout drives its slots that way.
   */
  slotRunes?: readonly RuneNumber[];
};

const RUNES: readonly RuneNumber[] = [1, 2, 3, 4];

const ALTERNATE_BEARINGS: Record<RuneNumber, number> = {
  1: 0,
  2: 270,
  3: 180,
  4: 90,
};

/**
 * Slot k shows show_data effect k of the challenge layout buffs
 * (illusiong01 / 04 / 03 / 02 at 0° / 90° / 180° / 270°). The 头标符文 buff
 * lists its runes in the same order, twice: values 1..4 on the boss, 5..8 on
 * the chasers.
 */
const SLOT_RUNES: readonly RuneNumber[] = [1, 4, 3, 2];

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
  // 转盘内/中/外圈: the layout the challenge (连战) rings carry all fight.
  [
    829541,
    { radius: 7.5, bearings: ALTERNATE_BEARINGS, slotRunes: SLOT_RUNES },
  ],
  [
    829542,
    { radius: 17.53, bearings: ALTERNATE_BEARINGS, slotRunes: SLOT_RUNES },
  ],
  [
    829543,
    { radius: 27.53, bearings: ALTERNATE_BEARINGS, slotRunes: SLOT_RUNES },
  ],
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

/** Palette slots closest to each rune's colour. */
export const RUNE_COLOR_SLOTS: Record<RuneNumber, number> = {
  1: 1,
  2: 4,
  3: 3,
  4: 0,
};

const RUNE_SIZE_PX = 22;
/** Just past the observed trigger reach (players ≤ 1.8 m, spears ≤ 3 m). */
const SLOT_CIRCLE_RADIUS = 3;

/** The rune a 头标符文 (829544) effect value shows. */
export function headRune(value: number): RuneNumber | null {
  if (!Number.isInteger(value) || value < 1 || value > 8) return null;
  return SLOT_RUNES[(value - 1) % SLOT_RUNES.length] ?? null;
}

export function runeImage(rune: RuneNumber): string {
  return `/images/lapsis_rune/rune_0${rune}.png`;
}

export function runeRowIcon(rune: RuneNumber, alt: string): MechanicRowIcon {
  return { src: runeImage(rune), alt };
}

function runePoint(
  ring: MinimapEntity,
  layout: RuneLayout,
  rune: RuneNumber,
): { x: number; z: number } {
  const rad = ((layout.bearings[rune] + (ring.facing ?? 0)) * Math.PI) / 180;
  return {
    x: ring.x + Math.sin(rad) * layout.radius,
    z: ring.z + Math.cos(rad) * layout.radius,
  };
}

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
    for (const rune of RUNES) {
      icons.push({
        ...runePoint(ring, layout, rune),
        src: runeImage(rune),
        sizePx: RUNE_SIZE_PX,
        fallbackColor: RUNE_COLORS[rune],
        fallbackLabel: String(rune),
      });
    }
  }
  return icons;
}

/**
 * A circle under each slot whose effect the ring keeps looping: a spear or a
 * player starts it, the matching chaser stops it. Mirrors the ring's own
 * effect commands rather than inferring them.
 */
export function turntableSlotRegions(
  snapshot: MinimapSnapshot,
  entitiesByUuid: ReadonlyMap<string, MinimapEntity>,
): MechanicRegion[] {
  const regions: MechanicRegion[] = [];
  for (const buff of snapshot.buffs) {
    const layout = RUNE_LAYOUTS.get(buff.baseId);
    if (!layout?.slotRunes) continue;
    const ring = entitiesByUuid.get(buff.targetEntityUuid);
    if (!ring) continue;
    for (const slot of buff.loopEffects) {
      const rune = layout.slotRunes[slot - 1];
      if (!rune) continue;
      regions.push(
        circle(
          runePoint(ring, layout, rune),
          SLOT_CIRCLE_RADIUS,
          RUNE_COLOR_SLOTS[rune],
        ),
      );
    }
  }
  return regions;
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
