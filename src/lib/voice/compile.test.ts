import { describe, expect, it } from "vitest";
import { getCounterRules } from "$lib/skill-mappings";
import type {
  VoiceEventConfig,
  VoiceExpiringEventConfig,
} from "$lib/settings-store";
import {
  collectBindings,
  compileVoiceRules,
  isResolved,
  phraseRequests,
  type PhraseIndex,
} from "./compile";
import { collectReferencedVoiceKeys } from "./gc";
import { listVoiceBindingOverview } from "./overview";
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
        name: "auto:voice:buff:101:gained",
        text: "狂暴已生效",
        language: "zhCn",
      },
      {
        name: "custom:voice:buff:101:lost",
        text: "狂暴没了",
        language: "zhCn",
      },
      ...[0, 1, 2, 3, 4, 5].map((tier) => ({
        name: `custom:voice:buff:101:lost:tier${tier}`,
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
});

describe("compileVoiceRules", () => {
  const index: PhraseIndex = {
    "auto:voice:buff:101:gained": {
      phraseId: "P-gained",
      text: "狂暴已生效",
      language: "zhCn",
    },
    "auto:voice:buff:101:expiring": {
      phraseId: "P-exp",
      text: "狂暴还有3秒失效",
      language: "zhCn",
    },
    "custom:voice:buff:101:lost": {
      phraseId: "P-lost",
      text: "狂暴没了",
      language: "zhCn",
    },
    "custom:voice:buff:101:lost:tier2": {
      phraseId: "P-lost-2",
      text: "2阶狂暴没了",
      language: "zhCn",
    },
    "custom:voice:monsterBuff:anySource:55:gained": {
      phraseId: "P-mb",
      text: "x",
      language: "zhCn",
    },
    "auto:voice:dbm:8801:onCast": {
      phraseId: "P-dbm",
      text: "大招",
      language: "zhCn",
    },
    "auto:voice:dbm:8801:expiring": {
      phraseId: "P-dbm-exp",
      text: "大招还有5秒",
      language: "zhCn",
    },
    "auto:voice:alert:matchReady": {
      phraseId: "P-alert",
      text: "voice.alerts.autoText.matchReady",
      language: "enUs",
    },
    "auto:voice:minimapCue:s3-raid:bomb": {
      phraseId: "P-cue",
      text: "炸弹",
      language: "zhCn",
    },
    "auto:voice:skill:990001:cast": {
      phraseId: "P-sk-cast",
      text: "#990001已释放",
      language: "zhCn",
    },
    "auto:voice:skill:990001:readyIn": {
      phraseId: "P-sk-in",
      text: "#990001还有2秒就绪",
      language: "zhCn",
    },
    "auto:voice:entity:179901:self:appeared": {
      phraseId: "P-en-up",
      text: "镰车已出现",
      language: "zhCn",
    },
    "auto:voice:entity:179901:self:expiring": {
      phraseId: "P-en-exp",
      text: "镰车还有5秒消失",
      language: "zhCn",
    },
    "auto:voice:entity:179901:self:gone": {
      phraseId: "P-en-gone",
      text: "镰车已消失",
      language: "zhCn",
    },
  };

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
        "179901:self": {
          appeared: auto(),
          expiring: expiring(5),
          gone: auto(),
        },
        // Re-scoped / removed entries are dormant until re-added.
        "179901:any": { appeared: auto() },
      },
    },
    alertConfigs: { matchReady: auto() },
    minimapCues: [
      { id: "s3-raid:bomb", labelKey: "voice.alerts.title", autoText: "炸弹" },
    ],
    mechanicVoiceConfigs: { "s3-raid:bomb": auto() },
  });

  it("suspends unmonitored skills while retaining configuration and GC references", () => {
    const profile = fullView.skillProfile!;
    const dormant = {
      ...fullView,
      skillProfile: { ...profile, monitoredSkillIds: [] as number[] },
    };
    const before = compileVoiceRules(collectBindings(fullView), index);
    expect(
      compileVoiceRules(collectBindings(dormant), index).some(
        (r) => r.trigger.subject.kind === "skill",
      ),
    ).toBe(false);
    expect(
      phraseRequests(collectBindings(dormant)).some((r) =>
        r.name.includes(":skill:"),
      ),
    ).toBe(false);
    expect(
      listVoiceBindingOverview(dormant, index).some(
        (r) => r.navigateTo === "skill",
      ),
    ).toBe(false);
    expect(
      collectReferencedVoiceKeys({
        skillProfiles: [dormant.skillProfile],
        monsterConfigs: [],
        mechanicVoiceConfigs: {},
      }).has("voice:skill:990001:cast"),
    ).toBe(true);
    expect(dormant.skillProfile.skillVoiceConfigs).toBe(
      profile.skillVoiceConfigs,
    );
    dormant.skillProfile.monitoredSkillIds = [990001];
    expect(compileVoiceRules(collectBindings(dormant), index)).toEqual(before);
  });

  it("produces the expected rule literals", () => {
    const rules = compileVoiceRules(collectBindings(fullView), index);
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
        id: "voice:entity:179901:self:appeared",
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
        id: "voice:entity:179901:self:expiring",
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
        id: "voice:entity:179901:self:gone",
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

  it("keeps the stale phrase id while a text change is pending, drops unresolved ones", () => {
    const stale: PhraseIndex = {
      "auto:voice:buff:101:gained": {
        phraseId: "P-old",
        text: "旧文本",
        language: "zhCn",
      },
    };
    const rules = compileVoiceRules(collectBindings(fullView), stale);
    expect(rules.map((r) => [r.id, r.phraseId])).toEqual([
      ["voice:buff:101:gained", "P-old"],
    ]);
  });

  it("includes preset counter slots when configured", () => {
    const preset = getCounterRules().find((rule) =>
      rule.effectSlots.some((slot) => slot.threshold !== null),
    )!;
    const slot = preset.effectSlots.find((s) => s.threshold !== null)!;
    const key = `voice:counter:${preset.ruleId}:${slot.slotId}:threshold`;
    const rules = compileVoiceRules(
      collectBindings(
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
      ),
      { [`auto:${key}`]: { phraseId: "P-c", text: "t", language: "zhCn" } },
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
    const mb = entries.find(
      (e) => e.id === "voice:monsterBuff:anySource:55:gained",
    )!;
    expect(mb.monsterBuffSourceScope).toBe("anySource");
    const alert = entries.find((e) => e.id === "voice:alert:matchReady")!;
    expect(alert).toMatchObject({ bundledFallback: true, language: "enUs" });
  });
});

describe("isResolved", () => {
  const request = {
    name: "auto:voice:buff:1:gained",
    text: "a",
    language: "zhCn" as const,
  };
  const index: PhraseIndex = {
    [request.name]: { phraseId: "P", text: "a", language: "zhCn" },
  };
  it("requires matching text/language and a live catalog phrase", () => {
    expect(isResolved(index, new Set(["P"]), request)).toBe(true);
    expect(isResolved(index, new Set(), request)).toBe(false);
    expect(isResolved(index, new Set(["P"]), { ...request, text: "b" })).toBe(
      false,
    );
    expect(
      isResolved(index, new Set(["P"]), { ...request, language: "enUs" }),
    ).toBe(false);
    expect(isResolved({}, new Set(["P"]), request)).toBe(false);
  });
});
