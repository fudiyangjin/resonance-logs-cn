import classes from "./config/class_skill_configs.json";
import templates from "./config/counter_source_templates.json";
import type {
  SkillDamageGroup,
  SkillDamageProfile,
} from "./skill-damage-settings";

// Use the same base skill ids as the counter sources, not damage-effect ids.
const raySource = templates.find(
  (item) => item.sourceId === "frost_mage_x6",
)?.source;
const ray =
  raySource && !Array.isArray(raySource) && "skillDurationTick" in raySource
    ? raySource.skillDurationTick?.skillBaseId
    : undefined;
export function castPresetSkillIds(group: SkillDamageGroup): number[] {
  switch (group.continuousCastPreset) {
    case "ray":
      return ray ? [ray] : [];
    case "infusion":
      return classes.verdant_oracle.skills
        .filter((skill) => skill.skillId === 1520)
        .map((skill) => skill.skillId);
  }
}
export function watchedSkillDamageCastIds(
  profile: SkillDamageProfile | null | undefined,
): number[] {
  if (!profile?.enabled) return [];
  return [
    ...new Set(
      profile.groups
        .filter(
          (group) =>
            group.enabled &&
            group.displayMode === "continuous" &&
            group.continuousWindowMode === "cast",
        )
        .flatMap(castPresetSkillIds),
    ),
  ].sort((a, b) => a - b);
}
