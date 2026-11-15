import { describe, expect, it } from "vitest";
import type {
  CountdownVoiceSetting,
  VoiceExpiringEventConfig,
} from "$lib/settings-store";
import type { PhraseIndex, VoiceBinding } from "./compile";
import {
  countdownDigitBinding,
  countdownPhraseIds,
  countdownPhraseRequests,
  countdownPhrases,
} from "./countdown";

const OWN: CountdownVoiceSetting = { source: "custom" };
const OWN_HTTP: CountdownVoiceSetting = {
  source: "custom",
  generationSource: { mode: "http", providerId: "fish" },
};

function binding(countdown: boolean): VoiceBinding {
  const config: VoiceExpiringEventConfig = {
    enabled: true,
    phrase: { source: "auto" },
    secondsBefore: 5,
    countdown,
  };
  return { config } as VoiceBinding;
}

describe("countdownPhrases", () => {
  it("names the bundled digits like the backend seeds them", () => {
    const phrases = countdownPhrases(undefined, "enUs");
    expect(phrases).toHaveLength(10);
    expect(phrases[0]).toEqual({
      name: "auto:voice:countdown:1",
      text: "one",
      language: "enUs",
    });
    expect(phrases[9]?.name).toBe("auto:voice:countdown:10");
    expect(countdownPhrases({ source: "auto" }, "enUs")).toEqual(phrases);
  });

  it("keeps the user's digits apart from the bundled ones, per voice", () => {
    const own = countdownPhrases(OWN, "zhCn");
    expect(own.map((phrase) => phrase.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `custom:voice:countdown:${i + 1}`),
    );
    expect(own[2]).toMatchObject({ text: "三", language: "zhCn" });

    // A pinned voice gets a set of its own, so switching voices never
    // overwrites the digits generated with another one.
    const pinned = countdownPhrases(OWN_HTTP, "zhCn");
    expect(pinned[2]?.name).toMatch(
      /^custom:voice:countdown:3:source[0-9a-f]{8}$/,
    );
    expect(pinned[2]?.name).not.toBe(own[2]?.name);
  });
});

describe("countdownDigitBinding", () => {
  it("generates the user's digits with the voice they pinned", () => {
    expect(countdownDigitBinding(undefined)).toEqual({ source: "auto" });
    expect(countdownDigitBinding(OWN_HTTP, "三")).toEqual({
      source: "custom",
      text: "三",
      generationSource: { mode: "http", providerId: "fish" },
    });
  });
});

describe("countdownPhraseRequests", () => {
  it("asks for the bundled digits only while a binding counts down", () => {
    expect(countdownPhraseRequests([binding(false)], "zhCn")).toEqual([]);
    expect(countdownPhraseRequests([binding(false)], "zhCn", OWN)).toEqual([]);
    const requests = countdownPhraseRequests([binding(true)], "enUs");
    expect(requests).toHaveLength(10);
    expect(requests[0]).toEqual({
      name: "auto:voice:countdown:1",
      text: "one",
      language: "enUs",
    });
  });

  it("asks for the user's digits too once they are chosen", () => {
    const names = countdownPhraseRequests([binding(true)], "zhCn", OWN).map(
      (request) => request.name,
    );
    expect(names).toHaveLength(20);
    // The bundled set stays: it speaks for a custom digit without audio.
    expect(names).toContain("auto:voice:countdown:3");
    expect(names).toContain("custom:voice:countdown:3");
  });
});

describe("countdownPhraseIds", () => {
  const index: PhraseIndex = {
    "auto:voice:countdown:1": { phraseId: "B1", text: "一", language: "zhCn" },
    "custom:voice:countdown:1": {
      phraseId: "C1",
      text: "一",
      language: "zhCn",
    },
    "custom:voice:countdown:3": {
      phraseId: "C3",
      text: "三",
      language: "zhCn",
    },
  };

  it("sends nothing for the bundled digits, which the backend finds by name", () => {
    expect(countdownPhraseIds(undefined, "zhCn", index)).toEqual([]);
    expect(countdownPhraseIds({ source: "auto" }, "zhCn", index)).toEqual([]);
  });

  it("lists the user's digits by position, leaving the missing ones empty", () => {
    expect(countdownPhraseIds(OWN, "zhCn", index)).toEqual([
      "C1",
      "",
      "C3",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    // Another voice has no phrases yet: the bundled digits count.
    expect(countdownPhraseIds(OWN_HTTP, "zhCn", index)).toEqual([]);
  });
});
