import type { MinimapBuffFact } from "$lib/api";
import { t } from "$lib/i18n/index.svelte";
import {
  activeBuffs,
  addRow,
  type BuildContext,
  maxDuration,
  playerTargets,
} from "./context";

/** 罪罚: stays on the player at 1–4 layers; each change refreshes 120 s. */
const BUFF_SIN = 829602;
/**
 * 极罪 (12 s): the 5th layer removes 罪罚 and adds this in the same packet.
 * Its holder died within a second in all four nightmare samples.
 */
const BUFF_EXTREME_SIN = 829603;

/**
 * The info bar sorts rows by colour slot, so slots rise with the layer.
 * 15 wraps to red and sorts last.
 */
const LAYER_COLOR_SLOTS: Record<number, number> = { 1: 0, 2: 5, 3: 6, 4: 15 };
const COLOR_EXTREME_SIN = 15;

const textKeys = {
  sin: "minimap.s4SkyEndRaid.sin",
  sinLayer: "minimap.s4SkyEndRaid.sinLayer",
  extremeSin: "minimap.s4SkyEndRaid.extremeSin",
} as const;

/** Lapsis eternal day (老二): players grouped by their 罪罚 layer. */
export function addSin(ctx: BuildContext) {
  const byLayer = new Map<number, MinimapBuffFact[]>();
  for (const buff of activeBuffs(ctx, BUFF_SIN)) {
    const layer = byLayer.get(buff.layer);
    if (layer) layer.push(buff);
    else byLayer.set(buff.layer, [buff]);
  }
  for (const [layer, buffs] of byLayer) {
    const targets = playerTargets(ctx, buffs);
    if (targets.length === 0) continue;
    addRow(ctx, {
      key: `sin:${layer}`,
      group: t(textKeys.sin),
      label: t(textKeys.sinLayer, { layer }),
      colorSlot: LAYER_COLOR_SLOTS[layer] ?? COLOR_EXTREME_SIN,
      createTimeMs: 0,
      durationMs: 0,
      targets,
      hideTimer: true,
    });
  }

  const extreme = activeBuffs(ctx, BUFF_EXTREME_SIN);
  const targets = playerTargets(ctx, extreme);
  if (targets.length === 0) return;
  addRow(ctx, {
    key: "sin:extreme",
    group: t(textKeys.sin),
    label: t(textKeys.extremeSin),
    colorSlot: COLOR_EXTREME_SIN,
    createTimeMs: Math.min(...extreme.map((buff) => buff.createTimeMs)),
    durationMs: maxDuration(extreme),
    targets,
  });
}
