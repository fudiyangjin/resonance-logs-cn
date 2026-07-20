/**
 * @file Compiles the buff / counter / DBM voice bindings scattered across the
 * skill-monitor counter and monster-monitor settings into the flat
 * `VoiceRule[]` the Rust side consumes (see `voice::models::VoiceRule`).
 *
 * Also exports the subject-key / auto-text helpers shared with
 * `voice-binding-control.svelte`, so a binding's "试听" preview and its
 * compiled rule always resolve to the exact same catalog phrase.
 *
 * Auto/custom bindings need a phrase id, which only exists once the phrase
 * has been created (or updated) in the backend catalog via
 * `voiceUpsertPhrase`. That call is async, but `buildVoiceRuntimeSnapshot()`
 * (in `runtime-monitor-sync.ts`) is read synchronously inside a Svelte
 * `$effect`, so resolution works as a small reactive cache: `compile*()`
 * synchronously returns whatever is already resolved, kicks off any missing
 * upserts in the background, and the `$state` cache update naturally
 * re-triggers the effect once they land.
 */
import { SvelteSet } from "svelte/reactivity";
import {
  commands,
  type MonsterBuffSourceScope,
  type VoiceRule,
  type VoiceTrigger,
} from "$lib/bindings";
import { resolveBuffDisplayName } from "$lib/config/buff-name-table";
import { lookupDbmDefaultName } from "$lib/config/dbm-table";
import { t } from "$lib/i18n/index.svelte";
import {
  activeProfile,
  updateActiveProfile,
} from "$lib/skill-monitor-profile.svelte.js";
import {
  ensureBuffVoiceConfigs,
  ensureDbmVoiceConfigs,
  ensureMechanicVoiceConfigs,
  getGlobalBuffAliases,
  SETTINGS,
  type BuffVoiceConfig,
  type DbmVoiceConfig,
  type VoiceEventConfig,
  type VoiceExpiringEventConfig,
  type VoicePhraseBinding,
} from "$lib/settings-store";
import {
  counterSlotLabel,
  counterSlotSupportsExpiry,
  counterSlotSupportsThreshold,
  resolveCounterVoiceRules,
} from "$lib/voice-binding-counter";
import { allMinimapVoiceCues } from "../routes/minimap-overlay/scene-registry";

const DEFAULT_PRIORITY = 150;
const EXPIRING_PRIORITY = 180;
const DEFAULT_COOLDOWN_MS = 2000;

// ---------------------------------------------------------------------------
// Fantasy tier placeholder (`${阶数}` / `${remodelLevel}`) for custom
// buff/monsterBuff gained/lost text. Expands into one phrase per remodel
// level (0-5) plus a placeholder-stripped fallback, so the Rust rule engine
// (`VoiceRule::phrase_id_by_tier`) can pick the variant matching the tier of
// the fantasy summon that actually applied/removed the buff.
// ---------------------------------------------------------------------------

const TIER_LEVELS = [0, 1, 2, 3, 4, 5] as const;
/** Tier used to render the "试听" preview for text containing the placeholder. */
const PREVIEW_TIER = 5;

function tierPlaceholderPattern(): RegExp {
  return /\$\{(?:remodelLevel|阶数)\}/g;
}

export function hasTierPlaceholder(text: string): boolean {
  return /\$\{(?:remodelLevel|阶数)\}/.test(text);
}

/** Replaces the placeholder with `{tier}阶` (or removes it when `tier` is null, for the no-tier-known fallback), collapsing any resulting double spaces. */
export function expandTierPlaceholder(
  text: string,
  tier: number | null,
): string {
  const replacement = tier === null ? "" : `${tier}阶`;
  return text
    .replace(tierPlaceholderPattern(), replacement)
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Subject labels, per-event rule-id keys, and auto-generated preview text.
// Shared between the compile pass below and `voice-binding-control.svelte`,
// so a binding's live preview always matches what actually gets spoken.
// ---------------------------------------------------------------------------

export function buffSubjectLabel(buffId: number): string {
  return resolveBuffDisplayName(buffId, getGlobalBuffAliases());
}

export function dbmSubjectLabel(baseSkillId: number): string {
  const alias = SETTINGS.monsterMonitor.state.dbmAliases?.[String(baseSkillId)];
  return (
    alias?.trim() || lookupDbmDefaultName(baseSkillId) || `#${baseSkillId}`
  );
}

export function buffEventKey(
  buffId: number,
  event: "gained" | "expiring" | "lost",
): string {
  return `voice:buff:${buffId}:${event}`;
}

export function buffAutoText(
  name: string,
  event: "gained" | "expiring" | "lost",
  secondsBefore = 5,
): string {
  switch (event) {
    case "gained":
      return `${name}已生效`;
    case "expiring":
      return `${name}还有${secondsBefore}秒失效`;
    case "lost":
      return `${name}已失效`;
  }
}

export function monsterBuffEventKey(
  sourceScope: MonsterBuffSourceScope,
  buffId: number,
  event: "gained" | "expiring" | "lost",
): string {
  return `voice:monsterBuff:${sourceScope}:${buffId}:${event}`;
}

export function resolveMonsterBuffSourceScope(
  buffId: number,
): MonsterBuffSourceScope | null {
  const monitor = SETTINGS.monsterMonitor.state;
  if (monitor.selfAppliedBuffIds.includes(buffId)) {
    return "localPlayerSource";
  }
  if (monitor.monitoredBuffIds.includes(buffId)) return "anySource";
  return monitor.selfAppliedMonitorAll ? "localPlayerSource" : null;
}

export function monsterBuffAutoText(
  name: string,
  event: "gained" | "expiring" | "lost",
  secondsBefore = 5,
): string {
  switch (event) {
    case "gained":
      return `目标${name}已生效`;
    case "expiring":
      return `目标${name}还有${secondsBefore}秒失效`;
    case "lost":
      return `目标${name}已失效`;
  }
}

export function minimapCueEventKey(cueId: string): string {
  return `voice:minimapCue:${cueId}`;
}

export function counterEventKey(
  ruleId: number,
  slotId: number,
  event: "threshold" | "expiring",
): string {
  return `voice:counter:${ruleId}:${slotId}:${event}`;
}

export function counterAutoText(
  label: string,
  event: "threshold" | "expiring",
  secondsBefore = 5,
): string {
  return event === "threshold"
    ? `${label}已达到目标`
    : `${label}还有${secondsBefore}秒`;
}

export function dbmEventKey(
  baseSkillId: number,
  event: "onCast" | "expiring",
): string {
  return `voice:dbm:${baseSkillId}:${event}`;
}

export function dbmAutoText(
  name: string,
  event: "onCast" | "expiring",
  secondsBefore = 5,
): string {
  return event === "onCast" ? name : `${name}还有${secondsBefore}秒`;
}

// ---------------------------------------------------------------------------
// Phrase resolution (auto/custom text -> catalog phrase id via upsert).
// ---------------------------------------------------------------------------

type ResolvedEntry = { phraseId: string; text: string };

const resolved = $state<Record<string, ResolvedEntry>>({});
const pendingKeys = new SvelteSet<string>();

async function upsertPhrase(key: string, text: string): Promise<string | null> {
  try {
    const result = await commands.voiceUpsertPhrase(key, text, "zhCn");
    if (result.status !== "ok") return null;
    resolved[key] = { phraseId: result.data.id, text };
    return result.data.id;
  } finally {
    pendingKeys.delete(key);
  }
}

/**
 * Resolves `binding` to a phrase id, or `null` if it can't be played yet
 * (empty custom text, unset phrase reference, or an auto/custom phrase
 * that's still being created in the background). Exported for reuse by the
 * minimap overlay's cue player (`minimap-voice.svelte.ts`), which resolves
 * phrases the same way but enqueues playback directly instead of compiling
 * a `VoiceRule`.
 */
export function ensurePhraseId(
  key: string,
  binding: VoicePhraseBinding,
  autoText: string,
): string | null {
  if (binding.source === "phrase") {
    const id = binding.phraseId.trim();
    return id || null;
  }
  const text = (binding.source === "custom" ? binding.text : autoText).trim();
  if (!text) return null;
  const cacheKey = `${binding.source}:${key}`;
  const cached = resolved[cacheKey];
  if (!cached || cached.text !== text) {
    if (!pendingKeys.has(cacheKey)) {
      pendingKeys.add(cacheKey);
      void upsertPhrase(cacheKey, text);
    }
  }
  return cached?.text === text ? cached.phraseId : (cached?.phraseId ?? null);
}

export type TieredPhraseResolution = {
  /** Fallback phrase, used when the triggering buff's fantasy tier is unknown or has no variant below. */
  phraseId: string;
  /** Per-tier (0-5) variant phrase ids, present only once each has resolved. */
  phraseIdByTier?: Record<number, string>;
};

/**
 * Like `ensurePhraseId`, but for buff/monsterBuff gained/lost bindings that
 * may use the fantasy tier placeholder. Non-custom bindings (and custom text
 * without the placeholder) behave exactly like `ensurePhraseId`. Custom text
 * with the placeholder instead resolves (and, on cache miss, kicks off
 * upserts for) up to 7 phrases: one per remodel level 0-5, plus a fallback
 * with the placeholder segment stripped for when the tier can't be
 * determined at runtime.
 */
export function ensureTieredPhraseId(
  key: string,
  binding: VoicePhraseBinding,
  autoText: string,
): TieredPhraseResolution | null {
  if (binding.source !== "custom" || !hasTierPlaceholder(binding.text)) {
    const phraseId = ensurePhraseId(key, binding, autoText);
    return phraseId ? { phraseId } : null;
  }

  const rawText = binding.text;
  const fallbackPhraseId = ensurePhraseId(
    key,
    { source: "custom", text: expandTierPlaceholder(rawText, null) },
    autoText,
  );
  if (!fallbackPhraseId) return null;

  const phraseIdByTier: Record<number, string> = {};
  for (const tier of TIER_LEVELS) {
    const tierPhraseId = ensurePhraseId(
      `${key}:tier${tier}`,
      { source: "custom", text: expandTierPlaceholder(rawText, tier) },
      autoText,
    );
    if (tierPhraseId) phraseIdByTier[tier] = tierPhraseId;
  }

  return {
    phraseId: fallbackPhraseId,
    ...(Object.keys(phraseIdByTier).length > 0 ? { phraseIdByTier } : {}),
  };
}

/**
 * The catalog phrase id backing `binding`, if one has been resolved yet
 * (`null` for an unset phrase reference, empty custom text, or an
 * auto/custom phrase whose background upsert hasn't landed).
 */
export function resolvedPhraseIdOf(
  key: string,
  binding: VoicePhraseBinding,
): string | null {
  if (binding.source === "phrase") return binding.phraseId.trim() || null;
  const cacheKey = `${binding.source}:${key}`;
  return resolved[cacheKey]?.phraseId ?? null;
}

/**
 * Resolves `binding` to a phrase id and immediately plays it through the
 * test-trigger pipeline, awaiting phrase creation for auto/custom text
 * instead of returning `null` while it's pending (unlike `ensurePhraseId`,
 * which is meant for the reactive, non-blocking compile path). Used by the
 * "试听" buttons in the binding UI.
 */
export async function previewPhraseBinding(
  key: string,
  binding: VoicePhraseBinding,
  autoText: string,
): Promise<void> {
  if (binding.source === "phrase") {
    const id = binding.phraseId.trim();
    if (id) await commands.voiceTestTrigger(id);
    return;
  }
  const rawText = (
    binding.source === "custom" ? binding.text : autoText
  ).trim();
  if (!rawText) return;
  // Custom text with the tier placeholder has no single phrase (it compiles
  // to a fallback + per-tier variants), so preview it expanded with an
  // example tier under a dedicated cache key, separate from the ones the
  // compile pass uses for the real per-tier phrases.
  const usesTierPlaceholder =
    binding.source === "custom" && hasTierPlaceholder(rawText);
  const text = usesTierPlaceholder
    ? expandTierPlaceholder(rawText, PREVIEW_TIER)
    : rawText;
  const cacheKey = usesTierPlaceholder
    ? `${binding.source}:${key}:previewTier${PREVIEW_TIER}`
    : `${binding.source}:${key}`;
  const cached = resolved[cacheKey];
  const phraseId =
    cached?.text === text
      ? cached.phraseId
      : await upsertPhrase(cacheKey, text);
  if (phraseId) await commands.voiceTestTrigger(phraseId);
}

// ---------------------------------------------------------------------------
// Compile pass: settings -> flat VoiceRule[]
// ---------------------------------------------------------------------------

function compileEvent(
  ruleId: string,
  trigger: VoiceTrigger,
  config: VoiceEventConfig | undefined,
  autoText: string,
  priority: number,
): VoiceRule | null {
  if (!config?.enabled) return null;
  const phraseId = ensurePhraseId(ruleId, config.phrase, autoText);
  if (!phraseId) return null;
  return {
    id: ruleId,
    enabled: true,
    trigger,
    phraseId,
    priority,
    cooldownMs: DEFAULT_COOLDOWN_MS,
  };
}

/**
 * Like `compileEvent`, but for buff/monsterBuff gained/lost triggers, which
 * are the only ones the Rust rule engine resolves a fantasy tier for. Uses
 * `ensureTieredPhraseId` so custom text with the `${阶数}` placeholder
 * compiles to a rule carrying `phraseIdByTier` variants alongside the
 * placeholder-stripped fallback `phraseId`.
 */
function compileTieredEvent(
  ruleId: string,
  trigger: VoiceTrigger,
  config: VoiceEventConfig | undefined,
  autoText: string,
  priority: number,
): VoiceRule | null {
  if (!config?.enabled) return null;
  const resolution = ensureTieredPhraseId(ruleId, config.phrase, autoText);
  if (!resolution) return null;
  return {
    id: ruleId,
    enabled: true,
    trigger,
    phraseId: resolution.phraseId,
    phraseIdByTier: resolution.phraseIdByTier ?? null,
    priority,
    cooldownMs: DEFAULT_COOLDOWN_MS,
  };
}

function compileExpiringEvent(
  ruleId: string,
  trigger: VoiceTrigger,
  config: VoiceExpiringEventConfig | undefined,
  autoText: (secondsBefore: number) => string,
): VoiceRule | null {
  if (!config?.enabled) return null;
  const seconds = Math.max(1, Math.round(config.secondsBefore));
  const phraseId = ensurePhraseId(ruleId, config.phrase, autoText(seconds));
  if (!phraseId) return null;
  return {
    id: ruleId,
    enabled: true,
    trigger,
    phraseId,
    priority: EXPIRING_PRIORITY,
    cooldownMs: DEFAULT_COOLDOWN_MS,
  };
}

function compileBuffVoiceRules(): VoiceRule[] {
  const profile = activeProfile();
  if (!profile) return [];
  const configs = ensureBuffVoiceConfigs(profile.buffVoiceConfigs);
  const rules: VoiceRule[] = [];
  for (const [buffIdText, config] of Object.entries(configs)) {
    const buffId = Number(buffIdText);
    if (!Number.isInteger(buffId)) continue;
    const name = buffSubjectLabel(buffId);
    const seconds = config.expiring?.secondsBefore ?? 5;

    const gained = compileTieredEvent(
      buffEventKey(buffId, "gained"),
      { kind: "buffGained", buffId },
      config.gained,
      buffAutoText(name, "gained"),
      DEFAULT_PRIORITY,
    );
    if (gained) rules.push(gained);

    const lost = compileTieredEvent(
      buffEventKey(buffId, "lost"),
      { kind: "buffLost", buffId },
      config.lost,
      buffAutoText(name, "lost"),
      DEFAULT_PRIORITY,
    );
    if (lost) rules.push(lost);

    const expiring = compileExpiringEvent(
      buffEventKey(buffId, "expiring"),
      { kind: "buffExpiring", buffId, secondsBefore: seconds },
      config.expiring,
      (s) => buffAutoText(name, "expiring", s),
    );
    if (expiring) rules.push(expiring);
  }
  return rules;
}

function compileMonsterBuffVoiceRules(): VoiceRule[] {
  const configs = ensureBuffVoiceConfigs(
    SETTINGS.monsterMonitor.state.monsterBuffVoiceConfigs,
  );
  const rules: VoiceRule[] = [];
  for (const [buffIdText, config] of Object.entries(configs)) {
    const buffId = Number(buffIdText);
    if (!Number.isInteger(buffId)) continue;
    const sourceScope = resolveMonsterBuffSourceScope(buffId);
    if (!sourceScope) continue;
    const name = buffSubjectLabel(buffId);
    const seconds = config.expiring?.secondsBefore ?? 5;

    const gained = compileTieredEvent(
      monsterBuffEventKey(sourceScope, buffId, "gained"),
      { kind: "monsterBuffGained", buffId, sourceScope },
      config.gained,
      monsterBuffAutoText(name, "gained"),
      DEFAULT_PRIORITY,
    );
    if (gained) rules.push(gained);

    const lost = compileTieredEvent(
      monsterBuffEventKey(sourceScope, buffId, "lost"),
      { kind: "monsterBuffLost", buffId, sourceScope },
      config.lost,
      monsterBuffAutoText(name, "lost"),
      DEFAULT_PRIORITY,
    );
    if (lost) rules.push(lost);

    const expiring = compileExpiringEvent(
      monsterBuffEventKey(sourceScope, buffId, "expiring"),
      {
        kind: "monsterBuffExpiring",
        buffId,
        secondsBefore: seconds,
        sourceScope,
      },
      config.expiring,
      (s) => monsterBuffAutoText(name, "expiring", s),
    );
    if (expiring) rules.push(expiring);
  }
  return rules;
}

function compileCounterVoiceRules(): VoiceRule[] {
  const profile = activeProfile();
  if (!profile) return [];
  const rules: VoiceRule[] = [];
  for (const rule of resolveCounterVoiceRules(profile)) {
    for (const slot of rule.effectSlots) {
      const slotId = slot.slotId;
      const config = rule.voice[String(slotId)];
      if (!config) continue;
      const label = counterSlotLabel(rule, slotId);
      const seconds = config.expiring?.secondsBefore ?? 5;

      if (counterSlotSupportsThreshold(slot)) {
        const threshold = compileEvent(
          counterEventKey(rule.ruleId, slotId, "threshold"),
          { kind: "counterThreshold", ruleId: rule.ruleId, slotId },
          config.threshold,
          counterAutoText(label, "threshold"),
          DEFAULT_PRIORITY,
        );
        if (threshold) rules.push(threshold);
      }

      if (counterSlotSupportsExpiry(slot)) {
        const expiring = compileExpiringEvent(
          counterEventKey(rule.ruleId, slotId, "expiring"),
          {
            kind: "counterExpiring",
            ruleId: rule.ruleId,
            slotId,
            secondsBefore: seconds,
          },
          config.expiring,
          (s) => counterAutoText(label, "expiring", s),
        );
        if (expiring) rules.push(expiring);
      }
    }
  }
  return rules;
}

function compileDbmVoiceRules(): VoiceRule[] {
  const state = SETTINGS.monsterMonitor.state;
  const configs = ensureDbmVoiceConfigs(state.dbmVoiceConfigs);
  const rules: VoiceRule[] = [];
  for (const [idText, config] of Object.entries(configs)) {
    const baseSkillId = Number(idText);
    if (!Number.isInteger(baseSkillId)) continue;
    const name = dbmSubjectLabel(baseSkillId);
    const seconds = config.expiring?.secondsBefore ?? 5;

    const onCast = compileEvent(
      dbmEventKey(baseSkillId, "onCast"),
      { kind: "bossDbm", baseSkillId },
      config.onCast,
      dbmAutoText(name, "onCast"),
      DEFAULT_PRIORITY,
    );
    if (onCast) rules.push(onCast);

    const expiring = compileExpiringEvent(
      dbmEventKey(baseSkillId, "expiring"),
      { kind: "bossDbmExpiring", baseSkillId, secondsBefore: seconds },
      config.expiring,
      (s) => dbmAutoText(name, "expiring", s),
    );
    if (expiring) rules.push(expiring);
  }
  return rules;
}

export function prepareMinimapVoicePhrases(): void {
  const configs = ensureMechanicVoiceConfigs(
    SETTINGS.minimap.state.mechanicVoiceConfigs,
  );
  for (const cue of allMinimapVoiceCues()) {
    const config = configs[cue.id];
    if (!config?.enabled) continue;
    ensurePhraseId(minimapCueEventKey(cue.id), config.phrase, cue.autoText);
  }
}

export function mergeVoiceConfigPatch<T extends object>(
  base: Record<string, T>,
  patch: Record<string, Partial<T>>,
): Record<string, T> {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = { ...(next[key] ?? ({} as T)), ...value };
  }
  return next;
}

let legacyMigrationAttempted = false;

/**
 * One-shot migration of the old manually-authored `voice.rules` (buffGained /
 * buffLost / bossDbm only, no expiring/counter support) into the new inline
 * bindings, then clears the legacy list. Safe to call on every render: it's a
 * no-op once `voice.rules` is empty.
 */
function migrateLegacyVoiceRules(): void {
  const legacyRules = SETTINGS.voice.state.rules;
  if (legacyRules.length === 0) return;
  // Buff bindings live on the active skill-monitor profile, which may not be
  // hydrated from disk yet on the very first tick; retry on a later call
  // instead of dropping the legacy rules for buffs that reference it.
  const profile = activeProfile();
  if (!profile && !legacyMigrationAttempted) {
    legacyMigrationAttempted = true;
    return;
  }

  const buffPatch: Record<string, Partial<BuffVoiceConfig>> = {};
  const dbmPatch: Record<string, Partial<DbmVoiceConfig>> = {};
  for (const rule of legacyRules) {
    if (!rule.phraseId) continue;
    const phrase: VoicePhraseBinding = {
      source: "phrase",
      phraseId: rule.phraseId,
    };
    const event: VoiceEventConfig = { enabled: rule.enabled, phrase };
    if (rule.trigger.kind === "buffGained") {
      const key = String(rule.trigger.buffId);
      buffPatch[key] = { ...buffPatch[key], gained: event };
    } else if (rule.trigger.kind === "buffLost") {
      const key = String(rule.trigger.buffId);
      buffPatch[key] = { ...buffPatch[key], lost: event };
    } else if (rule.trigger.kind === "bossDbm") {
      const key = String(rule.trigger.baseSkillId);
      dbmPatch[key] = { ...dbmPatch[key], onCast: event };
    }
  }

  if (profile && Object.keys(buffPatch).length > 0) {
    updateActiveProfile((current) => ({
      ...current,
      buffVoiceConfigs: mergeVoiceConfigPatch(
        ensureBuffVoiceConfigs(current.buffVoiceConfigs),
        buffPatch,
      ),
    }));
  }
  if (Object.keys(dbmPatch).length > 0) {
    SETTINGS.monsterMonitor.state.dbmVoiceConfigs = mergeVoiceConfigPatch(
      ensureDbmVoiceConfigs(SETTINGS.monsterMonitor.state.dbmVoiceConfigs),
      dbmPatch,
    );
  }
  SETTINGS.voice.state.rules = [];
}

/** All bindings compiled to the flat rule list the Rust side consumes. */
export function compileVoiceRules(): VoiceRule[] {
  migrateLegacyVoiceRules();
  return [
    ...compileBuffVoiceRules(),
    ...compileMonsterBuffVoiceRules(),
    ...compileCounterVoiceRules(),
    ...compileDbmVoiceRules(),
  ];
}

// ---------------------------------------------------------------------------
// Read-only overview (used by the voice page's "播报总览" tab).
// ---------------------------------------------------------------------------

export type VoiceBindingOverviewEntry = {
  id: string;
  subjectLabel: string;
  eventLabelKey:
    | "voice.binding.event.gained"
    | "voice.binding.event.expiring"
    | "voice.binding.event.lost"
    | "voice.binding.event.threshold"
    | "voice.binding.event.onCast";
  binding: VoicePhraseBinding;
  phraseId: string | null;
  navigateTo: "buff" | "monsterBuff" | "counter" | "dbm" | "minimap";
  monsterBuffSourceScope?: MonsterBuffSourceScope;
};

function pushOverviewEntry(
  entries: VoiceBindingOverviewEntry[],
  navigateTo: VoiceBindingOverviewEntry["navigateTo"],
  id: string,
  subjectLabel: string,
  eventLabelKey: VoiceBindingOverviewEntry["eventLabelKey"],
  config: VoiceEventConfig | VoiceExpiringEventConfig | undefined,
  monsterBuffSourceScope?: MonsterBuffSourceScope,
) {
  if (!config?.enabled) return;
  entries.push({
    id,
    subjectLabel,
    eventLabelKey,
    binding: config.phrase,
    phraseId: resolvedPhraseIdOf(id, config.phrase),
    navigateTo,
    ...(monsterBuffSourceScope ? { monsterBuffSourceScope } : {}),
  });
}

/**
 * Same three sources as `compileVoiceRules`, but every configured event
 * (regardless of whether its phrase has resolved yet) - used by the
 * read-only overview tab so users can see "pending generation" entries
 * instead of them just being invisible.
 */
export function listVoiceBindingOverview(): VoiceBindingOverviewEntry[] {
  const entries: VoiceBindingOverviewEntry[] = [];
  const profile = activeProfile();

  if (profile) {
    const buffConfigs = ensureBuffVoiceConfigs(profile.buffVoiceConfigs);
    for (const [buffIdText, config] of Object.entries(buffConfigs)) {
      const buffId = Number(buffIdText);
      if (!Number.isInteger(buffId)) continue;
      const subjectLabel = buffSubjectLabel(buffId);
      pushOverviewEntry(
        entries,
        "buff",
        buffEventKey(buffId, "gained"),
        subjectLabel,
        "voice.binding.event.gained",
        config.gained,
      );
      pushOverviewEntry(
        entries,
        "buff",
        buffEventKey(buffId, "expiring"),
        subjectLabel,
        "voice.binding.event.expiring",
        config.expiring,
      );
      pushOverviewEntry(
        entries,
        "buff",
        buffEventKey(buffId, "lost"),
        subjectLabel,
        "voice.binding.event.lost",
        config.lost,
      );
    }

    for (const rule of resolveCounterVoiceRules(profile)) {
      for (const slot of rule.effectSlots) {
        const slotId = slot.slotId;
        const config = rule.voice[String(slotId)];
        if (!config) continue;
        const subjectLabel = counterSlotLabel(rule, slotId);
        if (counterSlotSupportsThreshold(slot)) {
          pushOverviewEntry(
            entries,
            "counter",
            counterEventKey(rule.ruleId, slotId, "threshold"),
            subjectLabel,
            "voice.binding.event.threshold",
            config.threshold,
          );
        }
        if (counterSlotSupportsExpiry(slot)) {
          pushOverviewEntry(
            entries,
            "counter",
            counterEventKey(rule.ruleId, slotId, "expiring"),
            subjectLabel,
            "voice.binding.event.expiring",
            config.expiring,
          );
        }
      }
    }
  }

  const monsterBuffConfigs = ensureBuffVoiceConfigs(
    SETTINGS.monsterMonitor.state.monsterBuffVoiceConfigs,
  );
  for (const [buffIdText, config] of Object.entries(monsterBuffConfigs)) {
    const buffId = Number(buffIdText);
    if (!Number.isInteger(buffId)) continue;
    const sourceScope = resolveMonsterBuffSourceScope(buffId);
    if (!sourceScope) continue;
    const subjectLabel = buffSubjectLabel(buffId);
    pushOverviewEntry(
      entries,
      "monsterBuff",
      monsterBuffEventKey(sourceScope, buffId, "gained"),
      subjectLabel,
      "voice.binding.event.gained",
      config.gained,
      sourceScope,
    );
    pushOverviewEntry(
      entries,
      "monsterBuff",
      monsterBuffEventKey(sourceScope, buffId, "expiring"),
      subjectLabel,
      "voice.binding.event.expiring",
      config.expiring,
      sourceScope,
    );
    pushOverviewEntry(
      entries,
      "monsterBuff",
      monsterBuffEventKey(sourceScope, buffId, "lost"),
      subjectLabel,
      "voice.binding.event.lost",
      config.lost,
      sourceScope,
    );
  }

  const dbmConfigs = ensureDbmVoiceConfigs(
    SETTINGS.monsterMonitor.state.dbmVoiceConfigs,
  );
  for (const [idText, config] of Object.entries(dbmConfigs)) {
    const baseSkillId = Number(idText);
    if (!Number.isInteger(baseSkillId)) continue;
    const subjectLabel = dbmSubjectLabel(baseSkillId);
    pushOverviewEntry(
      entries,
      "dbm",
      dbmEventKey(baseSkillId, "onCast"),
      subjectLabel,
      "voice.binding.event.onCast",
      config.onCast,
    );
    pushOverviewEntry(
      entries,
      "dbm",
      dbmEventKey(baseSkillId, "expiring"),
      subjectLabel,
      "voice.binding.event.expiring",
      config.expiring,
    );
  }

  const minimapConfigs = ensureMechanicVoiceConfigs(
    SETTINGS.minimap.state.mechanicVoiceConfigs,
  );
  for (const cue of allMinimapVoiceCues()) {
    pushOverviewEntry(
      entries,
      "minimap",
      minimapCueEventKey(cue.id),
      t(cue.labelKey),
      "voice.binding.event.onCast",
      minimapConfigs[cue.id],
    );
  }

  return entries;
}
