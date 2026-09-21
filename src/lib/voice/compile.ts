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
  expandTierPlaceholder,
  hasTierPlaceholder,
  managedPhraseName,
  TIER_LEVELS,
  type ManagedPhraseVariant,
} from "./phrase-key";
import { VOICE_SUBJECT_ADAPTERS } from "./registry";
import type {
  OverviewGroup,
  VoiceBindingEventKind,
  VoiceBindingSubject,
  VoiceBindingView,
  VoiceEventConfigAny,
} from "./subject-types";

export const DEFAULT_COOLDOWN_MS = 2000;
const DEFAULT_SECONDS_BEFORE = 5;

/** One enabled (subject, event) pair with everything needed downstream. */
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
};

/** Managed phrase name -> what the backend last confirmed for it. */
export type PhraseIndex = Readonly<Record<string, ResolvedPhrase>>;

export function secondsBeforeOf(config: VoiceEventConfigAny): number {
  const raw =
    "secondsBefore" in config ? config.secondsBefore : DEFAULT_SECONDS_BEFORE;
  return Math.max(1, Math.round(raw));
}

/** All enabled bindings visible in `view`, in registry order. */
export function collectBindings(view: VoiceBindingView): VoiceBinding[] {
  const bindings: VoiceBinding[] = [];
  for (const adapter of VOICE_SUBJECT_ADAPTERS) {
    for (const subject of adapter.enumerate(view)) {
      const specs = adapter.events(view, subject);
      if (specs.length === 0) continue;
      const subjectLabel = adapter.label(view, subject);
      const language = adapter.language(view);
      for (const spec of specs) {
        const config = adapter.read(view, subject, spec.eventKind);
        if (!config?.enabled) continue;
        const seconds = secondsBeforeOf(config);
        bindings.push({
          ruleKey: adapter.ruleKey(subject, spec.eventKind),
          subject,
          eventKind: spec.eventKind,
          group: adapter.overview.group,
          subjectLabel,
          config,
          phrase: config.phrase,
          autoText: spec.autoText(seconds),
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
        });
      }
    }
  }
  return bindings;
}

/** The managed text a binding speaks (`null` for phrase references / empty text). */
export function bindingText(binding: VoiceBinding): string | null {
  if (binding.phrase.source === "phrase") return null;
  const text = (
    binding.phrase.source === "custom" ? binding.phrase.text : binding.autoText
  ).trim();
  return text || null;
}

export function bindingPhraseName(
  binding: VoiceBinding,
  variant?: ManagedPhraseVariant,
): string | null {
  if (binding.phrase.source === "phrase") return null;
  return managedPhraseName({
    source: binding.phrase.source,
    ruleKey: binding.ruleKey,
    ...(variant ? { variant } : {}),
  });
}

/**
 * Every catalog phrase the bindings need, deduplicated by name. Tiered
 * bindings expand to the placeholder-stripped fallback plus tiers 0-5.
 */
export function phraseRequests(
  bindings: readonly VoiceBinding[],
): PhraseRequest[] {
  const byName = new Map<string, PhraseRequest>();
  const push = (name: string | null, text: string, language: VoiceLanguage) => {
    if (!name || !text || byName.has(name)) return;
    byName.set(name, { name, text, language });
  };
  for (const binding of bindings) {
    const text = bindingText(binding);
    if (!text) continue;
    if (!binding.tiered) {
      push(bindingPhraseName(binding), text, binding.language);
      continue;
    }
    push(
      bindingPhraseName(binding),
      expandTierPlaceholder(text, null),
      binding.language,
    );
    for (const tier of TIER_LEVELS) {
      push(
        bindingPhraseName(binding, { kind: "tier", tier }),
        expandTierPlaceholder(text, tier),
        binding.language,
      );
    }
  }
  return [...byName.values()];
}

/**
 * Whether `request` already has a usable phrase: the index knows the name,
 * the stored text/language match, and the phrase still exists in the
 * catalog (`catalogPhraseIds`), so GC'd or hand-deleted phrases are
 * re-created instead of compiling into dangling ids.
 */
export function isResolved(
  index: PhraseIndex,
  catalogPhraseIds: ReadonlySet<string>,
  request: PhraseRequest,
): boolean {
  const entry = index[request.name];
  return (
    entry !== undefined &&
    entry.text === request.text &&
    entry.language === request.language &&
    catalogPhraseIds.has(entry.phraseId)
  );
}

/**
 * Phrase id a binding compiles to. Matches the pre-registry behaviour: a
 * stale index entry (text changed, upsert pending) keeps the old id so the
 * previous audio keeps playing until the new one lands.
 */
export function resolvePhraseId(
  binding: VoiceBinding,
  index: PhraseIndex,
): string | null {
  if (binding.phrase.source === "phrase")
    return binding.phrase.phraseId.trim() || null;
  if (!bindingText(binding)) return null;
  const name = bindingPhraseName(binding);
  return name ? (index[name]?.phraseId ?? null) : null;
}

export function resolveTierPhraseIds(
  binding: VoiceBinding,
  index: PhraseIndex,
): Record<number, string> {
  const byTier: Record<number, string> = {};
  if (!binding.tiered) return byTier;
  for (const tier of TIER_LEVELS) {
    const name = bindingPhraseName(binding, { kind: "tier", tier });
    const id = name ? index[name]?.phraseId : undefined;
    if (id) byTier[tier] = id;
  }
  return byTier;
}

/** Backend rules for every binding with a trigger and a resolved phrase. */
export function compileVoiceRules(
  bindings: readonly VoiceBinding[],
  index: PhraseIndex,
): VoiceRule[] {
  const rules: VoiceRule[] = [];
  for (const binding of bindings) {
    if (!binding.trigger) continue;
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
