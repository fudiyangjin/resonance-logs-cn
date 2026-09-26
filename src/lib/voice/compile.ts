/**
 * @file Pure compile pipeline: settings view -> bindings -> phrase requests
 * -> `VoiceRule[]`. No runes, no IPC; the reactive layer (`sync.svelte.ts`)
 * owns phrase materialization and feeds the resulting `PhraseIndex` back in.
 */
import type { VoiceLanguage, VoiceRule, VoiceTrigger } from "$lib/bindings";
import {
  resolveVoicePriority,
  type VoicePhraseBinding,
} from "$lib/settings-store";
import {
  bindingPhrases,
  hasTierPlaceholder,
  managedSlotOf,
  type BindingPhrase,
} from "./phrase-key";
import { VOICE_SUBJECT_ADAPTERS } from "./registry";
import type {
  OverviewGroup,
  VoiceBindingEventKind,
  VoiceBindingSubject,
  VoiceBindingView,
  VoiceEventConfigAny,
} from "./subject-types";

export {
  bindingPhrases,
  type BindingPhrase,
  type BindingPhraseInput,
} from "./phrase-key";

export const DEFAULT_COOLDOWN_MS = 2000;
const DEFAULT_SECONDS_BEFORE = 5;

/** One configured (subject, event) pair with everything needed downstream. */
export type VoiceBinding = {
  ruleKey: string;
  subject: VoiceBindingSubject;
  eventKind: VoiceBindingEventKind;
  group: OverviewGroup;
  subjectLabel: string;
  config: VoiceEventConfigAny;
  phrase: VoicePhraseBinding;
  /** Auto text with `secondsBefore` already substituted. */
  autoText: string;
  language: VoiceLanguage;
  /** `null` for frontend-played subjects (minimap cues). */
  trigger: VoiceTrigger | null;
  /** Custom text using the fantasy tier placeholder compiles to tier variants. */
  tiered: boolean;
  bundledFallback: boolean;
  /** The managed phrases this binding speaks through (no preview variant). */
  phrases: readonly BindingPhrase[];
};

export type PhraseRequest = {
  name: string;
  text: string;
  language: VoiceLanguage;
};

export type ResolvedPhrase = {
  phraseId: string;
  text: string;
  language: VoiceLanguage;
  /** The phrase has an active asset to play. */
  hasAudio?: boolean;
  updatedAtMs?: number;
};

/** Managed phrase name -> what the backend last confirmed for it. */
export type PhraseIndex = Readonly<Record<string, ResolvedPhrase>>;

export function secondsBeforeOf(config: VoiceEventConfigAny): number {
  const raw =
    "secondsBefore" in config ? config.secondsBefore : DEFAULT_SECONDS_BEFORE;
  return Math.max(1, Math.round(raw));
}

export type CollectOptions = {
  /** Include switched-off events too (GC keeps their phrases). */
  includeDisabled?: boolean;
};

/** The configured bindings visible in `view`, in registry order. */
export function collectBindings(
  view: VoiceBindingView,
  { includeDisabled = false }: CollectOptions = {},
): VoiceBinding[] {
  const bindings: VoiceBinding[] = [];
  for (const adapter of VOICE_SUBJECT_ADAPTERS) {
    for (const subject of adapter.enumerate(view)) {
      const specs = adapter.events(view, subject);
      if (specs.length === 0) continue;
      const subjectLabel = adapter.label(view, subject);
      const language = adapter.language(view);
      for (const spec of specs) {
        const config = adapter.read(view, subject, spec.eventKind);
        if (!config || (!includeDisabled && !config.enabled)) continue;
        const seconds = secondsBeforeOf(config);
        const ruleKey = adapter.ruleKey(subject, spec.eventKind);
        const autoText = spec.autoText(seconds);
        bindings.push({
          ruleKey,
          subject,
          eventKind: spec.eventKind,
          group: adapter.overview.group,
          subjectLabel,
          config,
          phrase: config.phrase,
          autoText,
          language,
          trigger:
            adapter.runtime === "backend"
              ? adapter.trigger(subject, spec.eventKind, seconds)
              : null,
          tiered:
            spec.supportsTierPlaceholder &&
            config.phrase.source === "custom" &&
            hasTierPlaceholder(config.phrase.text),
          bundledFallback: adapter.readyWithoutPhrase(
            view,
            subject,
            spec.eventKind,
          ),
          phrases: bindingPhrases({
            ruleKey,
            phrase: config.phrase,
            autoText,
            language,
            supportsTier: spec.supportsTierPlaceholder,
            fixedName: adapter.fixedPhraseName === true,
          }),
        });
      }
    }
  }
  return bindings;
}

/** Every catalog phrase the bindings need, deduplicated by name. */
export function phraseRequests(
  bindings: readonly VoiceBinding[],
): PhraseRequest[] {
  const byName = new Map<string, PhraseRequest>();
  for (const binding of bindings) {
    for (const { name, text, language } of binding.phrases) {
      if (!byName.has(name)) byName.set(name, { name, text, language });
    }
  }
  return [...byName.values()];
}

/**
 * How to resolve a phrase name: `exact` (status views) finds that phrase or
 * nothing; `playable` (compiled rules) falls back, while the phrase does not
 * exist yet, to the newest phrase of the same binding slot that has audio —
 * so an edited text keeps its old voice until the new phrase lands. The
 * backend applies the same rule while a landed phrase still lacks audio.
 */
export type PhraseResolution = "exact" | "playable";

const playableBySlotCache = new WeakMap<
  PhraseIndex,
  ReadonlyMap<string, ResolvedPhrase>
>();

/** Newest phrase with audio per binding slot, built once per index. */
function playableBySlot(
  index: PhraseIndex,
): ReadonlyMap<string, ResolvedPhrase> {
  const cached = playableBySlotCache.get(index);
  if (cached) return cached;
  const bySlot = new Map<string, ResolvedPhrase>();
  for (const [name, phrase] of Object.entries(index)) {
    if (!phrase.hasAudio) continue;
    const slot = managedSlotOf(name);
    if (!slot) continue;
    const newest = bySlot.get(slot);
    if (!newest || (phrase.updatedAtMs ?? 0) > (newest.updatedAtMs ?? 0)) {
      bySlot.set(slot, phrase);
    }
  }
  playableBySlotCache.set(index, bySlot);
  return bySlot;
}

function phraseIdFor(
  name: string,
  index: PhraseIndex,
  resolution: PhraseResolution,
): string | null {
  const exact = index[name];
  if (exact) return exact.phraseId;
  if (resolution === "exact") return null;
  const slot = managedSlotOf(name);
  return slot ? (playableBySlot(index).get(slot)?.phraseId ?? null) : null;
}

/** Phrase id a binding compiles to (its base phrase). */
export function resolvePhraseId(
  binding: VoiceBinding,
  index: PhraseIndex,
  resolution: PhraseResolution = "playable",
): string | null {
  if (binding.phrase.source === "phrase")
    return binding.phrase.phraseId.trim() || null;
  const base = binding.phrases.find((phrase) => !phrase.variant);
  return base ? phraseIdFor(base.name, index, resolution) : null;
}

export function resolveTierPhraseIds(
  binding: VoiceBinding,
  index: PhraseIndex,
  resolution: PhraseResolution = "playable",
): Record<number, string> {
  const byTier: Record<number, string> = {};
  for (const phrase of binding.phrases) {
    if (phrase.variant?.kind !== "tier") continue;
    const id = phraseIdFor(phrase.name, index, resolution);
    if (id) byTier[phrase.variant.tier] = id;
  }
  return byTier;
}

/** Backend rules for every enabled binding with a trigger and a phrase. */
export function compileVoiceRules(
  bindings: readonly VoiceBinding[],
  index: PhraseIndex,
): VoiceRule[] {
  const rules: VoiceRule[] = [];
  for (const binding of bindings) {
    if (!binding.trigger || !binding.config.enabled) continue;
    const phraseId = resolvePhraseId(binding, index);
    if (!phraseId) continue;
    const rule: VoiceRule = {
      id: binding.ruleKey,
      enabled: true,
      trigger: binding.trigger,
      phraseId,
      priority: resolveVoicePriority(binding.config.priority),
      cooldownMs: DEFAULT_COOLDOWN_MS,
    };
    if (binding.tiered) {
      const byTier = resolveTierPhraseIds(binding, index);
      rule.phraseIdByTier = Object.keys(byTier).length > 0 ? byTier : null;
    }
    rules.push(rule);
  }
  return rules;
}
