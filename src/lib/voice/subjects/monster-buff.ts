import { ensureBuffVoiceConfigs } from "$lib/settings-store";
import { resolveMonsterBuffSourceScope } from "../association";
import type {
  VoiceBindingSubject,
  VoiceSubjectAdapter,
} from "../subject-types";
import {
  buffConfigIds,
  buffEventSpecs,
  buffLabel,
  buffTrigger,
  isBuffEventKind,
  writeBuffConfig,
  type BuffEventKind,
} from "./buff";

export { resolveMonsterBuffSourceScope } from "../association";

export function monsterBuffAutoText(
  name: string,
  event: BuffEventKind,
  secondsBefore = 5,
): string {
  switch (event) {
    case "gained":
      return `目标${name}已生效`;
    case "expiring":
      return `目标${name}还有${secondsBefore}秒失效`;
    case "lost":
      return `目标${name}已失效`;
  }
}

type MonsterBuffSubject = Extract<VoiceBindingSubject, { kind: "monsterBuff" }>;

export const monsterBuffAdapter: VoiceSubjectAdapter<MonsterBuffSubject> = {
  kind: "monsterBuff",
  runtime: "backend",
  overview: {
    group: "monsterBuff",
    titleKey: "monsterMonitor.buff.title",
    navigateKey: "voice.bindings.navigate.monsterBuff",
    route: "/main/monster-monitor?tab=buff",
  },
  ruleKey: (subject, eventKind) =>
    `voice:monsterBuff:${subject.sourceScope}:${subject.buffId}:${eventKind}`,
  label: (view, subject) => buffLabel(view, subject.buffId),
  events: (view, subject) => {
    const name = buffLabel(view, subject.buffId);
    return buffEventSpecs((event, s) => monsterBuffAutoText(name, event, s));
  },
  readyWithoutPhrase: () => false,
  enumerate: (view) =>
    buffConfigIds(view.monster.monsterBuffVoiceConfigs).flatMap((buffId) => {
      const sourceScope = resolveMonsterBuffSourceScope(view.monster, buffId);
      return sourceScope
        ? [{ kind: "monsterBuff" as const, buffId, sourceScope }]
        : [];
    }),
  read: (view, subject, eventKind) => {
    if (!isBuffEventKind(eventKind)) return undefined;
    const configs = ensureBuffVoiceConfigs(
      view.monster.monsterBuffVoiceConfigs,
    );
    return configs[String(subject.buffId)]?.[eventKind];
  },
  write: (writer, subject, eventKind, next) => {
    if (!isBuffEventKind(eventKind)) return;
    writer.patchMonster((current) => ({
      monsterBuffVoiceConfigs: writeBuffConfig(
        current.monsterBuffVoiceConfigs,
        subject.buffId,
        eventKind,
        next,
      ),
    }));
  },
  trigger: (subject, eventKind, secondsBefore) =>
    buffTrigger(
      {
        kind: "monsterBuff",
        buffId: subject.buffId,
        sourceScope: subject.sourceScope,
      },
      eventKind,
      secondsBefore,
    ),
  language: () => "zhCn",
};
