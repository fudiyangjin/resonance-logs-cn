import { describe, expect, it } from "vitest";
import type { SkillDamageHitState } from "./bindings";
import {
  buildSkillDamageRows,
  mergeSkillDamageRows,
} from "./skill-damage-groups";
import { createSkillDamageGroup } from "./skill-damage-settings";

const hit = (
  id: number,
  skillId: number,
  amount: string,
  batch = 1,
  targetUuid = "100",
  occurredAtMs = 1000,
): SkillDamageHitState => ({
  id,
  batch,
  targetUuid,
  skillId,
  amount,
  occurredAtMs,
});

const hits = [
  hit(1, 10, "9007199254740993", 1, "100"),
  hit(2, 20, "7", 1, "100"),
  hit(3, 20, "10", 1, "200"),
  hit(4, 20, "50", 2, "200", 1050),
  hit(5, 30, "1000", 1, "300"),
];

function group(name: string, skillIds: number[]) {
  const created = createSkillDamageGroup(name);
  created.entries = skillIds.map((skillId) => ({ skillId, alias: "" }));
  return created;
}

describe("buildSkillDamageRows", () => {
  it("keeps the largest hit per batch, with its target count, when unmerged", () => {
    const first = group("First", [10, 20]);
    const rows = buildSkillDamageRows(hits, [first]);
    expect(rows.map((row) => [row.skillId, row.amount, row.hitCount])).toEqual([
      [10, "9007199254740993", 1],
      [20, "50", 1],
    ]);
    expect(rows.every((row) => !row.merged && row.groupId === first.id)).toBe(
      true,
    );
  });

  it("sums one skill per batch when merging hits", () => {
    const first = group("First", [20]);
    first.mergeHits = true;
    expect(
      buildSkillDamageRows(hits, [first]).map((row) => [
        row.amount,
        row.hitCount,
      ]),
    ).toEqual([
      ["17", 2],
      ["50", 1],
    ]);
  });

  it("combines all skills of a batch with exact amounts and unique targets", () => {
    const first = group("First", [10, 20]);
    first.mergeSimultaneous = true;
    const rows = buildSkillDamageRows(hits, [first]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      amount: "9007199254741010",
      hitCount: 2,
      merged: true,
    });
    expect(rows[1]?.amount).toBe("50");
  });

  it("gives each row its group's lifetime and skips disabled groups", () => {
    const first = group("First", [10]);
    const second = group("Second", [30]);
    first.durationMs = 5000;
    second.durationMs = 100;
    const rows = buildSkillDamageRows(hits, [first, second]);
    expect(rows.map((row) => row.expiresAtMs)).toEqual([6000, 1100]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    second.enabled = false;
    expect(buildSkillDamageRows(hits, [first, second])).toHaveLength(1);
  });
});

describe("mergeSkillDamageRows", () => {
  it.each([false, true])(
    "limits each group independently, keeping the newest (group merge: %s)",
    (merge) => {
      const first = group("First", [10]);
      const second = group("Second", [30]);
      first.maxVisible = 1;
      first.mergeSimultaneous = merge;
      second.mergeSimultaneous = merge;
      let rows = mergeSkillDamageRows([], [], [first, second], 0);
      for (let index = 0; index < 10; index += 1) {
        const added = buildSkillDamageRows(
          [
            hit(index * 2 + 1, 10, String(index + 1), index),
            hit(index * 2 + 2, 30, String(index + 1), index),
          ],
          [first, second],
        );
        rows = mergeSkillDamageRows(rows, added, [first, second], 1100);
      }
      expect(
        rows.filter((row) => row.groupId === first.id).map((row) => row.amount),
      ).toEqual(["10"]);
      expect(
        rows
          .filter((row) => row.groupId === second.id)
          .map((row) => row.amount),
      ).toEqual(["3", "4", "5", "6", "7", "8", "9", "10"]);
    },
  );

  it("drops expired rows and rows of removed or disabled groups", () => {
    const first = group("First", [10]);
    const second = group("Second", [30]);
    const rows = buildSkillDamageRows(hits, [first, second]);
    expect(mergeSkillDamageRows(rows, [], [first, second], 3500)).toHaveLength(
      0,
    );
    expect(
      mergeSkillDamageRows(rows, [], [first], 1100).map((row) => row.groupId),
    ).toEqual([first.id]);
    first.enabled = false;
    expect(
      mergeSkillDamageRows(rows, [], [first, second], 1100).map(
        (row) => row.groupId,
      ),
    ).toEqual([second.id]);
  });
});
