/**
 * @file Garbage collection of auto-managed voice phrases.
 *
 * A managed phrase (`auto:` / `custom:voice:*`) is needed while a binding
 * in *some* profile speaks through it — every skill profile, every monster
 * profile, and the global minimap and alert bindings, switched-off events
 * included — because phrase names are shared across loadouts. Bindings only
 * exist while their subject is associated (`association.ts`), so
 * un-monitoring a skill or removing an entity entry turns its phrases into
 * orphans here, and the phrase library deletes them in one click. Until
 * then, re-adding the binding with the same text reuses the audio.
 *
 * Never orphans: hand-made phrases (non-managed names), phrases a binding
 * picked from the library by id, phrases whose active audio was imported
 * (the user deletes those one by one), bundled alert prompts, and the
 * phrase a binding currently falls back to while its own audio is pending.
 */
import type { VoiceAssetMeta, VoicePhraseMeta } from "$lib/bindings";
import { collectBindings } from "./compile";
import {
  bindingPhrases,
  managedSlotOf,
  parseManagedPhraseName,
} from "./phrase-key";
import type { VoiceBindingView } from "./subject-types";

/** Rule keys of bundled prompts, which the backend re-seeds anyway. */
const BUNDLED_RULE_KEY_PREFIX = "voice:alert:";

/** What the phrase library must keep. */
export type VoicePhraseRefs = {
  /** Managed phrase names some binding speaks through. */
  names: ReadonlySet<string>;
  /** Phrase ids some binding picked from the library. */
  phraseIds: ReadonlySet<string>;
};

/**
 * The phrases referenced by the bindings of `views`: one view per profile
 * plus one for the global bindings (see `buildVoiceGcViews`).
 */
export function collectVoicePhraseRefs(
  views: readonly VoiceBindingView[],
): VoicePhraseRefs {
  const names = new Set<string>();
  const phraseIds = new Set<string>();
  for (const view of views) {
    for (const binding of collectBindings(view, { includeDisabled: true })) {
      if (binding.phrase.source === "phrase") {
        const id = binding.phrase.phraseId.trim();
        if (id) phraseIds.add(id);
        continue;
      }
      // Tier text also keeps the "试听" variant the binding control makes.
      const phrases = binding.tiered
        ? bindingPhrases({
            ruleKey: binding.ruleKey,
            phrase: binding.phrase,
            autoText: binding.autoText,
            language: binding.language,
            supportsTier: true,
            includePreview: true,
          })
        : binding.phrases;
      for (const phrase of phrases) names.add(phrase.name);
    }
  }
  return { names, phraseIds };
}

/**
 * Managed phrases nothing needs any more. Pure - safe to call from
 * `$derived`.
 */
export function classifyOrphanPhrases(
  phrases: readonly VoicePhraseMeta[],
  assets: readonly VoiceAssetMeta[],
  refs: VoicePhraseRefs,
): VoicePhraseMeta[] {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const hasAudio = (phrase: VoicePhraseMeta) =>
    !!phrase.activeAssetId && assetById.has(phrase.activeAssetId);
  const byName = new Map(phrases.map((phrase) => [phrase.name, phrase]));

  // A needed phrase that is missing or still silent plays the newest
  // phrase of its slot that has audio: that one is in use too.
  const fallbackIds = new Set<string>();
  for (const name of refs.names) {
    const current = byName.get(name);
    if (current && hasAudio(current)) continue;
    const slot = managedSlotOf(name);
    if (!slot) continue;
    let fallback: VoicePhraseMeta | undefined;
    for (const phrase of phrases) {
      if (phrase === current || !hasAudio(phrase)) continue;
      if (managedSlotOf(phrase.name) !== slot) continue;
      if (!fallback || phrase.updatedAtMs > fallback.updatedAtMs) {
        fallback = phrase;
      }
    }
    if (fallback) fallbackIds.add(fallback.id);
  }

  return phrases.filter((phrase) => {
    const parsed = parseManagedPhraseName(phrase.name);
    if (!parsed || parsed.ruleKey.startsWith(BUNDLED_RULE_KEY_PREFIX)) {
      return false;
    }
    if (
      refs.names.has(phrase.name) ||
      refs.phraseIds.has(phrase.id) ||
      fallbackIds.has(phrase.id)
    ) {
      return false;
    }
    const asset = phrase.activeAssetId
      ? assetById.get(phrase.activeAssetId)
      : undefined;
    return asset?.source.kind !== "imported";
  });
}
