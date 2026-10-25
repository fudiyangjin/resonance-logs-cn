/**
 * @file Turns the saved voice generation source (voice settings) into the
 * `source` of a `voiceGenerate` request, so the phrase library and the
 * bindings tab resolve it the same way.
 */
import type { VoiceGenerateRequestDto } from "$lib/bindings";
import type { AppLocale } from "$lib/i18n/locales";
import type { VoiceSourceSetting } from "$lib/settings-store";

export type GenerationSource = VoiceGenerateRequestDto["source"];

/**
 * "Preset" generation always uses the bundled reference voice matching the
 * language the user reads the app in, regardless of the phrase's own
 * language. `VoicePresetLocale` (Rust) and `AppLocale` serialize to the same
 * literals, so this is a type-checked identity kept as a named function so
 * call sites read intentionally.
 */
export function presetSourceForLocale(locale: AppLocale): GenerationSource {
  return { mode: "preset", locale };
}

/** HTTP providers synthesize remotely; every other source runs the local model. */
export function sourceNeedsLocalModel(source: VoiceSourceSetting): boolean {
  return source !== "http";
}

export type SavedSourceContext = {
  selectedSource: VoiceSourceSetting;
  selectedProfileId: string | null;
  selectedHttpProviderId: string | null;
  modelReady: boolean;
  fineTunedReady: boolean;
  locale: AppLocale;
};

/**
 * The saved source as a request source, or `null` while it cannot generate:
 * the local model is missing, or no profile / provider is picked.
 */
export function resolveSavedGenerationSource(
  context: SavedSourceContext,
): GenerationSource | null {
  if (sourceNeedsLocalModel(context.selectedSource) && !context.modelReady) {
    return null;
  }
  switch (context.selectedSource) {
    case "preset":
      return presetSourceForLocale(context.locale);
    case "fineTuned":
      return context.fineTunedReady ? { mode: "fineTuned" } : null;
    case "clone":
      return context.selectedProfileId
        ? { mode: "cloneExisting", profileId: context.selectedProfileId }
        : null;
    case "http":
      return context.selectedHttpProviderId
        ? { mode: "http", providerId: context.selectedHttpProviderId }
        : null;
  }
}
