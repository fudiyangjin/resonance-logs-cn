import { describe, expect, it } from "vitest";
import { overviewGroups } from "./overview";
import { byKind, VOICE_SUBJECT_ADAPTERS } from "./registry";
import type { VoiceBindingView } from "./subject-types";
import { resolveMonsterBuffSourceScope } from "./subjects/monster-buff";

function emptyView(): VoiceBindingView {
  return {
    skillProfile: null,
    monster: {
      monitoredBuffIds: [],
      selfAppliedBuffIds: [],
      selfAppliedMonitorAll: false,
      dbmAliases: {},
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
      ["alerts", "buff", "counter", "dbm", "minimap", "monsterBuff"].sort(),
    );
    expect(overviewGroups().map((group) => group.group)).toEqual([
      "buff",
      "monsterBuff",
      "counter",
      "dbm",
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
