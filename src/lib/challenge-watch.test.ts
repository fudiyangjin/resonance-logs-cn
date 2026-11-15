import { describe, expect, it } from "vitest";
import { CHALLENGE_PRESETS } from "./challenge-presets";
import {
  addGroupDamageIds,
  collectForbiddenDamageIds,
  createChallengeGroup,
  hasPresetGroup,
  normalizeChallengePresetLibrary,
  normalizeChallengeWatch,
  removeGroupDamageIds,
  saveGroupAsUserPreset,
  type ChallengeGroup,
} from "./challenge-watch";
import {
  challengeDamageLabel,
  challengeGroupName,
  describeForbiddenHits,
  formatForbiddenHitsTooltip,
} from "./challenge-watch-display";

const N17 = CHALLENGE_PRESETS[0]!;

function group(init: Partial<ChallengeGroup> & { id: string }): ChallengeGroup {
  return { name: "", presetId: null, damageIds: [], ...init };
}

describe("normalizeChallengeWatch", () => {
  it("turns a legacy list holding the whole N17 preset into its group", () => {
    expect(
      normalizeChallengeWatch({ forbiddenDamageIds: [...N17.damageIds] }),
    ).toEqual({
      groups: [
        {
          id: "preset:n17-fuyoupao",
          name: "",
          presetId: "n17-fuyoupao",
          damageIds: N17.damageIds,
        },
      ],
    });
  });

  it("keeps preset order for a partial preset and puts the rest in one group", () => {
    const result = normalizeChallengeWatch({
      forbiddenDamageIds: [999, 110098140104, 110098100102, 999, 0, 1.5],
    });
    expect(result.groups).toEqual([
      {
        id: "preset:n17-fuyoupao",
        name: "",
        presetId: "n17-fuyoupao",
        damageIds: [110098100102, 110098140104],
      },
      { id: "legacy", name: "", presetId: null, damageIds: [999] },
    ]);
  });

  it("returns no groups for an empty, missing or malformed value", () => {
    expect(normalizeChallengeWatch({ forbiddenDamageIds: [] })).toEqual({
      groups: [],
    });
    expect(normalizeChallengeWatch(undefined)).toEqual({ groups: [] });
    expect(normalizeChallengeWatch("x")).toEqual({ groups: [] });
  });

  it("prefers groups over a stale legacy key and is idempotent", () => {
    const once = normalizeChallengeWatch({
      forbiddenDamageIds: [1, 2],
      groups: [
        { id: "a", name: "Mine", presetId: "", damageIds: [5, 5, -1, 6] },
        { id: "a", damageIds: [7] },
        "junk",
      ],
    });
    expect(once).toEqual({
      groups: [
        { id: "a", name: "Mine", presetId: null, damageIds: [5, 6] },
        { id: "a-2", name: "", presetId: null, damageIds: [7] },
      ],
    });
    expect(normalizeChallengeWatch(once)).toEqual(once);
  });
});

describe("challenge group operations", () => {
  it("collects every forbidden id across groups", () => {
    const ids = collectForbiddenDamageIds([
      group({ id: "a", damageIds: [1, 2] }),
      group({ id: "b", damageIds: [2, 3] }),
    ]);
    expect([...ids]).toEqual([1, 2, 3]);
  });

  it("adds and removes damage ids without duplicates", () => {
    const base = group({ id: "a", damageIds: [1] });
    expect(addGroupDamageIds(base, [1])).toBe(base);
    const added = addGroupDamageIds(base, [2, 1, 3]);
    expect(added.damageIds).toEqual([1, 2, 3]);
    expect(removeGroupDamageIds(added, [2]).damageIds).toEqual([1, 3]);
  });

  it("creates groups with fresh ids and tracks preset membership", () => {
    const a = createChallengeGroup({ presetId: N17.id, damageIds: [1, 1] });
    const b = createChallengeGroup();
    expect(a.id).not.toBe(b.id);
    expect(a.damageIds).toEqual([1]);
    expect(hasPresetGroup([a, b], N17.id)).toBe(true);
    expect(hasPresetGroup([b], N17.id)).toBe(false);
  });

  it("saves a group as a new user preset and links the group to it", () => {
    const builtin = group({
      id: "g",
      presetId: N17.id,
      damageIds: [110098100102],
    });
    const saved = saveGroupAsUserPreset([], builtin, " N17 laser ");
    expect(saved.presets).toHaveLength(1);
    const preset = saved.presets[0]!;
    expect(preset).toMatchObject({
      name: "N17 laser",
      damageIds: [110098100102],
    });
    // Relinked to the user preset, keeping the name it was saved under.
    expect(saved.group).toEqual({
      ...builtin,
      name: "N17 laser",
      presetId: preset.id,
    });

    const edited = addGroupDamageIds(saved.group, [42]);
    const updated = saveGroupAsUserPreset(saved.presets, edited, "N17 laser");
    expect(updated.group).toBe(edited);
    expect(updated.presets).toEqual([
      { id: preset.id, name: "N17 laser", damageIds: [110098100102, 42] },
    ]);
  });

  it("sanitizes the user preset library", () => {
    expect(normalizeChallengePresetLibrary(null)).toEqual({ presets: [] });
    expect(
      normalizeChallengePresetLibrary({
        presets: [{ id: "p", name: 3, damageIds: [4, "5"] }, null],
      }),
    ).toEqual({ presets: [{ id: "p", name: "", damageIds: [4] }] });
  });
});

describe("challenge watch display", () => {
  it("names a group by its own name, then its preset label, then untitled", () => {
    expect(challengeGroupName(group({ id: "a", name: " Mine " }))).toBe("Mine");
    expect(challengeGroupName(group({ id: "a", presetId: N17.id }))).toBe(
      "N17-墓煌·浮游炮",
    );
    expect(challengeGroupName(group({ id: "a" }))).toBe("未命名分组");
  });

  it("labels every damage with its own name and id", () => {
    expect(challengeDamageLabel(120016180102, "zh-CN")).toBe(
      "亡灵远程普攻地火 #120016180102",
    );
    expect(challengeDamageLabel(987654321987, "zh-CN")).toBe("#987654321987");
  });

  it("lists each hit damage under its group with hit counts", () => {
    const groups = [
      group({ id: "n17", presetId: N17.id, damageIds: N17.damageIds }),
      group({ id: "mine", name: "Mine", damageIds: [110098140104, 555] }),
    ];
    const sections = describeForbiddenHits(
      [
        { id: 555, hits: 1 },
        { id: 110098140104, hits: 2 },
        { id: 110098140102, hits: 3 },
        { id: 777, hits: 4 },
      ],
      groups,
      "zh-CN",
    );
    expect(sections).toEqual([
      {
        groupName: "N17-墓煌·浮游炮",
        items: [
          {
            id: 110098140102,
            label: "浮游炮激光直线（诅咒煌墓） #110098140102",
            hits: 3,
          },
          {
            id: 110098140104,
            label: "浮游炮激光直线（诅咒煌墓） #110098140104",
            hits: 2,
          },
        ],
      },
      { groupName: "Mine", items: [{ id: 555, label: "#555", hits: 1 }] },
      { groupName: "未命名分组", items: [{ id: 777, label: "#777", hits: 4 }] },
    ]);
    expect(formatForbiddenHitsTooltip(sections.slice(0, 2))).toBe(
      [
        "受到禁用伤害",
        "N17-墓煌·浮游炮",
        "· 浮游炮激光直线（诅咒煌墓） #110098140102 ×3",
        "· 浮游炮激光直线（诅咒煌墓） #110098140104 ×2",
        "Mine",
        "· #555 ×1",
      ].join("\n"),
    );
  });
});
