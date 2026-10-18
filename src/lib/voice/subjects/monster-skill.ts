import { lookupMonsterSkillDefaultName } from "$lib/config/monster-skill-search";
import { ensureMonsterSkillEntries } from "$lib/monster-skill-entries";
import {
  ensureMonsterSkillVoiceConfigs,
  type MonsterSkillWatchEntry,
} from "$lib/settings-store";
import { monsterSkillEntryIds } from "../association";
import {
  mergeVoiceConfigPatch,
  type VoiceBindingSubject,
  type VoiceBindingView,
  type VoiceSubjectAdapter,
} from "../subject-types";

type MonsterSkillSubject = Extract<
  VoiceBindingSubject,
  { kind: "monsterSkill" }
>;

/** The watch entry a subject belongs to; `undefined` once it was removed. */
function monsterSkillEntryOf(
  view: VoiceBindingView,
  skillId: number,
): MonsterSkillWatchEntry | undefined {
  return ensureMonsterSkillEntries(view.monster.monsterSkillEntries).find(
    (entry) => entry.skillId === skillId,
  );
}

export function monsterSkillLabel(
  view: VoiceBindingView,
  skillId: number,
): string {
  return (
    monsterSkillEntryOf(view, skillId)?.label.trim() ||
    lookupMonsterSkillDefaultName(skillId, view.locale) ||
    `#${skillId}`
  );
}

export const monsterSkillAdapter: VoiceSubjectAdapter<MonsterSkillSubject> = {
  kind: "monsterSkill",
  runtime: "backend",
  overview: {
    group: "monsterSkill",
    titleKey: "monsterMonitor.monsterSkill.title",
    navigateKey: "voice.bindings.navigate.monsterSkill",
    route: "/main/monster-monitor?tab=monsterSkill",
  },
  ruleKey: (subject, eventKind) =>
    `voice:monsterSkill:${subject.skillId}:${eventKind}`,
  label: (view, subject) => monsterSkillLabel(view, subject.skillId),
  events: (view, subject) => {
    const name = monsterSkillLabel(view, subject.skillId);
    return [
      {
        eventKind: "onCast",
        labelKey: "voice.binding.event.onCast",
        expiring: false,
        supportsTierPlaceholder: false,
        autoText: () => name,
      },
    ];
  },
  readyWithoutPhrase: () => false,
  // A binding lives exactly as long as its watch entry.
  enumerate: (view) => {
    const entries = monsterSkillEntryIds(view.monster);
    return Object.keys(
      ensureMonsterSkillVoiceConfigs(view.monster.monsterSkillVoiceConfigs),
    )
      .map(Number)
      .filter((skillId) => entries.has(skillId))
      .map((skillId) => ({ kind: "monsterSkill", skillId }));
  },
  read: (view, subject, eventKind) => {
    if (eventKind !== "onCast") return undefined;
    return ensureMonsterSkillVoiceConfigs(
      view.monster.monsterSkillVoiceConfigs,
    )[String(subject.skillId)]?.onCast;
  },
  write: (writer, subject, eventKind, next) => {
    if (eventKind !== "onCast") return;
    writer.patchMonster((current) => ({
      monsterSkillVoiceConfigs: mergeVoiceConfigPatch(
        ensureMonsterSkillVoiceConfigs(current.monsterSkillVoiceConfigs),
        { [String(subject.skillId)]: { onCast: next } },
      ),
    }));
  },
  trigger: (subject, eventKind) =>
    eventKind === "onCast"
      ? {
          subject: { kind: "monsterSkill", skillId: subject.skillId },
          event: { kind: "started" },
        }
      : null,
  language: () => "zhCn",
};
