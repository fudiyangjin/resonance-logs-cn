/**
 * @file The digits a countdown speaks: one shared set of ten phrases, not a
 * binding. Pure, like `compile.ts`.
 *
 * The bundled recordings live under `auto:voice:countdown:{n}`, seeded by
 * the backend (`prompts.rs`). The user's own takes live next to them under
 * `custom:voice:countdown:{n}` (one set per pinned voice, like a binding),
 * so choosing them never touches the bundled set and switching back is
 * always possible. Both use fixed names, like the alert prompts.
 */
import type { VoiceLanguage } from "$lib/bindings";
import type {
  CountdownVoiceSetting,
  VoicePhraseBinding,
} from "$lib/settings-store";
import type { PhraseIndex, PhraseRequest, VoiceBinding } from "./compile";
import { bindingPhrases, type BindingPhrase } from "./phrase-key";

/**
 * Spoken text of countdown digits 1-10, per language. Must match the
 * bundled prompts in `src-tauri/voice-prompts/prompts.json` so the bundled
 * recording binds to the phrase.
 */
const COUNTDOWN_DIGIT_TEXT: Record<VoiceLanguage, readonly string[]> = {
  zhCn: ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"],
  enUs: [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ],
  jaJp: [
    "いち",
    "に",
    "さん",
    "よん",
    "ご",
    "ろく",
    "なな",
    "はち",
    "きゅう",
    "じゅう",
  ],
};

/**
 * `voice` as the phrase binding of one digit: what names its phrase and
 * picks the voice it is generated with.
 */
export function countdownDigitBinding(
  voice: CountdownVoiceSetting | undefined,
  text = "",
): VoicePhraseBinding {
  return voice?.source === "custom"
    ? { source: "custom", text, generationSource: voice.generationSource }
    : { source: "auto" };
}

/**
 * The ten digit phrases of `voice`, digit 1 first: the bundled recordings
 * for `auto` (or no setting), the user's own takes for `custom`.
 */
export function countdownPhrases(
  voice: CountdownVoiceSetting | undefined,
  language: VoiceLanguage,
): BindingPhrase[] {
  return COUNTDOWN_DIGIT_TEXT[language].flatMap((text, index) =>
    bindingPhrases({
      ruleKey: `voice:countdown:${index + 1}`,
      phrase: countdownDigitBinding(voice, text),
      autoText: text,
      language,
      supportsTier: false,
      fixedName: true,
    }),
  );
}

/**
 * The digit phrases the catalog must hold while any binding counts down:
 * the bundled set, which also stands in for a custom digit without audio,
 * and the custom set when it is chosen. They follow the app language.
 */
export function countdownPhraseRequests(
  bindings: readonly VoiceBinding[],
  language: VoiceLanguage,
  voice?: CountdownVoiceSetting,
): PhraseRequest[] {
  const counts = bindings.some(
    (binding) => "countdown" in binding.config && binding.config.countdown,
  );
  if (!counts) return [];
  const phrases = [
    ...countdownPhrases(undefined, language),
    ...(voice?.source === "custom" ? countdownPhrases(voice, language) : []),
  ];
  return phrases.map(({ name, text, language }) => ({ name, text, language }));
}

/**
 * The phrase ids the backend counts with instead of the bundled digits
 * (`VoiceRuntimeSnapshot.countdownPhraseIds`): digit `n` at index `n - 1`,
 * `""` for a digit whose phrase does not exist yet. Empty for the bundled
 * set, which the backend finds by name.
 */
export function countdownPhraseIds(
  voice: CountdownVoiceSetting | undefined,
  language: VoiceLanguage,
  index: PhraseIndex,
): string[] {
  if (voice?.source !== "custom") return [];
  const ids = countdownPhrases(voice, language).map(
    (phrase) => index[phrase.name]?.phraseId ?? "",
  );
  return ids.some(Boolean) ? ids : [];
}
