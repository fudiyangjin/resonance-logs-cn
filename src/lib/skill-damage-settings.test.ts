import { describe, expect, it } from "vitest";
import {
  createSkillDamageGroup,
  createSkillDamageProfile,
  isValidSkillDamageFontDataUrl,
  mergeSkillDamageFonts,
  normalizeSkillDamageGroup,
  normalizeSkillDamageState,
  skillDamageFontId,
  watchedSkillDamageKeys,
} from "./skill-damage-settings";

describe("skill damage settings normalization", () => {
  it("always keeps one profile, each starting with an editable group", () => {
    for (const input of [undefined, null, {}, { profiles: [] }]) {
      const state = normalizeSkillDamageState(input);
      expect(state.profiles).toHaveLength(1);
      expect(state.profiles[0]!.groups).toHaveLength(1);
      expect(state.profiles[0]!.enabled).toBe(false);
    }
  });

  it("drops duplicate profile and group ids", () => {
    const profile = createSkillDamageProfile("A");
    const group = profile.groups[0]!;
    profile.groups = [group, { ...group }];
    const state = normalizeSkillDamageState({ profiles: [profile, profile] });
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]!.groups).toHaveLength(1);
  });

  it("clamps ranges and replaces invalid values with defaults", () => {
    const group = normalizeSkillDamageGroup({
      id: "g",
      entries: [
        { skillId: 5, alias: "a" },
        { skillId: 5, alias: "duplicate" },
        { skillId: -1, alias: "negative" },
        { skillId: 1.5 },
        "junk",
      ],
      maxVisible: 20,
      durationMs: 5,
      labelMode: "sideways",
      fontWeight: 450,
      fontSize: 1000,
      iconBackground: { mode: "gradient", color: "#abcdef", endColor: "red" },
      numberStyle: { outlineWidth: -3, fill: { color: "nope" } },
      layout: { x: 12, y: Number.NaN, scale: 10 },
    });
    expect(group.id).toBe("g");
    expect(group.entries).toEqual([{ skillId: 5, alias: "a" }]);
    expect(group.maxVisible).toBe(8);
    expect(group.durationMs).toBe(100);
    expect(group.labelMode).toBe("text");
    expect(group.fontWeight).toBe(700);
    expect(group.fontSize).toBe(120);
    expect(group.iconBackground).toMatchObject({
      mode: "gradient",
      color: "#abcdef",
      endColor: "#abcdef",
    });
    expect(group.numberStyle.outlineWidth).toBe(0);
    expect(group.numberStyle.fill.color).toBe("#ffd86b");
    expect(group.layout).toEqual({ x: 12, y: 300, scale: 2.5 });
  });

  it("staggers new groups so they do not overlap", () => {
    expect(createSkillDamageGroup("", 0).layout.y).not.toBe(
      createSkillDamageGroup("", 1).layout.y,
    );
  });
});

describe("watchedSkillDamageKeys", () => {
  it("collects enabled groups of an enabled profile, deduplicated and sorted", () => {
    const profile = createSkillDamageProfile("");
    const first = profile.groups[0]!;
    first.entries = [
      { skillId: 30, alias: "" },
      { skillId: 10, alias: "" },
    ];
    const second = createSkillDamageGroup("", 1);
    second.entries = [{ skillId: 10, alias: "" }];
    const disabled = createSkillDamageGroup("", 2);
    disabled.enabled = false;
    disabled.entries = [{ skillId: 99, alias: "" }];
    profile.groups = [first, second, disabled];

    expect(watchedSkillDamageKeys(profile)).toEqual([]);
    profile.enabled = true;
    expect(watchedSkillDamageKeys(profile)).toEqual([10, 30]);
    expect(watchedSkillDamageKeys(null)).toEqual([]);
  });
});

describe("skill damage fonts", () => {
  const url = "data:font/woff2;base64,AAAA";

  it("identifies fonts by content", () => {
    expect(skillDamageFontId(url)).toBe(skillDamageFontId(url));
    expect(skillDamageFontId(url)).not.toBe(skillDamageFontId(`${url}B`));
    expect(skillDamageFontId(url)).toMatch(/^font_[0-9a-f]{16}$/);
  });

  it("stores each font once", () => {
    const font = { id: skillDamageFontId(url), name: "A", dataUrl: url };
    expect(mergeSkillDamageFonts([font], [{ ...font, name: "B" }])).toEqual([
      font,
    ]);
  });

  it("accepts only base64 data URLs", () => {
    expect(isValidSkillDamageFontDataUrl(url)).toBe(true);
    expect(isValidSkillDamageFontDataUrl("https://example.com/a.woff2")).toBe(
      false,
    );
    expect(isValidSkillDamageFontDataUrl(42)).toBe(false);
  });
});
