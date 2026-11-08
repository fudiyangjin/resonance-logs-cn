import { monsterSkillDisplayName } from "$lib/config/monster-skill-search";
import { ensureRosterSkillEntries } from "$lib/roster-skill-entries";
import { rosterSkillEntryIds } from "../association";
import { castSkillAdapter } from "./cast-skill";

/**
 * A battle-roster watched skill: a monster on the roster cast it. Named like
 * its roster cell, so the auto line says what the row shows.
 */
export const rosterSkillAdapter = castSkillAdapter({
  kind: "rosterSkill",
  field: "rosterSkillVoiceConfigs",
  overview: {
    group: "rosterSkill",
    titleKey: "monsterMonitor.roster.skills.voiceGroup",
    navigateKey: "voice.bindings.navigate.rosterSkill",
    route: "/main/monster-monitor?tab=roster",
  },
  entryIds: rosterSkillEntryIds,
  label: (view, skillId) =>
    monsterSkillDisplayName(
      ensureRosterSkillEntries(view.monster.rosterSkillEntries).find(
        (entry) => entry.skillId === skillId,
      )?.label,
      skillId,
      view.locale,
    ),
});
