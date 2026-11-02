import type { MinimapBuffFact, MinimapSnapshot } from "$lib/api";
import { headRune, type RuneNumber } from "./turntable";

/** 头标符文: on the boss it cycles through the order to light the runes in. */
const BUFF_HEAD_RUNE = 829544;

type RuneOrder = { buffKey: string; runes: RuneNumber[] };

/**
 * The boss shows one rune at a time and the buff ends after 4 s, but the
 * order has to stay up until the next 谒彼诸天. A plain variable, not reactive
 * state; recording the same snapshot twice changes nothing.
 */
let order: RuneOrder | null = null;

export function resetRuneOrder() {
  order = null;
}

/**
 * Appends each new rune the boss's 头标符文 shows. A new buff instance starts a
 * new order; without the boss (a restart, or leaving) the order is dropped.
 */
export function rememberRuneOrder(
  snapshot: MinimapSnapshot,
  bossUuid: string | undefined,
): readonly RuneNumber[] {
  if (!bossUuid) {
    order = null;
    return [];
  }
  const buff = snapshot.buffs.find(
    (fact) =>
      fact.baseId === BUFF_HEAD_RUNE && fact.targetEntityUuid === bossUuid,
  );
  if (buff) record(buff);
  return order?.runes ?? [];
}

function record(buff: MinimapBuffFact) {
  const buffKey = `${buff.buffUuid}:${buff.createTimeMs}`;
  if (order?.buffKey !== buffKey) order = { buffKey, runes: [] };
  // The boss loops exactly one rune at a time (stop-all, then play).
  const shown = buff.loopEffects.length === 1 ? buff.loopEffects[0] : undefined;
  const rune = shown === undefined ? null : headRune(shown);
  if (rune !== null && order.runes.at(-1) !== rune) order.runes.push(rune);
}
