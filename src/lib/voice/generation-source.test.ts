import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "$lib/i18n/locales";
import {
  decodeBindingSource,
  encodeBindingSource,
  presetSourceForLocale,
  resolveBindingGenerationSource,
  resolveSavedGenerationSource,
  type BindingSourceContext,
  type SavedSourceContext,
} from "./generation-source";

const base: SavedSourceContext = {
  selectedSource: "preset",
  selectedProfileId: null,
  selectedHttpProviderId: null,
  modelReady: true,
  fineTunedReady: false,
  locale: "zh-CN",
};

describe("presetSourceForLocale", () => {
  it("maps every supported UI locale to a preset source carrying that locale", () => {
    for (const locale of APP_LOCALES) {
      expect(presetSourceForLocale(locale)).toEqual({
        mode: "preset",
        locale,
      });
    }
  });
});

describe("resolveSavedGenerationSource", () => {
  it("resolves each saved source once its prerequisite is met", () => {
    expect(resolveSavedGenerationSource(base)).toEqual({
      mode: "preset",
      locale: "zh-CN",
    });
    expect(
      resolveSavedGenerationSource({
        ...base,
        selectedSource: "clone",
        selectedProfileId: "profile_1",
      }),
    ).toEqual({ mode: "cloneExisting", profileId: "profile_1" });
    expect(
      resolveSavedGenerationSource({
        ...base,
        selectedSource: "fineTuned",
        fineTunedReady: true,
      }),
    ).toEqual({ mode: "fineTuned" });
    expect(
      resolveSavedGenerationSource({
        ...base,
        selectedSource: "http",
        selectedHttpProviderId: "http_1",
      }),
    ).toEqual({ mode: "http", providerId: "http_1" });
  });

  it("is null while nothing is picked", () => {
    for (const selectedSource of ["clone", "fineTuned", "http"] as const) {
      expect(
        resolveSavedGenerationSource({ ...base, selectedSource }),
      ).toBeNull();
    }
  });

  it("only local sources require the installed model", () => {
    const noModel = { ...base, modelReady: false };
    expect(resolveSavedGenerationSource(noModel)).toBeNull();
    expect(
      resolveSavedGenerationSource({
        ...noModel,
        selectedSource: "http",
        selectedHttpProviderId: "http_1",
      }),
    ).toEqual({ mode: "http", providerId: "http_1" });
  });
});

describe("binding source select values", () => {
  it("round-trips every source and rejects malformed values", () => {
    for (const source of [
      undefined,
      ...APP_LOCALES.map((locale) => ({ mode: "preset" as const, locale })),
      { mode: "http" as const, providerId: "http_1" },
    ]) {
      expect(decodeBindingSource(encodeBindingSource(source))).toEqual(source);
    }
    expect(decodeBindingSource("preset:fr-FR")).toBeUndefined();
    expect(decodeBindingSource("http:")).toBeUndefined();
  });
});

describe("resolveBindingGenerationSource", () => {
  const saved = { mode: "http" as const, providerId: "saved" };
  const context: BindingSourceContext = {
    saved,
    modelReady: true,
    httpProviderIds: ["http_1"],
  };
  const preset = { mode: "preset" as const, locale: "ja-JP" as const };
  const http = { mode: "http" as const, providerId: "http_1" };

  it("uses the pinned voice of auto and custom text", () => {
    expect(
      resolveBindingGenerationSource(
        { source: "auto", generationSource: preset },
        context,
      ),
    ).toEqual(preset);
    expect(
      resolveBindingGenerationSource(
        { source: "custom", text: "Ready", generationSource: http },
        context,
      ),
    ).toEqual(http);
  });

  it("falls back to the saved source without a pin and for library phrases", () => {
    expect(resolveBindingGenerationSource({ source: "auto" }, context)).toBe(
      saved,
    );
    expect(
      resolveBindingGenerationSource(
        { source: "phrase", phraseId: "phrase_1" },
        context,
      ),
    ).toBe(saved);
  });

  it("is null while the pinned voice cannot generate", () => {
    expect(
      resolveBindingGenerationSource(
        { source: "auto", generationSource: preset },
        { ...context, modelReady: false },
      ),
    ).toBeNull();
    expect(
      resolveBindingGenerationSource(
        { source: "auto", generationSource: http },
        { ...context, httpProviderIds: [] },
      ),
    ).toBeNull();
  });
});
