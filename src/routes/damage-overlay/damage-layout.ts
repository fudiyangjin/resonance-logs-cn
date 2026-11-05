/**
 * @file "Reset position/size" for the active skill damage profile's panels,
 * matching the other HUD domains (which reset their active profile).
 */
import { activeSkillDamageProfile } from "$lib/skill-damage-profile.svelte";
import { defaultSkillDamageLayout } from "$lib/skill-damage-settings";

export function resetSkillDamagePositions(): void {
  activeSkillDamageProfile()?.groups.forEach((group, index) => {
    const { x, y } = defaultSkillDamageLayout(index);
    group.layout = { ...group.layout, x, y };
  });
}

export function resetSkillDamageSizes(): void {
  for (const group of activeSkillDamageProfile()?.groups ?? []) {
    group.layout = { ...group.layout, scale: 1 };
  }
}
