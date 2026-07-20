import { describe, expect, it } from "vitest";
import type { VoicePhraseMeta } from "./bindings";
import type {
  VoiceEventConfig,
  VoiceExpiringEventConfig,
} from "./settings-store";
import {
  classifyOrphanPhrases,
  collectReferencedVoiceKeys,
  managedBaseKeyOf,
  type VoicePhraseGcSources,
} from "./voice-phrase-gc";

function eventConfig(): VoiceEventConfig {
  return { enabled: true, phrase: { source: "auto" } };
}

function expiringConfig(): VoiceExpiringEventConfig {
  return { ...eventConfig(), secondsBefore: 5 };
}

function phrase(name: string): VoicePhraseMeta {
  return {
    id: `id-${name}`,
    name,
    text: name,
    language: "zhCn",
    activeAssetId: null,
    updatedAtMs: 0,
  };
}

function emptySources(): VoicePhraseGcSources {
  return { skillProfiles: [], monsterConfigs: [], mechanicVoiceConfigs: {} };
}

function orphanNames(
  phrases: VoicePhraseMeta[],
  sources: VoicePhraseGcSources,
): string[] {
  return classifyOrphanPhrases(
    phrases,
    collectReferencedVoiceKeys(sources),
  ).map((item) => item.name);
}

describe("collectReferencedVoiceKeys", () => {
  it("keeps phrases referenced by any profile, not just the active one", () => {
    // Profile A (active) references buff 101, profile B references buff 202;
    // both live in the profiles array, so both must be kept.
    const sources: VoicePhraseGcSources = {
      ...emptySources(),
      skillProfiles: [
        { buffVoiceConfigs: { "101": { gained: eventConfig() } } },
        { buffVoiceConfigs: { "202": { lost: eventConfig() } } },
      ],
    };
    const orphans = orphanNames(
      [
        phrase("custom:voice:buff:101:gained"),
        phrase("custom:voice:buff:202:lost"),
        phrase("custom:voice:buff:303:gained"),
      ],
      sources,
    );
    expect(orphans).toEqual(["custom:voice:buff:303:gained"]);
  });

  it("keeps all events of a configured subject even if only one is set", () => {
    const sources: VoicePhraseGcSources = {
      ...emptySources(),
      skillProfiles: [
        { buffVoiceConfigs: { "101": { gained: eventConfig() } } },
      ],
    };
    const keys = collectReferencedVoiceKeys(sources);
    expect(keys.has("voice:buff:101:gained")).toBe(true);
    expect(keys.has("voice:buff:101:expiring")).toBe(true);
    expect(keys.has("voice:buff:101:lost")).toBe(true);
  });

  it("counts both user counter rules and preset counter configs", () => {
    const sources: VoicePhraseGcSources = {
      ...emptySources(),
      skillProfiles: [
        {
          userCounterRules: [
            {
              ruleId: 7,
              name: "rule",
              sourceRefs: [],
              slotRefs: [],
              voice: { "1": { threshold: eventConfig() } },
            },
          ],
          presetCounterVoiceConfigs: {
            "9": { "2": { expiring: expiringConfig() } },
          },
        },
      ],
    };
    const keys = collectReferencedVoiceKeys(sources);
    expect(keys.has("voice:counter:7:1:threshold")).toBe(true);
    expect(keys.has("voice:counter:7:1:expiring")).toBe(true);
    expect(keys.has("voice:counter:9:2:threshold")).toBe(true);
    expect(keys.has("voice:counter:9:2:expiring")).toBe(true);
  });

  it("keeps both monster-buff source scopes for a configured buff", () => {
    const sources: VoicePhraseGcSources = {
      ...emptySources(),
      monsterConfigs: [
        { monsterBuffVoiceConfigs: { "55": { gained: eventConfig() } } },
      ],
    };
    const keys = collectReferencedVoiceKeys(sources);
    expect(keys.has("voice:monsterBuff:localPlayerSource:55:gained")).toBe(
      true,
    );
    expect(keys.has("voice:monsterBuff:anySource:55:gained")).toBe(true);
  });

  it("collects dbm and minimap cue keys", () => {
    const sources: VoicePhraseGcSources = {
      skillProfiles: [],
      monsterConfigs: [
        { dbmVoiceConfigs: { "8801": { onCast: eventConfig() } } },
      ],
      mechanicVoiceConfigs: { "s3-raid:bomb": eventConfig() },
    };
    const keys = collectReferencedVoiceKeys(sources);
    expect(keys.has("voice:dbm:8801:onCast")).toBe(true);
    expect(keys.has("voice:dbm:8801:expiring")).toBe(true);
    expect(keys.has("voice:minimapCue:s3-raid:bomb")).toBe(true);
  });

  it("treats disabled configs as referenced", () => {
    const sources: VoicePhraseGcSources = {
      ...emptySources(),
      skillProfiles: [
        {
          buffVoiceConfigs: {
            "101": {
              gained: { enabled: false, phrase: { source: "auto" } },
            },
          },
        },
      ],
    };
    expect(
      collectReferencedVoiceKeys(sources).has("voice:buff:101:gained"),
    ).toBe(true);
  });
});

describe("managedBaseKeyOf", () => {
  it("strips tier and preview suffixes", () => {
    expect(managedBaseKeyOf("custom:voice:buff:101:gained")).toBe(
      "voice:buff:101:gained",
    );
    expect(managedBaseKeyOf("custom:voice:buff:101:gained:tier3")).toBe(
      "voice:buff:101:gained",
    );
    expect(managedBaseKeyOf("custom:voice:buff:101:gained:previewTier5")).toBe(
      "voice:buff:101:gained",
    );
    expect(managedBaseKeyOf("auto:voice:dbm:8801:onCast")).toBe(
      "voice:dbm:8801:onCast",
    );
  });

  it("returns null for manually created phrase names", () => {
    expect(managedBaseKeyOf("机制来了")).toBeNull();
    expect(managedBaseKeyOf("my-phrase")).toBeNull();
    expect(managedBaseKeyOf("voice:buff:101:gained")).toBeNull();
    expect(managedBaseKeyOf("auto:something-else")).toBeNull();
  });
});

describe("classifyOrphanPhrases", () => {
  it("keeps or removes tier/preview variants together with the base key", () => {
    const sources: VoicePhraseGcSources = {
      ...emptySources(),
      skillProfiles: [
        { buffVoiceConfigs: { "101": { gained: eventConfig() } } },
      ],
    };
    const orphans = orphanNames(
      [
        phrase("custom:voice:buff:101:gained"),
        phrase("custom:voice:buff:101:gained:tier0"),
        phrase("custom:voice:buff:101:gained:tier5"),
        phrase("custom:voice:buff:101:gained:previewTier5"),
        phrase("custom:voice:buff:999:gained:tier2"),
        phrase("custom:voice:buff:999:gained:previewTier5"),
      ],
      sources,
    );
    expect(orphans).toEqual([
      "custom:voice:buff:999:gained:tier2",
      "custom:voice:buff:999:gained:previewTier5",
    ]);
  });

  it("judges auto and custom prefixes by the same base key", () => {
    // Both prefixes map to the same base key: while the binding exists, the
    // stale counterpart from an auto/custom switch is also kept (over-keep is
    // the safe direction); once the binding is gone, both become orphans.
    const referenced: VoicePhraseGcSources = {
      ...emptySources(),
      skillProfiles: [
        { buffVoiceConfigs: { "101": { gained: eventConfig() } } },
      ],
    };
    const catalog = [
      phrase("auto:voice:buff:101:gained"),
      phrase("custom:voice:buff:101:gained"),
    ];
    expect(orphanNames(catalog, referenced)).toEqual([]);
    expect(orphanNames(catalog, emptySources())).toEqual([
      "auto:voice:buff:101:gained",
      "custom:voice:buff:101:gained",
    ]);
  });

  it("never selects manually created phrases", () => {
    const orphans = orphanNames(
      [phrase("机制来了"), phrase("custom:voice:buff:1:gained")],
      emptySources(),
    );
    expect(orphans).toEqual(["custom:voice:buff:1:gained"]);
  });
});
