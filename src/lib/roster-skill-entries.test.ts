import { describe, expect, it } from "vitest";

import {
  addRosterSkillEntry,
  ensureRosterSkillEntries,
  MAX_ROSTER_SKILL_ENTRIES,
  moveRosterSkillEntry,
  patchRosterSkillEntry,
  removeRosterSkillEntry,
  rosterSkillCooldownMs,
  rosterSkillFirstCastMs,
  rosterWatchedSkill,
} from "./roster-skill-entries";

describe("roster skill entries", () => {
  it("normalizes persisted entries", () => {
    expect(
      ensureRosterSkillEntries([
        { skillId: 7, label: " 爆弹 ", cooldownSeconds: 2.04 },
        { skillId: 7, label: "dup" },
        { skillId: -1, label: "bad" },
        { skillId: 8, cooldownSeconds: -3 },
        { skillId: 9, cooldownSeconds: 9_999 },
      ]),
    ).toEqual([
      { skillId: 7, label: "爆弹", cooldownSeconds: 2 },
      { skillId: 8, label: "" },
      { skillId: 9, label: "", cooldownSeconds: 600 },
    ]);
    expect(ensureRosterSkillEntries(null)).toEqual([]);
  });

  it("adds once, up to the limit", () => {
    const one = addRosterSkillEntry([], 7);
    expect(one).toEqual([{ skillId: 7, label: "" }]);
    expect(addRosterSkillEntry(one, 7)).toEqual(one);

    const full = Array.from({ length: MAX_ROSTER_SKILL_ENTRIES }, (_, i) => ({
      skillId: i + 1,
      label: "",
    }));
    expect(addRosterSkillEntry(full, 999)).toHaveLength(
      MAX_ROSTER_SKILL_ENTRIES,
    );
  });

  it("patches labels and switches between custom and table cooldowns", () => {
    const entries = [{ skillId: 7, label: "" }];
    const custom = patchRosterSkillEntry(entries, 7, {
      label: "爆弹",
      cooldownSeconds: 12,
    });
    expect(custom).toEqual([
      { skillId: 7, label: "爆弹", cooldownSeconds: 12 },
    ]);
    expect(patchRosterSkillEntry(custom, 7, { cooldownSeconds: null })).toEqual(
      [{ skillId: 7, label: "爆弹" }],
    );
  });

  it("times a skill by the user's cooldown, else the table's", () => {
    const table = { cooldownSeconds: 25 };
    expect(rosterSkillCooldownMs(undefined, table)).toBe(25_000);
    expect(rosterSkillCooldownMs(null, table)).toBe(25_000);
    // Whole milliseconds: 0.3 * 1000 is not an integer in floating point.
    expect(rosterSkillCooldownMs(0.3, table)).toBe(300);
    expect(rosterSkillCooldownMs(undefined, { cooldownSeconds: 0 })).toBe(0);
  });

  it("reads the earliest first cast from the battle-start window", () => {
    expect(rosterSkillFirstCastMs({ battleStart: [5, 10] })).toBe(5_000);
    expect(rosterSkillFirstCastMs({ battleStart: "never" })).toBeNull();
    expect(rosterSkillFirstCastMs({ battleStart: null })).toBeNull();
  });

  it("hands the backend the timing the skill cell shows", () => {
    const timing = {
      cooldownSeconds: 15,
      battleStart: [10, 15] as const,
      singSeconds: 2,
      danger: false,
    };
    expect(
      rosterWatchedSkill({ skillId: 7, label: "" }, timing, [103, 205]),
    ).toEqual({
      skillId: 7,
      cooldownMs: 15_000,
      firstCast: { afterMs: 10_000, monsterIds: [103, 205] },
    });
    // A custom cooldown replaces the table's; the window stays the table's.
    expect(
      rosterWatchedSkill(
        { skillId: 7, label: "", cooldownSeconds: 12.5 },
        timing,
        [103],
      ).cooldownMs,
    ).toBe(12_500);
    // No template is known to cast it, or it has no window: nothing to
    // lead before the first cast.
    expect(
      rosterWatchedSkill({ skillId: 7, label: "" }, timing, []).firstCast,
    ).toBeNull();
    expect(
      rosterWatchedSkill(
        { skillId: 7, label: "" },
        { ...timing, battleStart: "never" },
        [103],
      ).firstCast,
    ).toBeNull();
  });

  it("moves and removes entries", () => {
    const entries = [
      { skillId: 1, label: "" },
      { skillId: 2, label: "" },
    ];
    expect(
      moveRosterSkillEntry(entries, 2, "up").map((entry) => entry.skillId),
    ).toEqual([2, 1]);
    expect(moveRosterSkillEntry(entries, 1, "up")).toEqual(entries);
    expect(removeRosterSkillEntry(entries, 1)).toEqual([
      { skillId: 2, label: "" },
    ]);
  });
});
