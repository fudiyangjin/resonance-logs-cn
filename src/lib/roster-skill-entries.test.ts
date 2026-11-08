import { describe, expect, it } from "vitest";

import {
  addRosterSkillEntry,
  ensureRosterSkillEntries,
  MAX_ROSTER_SKILL_ENTRIES,
  moveRosterSkillEntry,
  patchRosterSkillEntry,
  removeRosterSkillEntry,
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
