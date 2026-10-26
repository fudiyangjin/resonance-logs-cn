/**
 * @file Naming contract for auto-managed catalog phrases.
 *
 * A binding's phrase is looked up by *name* in the backend catalog. The name
 * encodes who owns it (`auto` / `custom` source), which rule it belongs to
 * (`voice:buff:101:gained`, ...), for tier-placeholder text which variant it
 * is (`:tier3`, `:previewTier5`), and a hash of the spoken text
 * (`~76ddfb4a`). Hashing the text makes every distinct text its own phrase:
 * loadouts that speak different words for the same subject each keep their
 * audio instead of overwriting one shared phrase, and identical texts share
 * one. Bundled prompts (`auto:voice:alert:*`) keep fixed, hash-less names.
 *
 * The Rust side mirrors this in `voice/phrase_name.rs` (hash, slot and the
 * one-time rename of pre-hash names) and `prompts.rs::managed_name`, so the
 * format here is part of the wire contract and must not drift.
 */
import type { VoiceLanguage } from "$lib/bindings";
import type { AppLocale } from "$lib/i18n/locales";
import type { VoicePhraseBinding } from "$lib/settings-store";

export type ManagedPhraseSource = "auto" | "custom";

export type ManagedPhraseVariant =
  | { kind: "tier"; tier: number }
  | { kind: "previewTier"; tier: number };

export type ManagedPhraseName = {
  source: ManagedPhraseSource;
  ruleKey: string;
  variant?: ManagedPhraseVariant;
  /** `contentHash` of the spoken text; absent on fixed and pre-hash names. */
  hash?: string;
};

export const TIER_LEVELS = [0, 1, 2, 3, 4, 5] as const;
/** Tier used to render the "试听" preview for text containing the placeholder. */
export const PREVIEW_TIER = 5;

const TIER_PLACEHOLDER = /\$\{(?:remodelLevel|阶数)\}/g;
const MANAGED_NAME_PATTERN =
  /^(auto|custom):(voice:.+?)(?::(tier|previewTier)(\d+))?(?:~([0-9a-f]{8}))?$/;

/**
 * FNV-1a 32-bit over the UTF-8 of `"{language}\0{text}"`, as 8 lowercase hex
 * digits. Pinned by the same golden vectors as `phrase_name.rs`.
 */
export function contentHash(text: string, language: VoiceLanguage): string {
  const bytes = new TextEncoder().encode(`${language}\u0000${text}`);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function managedPhraseName(name: ManagedPhraseName): string {
  const variant = name.variant
    ? `:${name.variant.kind}${name.variant.tier}`
    : "";
  const hash = name.hash ? `~${name.hash}` : "";
  return `${name.source}:${name.ruleKey}${variant}${hash}`;
}

/**
 * Inverse of `managedPhraseName`; `null` for phrases the user created by
 * hand (whose names don't follow the managed pattern).
 */
export function parseManagedPhraseName(name: string): ManagedPhraseName | null {
  const match = MANAGED_NAME_PATTERN.exec(name);
  if (!match) return null;
  const [, source, ruleKey, variantKind, tierText, hash] = match;
  const parsed: ManagedPhraseName = {
    source: source as ManagedPhraseSource,
    ruleKey: ruleKey!,
  };
  if (variantKind && tierText !== undefined) {
    parsed.variant = {
      kind: variantKind as ManagedPhraseVariant["kind"],
      tier: Number(tierText),
    };
  }
  if (hash) parsed.hash = hash;
  return parsed;
}

/**
 * The binding slot (rule key plus variant) a content-addressed name speaks
 * for, or `null` for any other name. Phrases of one slot are the successive
 * texts of the same binding: while the current one has no audio yet, the
 * newest one that has keeps playing (`phrase_name.rs::managed_slot`).
 */
export function managedSlotOf(name: string): string | null {
  const parsed = parseManagedPhraseName(name);
  if (!parsed?.hash) return null;
  const variant = parsed.variant
    ? `:${parsed.variant.kind}${parsed.variant.tier}`
    : "";
  return `${parsed.ruleKey}${variant}`;
}

export function hasTierPlaceholder(text: string): boolean {
  return /\$\{(?:remodelLevel|阶数)\}/.test(text);
}

/**
 * Replaces the placeholder with `{tier}阶` (or removes it when `tier` is
 * null, for the no-tier-known fallback), collapsing any resulting double
 * spaces.
 */
export function expandTierPlaceholder(
  text: string,
  tier: number | null,
): string {
  const replacement = tier === null ? "" : `${tier}阶`;
  return text
    .replace(TIER_PLACEHOLDER, replacement)
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** One managed catalog phrase a binding speaks through. */
export type BindingPhrase = {
  name: string;
  text: string;
  language: VoiceLanguage;
  variant?: ManagedPhraseVariant;
};

export type BindingPhraseInput = {
  ruleKey: string;
  phrase: VoicePhraseBinding;
  /** Auto text with `secondsBefore` already substituted. */
  autoText: string;
  language: VoiceLanguage;
  /** The event may use the fantasy-tier placeholder. */
  supportsTier: boolean;
  /** Bundled-prompt subjects keep fixed names. */
  fixedName?: boolean;
  /** Also yield the "试听" variant of tier-placeholder text. */
  includePreview?: boolean;
};

/**
 * Every managed phrase behind one binding event: the base phrase (for tier
 * text, the placeholder-stripped fallback), tiers 0-5 and, on request, the
 * preview variant. Phrase references and empty text yield none. The one
 * place phrase names are built, shared by compile, preview, the HUD and GC.
 */
export function bindingPhrases(input: BindingPhraseInput): BindingPhrase[] {
  const { phrase } = input;
  if (phrase.source === "phrase") return [];
  const raw = (
    phrase.source === "custom" ? phrase.text : input.autoText
  ).trim();
  if (!raw) return [];
  const language =
    phrase.source === "custom" && phrase.generationSource?.mode === "http"
      ? (phrase.httpLanguage ?? input.language)
      : input.language;
  const make = (
    text: string,
    variant?: ManagedPhraseVariant,
  ): BindingPhrase => ({
    name: managedPhraseName({
      source: phrase.source,
      ruleKey:
        phrase.source === "custom" && phrase.generationSource
          ? `${input.ruleKey}:source${contentHash(JSON.stringify(phrase.generationSource), language)}`
          : input.ruleKey,
      ...(variant ? { variant } : {}),
      ...(input.fixedName ? {} : { hash: contentHash(text, language) }),
    }),
    text,
    language,
    ...(variant ? { variant } : {}),
  });
  const tiered =
    input.supportsTier && phrase.source === "custom" && hasTierPlaceholder(raw);
  if (!tiered) return [make(raw)];
  const phrases = [
    make(expandTierPlaceholder(raw, null)),
    ...TIER_LEVELS.map((tier) =>
      make(expandTierPlaceholder(raw, tier), { kind: "tier", tier }),
    ),
  ];
  if (input.includePreview) {
    phrases.push(
      make(expandTierPlaceholder(raw, PREVIEW_TIER), {
        kind: "previewTier",
        tier: PREVIEW_TIER,
      }),
    );
  }
  return phrases.filter((candidate) => candidate.text);
}

export function voiceLanguageForLocale(locale: AppLocale): VoiceLanguage {
  switch (locale) {
    case "en-US":
      return "enUs";
    case "ja-JP":
      return "jaJp";
    default:
      return "zhCn";
  }
}
