import { describe, expect, it } from "vitest";

import type { MonsterSkillWatchEntry } from "$lib/settings-store";
import { buildMonsterSkillRows } from "./monster-skill-rows";

const entries: MonsterSkillWatchEntry[] = [
  { skillId: 2, label: "分摊", displayMs: 5_000 },
  { skillId: 1, label: "", displayMs: 3_000 },
  { skillId: 3, label: "", displayMs: 5_000 },
];

const formatRemaining = (remainingMs: number) => `${remainingMs}ms`;

function build(
  casts: [number, number][],
  now: number,
  watchList: MonsterSkillWatchEntry[] = entries,
) {
  return buildMonsterSkillRows({
    entries: watchList,
    casts: new Map(casts),
    now,
    resolveLabel: (entry) => entry.label || `#${entry.skillId}`,
    formatRemaining,
  });
}

describe("buildMonsterSkillRows", () => {
  it("discovers unlisted skills with ids, expires them, and keeps configured durations", () => {
    const result = buildMonsterSkillRows({
      entries,
      monitorAll: true,
      casts: new Map([
        [9, 1_000],
        [8, 2_000],
        [1, 2_000],
      ]),
      now: 6_000,
      resolveLabel: () => "alias",
      resolveSkillName: (id) => `Skill ${id}`,
      formatRemaining,
    });
    expect(result.rows.map((row) => row.label)).toEqual(["Skill 8#8"]);
    expect(result.nextDeadlineMs).toBe(7_000);
  });

  it("keeps listed skills first as configured, then unlisted ones by id", () => {
    const result = buildMonsterSkillRows({
      entries,
      monitorAll: true,
      casts: new Map([
        [9, 4_000],
        [2, 4_000],
        [7, 4_000],
        [1, 4_000],
      ]),
      now: 5_000,
      resolveLabel: (entry) => entry.label || `Listed ${entry.skillId}`,
      resolveSkillName: (id) => (id === 7 ? "Skill 7" : null),
      formatRemaining,
    });
    // Listed rows keep their alias and watch-list order; an unlisted skill
    // the table cannot name shows its id once.
    expect(result.rows.map((row) => row.label)).toEqual([
      "分摊",
      "Listed 1",
      "Skill 7#7",
      "#9",
    ]);
    // Skill 1 keeps its own 3 s display time.
    expect(result.nextDeadlineMs).toBe(7_000);
  });

  it("shows casts in watch-list order without countdown or progress", () => {
    const { rows } = build(
      [
        [1, 1_000],
        [2, 2_000],
      ],
      2_500,
    );
    expect(rows).toEqual([
      {
        key: "monster_skill_2",
        label: "分摊",
        valueText: "",
        progressPercent: 0,
        showProgress: false,
      },
      {
        key: "monster_skill_1",
        label: "#1",
        valueText: "",
        progressPercent: 0,
        showProgress: false,
      },
    ]);
  });

  it("drops casts past their entry's display time and reports the nearest expiry", () => {
    const result = build(
      [
        [1, 1_000],
        [2, 1_000],
        [3, 2_000],
      ],
      4_000,
    );
    // Skill 1 expired at 4 000; skill 2 runs to 6 000, skill 3 to 7 000.
    expect(result.rows.map((row) => row.key)).toEqual([
      "monster_skill_2",
      "monster_skill_3",
    ]);
    expect(result.nextDeadlineMs).toBe(6_000);
  });

  it("ignores casts of skills no longer on the list", () => {
    const result = build([[9, 1_000]], 1_500);
    expect(result).toEqual({ rows: [], nextDeadlineMs: null });
  });

  it("counts a countdown entry down from its cast over the display time", () => {
    const watchList: MonsterSkillWatchEntry[] = [
      { skillId: 2, label: "分摊", displayMs: 8_000, countdown: true },
      { skillId: 1, label: "", displayMs: 3_000 },
    ];
    const result = build(
      [
        [2, 1_000],
        [1, 1_000],
      ],
      3_000,
      watchList,
    );
    expect(result.rows).toEqual([
      {
        key: "monster_skill_2",
        label: "分摊",
        valueText: "6000ms",
        progressPercent: 75,
        showProgress: true,
        temporal: { deadlineMs: 9_000, durationMs: 8_000 },
      },
      // Entries without countdown keep the name-only row.
      {
        key: "monster_skill_1",
        label: "#1",
        valueText: "",
        progressPercent: 0,
        showProgress: false,
      },
    ]);
    expect(result.nextDeadlineMs).toBe(4_000);
  });

  it("drops a countdown row once its countdown reaches zero", () => {
    const watchList: MonsterSkillWatchEntry[] = [
      { skillId: 2, label: "", displayMs: 8_000, countdown: true },
    ];
    expect(build([[2, 1_000]], 9_000, watchList)).toEqual({
      rows: [],
      nextDeadlineMs: null,
    });
  });

  it("never gives discovered skills a countdown", () => {
    const result = buildMonsterSkillRows({
      entries: [{ skillId: 2, label: "", displayMs: 8_000, countdown: true }],
      monitorAll: true,
      casts: new Map([
        [2, 1_000],
        [9, 1_000],
      ]),
      now: 2_000,
      resolveLabel: () => "listed",
      resolveSkillName: () => null,
      formatRemaining,
    });
    expect(result.rows.map((row) => [row.label, row.showProgress])).toEqual([
      ["listed", true],
      ["#9", false],
    ]);
    expect(result.rows[1]?.temporal).toBeUndefined();
  });
});
