/**
 * @file Event-handler side of phrase resolution: "试听" previews and the
 * overview's "generate missing" both need to *await* phrase creation instead
 * of returning `null` while an upsert is pending (which is what the reactive
 * compile path does). Shares `sync.svelte.ts`'s index and upsert channel so
 * no duplicate phrases are created.
 */
import { commands, type VoiceLanguage } from "$lib/bindings";
import type { VoicePhraseBinding } from "$lib/settings-store";
import {
  expandTierPlaceholder,
  hasTierPlaceholder,
  managedPhraseName,
  PREVIEW_TIER,
  TIER_LEVELS,
  type ManagedPhraseVariant,
} from "./phrase-key";
import { currentPhraseIndex, upsertManagedPhrase } from "./sync.svelte";

async function resolveManaged(
  name: string,
  text: string,
  language: VoiceLanguage,
): Promise<string | null> {
  const cached = currentPhraseIndex()[name];
  if (cached && cached.text === text && cached.language === language) {
    return cached.phraseId;
  }
  return upsertManagedPhrase(name, text, language);
}

/**
 * Resolves `binding` to a phrase id and plays it through the test-trigger
 * pipeline. Custom text with the tier placeholder has no single phrase, so
 * it is previewed expanded with an example tier under a dedicated variant.
 */
export async function previewPhraseBinding(
  ruleKey: string,
  binding: VoicePhraseBinding,
  autoText: string,
  language: VoiceLanguage = "zhCn",
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
  const usesTierPlaceholder =
    binding.source === "custom" && hasTierPlaceholder(rawText);
  const text = usesTierPlaceholder
    ? expandTierPlaceholder(rawText, PREVIEW_TIER)
    : rawText;
  const name = managedPhraseName({
    source: binding.source,
    ruleKey,
    ...(usesTierPlaceholder
      ? {
          variant: {
            kind: "previewTier",
            tier: PREVIEW_TIER,
          } as ManagedPhraseVariant,
        }
      : {}),
  });
  const phraseId = await resolveManaged(name, text, language);
  if (phraseId) await commands.voiceTestTrigger(phraseId);
}

/**
 * Every phrase id behind `binding`, awaiting upserts that haven't landed.
 * Tier-placeholder custom text yields up to 7 ids (fallback + tiers 0-5).
 */
export async function materializeBindingPhraseIds(
  ruleKey: string,
  binding: VoicePhraseBinding,
  autoText: string,
  language: VoiceLanguage = "zhCn",
): Promise<string[]> {
  if (binding.source === "phrase") {
    const id = binding.phraseId.trim();
    return id ? [id] : [];
  }
  const rawText = (
    binding.source === "custom" ? binding.text : autoText
  ).trim();
  if (!rawText) return [];

  const variants: Array<{ variant?: ManagedPhraseVariant; text: string }> =
    binding.source === "custom" && hasTierPlaceholder(rawText)
      ? [
          { text: expandTierPlaceholder(rawText, null) },
          ...TIER_LEVELS.map((tier) => ({
            variant: { kind: "tier", tier } as ManagedPhraseVariant,
            text: expandTierPlaceholder(rawText, tier),
          })),
        ]
      : [{ text: rawText }];

  const ids: string[] = [];
  for (const { variant, text } of variants) {
    if (!text) continue;
    const name = managedPhraseName({
      source: binding.source,
      ruleKey,
      ...(variant ? { variant } : {}),
    });
    const id = await resolveManaged(name, text, language);
    if (id) ids.push(id);
  }
  return ids;
}
