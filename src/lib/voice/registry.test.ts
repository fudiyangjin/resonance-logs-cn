import { describe, expect, it } from "vitest";
import { overviewGroups } from "./overview";
import { byKind, VOICE_SUBJECT_ADAPTERS } from "./registry";
import type { VoiceBindingView } from "./subject-types";
import { resolveMonsterBuffSourceScope } from "./association";

function emptyView(): VoiceBindingView {
  return {
    skillProfile: null,
    monster: {
      monitoredBuffIds: [],
      selfAppliedBuffIds: [],
      selfAppliedMonitorAll: false,
      dbmAliases: {},
      entityDurationEntries: [],
      monsterSkillEntries: [],
    },
    mechanicVoiceConfigs: {},
    alertConfigs: {},
    minimapCues: [],
    buffAliases: {},
    locale: "zh-CN",
    t: (key) => key,
  };
}

describe("VOICE_SUBJECT_ADAPTERS", () => {
  it("has a unique kind per adapter", () => {
    const kinds = VOICE_SUBJECT_ADAPTERS.map((adapter) => adapter.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("covers every overview group exactly once", () => {
    const groups = VOICE_SUBJECT_ADAPTERS.map(
      (adapter) => adapter.overview.group,
    );
    expect([...groups].sort()).toEqual(
      [
        "alerts",
        "buff",
        "counter",
        "dbm",
        "entity",
        "minimap",
        "monsterBuff",
        "monsterSkill",
        "skill",
      ].sort(),
    );
    expect(overviewGroups().map((group) => group.group)).toEqual([
      "buff",
      "skill",
      "monsterBuff",
      "counter",
      "dbm",
      "entity",
      "monsterSkill",
      "minimap",
      "alerts",
    ]);
  });

  it("only the minimap cue runs on the frontend", () => {
    const frontend = VOICE_SUBJECT_ADAPTERS.filter(
      (a) => a.runtime === "frontend",
    );
    expect(frontend.map((a) => a.kind)).toEqual(["minimapCue"]);
    expect(
      byKind("minimapCue").trigger(
        { kind: "minimapCue", cueId: "x" },
        "onCast",
        0,
      ),
    ).toBeNull();
  });
});

// Golden values: these literals are the pre-registry `*EventKey` outputs.
// Existing user phrases are named after them, so they must never change.
describe("ruleKey golden values", () => {
  it("buff", () => {
    const a = byKind("buff");
    const s = { kind: "buff", buffId: 101 } as const;
    expect(a.ruleKey(s, "gained")).toBe("voice:buff:101:gained");
    expect(a.ruleKey(s, "expiring")).toBe("voice:buff:101:expiring");
    expect(a.ruleKey(s, "lost")).toBe("voice:buff:101:lost");
  });

  it("monsterBuff", () => {
    const a = byKind("monsterBuff");
    expect(
      a.ruleKey(
        { kind: "monsterBuff", buffId: 55, sourceScope: "anySource" },
        "gained",
      ),
    ).toBe("voice:monsterBuff:anySource:55:gained");
    expect(
      a.ruleKey(
        { kind: "monsterBuff", buffId: 55, sourceScope: "localPlayerSource" },
        "lost",
      ),
    ).toBe("voice:monsterBuff:localPlayerSource:55:lost");
  });

  it("counterSlot", () => {
    const a = byKind("counterSlot");
    const s = { kind: "counterSlot", ruleId: 7, slotId: 2 } as const;
    expect(a.ruleKey(s, "threshold")).toBe("voice:counter:7:2:threshold");
    expect(a.ruleKey(s, "expiring")).toBe("voice:counter:7:2:expiring");
  });

  it("dbm", () => {
    const a = byKind("dbm");
    const s = { kind: "dbm", baseSkillId: 8801 } as const;
    expect(a.ruleKey(s, "onCast")).toBe("voice:dbm:8801:onCast");
    expect(a.ruleKey(s, "expiring")).toBe("voice:dbm:8801:expiring");
  });

  it("skill", () => {
    const a = byKind("skill");
    const s = { kind: "skill", skillId: 1420 } as const;
    expect(a.ruleKey(s, "cast")).toBe("voice:skill:1420:cast");
    expect(a.ruleKey(s, "ready")).toBe("voice:skill:1420:ready");
    expect(a.ruleKey(s, "readyIn")).toBe("voice:skill:1420:readyIn");
  });

  it("entity (scope-less: re-scoping an entry keeps its phrases)", () => {
    const a = byKind("entity");
    const s = { kind: "entity", monsterId: 179901, scope: "self" } as const;
    expect(a.ruleKey(s, "appeared")).toBe("voice:entity:179901:appeared");
    expect(a.ruleKey(s, "expiring")).toBe("voice:entity:179901:expiring");
    expect(a.ruleKey({ ...s, scope: "any" }, "gone")).toBe(
      "voice:entity:179901:gone",
    );
  });

  it("minimapCue", () => {
    expect(
      byKind("minimapCue").ruleKey(
        { kind: "minimapCue", cueId: "s3-raid:bomb" },
        "onCast",
      ),
    ).toBe("voice:minimapCue:s3-raid:bomb");
  });

  it("gameAlert", () => {
    const a = byKind("gameAlert");
    expect(
      a.ruleKey({ kind: "gameAlert", alertKind: "matchReady" }, "onCast"),
    ).toBe("voice:alert:matchReady");
    expect(
      a.ruleKey({ kind: "gameAlert", alertKind: "readyCheck" }, "onCast"),
    ).toBe("voice:alert:readyCheck");
    expect(
      a.ruleKey({ kind: "gameAlert", alertKind: "teamVote" }, "onCast"),
    ).toBe("voice:alert:teamVote");
  });
});

describe("auto text golden values", () => {
  it("buff / monsterBuff / dbm / counter phrasing is unchanged", () => {
    const view = { ...emptyView(), buffAliases: { "101": "狂暴" } };
    const buffEvents = byKind("buff").events(view, {
      kind: "buff",
      buffId: 101,
    });
    expect(buffEvents.map((e) => [e.eventKind, e.autoText(3)])).toEqual([
      ["gained", "狂暴已生效"],
      ["expiring", "狂暴还有3秒失效"],
      ["lost", "狂暴已失效"],
    ]);
    expect(buffEvents.map((e) => e.supportsTierPlaceholder)).toEqual([
      true,
      false,
      true,
    ]);

    const monsterEvents = byKind("monsterBuff").events(view, {
      kind: "monsterBuff",
      buffId: 101,
      sourceScope: "anySource",
    });
    expect(monsterEvents.map((e) => e.autoText(5))).toEqual([
      "目标狂暴已生效",
      "目标狂暴还有5秒失效",
      "目标狂暴已失效",
    ]);

    const dbmView = { ...emptyView() };
    dbmView.monster.dbmAliases = { "8801": "大招" };
    const dbmEvents = byKind("dbm").events(dbmView, {
      kind: "dbm",
      baseSkillId: 8801,
    });
    expect(dbmEvents.map((e) => e.autoText(4))).toEqual([
      "大招",
      "大招还有4秒",
    ]);
  });

  it("skill events map to cast / ready / ready-in triggers", () => {
    const a = byKind("skill");
    const subject = { kind: "skill", skillId: 990001 } as const;
    const events = a.events(emptyView(), subject);
    expect(events.map((e) => [e.eventKind, e.expiring, e.autoText(3)])).toEqual(
      [
        ["cast", false, "#990001已释放"],
        ["ready", false, "#990001已就绪"],
        ["readyIn", true, "#990001还有3秒就绪"],
      ],
    );
    expect(a.trigger(subject, "ready", 0)).toEqual({
      subject: { kind: "skill", skillId: 990001 },
      event: { kind: "ended" },
    });
    expect(a.trigger(subject, "gained", 0)).toBeNull();
  });

  it("entity exposes expiring only with a duration and follows its entry", () => {
    const a = byKind("entity");
    const subject = {
      kind: "entity",
      monsterId: 179901,
      scope: "self",
    } as const;
    const withDuration = emptyView();
    withDuration.monster.entityDurationEntries = [
      {
        id: "e",
        monsterId: 179901,
        label: "镰车",
        durationMs: 35_000,
        scope: "self",
      },
    ];
    withDuration.monster.entityVoiceConfigs = {
      "179901": {
        appeared: { enabled: true, phrase: { source: "auto" } },
      },
    };
    expect(a.label(withDuration, subject)).toBe("镰车");
    expect(
      a.events(withDuration, subject).map((e) => [e.eventKind, e.autoText(5)]),
    ).toEqual([
      ["appeared", "镰车已出现"],
      ["expiring", "镰车还有5秒消失"],
      ["gone", "镰车已消失"],
    ]);
    expect(a.enumerate(withDuration)).toEqual([subject]);

    const openEnded = emptyView();
    openEnded.monster.entityDurationEntries = [
      { id: "e", monsterId: 179901, label: "", scope: "any" },
    ];
    // Keyed by the watch scope, as bindings were before one entry per
    // monster id owned them.
    openEnded.monster.entityVoiceConfigs = {
      "179901:self": {
        appeared: { enabled: true, phrase: { source: "auto" } },
      },
    };
    const anySubject = { ...subject, scope: "any" as const };
    expect(a.label(openEnded, anySubject)).toBe("#179901");
    expect(a.events(openEnded, anySubject).map((e) => e.eventKind)).toEqual([
      "appeared",
      "gone",
    ]);
    // Re-scoping the entry keeps the binding; the subject takes its scope.
    expect(a.enumerate(openEnded)).toEqual([anySubject]);
    expect(a.read(openEnded, anySubject, "appeared")).toEqual({
      enabled: true,
      phrase: { source: "auto" },
    });

    // Without its entry the binding has no subject.
    const removed = emptyView();
    removed.monster.entityVoiceConfigs =
      withDuration.monster.entityVoiceConfigs;
    expect(a.enumerate(removed)).toEqual([]);
    expect(a.trigger(anySubject, "expiring", 4)).toEqual({
      subject: { kind: "entity", monsterId: 179901, scope: "any" },
      event: { kind: "expiringIn", secondsBefore: 4 },
    });
  });

  it("alerts follow the UI locale and are playable from bundled prompts", () => {
    const a = byKind("gameAlert");
    const subject = { kind: "gameAlert", alertKind: "matchReady" } as const;
    expect(a.language({ ...emptyView(), locale: "en-US" })).toBe("enUs");
    const view = {
      ...emptyView(),
      alertConfigs: {
        matchReady: { enabled: true, phrase: { source: "auto" as const } },
      },
    };
    expect(a.readyWithoutPhrase(view, subject, "onCast")).toBe(true);
    expect(a.readyWithoutPhrase(emptyView(), subject, "onCast")).toBe(false);
    expect(a.events(view, subject)[0]!.autoText(0)).toBe(
      "voice.alerts.autoText.matchReady",
    );
    expect(a.trigger(subject, "onCast", 0)).toEqual({
      subject: { kind: "alert", alert: "matchmakingPopped" },
      event: { kind: "started" },
    });
  });
});

describe("resolveMonsterBuffSourceScope", () => {
  const base = {
    monitoredBuffIds: [1],
    selfAppliedBuffIds: [2],
    selfAppliedMonitorAll: false,
  };
  it("prefers the self-applied list, then monitored, then monitor-all", () => {
    expect(resolveMonsterBuffSourceScope(base, 2)).toBe("localPlayerSource");
    expect(resolveMonsterBuffSourceScope(base, 1)).toBe("anySource");
    expect(resolveMonsterBuffSourceScope(base, 3)).toBeNull();
    expect(
      resolveMonsterBuffSourceScope(
        { ...base, selfAppliedMonitorAll: true },
        3,
      ),
    ).toBe("localPlayerSource");
  });
});

describe("monsterSkill adapter", () => {
  const a = byKind("monsterSkill");
  const s = { kind: "monsterSkill", skillId: 101403 } as const;

  it("keys rules by skill id and only fires on cast", () => {
    expect(a.ruleKey(s, "onCast")).toBe("voice:monsterSkill:101403:onCast");
    expect(a.trigger(s, "onCast", 0)).toEqual({
      subject: { kind: "monsterSkill", skillId: 101403 },
      event: { kind: "started" },
    });
    expect(a.trigger(s, "expiring", 5)).toBeNull();
  });

  it("speaks the entry label, falling back to the game name", () => {
    const view = emptyView();
    view.monster.monsterSkillEntries = [
      { skillId: 101403, label: "", displayMs: 5_000 },
    ];
    expect(a.events(view, s).map((event) => event.autoText(0))).toEqual([
      "冰龙蓄力下砸",
    ]);
    view.monster.monsterSkillEntries = [
      { skillId: 101403, label: "下砸", displayMs: 5_000 },
    ];
    expect(a.label(view, s)).toBe("下砸");
  });
});
