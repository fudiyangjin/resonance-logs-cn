import { describe, expect, it } from "vitest";
import {
  bindingPhrases,
  contentHash,
  expandTierPlaceholder,
  hasTierPlaceholder,
  managedPhraseName,
  managedSlotOf,
  parseManagedPhraseName,
  PREVIEW_TIER,
  TIER_LEVELS,
  voiceLanguageForLocale,
} from "./phrase-key";

describe("contentHash", () => {
  it("matches the backend golden vectors (phrase_name.rs)", () => {
    expect(contentHash("", "zhCn")).toBe("0f03554a");
    expect(contentHash("镰车还有5秒消失", "zhCn")).toBe("76ddfb4a");
    expect(contentHash("镰车还有3秒消失", "zhCn")).toBe("bbf8b0a8");
    expect(contentHash("Ready check", "enUs")).toBe("1295c939");
    expect(contentHash("準備完了", "jaJp")).toBe("849889d1");
  });
});

describe("managedPhraseName", () => {
  it("keeps the fixed `auto:{key}` names prompts.rs::managed_name seeds", () => {
    expect(
      managedPhraseName({ source: "auto", ruleKey: "voice:alert:matchReady" }),
    ).toBe("auto:voice:alert:matchReady");
  });

  it("appends the variant, then the content hash", () => {
    expect(
      managedPhraseName({
        source: "custom",
        ruleKey: "voice:buff:101:gained",
        variant: { kind: "tier", tier: 3 },
        hash: "76ddfb4a",
      }),
    ).toBe("custom:voice:buff:101:gained:tier3~76ddfb4a");
    expect(
      managedPhraseName({
        source: "custom",
        ruleKey: "voice:buff:101:gained",
        variant: { kind: "previewTier", tier: PREVIEW_TIER },
        hash: "0f03554a",
      }),
    ).toBe("custom:voice:buff:101:gained:previewTier5~0f03554a");
  });

  it("round-trips through parseManagedPhraseName, legacy names included", () => {
    const cases = [
      { source: "auto", ruleKey: "voice:dbm:8801:onCast" },
      { source: "auto", ruleKey: "voice:dbm:8801:onCast", hash: "0f03554a" },
      {
        source: "custom",
        ruleKey: "voice:minimapCue:s3-raid:bomb",
        hash: "1295c939",
      },
      {
        source: "custom",
        ruleKey: "voice:monsterBuff:anySource:55:lost",
        variant: { kind: "tier", tier: 0 },
        hash: "bbf8b0a8",
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

describe("managedSlotOf", () => {
  it("is the rule key plus variant of content-addressed names only", () => {
    expect(managedSlotOf("custom:voice:skill:1420:readyIn~76ddfb4a")).toBe(
      "voice:skill:1420:readyIn",
    );
    expect(managedSlotOf("auto:voice:buff:101:gained:tier3~0f03554a")).toBe(
      "voice:buff:101:gained:tier3",
    );
    expect(managedSlotOf("auto:voice:skill:1420:ready")).toBeNull();
    expect(managedSlotOf("auto:voice:alert:matchReady")).toBeNull();
    expect(managedSlotOf("机制来了")).toBeNull();
  });
});

describe("bindingPhrases", () => {
  const base = {
    ruleKey: "voice:buff:101:lost",
    autoText: "狂暴已失效",
    language: "zhCn" as const,
    supportsTier: true,
  };

  it("names auto and custom text by content, picked phrases by nothing", () => {
    expect(bindingPhrases({ ...base, phrase: { source: "auto" } })).toEqual([
      {
        name: `auto:voice:buff:101:lost~${contentHash("狂暴已失效", "zhCn")}`,
        text: "狂暴已失效",
        language: "zhCn",
      },
    ]);
    expect(
      bindingPhrases({ ...base, phrase: { source: "custom", text: " 没了 " } }),
    ).toEqual([
      {
        name: `custom:voice:buff:101:lost~${contentHash("没了", "zhCn")}`,
        text: "没了",
        language: "zhCn",
      },
    ]);
    expect(
      bindingPhrases({
        ...base,
        phrase: { source: "phrase", phraseId: "p-1" },
      }),
    ).toEqual([]);
    expect(
      bindingPhrases({ ...base, phrase: { source: "custom", text: "  " } }),
    ).toEqual([]);
  });

  it("expands tier text to the fallback, tiers 0-5 and, on request, the preview", () => {
    const phrase = { source: "custom", text: "${阶数}狂暴没了" } as const;
    const phrases = bindingPhrases({ ...base, phrase, includePreview: true });
    expect(phrases.map((entry) => [entry.variant ?? null, entry.text])).toEqual(
      [
        [null, "狂暴没了"],
        ...TIER_LEVELS.map((tier) => [
          { kind: "tier", tier },
          `${tier}阶狂暴没了`,
        ]),
        [{ kind: "previewTier", tier: PREVIEW_TIER }, "5阶狂暴没了"],
      ],
    );
    expect(phrases[1]!.name).toBe(
      `custom:voice:buff:101:lost:tier0~${contentHash("0阶狂暴没了", "zhCn")}`,
    );
    // The compiled rule: tiers 0-5 plus the placeholder-stripped fallback.
    expect(bindingPhrases({ ...base, phrase })).toHaveLength(7);
    // Events without a tier speak the placeholder text as written.
    expect(
      bindingPhrases({ ...base, phrase, supportsTier: false }).map(
        (entry) => entry.text,
      ),
    ).toEqual(["${阶数}狂暴没了"]);
  });

  it("keeps fixed names for bundled prompts", () => {
    expect(
      bindingPhrases({
        ruleKey: "voice:alert:matchReady",
        phrase: { source: "auto" },
        autoText: "Match ready",
        language: "enUs",
        supportsTier: false,
        fixedName: true,
      }).map((entry) => entry.name),
    ).toEqual(["auto:voice:alert:matchReady"]);
  });

  it("gives different texts different names and equal texts the same", () => {
    const name = (text: string) =>
      bindingPhrases({ ...base, phrase: { source: "custom", text } })[0]!.name;
    expect(name("甲")).not.toBe(name("乙"));
    expect(name("甲")).toBe(name(" 甲 "));
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

  it("covers tiers 0-5", () => {
    expect(TIER_LEVELS).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("voiceLanguageForLocale", () => {
  it("maps app locales to TTS languages", () => {
    expect(voiceLanguageForLocale("zh-CN")).toBe("zhCn");
    expect(voiceLanguageForLocale("en-US")).toBe("enUs");
    expect(voiceLanguageForLocale("ja-JP")).toBe("jaJp");
  });
});
