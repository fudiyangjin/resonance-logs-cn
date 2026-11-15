/**
 * @file Adapter factory for watched monster skills: a watch list of skills
 * voiced when a monster casts them (`Started` on the backend). The monster
 * skill panel (any nearby monster) and the battle roster (monsters on the
 * roster) differ only in their list, config field, label, overview entry and
 * events — the roster also knows each monster's cooldown, so it can speak
 * ahead of the next cast — so both are built here and cannot drift apart.
 */
import type { VoiceTrigger } from "$lib/bindings";
import type { MessageKey } from "$lib/i18n/index.svelte";
import {
  ensureMonsterSkillVoiceConfigs,
  type RosterSkillVoiceConfig,
} from "$lib/settings-store";
import {
  mergeVoiceConfigPatch,
  type MonsterVoiceSlice,
  type OverviewGroupMeta,
  type VoiceBindingEventKind,
  type VoiceBindingSubject,
  type VoiceBindingView,
  type VoiceSubjectAdapter,
} from "../subject-types";
import { skillAutoText } from "./skill";

type CastSkillKind = "monsterSkill" | "rosterSkill";

type CastSkillSubject = Extract<VoiceBindingSubject, { kind: CastSkillKind }>;

/** Monster-slice fields holding watched-skill voice configs, keyed by skill id. */
type CastSkillVoiceField =
  | "monsterSkillVoiceConfigs"
  | "rosterSkillVoiceConfigs";

/** `onCast`: a monster cast it. `readyIn`: a monster may cast it (again) soon. */
export type CastSkillEventKind = keyof RosterSkillVoiceConfig;

type CastSkillEventDef = {
  labelKey: MessageKey;
  expiring: boolean;
  autoText: (name: string, secondsBefore: number) => string;
  event: (secondsBefore: number) => VoiceTrigger["event"];
};

const EVENT_DEFS: Record<CastSkillEventKind, CastSkillEventDef> = {
  onCast: {
    labelKey: "voice.binding.event.onCast",
    expiring: false,
    autoText: (name) => name,
    event: () => ({ kind: "started" }),
  },
  readyIn: {
    labelKey: "voice.binding.event.readyIn",
    expiring: true,
    autoText: (name, secondsBefore) =>
      skillAutoText(name, "readyIn", secondsBefore),
    event: (secondsBefore) => ({ kind: "expiringIn", secondsBefore }),
  },
};

type CastSkillAdapterSpec<K extends CastSkillKind> = {
  kind: K;
  field: CastSkillVoiceField;
  overview: OverviewGroupMeta;
  /** The events the subject can voice, in display order. */
  events: readonly CastSkillEventKind[];
  /** Skill ids on the watch list: a binding lives exactly as long as its entry. */
  entryIds: (monster: MonsterVoiceSlice) => ReadonlySet<number>;
  label: (view: VoiceBindingView, skillId: number) => string;
};

export function castSkillAdapter<K extends CastSkillKind>(
  spec: CastSkillAdapterSpec<K>,
): VoiceSubjectAdapter<Extract<VoiceBindingSubject, { kind: K }>> {
  const configsOf = (
    monster: Pick<MonsterVoiceSlice, CastSkillVoiceField>,
  ): Record<string, RosterSkillVoiceConfig> =>
    ensureMonsterSkillVoiceConfigs(monster[spec.field]);
  const subjectOf = (skillId: number) =>
    ({ kind: spec.kind, skillId }) as CastSkillSubject;
  const supports = (
    eventKind: VoiceBindingEventKind,
  ): eventKind is CastSkillEventKind =>
    (spec.events as readonly VoiceBindingEventKind[]).includes(eventKind);

  const adapter: VoiceSubjectAdapter<CastSkillSubject> = {
    kind: spec.kind,
    runtime: "backend",
    overview: spec.overview,
    ruleKey: (subject, eventKind) =>
      `voice:${spec.kind}:${subject.skillId}:${eventKind}`,
    label: (view, subject) => spec.label(view, subject.skillId),
    events: (view, subject) => {
      const name = spec.label(view, subject.skillId);
      return spec.events.map((eventKind) => {
        const def = EVENT_DEFS[eventKind];
        return {
          eventKind,
          labelKey: def.labelKey,
          expiring: def.expiring,
          supportsTierPlaceholder: false,
          autoText: (secondsBefore: number) =>
            def.autoText(name, secondsBefore),
        };
      });
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
      supports(eventKind)
        ? configsOf(view.monster)[String(subject.skillId)]?.[eventKind]
        : undefined,
    write: (writer, subject, eventKind, next) => {
      if (!supports(eventKind)) return;
      writer.patchMonster((current) => ({
        [spec.field]: mergeVoiceConfigPatch(configsOf(current), {
          [String(subject.skillId)]: { [eventKind]: next },
        }),
      }));
    },
    trigger: (subject, eventKind, secondsBefore) =>
      supports(eventKind)
        ? {
            subject: {
              kind: spec.kind,
              skillId: subject.skillId,
            } as VoiceTrigger["subject"],
            event: EVENT_DEFS[eventKind].event(secondsBefore),
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
