import presets from "./config/skill-icon-presets.json";
import talents from "./config/talent-icon-presets.json";
import type { SkillDamageGroup } from "./skill-damage-settings";

export const SKILL_DAMAGE_ICON_PRESETS: readonly string[] = presets;
export const TALENT_DAMAGE_ICON_PRESETS: readonly string[] = talents;
const presetPaths = new Set([...presets, ...talents]);

/** Icon plate background with the group's opacity applied to every stop. */
export function skillDamageIconBackground(
  group: Pick<SkillDamageGroup, "iconBackground" | "iconBackgroundOpacity">,
): string {
  const paint = group.iconBackground;
  const rgba = (color: string) =>
    `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, ${group.iconBackgroundOpacity})`;
  return paint.mode === "gradient"
    ? `linear-gradient(${paint.angle}deg, ${rgba(paint.color)}, ${rgba(paint.endColor)})`
    : rgba(paint.color);
}

export function resolveSkillDamageIcon(path: string): string | null {
  return presetPaths.has(path) ? path : null;
}
