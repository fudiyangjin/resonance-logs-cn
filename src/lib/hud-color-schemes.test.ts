import { describe, expect, it } from "vitest";
import {
  HUD_COLOR_SCHEMES,
  HUD_SCHEME_SWATCHES,
  MONSTER_HUD_PANELS,
  MONSTER_PANEL_STYLE_KEYS,
  SEMANTIC_HUD_PANELS,
  SKILL_HUD_PANELS,
  applySchemeToMonsterStyles,
  applySchemeToSkillStyles,
  getHudColorScheme,
  inferSkillSchemeId,
  listWhitePanels,
  matchesPatch,
  schemePatch,
  type MonsterSchemeStyles,
} from "./hud-color-schemes";
import {
  createDefaultCustomPanelGroup,
  createDefaultMonsterMonitorConfig,
  createDefaultSkillMonitorProfile,
} from "./settings-store";

const HEX = /^#[0-9a-f]{6}$/;

function monsterStyles(): MonsterSchemeStyles {
  const config = createDefaultMonsterMonitorConfig();
  const styles = {} as Record<string, unknown>;
  for (const key of Object.values(MONSTER_PANEL_STYLE_KEYS)) {
    styles[key] = config[key];
  }
  return styles as MonsterSchemeStyles;
}

function skillStyles(groupCount = 3) {
  const profile = createDefaultSkillMonitorProfile();
  return {
    textBuffPanelStyle: profile.textBuffPanelStyle!,
    buffCoverageStyle: profile.buffCoverageStyle!,
    customPanelGroups: Array.from({ length: groupCount }, (_, index) =>
      createDefaultCustomPanelGroup("", index + 1),
    ),
  };
}

describe("HUD color schemes", () => {
  it("define valid colors for every panel", () => {
    for (const scheme of HUD_COLOR_SCHEMES) {
      for (const panel of [...SKILL_HUD_PANELS, ...MONSTER_HUD_PANELS]) {
        const colors = scheme.panels[panel];
        expect(colors.nameColor, `${scheme.id}.${panel}`).toMatch(HEX);
        expect(colors.valueColor).toMatch(HEX);
        expect(colors.progressColor).toMatch(HEX);
        expect(colors.progressOpacity).toBeGreaterThan(0);
        expect(colors.progressOpacity).toBeLessThanOrEqual(1);
      }
      expect(scheme.customGroups.length).toBeGreaterThan(0);
    }
    expect(new Set(HUD_COLOR_SCHEMES.map((scheme) => scheme.id)).size).toBe(
      HUD_COLOR_SCHEMES.length,
    );
  });

  it("keep the vivid semantic colors in every scheme", () => {
    const vivid = getHudColorScheme("vivid");
    for (const scheme of HUD_COLOR_SCHEMES) {
      for (const panel of SEMANTIC_HUD_PANELS) {
        expect(scheme.panels[panel]).toEqual(vivid.panels[panel]);
      }
    }
  });

  it("offer every scheme color as a swatch", () => {
    for (const scheme of HUD_COLOR_SCHEMES) {
      for (const colors of Object.values(scheme.panels)) {
        expect(HUD_SCHEME_SWATCHES).toContain(colors.progressColor);
      }
    }
    expect(new Set(HUD_SCHEME_SWATCHES).size).toBe(HUD_SCHEME_SWATCHES.length);
  });

  it("falls back to vivid for an unknown id", () => {
    expect(getHudColorScheme("nope").id).toBe("vivid");
  });
});

describe("schemePatch", () => {
  const vivid = getHudColorScheme("vivid");

  it("writes only name colors for panels without a bar", () => {
    expect(Object.keys(schemePatch(vivid, "teammateCd"))).toEqual([
      "nameColor",
    ]);
    expect(Object.keys(schemePatch(vivid, "fantasy")).sort()).toEqual([
      "nameColor",
      "valueColor",
    ]);
  });

  it("rotates custom groups by index", () => {
    const groups = vivid.customGroups;
    expect(schemePatch(vivid, "customGroup", 1)).toEqual(groups[1]);
    expect(schemePatch(vivid, "customGroup", groups.length)).toEqual(groups[0]);
    const ice = getHudColorScheme("ice");
    expect(schemePatch(ice, "customGroup", 4)).toEqual(ice.customGroups[0]);
  });
});

describe("applying a scheme", () => {
  it("changes only color keys of skill panels", () => {
    const styles = skillStyles();
    styles.textBuffPanelStyle.fontSize = 22;
    styles.customPanelGroups[1]!.style.gap = 9;
    const result = applySchemeToSkillStyles(styles, getHudColorScheme("ice"));
    expect(result.textBuffPanelStyle.fontSize).toBe(22);
    expect(result.textBuffPanelStyle.displayMode).toBe("modern");
    expect(result.textBuffPanelStyle.progressColor).toBe("#38bdf8");
    expect(result.customPanelGroups[1]!.style.gap).toBe(9);
    expect(result.customPanelGroups[1]!.entries).toBe(
      styles.customPanelGroups[1]!.entries,
    );
    expect(result.customPanelStyle).toBeUndefined();
    // The input is not mutated.
    expect(styles.textBuffPanelStyle.progressColor).toBe("#ffffff");
  });

  it("patches the fallback custom panel style only when present", () => {
    const styles = {
      ...skillStyles(0),
      customPanelStyle: createDefaultCustomPanelGroup("").style,
    };
    const result = applySchemeToSkillStyles(styles, getHudColorScheme("jade"));
    expect(result.customPanelStyle?.progressColor).toBe("#34d399");
  });

  it("changes only color keys of monster panels", () => {
    const styles = monsterStyles();
    styles.teammatePanelStyle.rowHeight = 30;
    const result = applySchemeToMonsterStyles(
      styles,
      getHudColorScheme("violet"),
    );
    expect(result.teammatePanelStyle.rowHeight).toBe(30);
    expect(result.teammatePanelStyle.deadNameColor).toBe("#ef4444");
    expect(result.teammatePanelStyle.progressColor).toBe("#a78bfa");
    expect(result.teammateCdPanelStyle.nameColor).toBe("#ddd6fe");
    expect(result.teammateCdPanelStyle.deadNameColor).toBe("#ef4444");
    expect(result.teammateCdPanelStyle.iconSize).toBe(
      styles.teammateCdPanelStyle.iconSize,
    );
    expect(result.fantasyPanelStyle.progressColor).toBe(
      styles.fantasyPanelStyle.progressColor,
    );
    expect(result.hpPanelStyle.progressColor).toBe("#ef4444");
    expect(result.stunPanelStyle.progressColor).toBe("#60a5fa");
  });
});

describe("matchesPatch", () => {
  it("compares colors case-insensitively and opacity loosely", () => {
    expect(
      matchesPatch(
        { nameColor: "#ABCDEF", progressOpacity: 0.4 },
        { nameColor: "#abcdef", progressOpacity: 0.4000001 },
      ),
    ).toBe(true);
    expect(
      matchesPatch({ nameColor: "#abcdef" }, { nameColor: "#abcdee" }),
    ).toBe(false);
    expect(matchesPatch(undefined, { nameColor: "#abcdef" })).toBe(false);
  });
});

describe("inferSkillSchemeId", () => {
  it("finds the scheme most panels follow", () => {
    for (const scheme of HUD_COLOR_SCHEMES) {
      const applied = applySchemeToSkillStyles(skillStyles(), scheme);
      expect(inferSkillSchemeId(applied)).toBe(scheme.id);
    }
  });

  it("falls back to vivid", () => {
    expect(inferSkillSchemeId(skillStyles())).toBe("vivid");
    expect(inferSkillSchemeId({})).toBe("vivid");
  });
});

describe("listWhitePanels", () => {
  it("lists all-white panels with a bar", () => {
    const white = listWhitePanels(skillStyles(2), monsterStyles());
    expect(white).toEqual([
      "textBuff",
      "customGroup",
      "customGroup",
      "monsterBuff",
      "teammate",
      "hate",
      "entityDuration",
      "monsterSkill",
    ]);
  });

  it("is empty once a scheme is applied", () => {
    const scheme = getHudColorScheme("muted");
    expect(
      listWhitePanels(
        applySchemeToSkillStyles(skillStyles(), scheme),
        applySchemeToMonsterStyles(monsterStyles(), scheme),
      ),
    ).toEqual([]);
  });

  it("counts a missing text-buff style as white", () => {
    expect(listWhitePanels({}, null)).toEqual(["textBuff"]);
    expect(listWhitePanels(null, null)).toEqual([]);
  });
});
