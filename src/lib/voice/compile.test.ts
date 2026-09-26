import { describe, expect, it } from "vitest";
import { getCounterRules } from "$lib/skill-mappings";
import type {
  VoiceEventConfig,
  VoiceExpiringEventConfig,
} from "$lib/settings-store";
import {
  collectBindings,
  compileVoiceRules,
  phraseRequests,
  type PhraseIndex,
  type ResolvedPhrase,
  type VoiceBinding,
} from "./compile";
import { listVoiceBindingOverview } from "./overview";
import {
  contentHash,
  managedPhraseName,
  parseManagedPhraseName,
  type ManagedPhraseName,
} from "./phrase-key";
import type { VoiceBindingView } from "./subject-types";

function auto(priority?: number): VoiceEventConfig {
  return { enabled: true, phrase: { source: "auto" }, priority };
}

function custom(text: string): VoiceEventConfig {
  return { enabled: true, phrase: { source: "custom", text } };
}

function expiring(secondsBefore: number): VoiceExpiringEventConfig {
  return { ...auto(), secondsBefore };
}

/** The content-addressed name of `text` (Chinese) for a binding slot. */
function nameOf(
  source: ManagedPhraseName["source"],
  ruleKey: string,
  text: string,
  variant?: ManagedPhraseName["variant"],
): string {
  return managedPhraseName({
    source,
    ruleKey,
    ...(variant ? { variant } : {}),
    hash: contentHash(text, "zhCn"),
  });
}

/** `voice:buff:101:lost:tier2` for any name of that binding slot. */
function slotKey(name: string): string {
  const parsed = parseManagedPhraseName(name)!;
  const variant = parsed.variant
    ? `:${parsed.variant.kind}${parsed.variant.tier}`
    : "";
  return `${parsed.ruleKey}${variant}`;
}

/**
 * A catalog index in which the phrase each binding asks for exists as
 * `ids[slot]` (slots without an id are missing from the catalog).
 */
function indexOf(
  bindings: readonly VoiceBinding[],
  ids: Record<string, string>,
): PhraseIndex {
  const index: Record<string, ResolvedPhrase> = {};
  for (const request of phraseRequests(bindings)) {
    const phraseId = ids[slotKey(request.name)];
    if (!phraseId) continue;
    index[request.name] = {
      phraseId,
      text: request.text,
      language: request.language,
      hasAudio: true,
    };
  }
  return index;
}

function view(overrides: Partial<VoiceBindingView> = {}): VoiceBindingView {
  return {
    skillProfile: null,
    monster: {
      monitoredBuffIds: [],
      selfAppliedBuffIds: [],
      selfAppliedMonitorAll: false,
      dbmAliases: {},
      entityDurationEntries: [],
    },
    mechanicVoiceConfigs: {},
    alertConfigs: {},
    minimapCues: [],
    buffAliases: { "101": "狂暴", "55": "破甲" },
    locale: "zh-CN",
    t: (key) => key,
    ...overrides,
  };
}

describe("collectBindings + phraseRequests", () => {
  it("lists only enabled events, with auto text and triggers", () => {
    const bindings = collectBindings(
      view({
        skillProfile: {
          monitoredSkillIds: [990001],
          selectedClass: "wind_knight",
          buffVoiceConfigs: {
            "101": {
              gained: auto(),
              expiring: {
                enabled: false,
                phrase: { source: "auto" },
                secondsBefore: 5,
              },
              lost: custom("${阶数}狂暴没了"),
            },
          },
        },
      }),
    );
    expect(bindings.map((b) => b.ruleKey)).toEqual([
      "voice:buff:101:gained",
      "voice:buff:101:lost",
    ]);
    expect(bindings[0]).toMatchObject({
      autoText: "狂暴已生效",
      language: "zhCn",
      tiered: false,
      trigger: {
        subject: { kind: "buff", buffId: 101 },
        event: { kind: "started" },
      },
    });
    expect(bindings[1]!.tiered).toBe(true);

    expect(phraseRequests(bindings)).toEqual([
      {
        name: nameOf("auto", "voice:buff:101:gained", "狂暴已生效"),
        text: "狂暴已生效",
        language: "zhCn",
      },
      {
        name: nameOf("custom", "voice:buff:101:lost", "狂暴没了"),
        text: "狂暴没了",
        language: "zhCn",
      },
      ...[0, 1, 2, 3, 4, 5].map((tier) => ({
        name: nameOf("custom", "voice:buff:101:lost", `${tier}阶狂暴没了`, {
          kind: "tier",
          tier,
        }),
        text: `${tier}阶狂暴没了`,
        language: "zhCn" as const,
      })),
    ]);
  });

  it("skips phrase references and empty custom text", () => {
    const bindings = collectBindings(
      view({
        monster: {
          monitoredBuffIds: [55],
          selfAppliedBuffIds: [],
          selfAppliedMonitorAll: false,
          dbmAliases: {},
          entityDurationEntries: [],
          monsterBuffVoiceConfigs: {
            "55": {
              gained: {
                enabled: true,
                phrase: { source: "phrase", phraseId: "p-1" },
              },
              lost: custom("   "),
            },
          },
        },
      }),
    );
    expect(bindings).toHaveLength(2);
    expect(phraseRequests(bindings)).toEqual([]);
  });

  it("includes switched-off events only on request", () => {
    const disabled = view({
      skillProfile: {
        monitoredSkillIds: [],
        selectedClass: "",
        buffVoiceConfigs: {
          "101": { gained: { enabled: false, phrase: { source: "auto" } } },
        },
      },
    });
    expect(collectBindings(disabled)).toEqual([]);
    expect(
      collectBindings(disabled, { includeDisabled: true }).map(
        (b) => b.ruleKey,
      ),
    ).toEqual(["voice:buff:101:gained"]);
  });
});

describe("compileVoiceRules", () => {
  const fullView = view({
    locale: "en-US",
    skillProfile: {
      monitoredSkillIds: [990001],
      selectedClass: "wind_knight",
      buffVoiceConfigs: {
        "101": {
          gained: auto(200),
          expiring: expiring(3.4),
          lost: custom("${阶数}狂暴没了"),
        },
      },
      skillVoiceConfigs: {
        "990001": {
          cast: auto(),
          ready: { enabled: false, phrase: { source: "auto" } },
          readyIn: expiring(2),
        },
      },
    },
    monster: {
      monitoredBuffIds: [55],
      selfAppliedBuffIds: [],
      selfAppliedMonitorAll: false,
      dbmAliases: { "8801": "大招" },
      entityDurationEntries: [
        {
          id: "e1",
          monsterId: 179901,
          label: "镰车",
          durationMs: 35_000,
          scope: "self",
        },
      ],
      monsterBuffVoiceConfigs: { "55": { gained: custom("x") } },
      dbmVoiceConfigs: { "8801": { onCast: auto(), expiring: expiring(5) } },
      entityVoiceConfigs: {
        "179901": {
          appeared: auto(),
          expiring: expiring(5),
          gone: auto(),
        },
      },
    },
    alertConfigs: { matchReady: auto() },
    minimapCues: [
      { id: "s3-raid:bomb", labelKey: "voice.alerts.title", autoText: "炸弹" },
    ],
    mechanicVoiceConfigs: { "s3-raid:bomb": auto() },
  });
  const fullBindings = collectBindings(fullView);
  const index = indexOf(fullBindings, {
    "voice:buff:101:gained": "P-gained",
    "voice:buff:101:expiring": "P-exp",
    "voice:buff:101:lost": "P-lost",
    "voice:buff:101:lost:tier2": "P-lost-2",
    "voice:monsterBuff:anySource:55:gained": "P-mb",
    "voice:dbm:8801:onCast": "P-dbm",
    "voice:dbm:8801:expiring": "P-dbm-exp",
    "voice:alert:matchReady": "P-alert",
    "voice:minimapCue:s3-raid:bomb": "P-cue",
    "voice:skill:990001:cast": "P-sk-cast",
    "voice:skill:990001:readyIn": "P-sk-in",
    "voice:entity:179901:appeared": "P-en-up",
    "voice:entity:179901:expiring": "P-en-exp",
    "voice:entity:179901:gone": "P-en-gone",
  });

  it("names phrases by their spoken text; bundled alert prompts keep fixed names", () => {
    const names = phraseRequests(fullBindings).map((request) => request.name);
    expect(names).toContain(
      nameOf("auto", "voice:entity:179901:expiring", "镰车还有5秒消失"),
    );
    expect(names).toContain(
      nameOf("auto", "voice:buff:101:expiring", "狂暴还有3秒失效"),
    );
    expect(names).toContain("auto:voice:alert:matchReady");
  });

  it("compiles nothing for a skill that is not monitored", () => {
    const profile = fullView.skillProfile!;
    const unmonitored = {
      ...fullView,
      skillProfile: { ...profile, monitoredSkillIds: [] as number[] },
    };
    const bindings = collectBindings(unmonitored);
    expect(
      compileVoiceRules(bindings, index).some(
        (r) => r.trigger.subject.kind === "skill",
      ),
    ).toBe(false);
    expect(
      phraseRequests(bindings).some((r) => r.name.includes(":skill:")),
    ).toBe(false);
    expect(
      listVoiceBindingOverview(unmonitored, index).some(
        (r) => r.navigateTo === "skill",
      ),
    ).toBe(false);
  });

  it("produces the expected rule literals", () => {
    const rules = compileVoiceRules(fullBindings, index);
    expect(rules).toEqual([
      {
        id: "voice:buff:101:gained",
        enabled: true,
        trigger: {
          subject: { kind: "buff", buffId: 101 },
          event: { kind: "started" },
        },
        phraseId: "P-gained",
        priority: 200,
        cooldownMs: 2000,
      },
      {
        id: "voice:buff:101:expiring",
        enabled: true,
        trigger: {
          subject: { kind: "buff", buffId: 101 },
          event: { kind: "expiringIn", secondsBefore: 3 },
        },
        phraseId: "P-exp",
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:buff:101:lost",
        enabled: true,
        trigger: {
          subject: { kind: "buff", buffId: 101 },
          event: { kind: "ended" },
        },
        phraseId: "P-lost",
        phraseIdByTier: { 2: "P-lost-2" },
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:skill:990001:cast",
        enabled: true,
        trigger: {
          subject: { kind: "skill", skillId: 990001 },
          event: { kind: "started" },
        },
        phraseId: "P-sk-cast",
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:skill:990001:readyIn",
        enabled: true,
        trigger: {
          subject: { kind: "skill", skillId: 990001 },
          event: { kind: "expiringIn", secondsBefore: 2 },
        },
        phraseId: "P-sk-in",
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:monsterBuff:anySource:55:gained",
        enabled: true,
        trigger: {
          subject: {
            kind: "monsterBuff",
            buffId: 55,
            sourceScope: "anySource",
          },
          event: { kind: "started" },
        },
        phraseId: "P-mb",
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:dbm:8801:onCast",
        enabled: true,
        trigger: {
          subject: { kind: "bossDbm", baseSkillId: 8801 },
          event: { kind: "started" },
        },
        phraseId: "P-dbm",
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:dbm:8801:expiring",
        enabled: true,
        trigger: {
          subject: { kind: "bossDbm", baseSkillId: 8801 },
          event: { kind: "expiringIn", secondsBefore: 5 },
        },
        phraseId: "P-dbm-exp",
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:entity:179901:appeared",
        enabled: true,
        trigger: {
          subject: { kind: "entity", monsterId: 179901, scope: "self" },
          event: { kind: "started" },
        },
        phraseId: "P-en-up",
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:entity:179901:expiring",
        enabled: true,
        trigger: {
          subject: { kind: "entity", monsterId: 179901, scope: "self" },
          event: { kind: "expiringIn", secondsBefore: 5 },
        },
        phraseId: "P-en-exp",
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:entity:179901:gone",
        enabled: true,
        trigger: {
          subject: { kind: "entity", monsterId: 179901, scope: "self" },
          event: { kind: "ended" },
        },
        phraseId: "P-en-gone",
        priority: 0,
        cooldownMs: 2000,
      },
      {
        id: "voice:alert:matchReady",
        enabled: true,
        trigger: {
          subject: { kind: "alert", alert: "matchmakingPopped" },
          event: { kind: "started" },
        },
        phraseId: "P-alert",
        priority: 0,
        cooldownMs: 2000,
      },
    ]);
  });

  it("plays the slot's newest voiced phrase until the current text's phrase exists", () => {
    const phrase = (
      phraseId: string,
      text: string,
      hasAudio: boolean,
      updatedAtMs: number,
    ): ResolvedPhrase => ({
      phraseId,
      text,
      language: "zhCn",
      hasAudio,
      updatedAtMs,
    });
    const gained = (text: string) =>
      nameOf("custom", "voice:buff:101:gained", text);
    const pending: PhraseIndex = {
      [gained("旧")]: phrase("P-old", "旧", true, 2),
      [gained("更旧")]: phrase("P-older", "更旧", true, 1),
      [gained("无声")]: phrase("P-silent", "无声", false, 3),
      // Newer, but of another slot: only stands in for its own binding.
      [nameOf("custom", "voice:buff:101:lost", "旧")]: phrase(
        "P-lost-old",
        "旧",
        true,
        9,
      ),
    };
    const rulesOf = (catalog: PhraseIndex) =>
      compileVoiceRules(fullBindings, catalog).map((r) => [r.id, r.phraseId]);
    expect(rulesOf(pending)).toEqual([
      ["voice:buff:101:gained", "P-old"],
      ["voice:buff:101:lost", "P-lost-old"],
    ]);
    // The status view stays exact: the binding is pending.
    const gainedEntry = (catalog: PhraseIndex) =>
      listVoiceBindingOverview(fullView, catalog).find(
        (entry) => entry.id === "voice:buff:101:gained",
      )!;
    expect(gainedEntry(pending).phraseId).toBeNull();

    // Once it exists it compiles, audio or not (the backend falls back
    // while it is silent).
    const landed: PhraseIndex = {
      ...pending,
      [nameOf("auto", "voice:buff:101:gained", "狂暴已生效")]: phrase(
        "P-new",
        "狂暴已生效",
        false,
        4,
      ),
    };
    expect(rulesOf(landed)).toEqual([
      ["voice:buff:101:gained", "P-new"],
      ["voice:buff:101:lost", "P-lost-old"],
    ]);
    expect(gainedEntry(landed).phraseId).toBe("P-new");
  });

  it("includes preset counter slots when configured", () => {
    const preset = getCounterRules().find((rule) =>
      rule.effectSlots.some((slot) => slot.threshold !== null),
    )!;
    const slot = preset.effectSlots.find((s) => s.threshold !== null)!;
    const key = `voice:counter:${preset.ruleId}:${slot.slotId}:threshold`;
    const bindings = collectBindings(
      view({
        skillProfile: {
          monitoredSkillIds: [990001],
          selectedClass: "wind_knight",
          presetCounterVoiceConfigs: {
            [String(preset.ruleId)]: {
              [String(slot.slotId)]: { threshold: auto() },
            },
          },
        },
      }),
    );
    const rules = compileVoiceRules(
      bindings,
      indexOf(bindings, { [key]: "P-c" }),
    );
    expect(rules).toEqual([
      {
        id: key,
        enabled: true,
        trigger: {
          subject: {
            kind: "counter",
            ruleId: preset.ruleId,
            slotId: slot.slotId,
          },
          event: { kind: "threshold" },
        },
        phraseId: "P-c",
        priority: 0,
        cooldownMs: 2000,
      },
    ]);
  });

  it("overview lists frontend cues too, with resolved ids and tier variants", () => {
    const entries = listVoiceBindingOverview(fullView, index);
    expect(entries.map((e) => e.id)).toContain("voice:minimapCue:s3-raid:bomb");
    const cue = entries.find((e) => e.id === "voice:minimapCue:s3-raid:bomb")!;
    expect(cue).toMatchObject({
      subjectLabel: "voice.alerts.title",
      phraseId: "P-cue",
      navigateTo: "minimap",
      eventLabelKey: "voice.binding.event.onCast",
    });
    const lost = entries.find((e) => e.id === "voice:buff:101:lost")!;
    expect(lost.tierPhraseIds).toEqual(["P-lost-2"]);
    expect(lost.phrases).toHaveLength(7);
    const mb = entries.find(
      (e) => e.id === "voice:monsterBuff:anySource:55:gained",
    )!;
    expect(mb.monsterBuffSourceScope).toBe("anySource");
    const alert = entries.find((e) => e.id === "voice:alert:matchReady")!;
    expect(alert).toMatchObject({ bundledFallback: true, language: "enUs" });
  });
});
