import { describe, expect, it } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  SKILL_DAMAGE_ICON_PRESETS,
  SKILL_ICONS_BY_CLASS,
  TALENT_COMMON_ICONS,
  TALENT_COMMON_TAB,
  TALENT_DAMAGE_ICON_PRESETS,
  iconOwnerClasses,
  initialIconPickerClass,
  presetIconTitle,
  skillDamageIconBackground,
  resolveSkillDamageIcon,
  talentIconNames,
  talentIconSections,
} from "./skill-damage-icons";
import classSkillConfigs from "./config/class_skill_configs.json";
import { TALENT_STAGE_SPECS } from "./config/talent-stages";
import { CLASS_SPEC_MAP } from "./settings-store";

const CLASS_KEYS = Object.keys(classSkillConfigs);
/** `CLASS_SPEC_MAP` class names are the English class names. */
const classKeyOf = (className: string) =>
  className.toLowerCase().replace(/ /g, "_");
const talentPath = (prefix: string) =>
  TALENT_DAMAGE_ICON_PRESETS.find((path) =>
    path.startsWith(`/images/talent/${prefix}_`),
  )!;

describe("skill damage icon presets", () => {
  it("includes all talent icons and resolves them as valid presets", () => {
    const files = readdirSync(resolve("static/images/talent"))
      .filter((name) => /\.(png|webp|jpe?g|svg)$/i.test(name))
      .map((name) => `/images/talent/${name}`)
      .sort();
    expect(TALENT_DAMAGE_ICON_PRESETS).toEqual(files);
    expect(resolveSkillDamageIcon(TALENT_DAMAGE_ICON_PRESETS[0]!)).toBe(
      TALENT_DAMAGE_ICON_PRESETS[0],
    );
  });
  it("applies opacity only to background colors, including gradient stops", () => {
    const paint = {
      mode: "solid" as const,
      color: "#ff0000",
      endColor: "#0000ff",
      angle: 45,
    };
    expect(
      skillDamageIconBackground({
        iconBackground: paint,
        iconBackgroundOpacity: 0,
      }),
    ).toBe("rgba(255, 0, 0, 0)");
    expect(
      skillDamageIconBackground({
        iconBackground: { ...paint, mode: "gradient" },
        iconBackgroundOpacity: 0.5,
      }),
    ).toBe(
      "linear-gradient(45deg, rgba(255, 0, 0, 0.5), rgba(0, 0, 255, 0.5))",
    );
  });
  it("includes every class skill icon in static/images without duplicates", () => {
    const root = resolve("static/images");
    const files = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const dir = resolve(root, entry.name, "skill");
        return existsSync(dir)
          ? readdirSync(dir)
              .filter((name) => /\.(png|webp|jpe?g|svg)$/i.test(name))
              .map((name) => `/images/${entry.name}/skill/${name}`)
          : [];
      })
      .sort();
    expect(SKILL_DAMAGE_ICON_PRESETS).toEqual(files);
    expect(new Set(SKILL_DAMAGE_ICON_PRESETS).size).toBe(files.length);
  });
  it("resolves only valid preset paths and safely falls back for missing icons", () => {
    const preset = SKILL_DAMAGE_ICON_PRESETS[0]!;
    expect(resolveSkillDamageIcon(preset)).toBe(preset);
    expect(resolveSkillDamageIcon("")).toBeNull();
    expect(resolveSkillDamageIcon("/images/missing.png")).toBeNull();
    expect(resolveSkillDamageIcon("https://example.com/image.png")).toBeNull();
  });
});

describe("skill damage icon picker catalog", () => {
  it("groups every class skill icon under a known class", () => {
    const grouped = [...SKILL_ICONS_BY_CLASS.values()].flat();
    expect(grouped.sort()).toEqual([...SKILL_DAMAGE_ICON_PRESETS].sort());
    for (const classKey of SKILL_ICONS_BY_CLASS.keys())
      expect(CLASS_KEYS).toContain(classKey);
    for (const classKey of CLASS_KEYS)
      expect(SKILL_ICONS_BY_CLASS.get(classKey)?.length).toBeGreaterThan(0);
  });

  it("splits talent icons into the class-wide part and the class's own specs", () => {
    for (const classKey of CLASS_KEYS) {
      const sections = talentIconSections(classKey);
      expect(sections.filter((s) => s.stageId === null)).toHaveLength(1);
      const specs = sections.filter((s) => s.stageId !== null);
      expect(specs).toHaveLength(2);
      for (const section of specs) {
        const spec = TALENT_STAGE_SPECS[section.stageId!];
        expect(spec).toBeDefined();
        expect(classKeyOf(CLASS_SPEC_MAP[spec!]!)).toBe(classKey);
      }
      const icons = sections.flatMap((s) => s.icons);
      expect(icons.length).toBeGreaterThan(0);
      expect(new Set(icons).size).toBe(icons.length);
      expect(icons.some((path) => path.includes("/common_"))).toBe(false);
    }
  });

  it("includes the flame berserker talent icons", () => {
    const icons = talentIconSections("flame_berserker").flatMap((s) => s.icons);
    expect(icons.filter((path) => path.includes("/shuangfu"))).toHaveLength(67);
  });

  it("keeps the shared attribute icons in the common tab only", () => {
    expect(TALENT_COMMON_ICONS.length).toBeGreaterThan(0);
    for (const path of TALENT_COMMON_ICONS)
      expect(iconOwnerClasses(path)).toEqual([TALENT_COMMON_TAB]);
  });

  it("reports which tabs an icon appears under", () => {
    const windSkill = SKILL_ICONS_BY_CLASS.get("wind_knight")![0]!;
    expect(iconOwnerClasses(windSkill)).toEqual(["wind_knight"]);
    expect(
      iconOwnerClasses(
        talentPath("talent_passive_icon_general_dps_icenucleus"),
      ),
    ).toEqual(["frost_mage", "wind_knight", "marksman"]);
    expect(iconOwnerClasses("")).toEqual([]);
    expect(iconOwnerClasses("/images/talent/missing.png")).toEqual([]);
  });

  it("opens on the selected icon's class, then the loadout's class, then the first class", () => {
    const windSkill = SKILL_ICONS_BY_CLASS.get("wind_knight")![0]!;
    const shared = talentPath("talent_passive_icon_general_dps_icenucleus");
    const pick = (path: string, linkedStageId: number | null) =>
      initialIconPickerClass({ path, linkedStageId, classKeys: CLASS_KEYS });
    // Selected icon wins over the loadout's spec (101 = Iaido, stormblade).
    expect(pick(windSkill, 101)).toBe("wind_knight");
    // A shared icon opens on the loadout's class when it is one of its owners.
    expect(pick(shared, 107)).toBe("wind_knight");
    expect(pick(shared, 101)).toBe("frost_mage");
    expect(pick(shared, null)).toBe("frost_mage");
    expect(pick(TALENT_COMMON_ICONS[0]!, 101)).toBe(TALENT_COMMON_TAB);
    // No usable icon: the loadout's spec (129 = Blazecrimson) decides.
    expect(pick("", 129)).toBe("flame_berserker");
    expect(pick("", 999)).toBe(CLASS_KEYS[0]);
    expect(pick("", null)).toBe(CLASS_KEYS[0]);
  });

  it("names talent icons per locale and falls back to Chinese", () => {
    const path = talentPath("common_icon05");
    expect(talentIconNames(path, "zh-CN")).toEqual(["力量"]);
    expect(talentIconNames(path, "en-US")).toEqual(["Strength"]);
    expect(presetIconTitle(talentPath("common_icon03"), "zh-CN")).toContain(
      " / ",
    );
    expect(talentIconNames("/images/talent/missing.png", "en-US")).toEqual([]);
  });

  it("names skill icons from the class skill configs", () => {
    const skill = classSkillConfigs.wind_knight.skills[0]!;
    expect(presetIconTitle(skill.imagePath, "zh-CN")).toBe(skill.name);
    const unnamed = SKILL_DAMAGE_ICON_PRESETS.find(
      (path) => !presetIconTitle(path, "zh-CN"),
    );
    expect(unnamed).toBeDefined();
  });
});
