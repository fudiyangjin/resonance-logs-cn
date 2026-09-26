import { describe, expect, it } from "vitest";
import type {
  EntityDurationEntry,
  VoiceEventConfig,
  VoiceExpiringEventConfig,
} from "$lib/settings-store";
import { getCounterRules } from "$lib/skill-mappings";
import {
  counterSlotSupportsExpiry,
  counterSlotSupportsThreshold,
} from "$lib/voice-binding-counter";
import {
  entityVoiceConfigFor,
  pruneAlertVoiceConfigs,
  pruneMechanicVoiceConfigs,
  pruneMonsterVoice,
  pruneSkillProfileVoice,
} from "./association";
import type {
  MonsterVoiceSlice,
  SkillProfileVoiceSlice,
} from "./subject-types";

const on: VoiceEventConfig = { enabled: true, phrase: { source: "auto" } };
const off: VoiceEventConfig = { enabled: false, phrase: { source: "auto" } };
const soon: VoiceExpiringEventConfig = { ...on, secondsBefore: 5 };

function skillProfile(
  overrides: Partial<SkillProfileVoiceSlice> = {},
): SkillProfileVoiceSlice {
  return { monitoredSkillIds: [], selectedClass: "", ...overrides };
}

function monster(
  overrides: Partial<MonsterVoiceSlice> = {},
): MonsterVoiceSlice {
  return {
    monitoredBuffIds: [],
    selfAppliedBuffIds: [],
    selfAppliedMonitorAll: false,
    dbmAliases: {},
    entityDurationEntries: [],
    ...overrides,
  };
}

function entry(
  monsterId: number,
  overrides: Partial<EntityDurationEntry> = {},
): EntityDurationEntry {
  return {
    id: `e-${monsterId}`,
    monsterId,
    label: "",
    scope: "self",
    ...overrides,
  };
}

describe("pruneSkillProfileVoice", () => {
  it("drops skill bindings of skills the profile no longer monitors", () => {
    const profile = skillProfile({
      monitoredSkillIds: [1420],
      skillVoiceConfigs: { "1420": { cast: on }, "1421": { ready: off } },
      buffVoiceConfigs: { "101": { gained: on } },
    });
    const pruned = pruneSkillProfileVoice(profile);
    expect(pruned.skillVoiceConfigs).toEqual({ "1420": { cast: on } });
    // Local buff bindings are their own list.
    expect(pruned.buffVoiceConfigs).toBe(profile.buffVoiceConfigs);
  });

  it("returns the profile itself when nothing is dissociated, and is idempotent", () => {
    const profile = skillProfile({
      monitoredSkillIds: [1420],
      skillVoiceConfigs: { "1420": { cast: on } },
    });
    expect(pruneSkillProfileVoice(profile)).toBe(profile);
    const pruned = pruneSkillProfileVoice(
      skillProfile({ skillVoiceConfigs: { "1420": { cast: on } } }),
    );
    expect(pruneSkillProfileVoice(pruned)).toBe(pruned);
  });

  it("keeps preset counter bindings only for resolvable slots and applicable events", () => {
    const preset = getCounterRules().find((rule) =>
      rule.effectSlots.some(
        (slot) =>
          counterSlotSupportsThreshold(slot) &&
          !counterSlotSupportsExpiry(slot),
      ),
    )!;
    const slot = preset.effectSlots.find(
      (candidate) =>
        counterSlotSupportsThreshold(candidate) &&
        !counterSlotSupportsExpiry(candidate),
    )!;
    const presetCounterVoiceConfigs = {
      [String(preset.ruleId)]: {
        [String(slot.slotId)]: { threshold: on, expiring: soon },
        "99": { threshold: on },
      },
      "999999": { "1": { threshold: on } },
    };
    const profile = skillProfile({ presetCounterVoiceConfigs });
    expect(pruneSkillProfileVoice(profile).presetCounterVoiceConfigs).toEqual({
      [String(preset.ruleId)]: { [String(slot.slotId)]: { threshold: on } },
    });

    // A user rule with the preset's id replaces it: the preset binding goes.
    const overridden = skillProfile({
      presetCounterVoiceConfigs,
      userCounterRules: [
        {
          ruleId: preset.ruleId,
          name: "mine",
          sourceRefs: ["stormablade_x1"],
          slotRefs: ["stormablade_x1"],
        },
      ],
    });
    expect(
      pruneSkillProfileVoice(overridden).presetCounterVoiceConfigs,
    ).toEqual({});
  });

  it("prunes user counter rule voice but keeps the rule", () => {
    const rule = {
      ruleId: 10001,
      name: "mine",
      sourceRefs: ["stormablade_x1"],
      slotRefs: ["stormablade_x1"],
      voice: {
        "1": { threshold: on, expiring: soon },
        "2": { threshold: on },
      },
    };
    const pruned = pruneSkillProfileVoice(
      skillProfile({ userCounterRules: [rule] }),
    );
    expect(pruned.userCounterRules).toEqual([
      { ...rule, voice: { "1": { threshold: on } } },
    ]);
  });
});

describe("pruneMonsterVoice", () => {
  it("keeps target-buff bindings only while a monitor list holds the buff", () => {
    const configs = {
      "1": { gained: on },
      "2": { lost: on },
      "3": { gained: on },
    };
    const slice = monster({
      monitoredBuffIds: [1],
      selfAppliedBuffIds: [2],
      monsterBuffVoiceConfigs: configs,
    });
    expect(pruneMonsterVoice(slice).monsterBuffVoiceConfigs).toEqual({
      "1": { gained: on },
      "2": { lost: on },
    });
    const all = monster({
      selfAppliedMonitorAll: true,
      monsterBuffVoiceConfigs: configs,
    });
    expect(pruneMonsterVoice(all)).toBe(all);
  });

  it("keeps DBM bindings only for listed DBM entries", () => {
    const slice = monster({
      dbmAliases: { "8801": "大招", "8802": "  " },
      dbmVoiceConfigs: {
        "8801": { onCast: on },
        "8802": { onCast: on },
        "8803": { expiring: soon },
      },
    });
    expect(pruneMonsterVoice(slice).dbmVoiceConfigs).toEqual({
      "8801": { onCast: on },
    });
  });

  it("re-keys entity bindings by monster id and drops events the entry lacks", () => {
    const slice = monster({
      entityDurationEntries: [
        entry(179901, { scope: "any" }),
        entry(179902, { durationMs: 5_000 }),
      ],
      entityVoiceConfigs: {
        "179901:self": { appeared: on, expiring: soon },
        "179902": { expiring: soon },
        "179903": { gone: on },
      },
    });
    expect(pruneMonsterVoice(slice).entityVoiceConfigs).toEqual({
      "179901": { appeared: on },
      "179902": { expiring: soon },
    });
    const pruned = pruneMonsterVoice(slice);
    expect(pruneMonsterVoice(pruned)).toBe(pruned);
  });

  it("returns the slice itself when every binding still has its subject", () => {
    const slice = monster({
      monitoredBuffIds: [1],
      dbmAliases: { "8801": "大招" },
      entityDurationEntries: [entry(179901)],
      monsterBuffVoiceConfigs: { "1": { gained: on } },
      dbmVoiceConfigs: { "8801": { onCast: on } },
      entityVoiceConfigs: { "179901": { appeared: on } },
    });
    expect(pruneMonsterVoice(slice)).toBe(slice);
    expect(pruneMonsterVoice(monster())).toEqual(monster());
  });

  it("tolerates persisted slices with missing lists", () => {
    const broken = {
      monsterBuffVoiceConfigs: { "1": { gained: on } },
    } as unknown as MonsterVoiceSlice;
    expect(pruneMonsterVoice(broken).monsterBuffVoiceConfigs).toEqual({});
  });
});

describe("entityVoiceConfigFor", () => {
  it("prefers the canonical key, then the entry's own scope, then any scope", () => {
    const self = { appeared: on };
    const any = { gone: on };
    const canonical = { expiring: soon };
    expect(
      entityVoiceConfigFor(
        { "7:any": any, "7:self": self, "7": canonical },
        entry(7),
      ),
    ).toBe(canonical);
    expect(
      entityVoiceConfigFor({ "7:any": any, "7:self": self }, entry(7)),
    ).toBe(self);
    expect(entityVoiceConfigFor({ "7:any": any }, entry(7))).toBe(any);
    expect(entityVoiceConfigFor({ "8": canonical }, entry(7))).toBeUndefined();
  });
});

describe("global bindings", () => {
  it("keeps minimap cue bindings of registered cues only", () => {
    const configs = { "s3-raid:bomb": on, "gone:cue": on };
    expect(
      pruneMechanicVoiceConfigs(configs, new Set(["s3-raid:bomb"])),
    ).toEqual({ "s3-raid:bomb": on });
    expect(
      pruneMechanicVoiceConfigs(configs, new Set(Object.keys(configs))),
    ).toBe(configs);
  });

  it("keeps alert bindings of existing alert kinds only", () => {
    expect(
      pruneAlertVoiceConfigs({
        matchReady: on,
        removedKind: on,
      } as unknown as Parameters<typeof pruneAlertVoiceConfigs>[0]),
    ).toEqual({ matchReady: on });
  });
});
