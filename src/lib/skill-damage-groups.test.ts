import { describe, expect, it } from "vitest";
import { SKILL_DAMAGE_ICON_PRESETS } from "./skill-damage-icons";
import {
  createSkillDamageGroup,
  defaultDamageNumberStyle,
  groupSkillDamageRows,
  skillDamageGroups,
} from "./skill-damage-groups";
import {
  defaultSkillDamageDisplay,
  createDefaultMonsterMonitorProfile,
  createDefaultSkillMonitorProfile,
  omitProfileId,
} from "./settings-store";
import { parseLoadoutExport } from "./loadout-import";
import type { SkillDamageHitState } from "./bindings";

const hits: SkillDamageHitState[] = [
  {
    id: "1",
    batchId: "1",
    targetUuid: "100",
    skillId: 10,
    amount: "9007199254740993",
    occurredAtMs: 1000,
  },
  {
    id: "2",
    batchId: "1",
    targetUuid: "100",
    skillId: 20,
    amount: "7",
    occurredAtMs: 1000,
  },
  {
    id: "3",
    batchId: "1",
    targetUuid: "200",
    skillId: 20,
    amount: "10",
    occurredAtMs: 1000,
  },
  {
    id: "4",
    batchId: "2",
    targetUuid: "200",
    skillId: 20,
    amount: "50",
    occurredAtMs: 1050,
  },
  {
    id: "5",
    batchId: "1",
    targetUuid: "300",
    skillId: 30,
    amount: "1000",
    occurredAtMs: 1000,
  },
];
function setup() {
  const config = { ...defaultSkillDamageDisplay(), enabled: true };
  const first = createSkillDamageGroup("First");
  first.entries = [
    { skillId: 10, alias: "A" },
    { skillId: 20, alias: "B" },
  ];
  return { config: { ...config, groups: [first] }, first };
}
describe("skill damage groups", () => {
  it.each([false, true])(
    "limits each group independently after merging (group merge: %s)",
    (merge) => {
      const { config, first } = setup();
      first.maxVisible = 1;
      first.mergeSimultaneous = merge;
      const second = createSkillDamageGroup("Second");
      second.entries = [{ skillId: 30, alias: "C" }];
      second.maxVisible = 8;
      second.mergeSimultaneous = merge;
      config.groups.push(second);
      const stream = Array.from({ length: 10 }, (_, index) => [
        {
          id: `a${index}`,
          batchId: String(index),
          skillId: 10,
          amount: String(index + 1),
          occurredAtMs: 1000 + index,
        },
        {
          id: `b${index}`,
          batchId: String(index),
          skillId: 30,
          amount: String(index + 1),
          occurredAtMs: 1000 + index,
        },
      ]).flat();
      const rows = groupSkillDamageRows(stream, config, 1100);
      expect(rows).toHaveLength(9);
      expect(
        rows
          .filter((row) => row.group.id === first.id)
          .map((row) => row.amount),
      ).toEqual(["10"]);
      expect(
        rows
          .filter((row) => row.group.id === second.id)
          .map((row) => row.amount),
      ).toEqual(["3", "4", "5", "6", "7", "8", "9", "10"]);
    },
  );
  it("preserves legacy settings and does not recreate intentionally deleted groups", () => {
    const legacy = defaultSkillDamageDisplay();
    legacy.entries = [{ skillId: 25523102, alias: "Blast" }];
    legacy.fontSize = 42;
    legacy.fontColor = "#123456";
    expect(skillDamageGroups(legacy)[0]).toMatchObject({
      entries: legacy.entries,
      fontSize: 42,
      fontColor: "#123456",
      mergeSimultaneous: false,
    });
    expect(skillDamageGroups({ ...legacy, groups: [] })).toEqual([]);
    expect(groupSkillDamageRows(hits, legacy, 1100)).toEqual([]);
  });
  it("combines all skills within the group and batch with exact amounts and unique targets", () => {
    const { config, first } = setup();
    first.mergeSimultaneous = true;
    const rows = groupSkillDamageRows(hits, config, 1100);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      amount: "9007199254741010",
      hitCount: 2,
      merged: true,
      group: { name: "First" },
    });
    expect(rows[1]?.amount).toBe("50");
  });
  it("keeps unmerged mode and each group's style, lifetime and enabled state independent", () => {
    const { config, first } = setup();
    const second = createSkillDamageGroup("Second");
    second.entries = [{ skillId: 30, alias: "C" }];
    second.fontSize = 50;
    second.durationMs = 100;
    first.durationMs = 5000;
    config.groups.push(second);
    expect(
      groupSkillDamageRows(hits, config, 1050).map((row) => row.group.name),
    ).toContain("Second");
    expect(
      groupSkillDamageRows(hits, config, 1200).every(
        (row) => row.group.id === first.id,
      ),
    ).toBe(true);
    first.enabled = false;
    expect(groupSkillDamageRows(hits, config, 1200)).toEqual([]);
    second.numberStyle!.fill.color = "#abcdef";
    expect(first.numberStyle!.fill.color).not.toBe("#abcdef");
  });
  it("round trips group styles including gradients and rejects invalid effect sizes", () => {
    const { config, first } = setup();
    first.mergeSimultaneous = true;
    first.numberStyle = defaultDamageNumberStyle();
    first.maxVisible = 3;
    first.nameDisplayMode = "icon";
    first.animation = "floatUp";
    first.scrollDirection = "down";
    first.labelSpacing = 25;
    first.iconBackground = {
      mode: "gradient",
      color: "#abcdef",
      endColor: "#123456",
      angle: 45,
    };
    first.iconBackgroundOpacity = 0.35;
    first.iconPath = SKILL_DAMAGE_ICON_PRESETS[0]!;
    first.position = { x: 123, y: 456 };
    first.scale = 12;
    first.numberStyle.italic = true;
    for (const paint of [
      first.numberStyle.fill,
      first.numberStyle.innerGlowColor,
      first.numberStyle.outlineColor,
      first.numberStyle.outerGlowColor,
      first.numberStyle.shadowColor,
    ]) {
      paint.mode = "gradient";
      paint.endColor = "#12abcd";
      paint.angle = 45;
    }
    const monster = createDefaultMonsterMonitorProfile();
    monster.skillDamageDisplay = config;
    const exported = {
      kind: "resonance-logs-loadout",
      version: 2,
      name: "Groups",
      skillProfile: omitProfileId(createDefaultSkillMonitorProfile()),
      monsterProfile: omitProfileId(monster),
    };
    const parsed = parseLoadoutExport(JSON.parse(JSON.stringify(exported)));
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.output.monsterProfile.skillDamageDisplay?.groups).toEqual(
        config.groups,
      );
    first.numberStyle.outlineWidth = -1;
    expect(parseLoadoutExport(exported).success).toBe(false);
  });
});
