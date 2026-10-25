import type { MinimapBuffFact } from "$lib/api";
import { t } from "$lib/i18n/index.svelte";
import {
  activeBuffs,
  addRow,
  type BuildContext,
  playerTargets,
} from "./context";

/**
 * 法阵分摊点名 (5 s): two players, the second called 4 s after the first, so
 * one second before the first share lands.
 */
const BUFF_SHARE_TARGET = 829649;
/**
 * 法阵分摊易伤 (12 s): everyone a share hits; the next share deals +800%.
 * In the nightmare log the second target had joined the first share in all
 * four rounds and died in three.
 */
const BUFF_SHARE_VULNERABLE = 829650;

const COLOR_FIRST = 0;
const COLOR_SECOND = 7;
/** 15 wraps to red and sorts last. */
const COLOR_VULNERABLE = 15;

const textKeys = {
  share: "minimap.s4SkyEndRaid.share",
  shareFirst: "minimap.s4SkyEndRaid.shareFirst",
  shareSecond: "minimap.s4SkyEndRaid.shareSecond",
  shareVulnerable: "minimap.s4SkyEndRaid.shareVulnerable",
} as const;

/**
 * Of two marks the earlier is the first. A lone mark is the second once a
 * share has landed after it was called, i.e. some vulnerability is newer.
 */
export function shareOrder(
  marks: readonly MinimapBuffFact[],
  vulnerable: readonly MinimapBuffFact[],
): { first: MinimapBuffFact[]; second: MinimapBuffFact[] } {
  const sorted = [...marks].sort(
    (left, right) => left.createTimeMs - right.createTimeMs,
  );
  if (sorted.length !== 1) {
    return { first: sorted.slice(0, 1), second: sorted.slice(1) };
  }
  const mark = sorted[0]!;
  const landed = vulnerable.some(
    (buff) => buff.createTimeMs > mark.createTimeMs,
  );
  return landed ? { first: [], second: [mark] } : { first: [mark], second: [] };
}

/** Lapsis eternal day (老二) 法阵分摊: who is called, who must sit out. */
export function addShare(ctx: BuildContext) {
  const vulnerable = activeBuffs(ctx, BUFF_SHARE_VULNERABLE);
  const { first, second } = shareOrder(
    activeBuffs(ctx, BUFF_SHARE_TARGET),
    vulnerable,
  );
  const rows = [
    {
      key: "share:first",
      buffs: first,
      labelKey: textKeys.shareFirst,
      colorSlot: COLOR_FIRST,
    },
    {
      key: "share:second",
      buffs: second,
      labelKey: textKeys.shareSecond,
      colorSlot: COLOR_SECOND,
    },
    {
      key: "share:vulnerable",
      buffs: vulnerable,
      labelKey: textKeys.shareVulnerable,
      colorSlot: COLOR_VULNERABLE,
    },
  ];
  for (const row of rows) {
    // One row per buff under a shared key: addRow merges the time spans.
    for (const buff of row.buffs) {
      const targets = playerTargets(ctx, [buff]);
      if (targets.length === 0) continue;
      addRow(ctx, {
        key: row.key,
        group: t(textKeys.share),
        label: t(row.labelKey),
        colorSlot: row.colorSlot,
        createTimeMs: buff.createTimeMs,
        durationMs: buff.durationMs,
        targets,
      });
    }
  }
}
