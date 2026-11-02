import { describe, expect, it } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  SKILL_DAMAGE_ICON_PRESETS,
  TALENT_DAMAGE_ICON_PRESETS,
  skillDamageIconBackground,
  resolveSkillDamageIcon,
} from "./skill-damage-icons";

describe("skill damage icon presets", () => {
  it("includes all talent icons and resolves them as valid presets", () => {
    const files = readdirSync(resolve("static/images/talent"))
      .filter((name) => /\.(png|webp|jpe?g|svg)$/i.test(name))
      .map((name) => `/images/talent/${name}`)
      .sort();
    expect(TALENT_DAMAGE_ICON_PRESETS).toEqual(files);
    expect(resolveSkillDamageIcon(TALENT_DAMAGE_ICON_PRESETS[0])).toBe(
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
    expect(resolveSkillDamageIcon(undefined)).toBeNull();
    expect(resolveSkillDamageIcon("/images/missing.png")).toBeNull();
    expect(resolveSkillDamageIcon("https://example.com/image.png")).toBeNull();
  });
});
