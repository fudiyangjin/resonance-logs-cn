import { describe, expect, it } from "vitest";

import {
  DEFAULT_MONSTER_SKILL_DISPLAY_MS,
  MAX_MONSTER_SKILL_DISPLAY_MS,
  MAX_MONSTER_SKILL_ENTRIES,
  MIN_MONSTER_SKILL_DISPLAY_MS,
  addMonsterSkillEntry,
  ensureMonsterSkillEntries,
  moveMonsterSkillEntry,
  patchMonsterSkillEntry,
  removeMonsterSkillEntry,
} from "./monster-skill-entries";
import type { MonsterSkillWatchEntry } from "./settings-store";

function entry(skillId: number, displayMs = 5_000): MonsterSkillWatchEntry {
  return { skillId, label: "", displayMs };
}

describe("ensureMonsterSkillEntries", () => {
  it("returns an empty list for non-arrays", () => {
    expect(ensureMonsterSkillEntries(undefined)).toEqual([]);
    expect(ensureMonsterSkillEntries(null)).toEqual([]);
  });

  it("drops invalid and duplicate skill ids, keeping the first entry", () => {
    const result = ensureMonsterSkillEntries([
      { skillId: 0, label: "", displayMs: 1_000 },
      { skillId: 1.5, label: "", displayMs: 1_000 },
      { skillId: 2_147_483_648, label: "", displayMs: 1_000 },
      { label: "no id", displayMs: 1_000 },
      { skillId: 101_403, label: " 下砸 ", displayMs: 2_000 },
      { skillId: 101_403, label: "dup", displayMs: 3_000 },
    ]);
    expect(result).toEqual([
      { skillId: 101_403, label: "下砸", displayMs: 2_000 },
    ]);
  });

  it("clamps display times and defaults unusable ones", () => {
    const result = ensureMonsterSkillEntries([
      { skillId: 1, label: "", displayMs: 10 },
      { skillId: 2, label: "", displayMs: 999_999 },
      { skillId: 3, label: "" },
      { skillId: 4, label: "", displayMs: Number.NaN },
    ]);
    expect(result.map((e) => e.displayMs)).toEqual([
      MIN_MONSTER_SKILL_DISPLAY_MS,
      MAX_MONSTER_SKILL_DISPLAY_MS,
      DEFAULT_MONSTER_SKILL_DISPLAY_MS,
      DEFAULT_MONSTER_SKILL_DISPLAY_MS,
    ]);
  });

  it("truncates to the entry limit", () => {
    const many = Array.from({ length: MAX_MONSTER_SKILL_ENTRIES + 5 }, (_, i) =>
      entry(i + 1),
    );
    expect(ensureMonsterSkillEntries(many)).toHaveLength(
      MAX_MONSTER_SKILL_ENTRIES,
    );
  });
});

describe("addMonsterSkillEntry", () => {
  it("appends a new skill with the default display time", () => {
    expect(addMonsterSkillEntry([entry(1)], 2)).toEqual([
      entry(1),
      { skillId: 2, label: "", displayMs: DEFAULT_MONSTER_SKILL_DISPLAY_MS },
    ]);
  });

  it("ignores duplicates, invalid ids and a full list", () => {
    expect(addMonsterSkillEntry([entry(1)], 1)).toEqual([entry(1)]);
    expect(addMonsterSkillEntry([], -3)).toEqual([]);
    const full = Array.from({ length: MAX_MONSTER_SKILL_ENTRIES }, (_, i) =>
      entry(i + 1),
    );
    expect(addMonsterSkillEntry(full, 999)).toHaveLength(
      MAX_MONSTER_SKILL_ENTRIES,
    );
  });
});

describe("patchMonsterSkillEntry", () => {
  it("updates only the matching entry and normalizes the patch", () => {
    const result = patchMonsterSkillEntry([entry(1), entry(2)], 2, {
      label: "  分摊 ",
      displayMs: 100,
    });
    expect(result).toEqual([
      entry(1),
      { skillId: 2, label: "分摊", displayMs: MIN_MONSTER_SKILL_DISPLAY_MS },
    ]);
  });
});

describe("moveMonsterSkillEntry / removeMonsterSkillEntry", () => {
  it("swaps neighbours and stays put at the edges", () => {
    const list = [entry(1), entry(2), entry(3)];
    expect(moveMonsterSkillEntry(list, 2, "up").map((e) => e.skillId)).toEqual([
      2, 1, 3,
    ]);
    expect(
      moveMonsterSkillEntry(list, 3, "down").map((e) => e.skillId),
    ).toEqual([1, 2, 3]);
    expect(moveMonsterSkillEntry(list, 9, "up")).toEqual(list);
  });

  it("removes by skill id", () => {
    expect(removeMonsterSkillEntry([entry(1), entry(2)], 1)).toEqual([
      entry(2),
    ]);
  });
});
