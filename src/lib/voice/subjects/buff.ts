import type { VoiceSubject } from "$lib/bindings";
import { resolveBuffDisplayName } from "$lib/config/buff-name-table";
import {
  ensureBuffVoiceConfigs,
  type BuffVoiceConfig,
  type BuffVoiceConfigMap,
} from "$lib/settings-store";
import {
  mergeVoiceConfigPatch,
  type VoiceBindingEventKind,
  type VoiceBindingSubject,
  type VoiceBindingView,
  type VoiceEventSpec,
  type VoiceSubjectAdapter,
} from "../subject-types";

export type BuffEventKind = "gained" | "expiring" | "lost";

export function isBuffEventKind(
  kind: VoiceBindingEventKind,
): kind is BuffEventKind {
  return kind === "gained" || kind === "expiring" || kind === "lost";
}

export function buffLabel(view: VoiceBindingView, buffId: number): string {
  return resolveBuffDisplayName(buffId, view.buffAliases, view.locale);
}

export function buffAutoText(
  name: string,
  event: BuffEventKind,
  secondsBefore = 5,
): string {
  switch (event) {
    case "gained":
      return `${name}已生效`;
    case "expiring":
      return `${name}还有${secondsBefore}秒失效`;
    case "lost":
      return `${name}已失效`;
  }
}

/** Buff-shaped events shared by `buff` and `monsterBuff`. */
export function buffEventSpecs(
  autoText: (event: BuffEventKind, seconds: number) => string,
): readonly VoiceEventSpec[] {
  return [
    {
      eventKind: "gained",
      labelKey: "voice.binding.event.gained",
      expiring: false,
      supportsTierPlaceholder: true,
      autoText: () => autoText("gained", 0),
    },
    {
      eventKind: "expiring",
      labelKey: "voice.binding.event.expiring",
      expiring: true,
      supportsTierPlaceholder: false,
      autoText: (s) => autoText("expiring", s),
    },
    {
      eventKind: "lost",
      labelKey: "voice.binding.event.lost",
      expiring: false,
      supportsTierPlaceholder: true,
      autoText: () => autoText("lost", 0),
    },
  ];
}

export function buffTrigger(
  subject: VoiceSubject,
  eventKind: VoiceBindingEventKind,
  secondsBefore: number,
) {
  switch (eventKind) {
    case "gained":
      return { subject, event: { kind: "started" as const } };
    case "lost":
      return { subject, event: { kind: "ended" as const } };
    case "expiring":
      return {
        subject,
        event: { kind: "expiringIn" as const, secondsBefore },
      };
    default:
      return null;
  }
}

export function buffConfigIds(
  configs: BuffVoiceConfigMap | null | undefined,
): number[] {
  return Object.keys(ensureBuffVoiceConfigs(configs))
    .map(Number)
    .filter((id) => Number.isInteger(id));
}

export function writeBuffConfig(
  configs: BuffVoiceConfigMap | null | undefined,
  buffId: number,
  eventKind: BuffEventKind,
  next: BuffVoiceConfig[BuffEventKind],
): BuffVoiceConfigMap {
  return mergeVoiceConfigPatch(ensureBuffVoiceConfigs(configs), {
    [String(buffId)]: { [eventKind]: next },
  });
}

type BuffSubject = Extract<VoiceBindingSubject, { kind: "buff" }>;

/** Local buff bindings form their own list, so they are always associated. */
export const buffAdapter: VoiceSubjectAdapter<BuffSubject> = {
  kind: "buff",
  runtime: "backend",
  overview: {
    group: "buff",
    titleKey: "skillMonitor.buff.title",
    navigateKey: "voice.bindings.navigate.buff",
    route: "/main/skill-monitor",
  },
  ruleKey: (subject, eventKind) => `voice:buff:${subject.buffId}:${eventKind}`,
  label: (view, subject) => buffLabel(view, subject.buffId),
  events: (view, subject) => {
    const name = buffLabel(view, subject.buffId);
    return buffEventSpecs((event, s) => buffAutoText(name, event, s));
  },
  readyWithoutPhrase: () => false,
  enumerate: (view) =>
    buffConfigIds(view.skillProfile?.buffVoiceConfigs).map((buffId) => ({
      kind: "buff",
      buffId,
    })),
  read: (view, subject, eventKind) => {
    if (!isBuffEventKind(eventKind)) return undefined;
    const configs = ensureBuffVoiceConfigs(view.skillProfile?.buffVoiceConfigs);
    return configs[String(subject.buffId)]?.[eventKind];
  },
  write: (writer, subject, eventKind, next) => {
    if (!isBuffEventKind(eventKind)) return;
    writer.updateSkillProfile((profile) => ({
      ...profile,
      buffVoiceConfigs: writeBuffConfig(
        profile.buffVoiceConfigs,
        subject.buffId,
        eventKind,
        next,
      ),
    }));
  },
  trigger: (subject, eventKind, secondsBefore) =>
    buffTrigger(
      { kind: "buff", buffId: subject.buffId },
      eventKind,
      secondsBefore,
    ),
  language: () => "zhCn",
};
