/**
 * @file Monsters whose incoming player damage is left out of the DPS stats.
 *
 * The list lives in the DPS settings profile (`live.general`) and reaches the
 * backend through the monitor runtime snapshot. A hit on a listed monster is
 * not accepted into combat: no totals, no history, no segment start. Damage
 * numbers and counters still see it. Every read path runs persisted values
 * through these helpers so malformed or legacy data never reaches Rust.
 */
import type { MessageKey } from "$lib/i18n/index.svelte";
import { isValidMonsterId } from "./monster-roster-settings";

/** Far above any real setup; the backend applies the same cap. */
export const MAX_EXCLUDED_DAMAGE_MONSTERS = 1_000;

export type DamageExclusionPreset = {
  key: string;
  monsterId: number;
  labelKey: MessageKey;
};

/** Built-in entries the player can add with one click. */
export const DAMAGE_EXCLUSION_PRESETS: readonly DamageExclusionPreset[] = [
  {
    // 奥义！鲛旋湍流 (skill 3995): the summon itself is the hostile dummy that
    // relays a share of the damage it takes, so hitting it is not real damage.
    key: "relayDummy",
    monsterId: 3_000_090,
    labelKey: "settings.live.excludedMonsters.preset.relayDummy",
  },
];

/** Valid, distinct ids in their persisted order (oldest first). */
export function ensureExcludedDamageMonsterIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const id of ids) {
    if (result.length >= MAX_EXCLUDED_DAMAGE_MONSTERS) break;
    if (!isValidMonsterId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** Returns a new list with `monsterId` appended; a no-op for an invalid id. */
export function addExcludedDamageMonster(
  ids: readonly number[],
  monsterId: number,
): number[] {
  if (!isValidMonsterId(monsterId)) return [...ids];
  return ensureExcludedDamageMonsterIds([...ids, monsterId]);
}

export function removeExcludedDamageMonster(
  ids: readonly number[],
  monsterId: number,
): number[] {
  return ids.filter((id) => id !== monsterId);
}
