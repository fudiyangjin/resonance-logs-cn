/**
 * @file Naming contract for auto-managed catalog phrases.
 *
 * A binding's phrase is looked up by *name* in the backend catalog. The name
 * encodes who owns it (`auto` / `custom` source), which rule it belongs to
 * (`voice:buff:101:gained`, ...) and, for tier-placeholder text, which
 * variant it is (`:tier3`, `:previewTier5`). The Rust side mirrors the
 * `auto:{key}` shape in `prompts.rs::managed_name`, so the format here is
 * part of the wire contract and must not drift.
 */
import type { VoiceLanguage } from "$lib/bindings";
import type { AppLocale } from "$lib/i18n/locales";

export type ManagedPhraseSource = "auto" | "custom";

export type ManagedPhraseVariant =
  | { kind: "tier"; tier: number }
  | { kind: "previewTier"; tier: number };

export type ManagedPhraseName = {
  source: ManagedPhraseSource;
  ruleKey: string;
  variant?: ManagedPhraseVariant;
};

export const TIER_LEVELS = [0, 1, 2, 3, 4, 5] as const;
/** Tier used to render the "试听" preview for text containing the placeholder. */
export const PREVIEW_TIER = 5;
/** Total phrases a tier-placeholder binding compiles to: tiers 0-5 plus the placeholder-stripped fallback. */
export const TIERED_PHRASE_COUNT = TIER_LEVELS.length + 1;

const TIER_PLACEHOLDER = /\$\{(?:remodelLevel|阶数)\}/g;
const MANAGED_NAME_PATTERN =
  /^(auto|custom):(voice:.+?)(?::(tier|previewTier)(\d+))?$/;

export function managedPhraseName(name: ManagedPhraseName): string {
  const base = `${name.source}:${name.ruleKey}`;
  if (!name.variant) return base;
  return `${base}:${name.variant.kind}${name.variant.tier}`;
}

/**
 * Inverse of `managedPhraseName`; `null` for phrases the user created by
 * hand (whose names don't follow the managed pattern).
 */
export function parseManagedPhraseName(name: string): ManagedPhraseName | null {
  const match = MANAGED_NAME_PATTERN.exec(name);
  if (!match) return null;
  const [, source, ruleKey, variantKind, tierText] = match;
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
  return parsed;
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
