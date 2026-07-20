/**
 * @file Resolves a teammate fantasy (resonance echo) summon's `monsterId` to a
 * display icon.
 *
 * The runtime only reports the summoned monster's `monsterId` (see
 * `TeammateFantasyState` in `$lib/api`), not the resonance skill that
 * summoned it. `fantasy_monster_icons.json` is a best-effort, hand-curated
 * `monsterId -> resonance skill id` map (multiple monster ids, e.g. the
 * goblin king's escort variants, can point at the same skill) so several
 * summoned entities from one cast collapse onto a single icon. Entries with
 * no reliable mapping are intentionally left out and fall back to
 * `FANTASY_PLACEHOLDER_ICON_PATH`, since showing a wrong icon is worse than
 * showing a generic one.
 */
import fantasyMonsterIconsRaw from "$lib/config/fantasy_monster_icons.json";
import { resolveMonsterName } from "$lib/config/game-names";
import { findResonanceSkill } from "$lib/skill-mappings";

const FANTASY_MONSTER_ICONS = fantasyMonsterIconsRaw as Record<string, number>;

/** Generic stand-in used whenever a monsterId has no curated skill mapping. */
export const FANTASY_PLACEHOLDER_ICON_PATH =
  "/images/resonance_skill/skill_aoyi_skill_icon_053.png";

export type FantasyIconInfo = {
  /** The resonance skill id this monster was mapped to, if known. */
  skillId: number | null;
  iconPath: string;
  isPlaceholder: boolean;
};

/**
 * The stable grouping key for a fantasy cast: monster ids that map to the
 * same resonance skill (e.g. a goblin king's several escort types) collapse
 * to that skill's id; unmapped monster ids fall back to their own id so they
 * still get deduplicated per-monster.
 */
export function resolveFantasyCastKey(monsterId: number): string {
  const skillId = FANTASY_MONSTER_ICONS[String(monsterId)];
  return skillId !== undefined ? `skill:${skillId}` : `monster:${monsterId}`;
}

export function resolveFantasyIcon(monsterId: number): FantasyIconInfo {
  const skillId = FANTASY_MONSTER_ICONS[String(monsterId)];
  if (skillId !== undefined) {
    const skill = findResonanceSkill(skillId);
    if (skill) {
      return { skillId, iconPath: skill.imagePath, isPlaceholder: false };
    }
  }
  return {
    skillId: null,
    iconPath: FANTASY_PLACEHOLDER_ICON_PATH,
    isPlaceholder: true,
  };
}

function stripFantasySuffix(name: string): string {
  const separatorIndex = name.indexOf("-");
  return (
    (separatorIndex >= 0 ? name.slice(0, separatorIndex) : name).trim() || name
  );
}

/** A short display name for a fantasy cast, for tooltips/labels. */
export function resolveFantasyDisplayName(monsterId: number): string {
  const skillId = FANTASY_MONSTER_ICONS[String(monsterId)];
  const skillName =
    skillId !== undefined ? findResonanceSkill(skillId)?.name : undefined;
  return skillName ?? stripFantasySuffix(resolveMonsterName(monsterId));
}
