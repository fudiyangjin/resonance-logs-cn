import type { VoiceSubject } from "$lib/bindings";
import {
  ensureSkillVoiceConfigs,
  type SkillVoiceConfig,
  type SkillVoiceConfigMap,
} from "$lib/settings-store";
import { findAnySkillByBaseId } from "$lib/skill-mappings";
import {
  mergeVoiceConfigPatch,
  type SkillProfileVoiceSlice,
  type VoiceBindingEventKind,
  type VoiceBindingSubject,
  type VoiceBindingView,
  type VoiceEventSpec,
  type VoiceSubjectAdapter,
} from "../subject-types";

export type SkillEventKind = "cast" | "ready" | "readyIn";
export const SKILL_EVENTS: readonly SkillEventKind[] = [
  "cast",
  "ready",
  "readyIn",
];

export function isSkillEventKind(
  kind: VoiceBindingEventKind,
): kind is SkillEventKind {
  return kind === "cast" || kind === "ready" || kind === "readyIn";
}

export function skillLabel(view: VoiceBindingView, skillId: number): string {
  const classKey = view.skillProfile?.selectedClass ?? "";
  return (
    findAnySkillByBaseId(classKey, skillId, view.locale)?.name?.trim() ||
    `#${skillId}`
  );
}

export function skillAutoText(
  name: string,
  event: SkillEventKind,
  secondsBefore = 5,
): string {
  switch (event) {
    case "cast":
      return `${name}已释放`;
    case "ready":
      return `${name}已就绪`;
    case "readyIn":
      return `${name}还有${secondsBefore}秒就绪`;
  }
}

export function skillEventSpecs(
  autoText: (event: SkillEventKind, seconds: number) => string,
): readonly VoiceEventSpec[] {
  return [
    {
      eventKind: "cast",
      labelKey: "voice.binding.event.cast",
      expiring: false,
      supportsTierPlaceholder: false,
      autoText: () => autoText("cast", 0),
    },
    {
      eventKind: "ready",
      labelKey: "voice.binding.event.ready",
      expiring: false,
      supportsTierPlaceholder: false,
      autoText: () => autoText("ready", 0),
    },
    {
      eventKind: "readyIn",
      labelKey: "voice.binding.event.readyIn",
      expiring: true,
      supportsTierPlaceholder: false,
      autoText: (s) => autoText("readyIn", s),
    },
  ];
}

export function skillConfigIds(
  configs: SkillVoiceConfigMap | null | undefined,
): number[] {
  return Object.keys(ensureSkillVoiceConfigs(configs))
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

function writeSkillConfig(
  configs: SkillVoiceConfigMap | null | undefined,
  skillId: number,
  eventKind: SkillEventKind,
  next: SkillVoiceConfig[SkillEventKind],
): SkillVoiceConfigMap {
  return mergeVoiceConfigPatch(ensureSkillVoiceConfigs(configs), {
    [String(skillId)]: { [eventKind]: next },
  });
}

type SkillSubject = Extract<VoiceBindingSubject, { kind: "skill" }>;

export const skillAdapter: VoiceSubjectAdapter<
  SkillSubject,
  SkillProfileVoiceSlice
> = {
  kind: "skill",
  runtime: "backend",
  overview: {
    group: "skill",
    titleKey: "skillMonitor.tabs.skillCd",
    navigateKey: "voice.bindings.navigate.skill",
    route: "/main/skill-monitor",
  },
  ruleKey: (subject, eventKind) =>
    `voice:skill:${subject.skillId}:${eventKind}`,
  label: (view, subject) => skillLabel(view, subject.skillId),
  events: (view, subject) => {
    const name = skillLabel(view, subject.skillId);
    return skillEventSpecs((event, s) => skillAutoText(name, event, s));
  },
  readyWithoutPhrase: () => false,
  enumerate: (view) =>
    skillConfigIds(view.skillProfile?.skillVoiceConfigs).map((skillId) => ({
      kind: "skill",
      skillId,
    })),
  read: (view, subject, eventKind) => {
    if (!isSkillEventKind(eventKind)) return undefined;
    const configs = ensureSkillVoiceConfigs(
      view.skillProfile?.skillVoiceConfigs,
    );
    return configs[String(subject.skillId)]?.[eventKind];
  },
  write: (writer, subject, eventKind, next) => {
    if (!isSkillEventKind(eventKind)) return;
    writer.updateSkillProfile((profile) => ({
      ...profile,
      skillVoiceConfigs: writeSkillConfig(
        profile.skillVoiceConfigs,
        subject.skillId,
        eventKind,
        next,
      ),
    }));
  },
  trigger: (subject, eventKind, secondsBefore) => {
    const voiceSubject: VoiceSubject = {
      kind: "skill",
      skillId: subject.skillId,
    };
    switch (eventKind) {
      case "cast":
        return { subject: voiceSubject, event: { kind: "started" } };
      case "ready":
        return { subject: voiceSubject, event: { kind: "ended" } };
      case "readyIn":
        return {
          subject: voiceSubject,
          event: { kind: "expiringIn", secondsBefore },
        };
      default:
        return null;
    }
  },
  language: () => "zhCn",
  gcKeys: (slice) =>
    Object.keys(slice.skillVoiceConfigs ?? {}).flatMap((idText) =>
      SKILL_EVENTS.map((event) => `voice:skill:${Number(idText)}:${event}`),
    ),
};
