/**
 * @file One-off migration of the removed skill-monitor "duration skills"
 * (fixed timer started from the local player's skill-CD packet) onto the
 * monster-monitor entity-duration watch list (driven by the summoned entity).
 *
 * Shared by the persisted-state schema migration (v4 -> v5) and by loadout
 * import, so exports taken before the change keep working.
 */
import {
  createEntryFromEntityDurationPreset,
  findEntityDurationPreset,
} from "./config/entity-duration-presets";
import { DEFAULT_LOCALE } from "./i18n/locales";
import type { EntityDurationEntry } from "./settings-store";

/** Legacy duration-skill id -> entity-duration preset key. */
export const LEGACY_SKILL_DURATION_PRESET_KEYS: Readonly<
  Record<number, string>
> = {
  1719: "stormblade_scythe_cart",
};

/**
 * Builds the entity-duration entries that replace the given legacy duration
 * skill ids. Ids without a preset, or whose preset monster id is already in
 * `existing`, are skipped.
 */
export function entriesFromLegacySkillDurationIds(
  skillIds: readonly number[] | null | undefined,
  existing: readonly EntityDurationEntry[],
): EntityDurationEntry[] {
  if (!Array.isArray(skillIds) || skillIds.length === 0) return [];
  const taken = new Set(existing.map((entry) => entry.monsterId));
  const added: EntityDurationEntry[] = [];
  for (const skillId of skillIds) {
    const presetKey = LEGACY_SKILL_DURATION_PRESET_KEYS[skillId];
    if (!presetKey) continue;
    const preset = findEntityDurationPreset(presetKey, DEFAULT_LOCALE);
    if (!preset || taken.has(preset.monsterId)) continue;
    taken.add(preset.monsterId);
    added.push(createEntryFromEntityDurationPreset(preset));
  }
  return added;
}
