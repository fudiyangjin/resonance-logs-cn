import type { MinimapBuffFact } from "$lib/api";
import { t } from "$lib/i18n/index.svelte";
import {
  activeBuffs,
  addRow,
  type BuildContext,
  maxDuration,
  playerTargets,
} from "./context";

/** 暗之侵蚀: 1–10 layers, each change refreshes 15 s. */
const BUFF_EROSION = 829721;
/**
 * 自我毁灭 (5 s): added in the packet that brings 暗之侵蚀 to 10 layers. In
 * the long nightmare log 8 of 14 holders died exactly when it ran out.
 */
const BUFF_SELF_DESTRUCT = 829722;
/**
 * Black holes and fog orbs add 5 layers at once, so from 5 layers one more
 * hit fills the bar. 10 layers shows up as 自我毁灭 instead.
 */
const MIN_LAYER = 5;
const MAX_LAYER = 9;

/**
 * The info bar sorts rows by colour slot, so slots rise with the layer.
 * 15 wraps to red; 9 layers and 自我毁灭 share it and sort by label.
 */
const LAYER_COLOR_SLOTS: Record<number, number> = {
  5: 0,
  6: 5,
  7: 6,
  8: 9,
  9: 15,
};
const COLOR_SELF_DESTRUCT = 15;

const textKeys = {
  erosion: "minimap.s4SkyEndRaid.erosion",
  erosionLayer: "minimap.s4SkyEndRaid.erosionLayer",
  selfDestruct: "minimap.s4SkyEndRaid.selfDestruct",
} as const;

/** Lapsis eternal night (老三): players one hit away from 10 erosion. */
export function addErosion(ctx: BuildContext) {
  const byLayer = new Map<number, MinimapBuffFact[]>();
  for (const buff of activeBuffs(ctx, BUFF_EROSION)) {
    if (buff.layer < MIN_LAYER || buff.layer > MAX_LAYER) continue;
    const layer = byLayer.get(buff.layer);
    if (layer) layer.push(buff);
    else byLayer.set(buff.layer, [buff]);
  }
  for (const [layer, buffs] of byLayer) {
    const targets = playerTargets(ctx, buffs);
    if (targets.length === 0) continue;
    addRow(ctx, {
      key: `erosion:${layer}`,
      group: t(textKeys.erosion),
      label: t(textKeys.erosionLayer, { layer }),
      colorSlot: LAYER_COLOR_SLOTS[layer] ?? COLOR_SELF_DESTRUCT,
      createTimeMs: 0,
      durationMs: 0,
      targets,
      hideTimer: true,
    });
  }

  const destruct = activeBuffs(ctx, BUFF_SELF_DESTRUCT);
  const targets = playerTargets(ctx, destruct);
  if (targets.length === 0) return;
  for (const target of targets) {
    ctx.entityColorSlots.set(target.uuid, COLOR_SELF_DESTRUCT);
  }
  addRow(ctx, {
    key: "erosion:selfDestruct",
    group: t(textKeys.erosion),
    label: t(textKeys.selfDestruct),
    colorSlot: COLOR_SELF_DESTRUCT,
    createTimeMs: Math.min(...destruct.map((buff) => buff.createTimeMs)),
    durationMs: maxDuration(destruct),
    targets,
  });
}
