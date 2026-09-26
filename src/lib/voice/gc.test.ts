import { describe, expect, it } from "vitest";
import type {
  VoiceAssetMeta,
  VoiceAssetSource,
  VoiceLanguage,
  VoicePhraseMeta,
} from "$lib/bindings";
import type { VoiceEventConfig, VoicePhraseBinding } from "$lib/settings-store";
import { classifyOrphanPhrases, collectVoicePhraseRefs } from "./gc";
import { bindingPhrases, contentHash, managedPhraseName } from "./phrase-key";
import type {
  MonsterVoiceSlice,
  SkillProfileVoiceSlice,
  VoiceBindingView,
} from "./subject-types";

const EMPTY_MONSTER: MonsterVoiceSlice = {
  monitoredBuffIds: [],
  selfAppliedBuffIds: [],
  selfAppliedMonitorAll: false,
  dbmAliases: {},
  entityDurationEntries: [],
};

function view(overrides: Partial<VoiceBindingView> = {}): VoiceBindingView {
  return {
    skillProfile: null,
    monster: EMPTY_MONSTER,
    mechanicVoiceConfigs: {},
    alertConfigs: {},
    minimapCues: [],
    buffAliases: { "101": "狂暴" },
    locale: "zh-CN",
    t: (key) => key,
    ...overrides,
  };
}

function skillView(profile: Partial<SkillProfileVoiceSlice>) {
  return view({
    skillProfile: { selectedClass: "", ...profile },
  });
}

function bound(phrase: VoicePhraseBinding, enabled = true): VoiceEventConfig {
  return { enabled, phrase };
}

const AUTO = { source: "auto" } as const;
const custom = (text: string) => ({ source: "custom", text }) as const;

/** Name of the managed phrase speaking `text` for a buff 101 event. */
function buffName(
  source: "auto" | "custom",
  event: string,
  text: string,
  variant?: { kind: "tier" | "previewTier"; tier: number },
): string {
  return managedPhraseName({
    source,
    ruleKey: `voice:buff:101:${event}`,
    ...(variant ? { variant } : {}),
    hash: contentHash(text, "zhCn"),
  });
}

let nextId = 0;
function phrase(
  name: string,
  options: {
    text?: string;
    language?: VoiceLanguage;
    audio?: VoiceAssetSource["kind"] | null;
    updatedAtMs?: number;
  } = {},
): { phrase: VoicePhraseMeta; asset: VoiceAssetMeta | null } {
  const id = `phrase-${nextId++}`;
  const audio = options.audio === undefined ? "cloneProfile" : options.audio;
  const asset: VoiceAssetMeta | null = audio
    ? {
        id: `asset-${id}`,
        phraseId: id,
        source:
          audio === "imported"
            ? { kind: "imported", sha256: "", originalFileName: "" }
            : { kind: "cloneProfile", profileId: "p" },
        modelVersion: "",
        paramsFingerprint: "",
        createdAtMs: 0,
        durationSec: 1,
        sampleRate: 24_000,
        stale: false,
      }
    : null;
  return {
    phrase: {
      id,
      name,
      text: options.text ?? name,
      language: options.language ?? "zhCn",
      activeAssetId: asset?.id ?? null,
      updatedAtMs: options.updatedAtMs ?? 0,
    },
    asset,
  };
}

function orphanNames(
  entries: ReturnType<typeof phrase>[],
  views: VoiceBindingView[],
): string[] {
  return classifyOrphanPhrases(
    entries.map((entry) => entry.phrase),
    entries.flatMap((entry) => (entry.asset ? [entry.asset] : [])),
    collectVoicePhraseRefs(views),
  ).map((orphan) => orphan.name);
}

describe("collectVoicePhraseRefs", () => {
  it("keeps what every profile speaks: loadouts with different texts keep their own audio", () => {
    const a = skillView({
      buffVoiceConfigs: { "101": { gained: bound(custom("狂暴来了")) } },
    });
    const b = skillView({
      buffVoiceConfigs: { "101": { gained: bound(custom("开狂暴")) } },
    });
    const refs = collectVoicePhraseRefs([a, b]);
    expect([...refs.names]).toEqual([
      buffName("custom", "gained", "狂暴来了"),
      buffName("custom", "gained", "开狂暴"),
    ]);
  });

  it("counts switched-off events and phrases picked by id", () => {
    const refs = collectVoicePhraseRefs([
      skillView({
        buffVoiceConfigs: {
          "101": {
            gained: bound(AUTO, false),
            lost: bound({ source: "phrase", phraseId: " picked " }),
          },
        },
      }),
    ]);
    expect([...refs.names]).toEqual([buffName("auto", "gained", "狂暴已生效")]);
    expect([...refs.phraseIds]).toEqual(["picked"]);
  });

  it("drops bindings without a subject, like an entity binding without its entry", () => {
    const entityVoiceConfigs = { "179901": { appeared: bound(AUTO) } };
    const withEntry = collectVoicePhraseRefs([
      view({
        monster: {
          ...EMPTY_MONSTER,
          entityDurationEntries: [
            { id: "e", monsterId: 179901, label: "镰车", scope: "self" },
          ],
          entityVoiceConfigs,
        },
      }),
    ]);
    const withoutEntry = collectVoicePhraseRefs([
      view({ monster: { ...EMPTY_MONSTER, entityVoiceConfigs } }),
    ]);
    expect(withEntry.names.size).toBe(1);
    expect(withoutEntry.names.size).toBe(0);
  });

  it("keeps the phrases of skill bindings: skills form their own list", () => {
    const refs = collectVoicePhraseRefs([
      skillView({ skillVoiceConfigs: { "990001": { cast: bound(AUTO) } } }),
    ]);
    expect(refs.names.size).toBe(1);
  });

  it("keeps the base, tier and preview phrases of tier-placeholder text", () => {
    const text = "${阶数}狂暴没了";
    const refs = collectVoicePhraseRefs([
      skillView({
        buffVoiceConfigs: { "101": { lost: bound(custom(text)) } },
      }),
    ]);
    const expected = bindingPhrases({
      ruleKey: "voice:buff:101:lost",
      phrase: custom(text),
      autoText: "",
      language: "zhCn",
      supportsTier: true,
      includePreview: true,
    }).map((entry) => entry.name);
    expect(expected).toHaveLength(8);
    expect([...refs.names]).toEqual(expected);
  });
});

describe("classifyOrphanPhrases", () => {
  const current = skillView({
    buffVoiceConfigs: { "101": { gained: bound(custom("狂暴来了")) } },
  });

  it("orphans the previous text and the other source once the current phrase has audio", () => {
    expect(
      orphanNames(
        [
          phrase(buffName("custom", "gained", "狂暴来了")),
          phrase(buffName("custom", "gained", "旧文本")),
          phrase(buffName("auto", "gained", "狂暴已生效")),
          phrase("auto:voice:buff:101:gained"),
        ],
        [current],
      ),
    ).toEqual([
      buffName("custom", "gained", "旧文本"),
      buffName("auto", "gained", "狂暴已生效"),
      "auto:voice:buff:101:gained",
    ]);
  });

  it("protects the newest same-slot phrase with audio while the current one has none", () => {
    const older = phrase(buffName("custom", "gained", "更旧"), {
      updatedAtMs: 1,
    });
    const newer = phrase(buffName("auto", "gained", "狂暴已生效"), {
      updatedAtMs: 2,
    });
    const silent = phrase(buffName("custom", "gained", "没音频"), {
      audio: null,
      updatedAtMs: 3,
    });
    const pending = phrase(buffName("custom", "gained", "狂暴来了"), {
      audio: null,
    });
    // Current phrase still silent: the newest voiced sibling keeps playing.
    expect(orphanNames([older, newer, silent, pending], [current])).toEqual([
      older.phrase.name,
      silent.phrase.name,
    ]);
    // Current phrase not even created yet: same.
    expect(orphanNames([older, newer], [current])).toEqual([older.phrase.name]);
  });

  it("orphans tier variants of an old text but keeps the current ones", () => {
    const text = "${阶数}狂暴没了";
    const view = skillView({
      buffVoiceConfigs: { "101": { lost: bound(custom(text)) } },
    });
    const needed = bindingPhrases({
      ruleKey: "voice:buff:101:lost",
      phrase: custom(text),
      autoText: "",
      language: "zhCn",
      supportsTier: true,
      includePreview: true,
    }).map((entry) => phrase(entry.name));
    const stale = phrase(
      buffName("custom", "lost", "2阶旧文本", { kind: "tier", tier: 2 }),
    );
    expect(orphanNames([...needed, stale], [view])).toEqual([
      stale.phrase.name,
    ]);
  });

  it("never orphans imported audio, picked phrases, alert prompts or hand-made phrases", () => {
    const imported = phrase(buffName("custom", "expiring", "导入的"), {
      audio: "imported",
    });
    const picked = phrase(buffName("custom", "lost", "被选用的"));
    const view = skillView({
      buffVoiceConfigs: {
        "101": {
          lost: bound({ source: "phrase", phraseId: picked.phrase.id }),
        },
      },
    });
    expect(
      orphanNames(
        [
          imported,
          picked,
          phrase("auto:voice:alert:matchReady"),
          phrase("custom:voice:alert:readyCheck"),
          phrase("机制来了"),
          phrase("custom:voice:buff:9:gained~0f03554a"),
        ],
        [view],
      ),
    ).toEqual(["custom:voice:buff:9:gained~0f03554a"]);
  });

  it("keeps phrases of every monster profile view", () => {
    const entityView = (label: string) =>
      view({
        monster: {
          ...EMPTY_MONSTER,
          entityDurationEntries: [
            { id: "e", monsterId: 179901, label, scope: "self" },
          ],
          entityVoiceConfigs: { "179901": { appeared: bound(AUTO) } },
        },
      });
    const name = (text: string) =>
      managedPhraseName({
        source: "auto",
        ruleKey: "voice:entity:179901:appeared",
        hash: contentHash(text, "zhCn"),
      });
    const catalog = [phrase(name("镰车已出现")), phrase(name("镰刀车已出现"))];
    expect(
      orphanNames(catalog, [entityView("镰车"), entityView("镰刀车")]),
    ).toEqual([]);
    expect(orphanNames(catalog, [entityView("镰车")])).toEqual([
      name("镰刀车已出现"),
    ]);
  });
});
