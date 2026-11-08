/**
 * @file Adapter factory for cast-only skill subjects: a watch list of skills
 * whose single voice event is "cast" (`Started` on the backend). The monster
 * skill panel (any nearby monster) and the battle roster (monsters on the
 * roster) differ only in their list, config field, label and overview entry,
 * so both are built here and cannot drift apart.
 */
import type { VoiceTrigger } from "$lib/bindings";
import { ensureMonsterSkillVoiceConfigs } from "$lib/settings-store";
import {
  mergeVoiceConfigPatch,
  type MonsterVoiceSlice,
  type OverviewGroupMeta,
  type VoiceBindingSubject,
  type VoiceBindingView,
  type VoiceSubjectAdapter,
} from "../subject-types";

type CastSkillKind = "monsterSkill" | "rosterSkill";

type CastSkillSubject = Extract<VoiceBindingSubject, { kind: CastSkillKind }>;

/** Monster-slice fields holding cast-skill voice configs, keyed by skill id. */
type CastSkillVoiceField =
  | "monsterSkillVoiceConfigs"
  | "rosterSkillVoiceConfigs";

type CastSkillAdapterSpec<K extends CastSkillKind> = {
  kind: K;
  field: CastSkillVoiceField;
  overview: OverviewGroupMeta;
  /** Skill ids on the watch list: a binding lives exactly as long as its entry. */
  entryIds: (monster: MonsterVoiceSlice) => ReadonlySet<number>;
  label: (view: VoiceBindingView, skillId: number) => string;
};

export function castSkillAdapter<K extends CastSkillKind>(
  spec: CastSkillAdapterSpec<K>,
): VoiceSubjectAdapter<Extract<VoiceBindingSubject, { kind: K }>> {
  const configsOf = (monster: Pick<MonsterVoiceSlice, CastSkillVoiceField>) =>
    ensureMonsterSkillVoiceConfigs(monster[spec.field]);
  const subjectOf = (skillId: number) =>
    ({ kind: spec.kind, skillId }) as CastSkillSubject;

  const adapter: VoiceSubjectAdapter<CastSkillSubject> = {
    kind: spec.kind,
    runtime: "backend",
    overview: spec.overview,
    ruleKey: (subject, eventKind) =>
      `voice:${spec.kind}:${subject.skillId}:${eventKind}`,
    label: (view, subject) => spec.label(view, subject.skillId),
    events: (view, subject) => {
      const name = spec.label(view, subject.skillId);
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
    enumerate: (view) => {
      const entries = spec.entryIds(view.monster);
      return Object.keys(configsOf(view.monster))
        .map(Number)
        .filter((skillId) => entries.has(skillId))
        .map(subjectOf);
    },
    read: (view, subject, eventKind) =>
      eventKind === "onCast"
        ? configsOf(view.monster)[String(subject.skillId)]?.onCast
        : undefined,
    write: (writer, subject, eventKind, next) => {
      if (eventKind !== "onCast") return;
      writer.patchMonster((current) => {
        const patch: Partial<Pick<MonsterVoiceSlice, CastSkillVoiceField>> = {};
        patch[spec.field] = mergeVoiceConfigPatch(configsOf(current), {
          [String(subject.skillId)]: { onCast: next },
        });
        return patch;
      });
    },
    trigger: (subject, eventKind) =>
      eventKind === "onCast"
        ? {
            subject: {
              kind: spec.kind,
              skillId: subject.skillId,
            } as VoiceTrigger["subject"],
            event: { kind: "started" },
          }
        : null,
    language: () => "zhCn",
  };
  // Every subject the adapter produces or receives has `kind === spec.kind`;
  // TypeScript cannot narrow the union by a generic `K` on its own.
  return adapter as unknown as VoiceSubjectAdapter<
    Extract<VoiceBindingSubject, { kind: K }>
  >;
}
