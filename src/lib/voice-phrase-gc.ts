/**
 * @file Garbage collection for auto-managed voice phrases.
 *
 * Binding-driven phrases (names like `custom:voice:buff:101:gained`, created
 * by `ensurePhraseId` in `voice-binding-compile.svelte.ts`) are only ever
 * upserted, never deleted: removing a binding, switching auto/custom, or
 * editing the `${阶数}` placeholder all leave orphan phrases (and their
 * generated audio) in the catalog. This module classifies those orphans so
 * the phrase-library tab can offer a one-click cleanup.
 *
 * Safety rules:
 * - Phrase names are shared across ALL monitor profiles (loadouts), so the
 *   keep-set must be built from every profile in settings, never just the
 *   active one.
 * - Keep-set is intentionally over-inclusive (all events per configured
 *   subject, both monster-buff source scopes, disabled configs included):
 *   keeping an extra phrase is harmless, deleting a referenced one loses
 *   generated audio.
 * - Only names matching the managed `auto:voice:*` / `custom:voice:*`
 *   pattern are ever considered; manually created phrases are untouched.
 */
import type { MonsterBuffSourceScope, VoicePhraseMeta } from "$lib/bindings";
import type {
  MechanicVoiceConfigMap,
  MonsterMonitorConfig,
  SkillMonitorProfile,
} from "$lib/settings-store";
import {
  buffEventKey,
  counterEventKey,
  dbmEventKey,
  minimapCueEventKey,
  monsterBuffEventKey,
} from "$lib/voice-binding-compile.svelte.js";

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

const BUFF_EVENTS = ["gained", "expiring", "lost"] as const;
const COUNTER_EVENTS = ["threshold", "expiring"] as const;
const DBM_EVENTS = ["onCast", "expiring"] as const;
const MONSTER_BUFF_SCOPES: readonly MonsterBuffSourceScope[] = [
  "localPlayerSource",
  "anySource",
];

/**
 * Base rule keys (the `voice:...` part of managed phrase names) referenced
 * by any binding across all provided sources.
 */
export function collectReferencedVoiceKeys(
  sources: VoicePhraseGcSources,
): Set<string> {
  const keys = new Set<string>();

  for (const profile of sources.skillProfiles) {
    for (const buffIdText of Object.keys(profile.buffVoiceConfigs ?? {})) {
      const buffId = Number(buffIdText);
      for (const event of BUFF_EVENTS) {
        keys.add(buffEventKey(buffId, event));
      }
    }
    for (const rule of profile.userCounterRules ?? []) {
      for (const slotIdText of Object.keys(rule.voice ?? {})) {
        const slotId = Number(slotIdText);
        for (const event of COUNTER_EVENTS) {
          keys.add(counterEventKey(rule.ruleId, slotId, event));
        }
      }
    }
    for (const [ruleIdText, slotConfigs] of Object.entries(
      profile.presetCounterVoiceConfigs ?? {},
    )) {
      const ruleId = Number(ruleIdText);
      for (const slotIdText of Object.keys(slotConfigs ?? {})) {
        const slotId = Number(slotIdText);
        for (const event of COUNTER_EVENTS) {
          keys.add(counterEventKey(ruleId, slotId, event));
        }
      }
    }
  }

  for (const config of sources.monsterConfigs) {
    for (const idText of Object.keys(config.dbmVoiceConfigs ?? {})) {
      const baseSkillId = Number(idText);
      for (const event of DBM_EVENTS) {
        keys.add(dbmEventKey(baseSkillId, event));
      }
    }
    for (const buffIdText of Object.keys(
      config.monsterBuffVoiceConfigs ?? {},
    )) {
      const buffId = Number(buffIdText);
      // The scope in the key depends on each profile's monitored lists at
      // compile time; keep both scopes rather than re-deriving per profile.
      for (const scope of MONSTER_BUFF_SCOPES) {
        for (const event of BUFF_EVENTS) {
          keys.add(monsterBuffEventKey(scope, buffId, event));
        }
      }
    }
  }

  for (const cueId of Object.keys(sources.mechanicVoiceConfigs ?? {})) {
    keys.add(minimapCueEventKey(cueId));
  }

  return keys;
}

const MANAGED_NAME_PATTERN = /^(?:auto|custom):(voice:.+)$/;
/** Fantasy-tier variants (`:tier0`-`:tier5`) and preview phrases (`:previewTier5`). */
const VARIANT_SUFFIX_PATTERN = /:(?:tier|previewTier)\d+$/;

/**
 * The base rule key of an auto-managed phrase name, or `null` for phrases
 * the user created manually (whose names don't follow the managed pattern).
 */
export function managedBaseKeyOf(name: string): string | null {
  const match = MANAGED_NAME_PATTERN.exec(name);
  if (!match) return null;
  return match[1]!.replace(VARIANT_SUFFIX_PATTERN, "");
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
