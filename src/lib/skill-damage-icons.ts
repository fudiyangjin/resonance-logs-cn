import presets from "./config/skill-icon-presets.json";
import talents from "./config/talent-icon-presets.json";
import type { SkillDamageDisplaySettings } from "./settings-store";
export const SKILL_DAMAGE_ICON_PRESETS: readonly string[] = presets;
export const TALENT_DAMAGE_ICON_PRESETS: readonly string[] = talents;
const presetPaths = new Set([...presets, ...talents]);
export function skillDamageIconBackground(
  config: Pick<
    SkillDamageDisplaySettings,
    "iconBackground" | "iconBackgroundOpacity"
  >,
): string {
  const paint = config.iconBackground ?? {
    mode: "solid",
    color: "#1e232c",
    endColor: "#1e232c",
    angle: 90,
  };
  const value = config.iconBackgroundOpacity ?? 0.9;
  const opacity = Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.9;
  const rgba = (color: string) => {
    const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : "#1e232c";
    return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${opacity})`;
  };
  return paint.mode === "gradient"
    ? `linear-gradient(${Number.isFinite(paint.angle) ? paint.angle : 90}deg, ${rgba(paint.color)}, ${rgba(paint.endColor)})`
    : rgba(paint.color);
}
export function resolveSkillDamageIcon(
  path: string | undefined,
): string | null {
  return path && presetPaths.has(path) ? path : null;
}
