/**
 * @file Garbage collection for auto-managed voice phrases.
 *
 * Binding-driven phrases (names like `custom:voice:buff:101:gained`) are
 * only ever upserted, never deleted: removing a binding, switching
 * auto/custom, or editing the `${阶数}` placeholder all leave orphan phrases
 * (and their generated audio) in the catalog. This module classifies those
 * orphans so the phrase-library tab can offer a one-click cleanup.
 *
 * Safety rules:
 * - Phrase names are shared across ALL monitor profiles (loadouts), so the
 *   keep-set must be built from every profile in settings, never just the
 *   active one.
 * - Keep-set is intentionally over-inclusive (all events per configured
 *   subject, both monster-buff source scopes, disabled configs included):
 *   keeping an extra phrase is harmless, deleting a referenced one loses
 *   generated audio. This is why GC goes through each adapter's `gcKeys`
 *   over raw settings slices instead of `enumerate` / `events`.
 * - Only names matching the managed `auto:voice:*` / `custom:voice:*`
 *   pattern are ever considered; manually created phrases are untouched.
 */
import type { VoicePhraseMeta } from "$lib/bindings";
import type {
  MechanicVoiceConfigMap,
  MonsterMonitorConfig,
  SkillMonitorProfile,
} from "$lib/settings-store";
import { parseManagedPhraseName } from "./phrase-key";
import { byKind } from "./registry";

export type VoicePhraseGcSkillSource = Pick<
  SkillMonitorProfile,
  "buffVoiceConfigs" | "userCounterRules" | "presetCounterVoiceConfigs"
>;

export type VoicePhraseGcMonsterSource = Pick<
  MonsterMonitorConfig,
  "dbmVoiceConfigs" | "monsterBuffVoiceConfigs"
>;

export type VoicePhraseGcSources = {
  /** Every skill-monitor profile (all loadouts, not just the active one). */
  skillProfiles: readonly VoicePhraseGcSkillSource[];
  /** Every monster-monitor profile plus the live mirror state. */
  monsterConfigs: readonly VoicePhraseGcMonsterSource[];
  /** Global minimap mechanic bindings (not loadout-scoped). */
  mechanicVoiceConfigs: MechanicVoiceConfigMap | null | undefined;
};

/**
 * Base rule keys (the `voice:...` part of managed phrase names) referenced
 * by any binding across all provided sources.
 */
export function collectReferencedVoiceKeys(
  sources: VoicePhraseGcSources,
): Set<string> {
  const keys = new Set<string>();
  const add = (list: string[]) => list.forEach((key) => keys.add(key));

  for (const profile of sources.skillProfiles) {
    add(byKind("buff").gcKeys(profile));
    add(byKind("counterSlot").gcKeys(profile));
  }
  for (const config of sources.monsterConfigs) {
    // dbm/monsterBuff only read their own maps; the other slice fields are
    // irrelevant to GC and may legitimately be absent from these sources.
    const slice = config as Parameters<
      ReturnType<typeof byKind<"dbm">>["gcKeys"]
    >[0];
    add(byKind("dbm").gcKeys(slice));
    add(byKind("monsterBuff").gcKeys(slice));
  }
  add(byKind("minimapCue").gcKeys(sources.mechanicVoiceConfigs));
  add(byKind("gameAlert").gcKeys(undefined));

  return keys;
}

/**
 * The base rule key of an auto-managed phrase name, or `null` for phrases
 * the user created manually (whose names don't follow the managed pattern).
 */
export function managedBaseKeyOf(name: string): string | null {
  return parseManagedPhraseName(name)?.ruleKey ?? null;
}

/**
 * Managed phrases whose base key is not referenced by any binding. Pure -
 * safe to call from `$derived`.
 */
export function classifyOrphanPhrases(
  phrases: readonly VoicePhraseMeta[],
  keepKeys: ReadonlySet<string>,
): VoicePhraseMeta[] {
  return phrases.filter((phrase) => {
    const baseKey = managedBaseKeyOf(phrase.name);
    return baseKey !== null && !keepKeys.has(baseKey);
  });
}
