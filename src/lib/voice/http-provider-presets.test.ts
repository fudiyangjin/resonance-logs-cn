import { describe, expect, it } from "vitest";
import {
  createHttpProviderPreset,
  HTTP_PROVIDER_PRESET_IDS,
} from "./http-provider-presets";

describe("createHttpProviderPreset", () => {
  it("creates new, well-formed providers", () => {
    for (const preset of HTTP_PROVIDER_PRESET_IDS) {
      const provider = createHttpProviderPreset(preset, "My TTS");
      expect(provider.id).toBeNull();
      expect(provider.name).toBe("My TTS");
      const { request } = provider;
      // The backend rejects a GET with a body.
      expect(request.method === "get" && request.body !== null).toBe(false);
      // Placeholders sit inside JSON strings, so the template parses as-is.
      if (request.body?.encoding === "json") {
        expect(() => JSON.parse(request.body!.template)).not.toThrow();
      }
      expect(request.url).toMatch(/^https?:\/\//);
    }
  });

  it("reads Google's base64 audio from audioContent", () => {
    const { request } = createHttpProviderPreset("googleCloud", "Google");
    expect(request.response).toEqual({
      kind: "jsonBase64",
      pointer: "/audioContent",
    });
    expect(request.languages.zhCn.lang).toBe("cmn-CN");
  });
});
