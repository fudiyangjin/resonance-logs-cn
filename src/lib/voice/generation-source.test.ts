import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "$lib/i18n/locales";
import {
  presetSourceForLocale,
  resolveSavedGenerationSource,
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
