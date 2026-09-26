/**
 * @file Event-handler side of phrase resolution: "试听" previews and the
 * overview's "generate missing" both need to *await* phrase creation instead
 * of returning `null` while an upsert is pending (which is what the reactive
 * compile path does). Shares `sync.svelte.ts`'s index and upsert channel so
 * no duplicate phrases are created, and `bindingPhrases` so a preview names
 * the same phrase the compiled rule plays.
 */
import { commands } from "$lib/bindings";
import type { VoicePhraseBinding } from "$lib/settings-store";
import {
  bindingPhrases,
  type BindingPhrase,
  type BindingPhraseInput,
} from "./phrase-key";
import { upsertManagedPhrase } from "./sync.svelte";

/**
 * Resolves a binding to a phrase id and plays it through the test-trigger
 * pipeline. Custom text with the tier placeholder has no single phrase, so
 * it is previewed expanded with an example tier under a dedicated variant.
 */
export async function previewPhraseBinding(
  input: BindingPhraseInput,
): Promise<void> {
  if (input.phrase.source === "phrase") {
    const id = input.phrase.phraseId.trim();
    if (id) await commands.voiceTestTrigger(id);
    return;
  }
  const phrases = bindingPhrases({ ...input, includePreview: true });
  const target =
    phrases.find((phrase) => phrase.variant?.kind === "previewTier") ??
    phrases.find((phrase) => !phrase.variant);
  if (!target) return;
  const phraseId = await upsertManagedPhrase(
    target.name,
    target.text,
    target.language,
  );
  if (phraseId) await commands.voiceTestTrigger(phraseId);
}

/**
 * Every phrase id behind a binding, awaiting upserts that haven't landed:
 * the phrase it picked from the library, or each of its managed `phrases`
 * (`VoiceBinding.phrases`; up to 7 for tier-placeholder text).
 */
export async function materializeBindingPhraseIds(
  binding: VoicePhraseBinding,
  phrases: readonly BindingPhrase[],
): Promise<string[]> {
  if (binding.source === "phrase") {
    const id = binding.phraseId.trim();
    return id ? [id] : [];
  }
  const ids: string[] = [];
  for (const { name, text, language } of phrases) {
    const id = await upsertManagedPhrase(name, text, language);
    if (id) ids.push(id);
  }
  return ids;
}
