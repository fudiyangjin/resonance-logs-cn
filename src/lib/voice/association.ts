/**
 * @file Which voice bindings still have a subject to speak for.
 *
 * A binding exists exactly as long as its subject is associated in the
 * profile that holds it — the skill it watches is monitored, the entity
 * entry exists, the target buff sits in a monitor list, the DBM entry is
 * listed, the counter slot resolves, the minimap cue is registered — and
 * only for events that apply (an entity entry without a duration has no
 * "expiring"). These pure functions are the single judge: the adapters'
 * `enumerate` / `events` (what compiles), the prune functions below (what a
 * write deletes) and the phrase GC (what audio is still needed) all ask
 * them, so the three can never disagree.
 *
 * Pruning happens inside the settings write that removes an association,
 * never from an `$effect`, and always one profile at a time: switching
 * loadouts or monster profiles prunes nothing. Pure data only (no labels,
 * no runes), so every window's startup normalization can run it.
 */
import type { MonsterBuffSourceScope } from "$lib/bindings";
import { ensureEntityDurationEntries } from "$lib/entity-duration-entries";
import {
  ensureDbmAliases,
  GAME_ALERT_KINDS,
  parseEntityVoiceConfigKey,
  type CounterSlotVoiceConfig,
  type CounterVoiceConfigMap,
  type EntityDurationEntry,
  type EntityVoiceConfig,
  type EntityVoiceConfigMap,
  type GameAlertVoiceConfigMap,
  type MechanicVoiceConfigMap,
  type UserCounterRule,
} from "$lib/settings-store";
import { ensureUserCounterRules } from "$lib/skill-mappings";
import {
  counterSlotSupportsExpiry,
  counterSlotSupportsThreshold,
  resolveCounterVoiceRules,
} from "$lib/voice-binding-counter";
import type {
  MonsterVoiceSlice,
  SkillProfileVoiceSlice,
} from "./subject-types";

export type EntityEventKind = "appeared" | "expiring" | "gone";
export type CounterEventKind = "threshold" | "expiring";

const ENTITY_EVENTS: readonly EntityEventKind[] = [
  "appeared",
  "expiring",
  "gone",
];
const ENTITY_EVENTS_WITHOUT_DURATION: readonly EntityEventKind[] = [
  "appeared",
  "gone",
];

// ---------------------------------------------------------------------------
// Association
// ---------------------------------------------------------------------------

// Pruning runs on persisted data during startup reconciliation, where a
// throw would send the whole monitoring store into recovery: list fields
// are read defensively.

export function isSkillAssociated(
  slice: Pick<SkillProfileVoiceSlice, "monitoredSkillIds">,
  skillId: number,
): boolean {
  return slice.monitoredSkillIds?.includes(skillId) === true;
}

/**
 * Which caster population a target-buff binding observes, derived from
 * where the buff sits in the monster monitor's lists. `null` when the buff
 * is monitored nowhere — the binding has no subject then.
 */
export function resolveMonsterBuffSourceScope(
  monitor: Pick<
    MonsterVoiceSlice,
    "monitoredBuffIds" | "selfAppliedBuffIds" | "selfAppliedMonitorAll"
  >,
  buffId: number,
): MonsterBuffSourceScope | null {
  if (monitor.selfAppliedBuffIds?.includes(buffId)) return "localPlayerSource";
  if (monitor.monitoredBuffIds?.includes(buffId)) return "anySource";
  return monitor.selfAppliedMonitorAll === true ? "localPlayerSource" : null;
}

/** Base skill ids of the DBM entries (the DBM list is the alias list). */
export function dbmEntryIds(
  slice: Pick<MonsterVoiceSlice, "dbmAliases">,
): Set<number> {
  return new Set(Object.keys(ensureDbmAliases(slice.dbmAliases)).map(Number));
}

/** Events an entity entry supports: `expiring` needs a duration. */
export function entityVoiceEvents(
  entry: Pick<EntityDurationEntry, "durationMs">,
): readonly EntityEventKind[] {
  return entry.durationMs === undefined
    ? ENTITY_EVENTS_WITHOUT_DURATION
    : ENTITY_EVENTS;
}

/**
 * The voice config of `entry`: under its canonical key, or — for settings
 * written before entity bindings were keyed by monster id — under the
 * pre-rekey key of the entry's own scope first, then of the other scope.
 */
export function entityVoiceConfigFor(
  configs: EntityVoiceConfigMap | null | undefined,
  entry: Pick<EntityDurationEntry, "monsterId" | "scope">,
): EntityVoiceConfig | undefined {
  if (!configs) return undefined;
  const candidates = Object.entries(configs).flatMap(([key, config]) => {
    const parsed = parseEntityVoiceConfigKey(key);
    return parsed?.monsterId === entry.monsterId && config
      ? [{ scope: parsed.scope, config }]
      : [];
  });
  return (
    candidates.find((candidate) => candidate.scope === undefined) ??
    candidates.find((candidate) => candidate.scope === entry.scope) ??
    candidates[0]
  )?.config;
}

/** Applicable events of every counter slot a profile can voice, per rule. */
type CounterAssociations = {
  preset: Map<number, Map<number, CounterEventKind[]>>;
  user: Map<number, Map<number, CounterEventKind[]>>;
};

function counterAssociations(
  profile: SkillProfileVoiceSlice,
): CounterAssociations {
  const associations: CounterAssociations = {
    preset: new Map(),
    user: new Map(),
  };
  // `resolveCounterVoiceRules` only reads the voice-related fields.
  const rules = resolveCounterVoiceRules(
    profile as Parameters<typeof resolveCounterVoiceRules>[0],
  );
  for (const rule of rules) {
    const slots = new Map<number, CounterEventKind[]>();
    for (const slot of rule.effectSlots) {
      const events: CounterEventKind[] = [];
      if (counterSlotSupportsThreshold(slot)) events.push("threshold");
      if (counterSlotSupportsExpiry(slot)) events.push("expiring");
      slots.set(slot.slotId, events);
    }
    associations[rule.origin].set(rule.ruleId, slots);
  }
  return associations;
}

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

/**
 * `record` with each entry mapped through `keep` (`null` drops it). Returns
 * `record` itself when nothing changed, so an unchanged write stays a no-op.
 */
function pruneRecord<C>(
  record: Record<string, C> | undefined,
  keep: (key: string, config: C) => C | null,
): Record<string, C> | undefined {
  if (!record) return record;
  let changed = false;
  const next: Record<string, C> = {};
  for (const [key, config] of Object.entries(record)) {
    const kept = config ? keep(key, config) : null;
    if (kept !== config) changed = true;
    if (kept) next[key] = kept;
  }
  return changed ? next : record;
}

/** `config` limited to `allowed` events, `null` when none is left. */
function pickEvents<C extends object>(
  config: C,
  allowed: readonly string[],
): C | null {
  const present = Object.entries(config).filter(([, value]) => value != null);
  const kept = present.filter(([event]) => allowed.includes(event));
  if (kept.length === 0) return null;
  return kept.length === present.length
    ? config
    : (Object.fromEntries(kept) as C);
}

function pruneCounterSlots(
  configs: CounterVoiceConfigMap | undefined,
  slots: Map<number, CounterEventKind[]> | undefined,
): CounterVoiceConfigMap | undefined {
  return pruneRecord(configs, (slotKey, config: CounterSlotVoiceConfig) =>
    pickEvents(config, slots?.get(Number(slotKey)) ?? []),
  );
}

/**
 * `profile` without the voice bindings whose subject it no longer
 * associates; the same object when nothing changed. Local buff bindings
 * form their own list and are always associated.
 */
export function pruneSkillProfileVoice<P extends SkillProfileVoiceSlice>(
  profile: P,
): P {
  const skillVoiceConfigs = pruneRecord(profile.skillVoiceConfigs, (key, c) =>
    isSkillAssociated(profile, Number(key)) ? c : null,
  );
  const counters = counterAssociations(profile);
  const presetCounterVoiceConfigs = pruneRecord(
    profile.presetCounterVoiceConfigs,
    (ruleKey, slots) => {
      const rule = counters.preset.get(Number(ruleKey));
      const pruned = rule ? pruneCounterSlots(slots, rule) : undefined;
      return pruned && Object.keys(pruned).length > 0 ? pruned : null;
    },
  );
  let userRulesChanged = false;
  // Same order as `profile.userCounterRules`; it fixes up legacy ids.
  const normalizedUserRules = ensureUserCounterRules(profile.userCounterRules);
  const userCounterRules = profile.userCounterRules?.map(
    (rule, index): UserCounterRule => {
      if (!rule.voice) return rule;
      const ruleId = normalizedUserRules[index]?.ruleId ?? rule.ruleId;
      const voice = pruneCounterSlots(rule.voice, counters.user.get(ruleId));
      if (voice === rule.voice) return rule;
      userRulesChanged = true;
      return { ...rule, voice: voice ?? {} };
    },
  );
  if (
    skillVoiceConfigs === profile.skillVoiceConfigs &&
    presetCounterVoiceConfigs === profile.presetCounterVoiceConfigs &&
    !userRulesChanged
  ) {
    return profile;
  }
  return {
    ...profile,
    skillVoiceConfigs,
    presetCounterVoiceConfigs,
    userCounterRules,
  };
}

/** One config per watched monster under its canonical key. */
function pruneEntityVoiceConfigs(
  configs: EntityVoiceConfigMap | undefined,
  entries: readonly Partial<EntityDurationEntry>[] | undefined,
): EntityVoiceConfigMap | undefined {
  if (!configs) return configs;
  const next: EntityVoiceConfigMap = {};
  for (const entry of ensureEntityDurationEntries(entries)) {
    const config = entityVoiceConfigFor(configs, entry);
    const kept = config ? pickEvents(config, entityVoiceEvents(entry)) : null;
    if (kept) next[String(entry.monsterId)] = kept;
  }
  const unchanged =
    Object.keys(next).length === Object.keys(configs).length &&
    Object.entries(next).every(([key, config]) => configs[key] === config);
  return unchanged ? configs : next;
}

/**
 * `monster` (the live mirror or a stored profile) without the voice
 * bindings whose subject it no longer associates; the same object when
 * nothing changed.
 */
export function pruneMonsterVoice<M extends MonsterVoiceSlice>(monster: M): M {
  const monsterBuffVoiceConfigs = pruneRecord(
    monster.monsterBuffVoiceConfigs,
    (key, config) =>
      resolveMonsterBuffSourceScope(monster, Number(key)) ? config : null,
  );
  const dbmEntries = dbmEntryIds(monster);
  const dbmVoiceConfigs = pruneRecord(monster.dbmVoiceConfigs, (key, config) =>
    dbmEntries.has(Number(key)) ? config : null,
  );
  const entityVoiceConfigs = pruneEntityVoiceConfigs(
    monster.entityVoiceConfigs,
    monster.entityDurationEntries,
  );
  if (
    monsterBuffVoiceConfigs === monster.monsterBuffVoiceConfigs &&
    dbmVoiceConfigs === monster.dbmVoiceConfigs &&
    entityVoiceConfigs === monster.entityVoiceConfigs
  ) {
    return monster;
  }
  return {
    ...monster,
    monsterBuffVoiceConfigs,
    dbmVoiceConfigs,
    entityVoiceConfigs,
  };
}

/** Minimap cue bindings of cues the scene registry still has. */
export function pruneMechanicVoiceConfigs(
  configs: MechanicVoiceConfigMap | undefined,
  knownCueIds: ReadonlySet<string>,
): MechanicVoiceConfigMap | undefined {
  return pruneRecord(configs, (cueId, config) =>
    knownCueIds.has(cueId) ? config : null,
  );
}

/** Game alert bindings of the alert kinds that exist. */
export function pruneAlertVoiceConfigs(
  configs: GameAlertVoiceConfigMap | undefined,
): GameAlertVoiceConfigMap | undefined {
  const kinds: ReadonlySet<string> = new Set(GAME_ALERT_KINDS);
  return pruneRecord(
    configs as Record<string, object> | undefined,
    (kind, c) => (kinds.has(kind) ? c : null),
  ) as GameAlertVoiceConfigMap | undefined;
}
