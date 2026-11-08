import { monsterSkillDisplayName } from "$lib/config/monster-skill-search";
import { ensureMonsterSkillEntries } from "$lib/monster-skill-entries";
import { monsterSkillEntryIds } from "../association";
import { castSkillAdapter } from "./cast-skill";

/** A monster-skill panel entry: any nearby monster cast the skill. */
export const monsterSkillAdapter = castSkillAdapter({
  kind: "monsterSkill",
  field: "monsterSkillVoiceConfigs",
  overview: {
    group: "monsterSkill",
    titleKey: "monsterMonitor.monsterSkill.title",
    navigateKey: "voice.bindings.navigate.monsterSkill",
    route: "/main/monster-monitor?tab=monsterSkill",
  },
  entryIds: monsterSkillEntryIds,
  label: (view, skillId) =>
    monsterSkillDisplayName(
      ensureMonsterSkillEntries(view.monster.monsterSkillEntries).find(
        (entry) => entry.skillId === skillId,
      )?.label,
      skillId,
      view.locale,
    ),
});
