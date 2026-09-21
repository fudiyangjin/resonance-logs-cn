import { describe, expect, it } from "vitest";
import {
  expandTierPlaceholder,
  hasTierPlaceholder,
  managedPhraseName,
  parseManagedPhraseName,
  PREVIEW_TIER,
  TIER_LEVELS,
  TIERED_PHRASE_COUNT,
  voiceLanguageForLocale,
} from "./phrase-key";

describe("managedPhraseName", () => {
  it("matches the `auto:{key}` contract used by prompts.rs::managed_name", () => {
    expect(
      managedPhraseName({ source: "auto", ruleKey: "voice:alert:matchReady" }),
    ).toBe("auto:voice:alert:matchReady");
    expect(
      managedPhraseName({ source: "custom", ruleKey: "voice:buff:101:gained" }),
    ).toBe("custom:voice:buff:101:gained");
  });

  it("appends tier / preview variants exactly like the legacy cache keys", () => {
    expect(
      managedPhraseName({
        source: "custom",
        ruleKey: "voice:buff:101:gained",
        variant: { kind: "tier", tier: 3 },
      }),
    ).toBe("custom:voice:buff:101:gained:tier3");
    expect(
      managedPhraseName({
        source: "custom",
        ruleKey: "voice:buff:101:gained",
        variant: { kind: "previewTier", tier: PREVIEW_TIER },
      }),
    ).toBe("custom:voice:buff:101:gained:previewTier5");
  });

  it("round-trips through parseManagedPhraseName", () => {
    const cases = [
      { source: "auto", ruleKey: "voice:dbm:8801:onCast" },
      { source: "custom", ruleKey: "voice:minimapCue:s3-raid:bomb" },
      {
        source: "custom",
        ruleKey: "voice:monsterBuff:anySource:55:lost",
        variant: { kind: "tier", tier: 0 },
      },
      {
        source: "custom",
        ruleKey: "voice:buff:1:gained",
        variant: { kind: "previewTier", tier: 5 },
      },
    ] as const;
    for (const name of cases) {
      expect(parseManagedPhraseName(managedPhraseName(name))).toEqual(name);
    }
  });

  it("rejects hand-made names", () => {
    expect(parseManagedPhraseName("机制来了")).toBeNull();
    expect(parseManagedPhraseName("voice:buff:101:gained")).toBeNull();
    expect(parseManagedPhraseName("auto:something-else")).toBeNull();
  });
});

describe("tier placeholder", () => {
  it("detects both placeholder spellings", () => {
    expect(hasTierPlaceholder("${阶数}阶来了")).toBe(true);
    expect(hasTierPlaceholder("tier ${remodelLevel}")).toBe(true);
    expect(hasTierPlaceholder("plain")).toBe(false);
  });

  it("expands to `{n}阶` or strips the placeholder", () => {
    expect(expandTierPlaceholder("${阶数} 幻兽", 3)).toBe("3阶 幻兽");
    expect(expandTierPlaceholder("${阶数} 幻兽", null)).toBe("幻兽");
    expect(expandTierPlaceholder("a  ${remodelLevel}  b", null)).toBe("a b");
  });

  it("compiles to one fallback plus one phrase per tier", () => {
    expect(TIER_LEVELS).toEqual([0, 1, 2, 3, 4, 5]);
    expect(TIERED_PHRASE_COUNT).toBe(7);
  });
});

describe("voiceLanguageForLocale", () => {
  it("maps app locales to TTS languages", () => {
    expect(voiceLanguageForLocale("zh-CN")).toBe("zhCn");
    expect(voiceLanguageForLocale("en-US")).toBe("enUs");
    expect(voiceLanguageForLocale("ja-JP")).toBe("jaJp");
  });
});
