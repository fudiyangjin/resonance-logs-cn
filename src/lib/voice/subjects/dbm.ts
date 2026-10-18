import { lookupDbmDefaultName } from "$lib/config/dbm-table";
import {
  ensureDbmVoiceConfigs,
  type DbmVoiceConfig,
  type DbmVoiceConfigMap,
} from "$lib/settings-store";
import { dbmEntryIds } from "../association";
import {
  mergeVoiceConfigPatch,
  type VoiceBindingEventKind,
  type VoiceBindingSubject,
  type VoiceBindingView,
  type VoiceSubjectAdapter,
} from "../subject-types";

export type DbmEventKind = "onCast" | "expiring";

function isDbmEventKind(kind: VoiceBindingEventKind): kind is DbmEventKind {
  return kind === "onCast" || kind === "expiring";
}

export function dbmLabel(view: VoiceBindingView, baseSkillId: number): string {
  const alias = view.monster.dbmAliases?.[String(baseSkillId)];
  return (
    alias?.trim() || lookupDbmDefaultName(baseSkillId) || `#${baseSkillId}`
  );
}

export function dbmAutoText(
  name: string,
  event: DbmEventKind,
  secondsBefore = 5,
): string {
  return event === "onCast" ? name : `${name}还有${secondsBefore}秒`;
}

function writeDbmConfig(
  configs: DbmVoiceConfigMap | null | undefined,
  baseSkillId: number,
  eventKind: DbmEventKind,
  next: DbmVoiceConfig[DbmEventKind],
): DbmVoiceConfigMap {
  return mergeVoiceConfigPatch(ensureDbmVoiceConfigs(configs), {
    [String(baseSkillId)]: { [eventKind]: next },
  });
}

type DbmSubject = Extract<VoiceBindingSubject, { kind: "dbm" }>;

export const dbmAdapter: VoiceSubjectAdapter<DbmSubject> = {
  kind: "dbm",
  runtime: "backend",
  overview: {
    group: "dbm",
    titleKey: "monsterMonitor.bossDbm.title",
    navigateKey: "voice.bindings.navigate.dbm",
    route: "/main/monster-monitor?tab=bossDbm",
  },
  ruleKey: (subject, eventKind) =>
    `voice:dbm:${subject.baseSkillId}:${eventKind}`,
  label: (view, subject) => dbmLabel(view, subject.baseSkillId),
  events: (view, subject) => {
    const name = dbmLabel(view, subject.baseSkillId);
    return [
      {
        eventKind: "onCast",
        labelKey: "voice.binding.event.onCast",
        expiring: false,
        supportsTierPlaceholder: false,
        autoText: () => dbmAutoText(name, "onCast"),
      },
      {
        eventKind: "expiring",
        labelKey: "voice.binding.event.expiring",
        expiring: true,
        supportsTierPlaceholder: false,
        autoText: (s) => dbmAutoText(name, "expiring", s),
      },
    ];
  },
  readyWithoutPhrase: () => false,
  // The DBM list is the alias list: a binding lives as long as its entry.
  enumerate: (view) => {
    const entries = dbmEntryIds(view.monster);
    return Object.keys(ensureDbmVoiceConfigs(view.monster.dbmVoiceConfigs))
      .map(Number)
      .filter((id) => Number.isInteger(id) && entries.has(id))
      .map((baseSkillId) => ({ kind: "dbm", baseSkillId }));
  },
  read: (view, subject, eventKind) => {
    if (!isDbmEventKind(eventKind)) return undefined;
    const configs = ensureDbmVoiceConfigs(view.monster.dbmVoiceConfigs);
    return configs[String(subject.baseSkillId)]?.[eventKind];
  },
  write: (writer, subject, eventKind, next) => {
    if (!isDbmEventKind(eventKind)) return;
    writer.patchMonster((current) => ({
      dbmVoiceConfigs: writeDbmConfig(
        current.dbmVoiceConfigs,
        subject.baseSkillId,
        eventKind,
        next,
      ),
    }));
  },
  trigger: (subject, eventKind, secondsBefore) => {
    const voiceSubject = {
      kind: "bossDbm" as const,
      baseSkillId: subject.baseSkillId,
    };
    switch (eventKind) {
      case "onCast":
        return { subject: voiceSubject, event: { kind: "started" } };
      case "expiring":
        return {
          subject: voiceSubject,
          event: { kind: "expiringIn", secondsBefore },
        };
      default:
        return null;
    }
  },
  language: () => "zhCn",
};
