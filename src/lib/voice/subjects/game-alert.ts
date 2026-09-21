import type { AlertKind } from "$lib/bindings";
import type { MessageKey } from "$lib/i18n/index.svelte";
import {
  ensureGameAlertVoiceConfigs,
  GAME_ALERT_KINDS,
  type GameAlertKind,
} from "$lib/settings-store";
import { voiceLanguageForLocale } from "../phrase-key";
import type {
  VoiceBindingSubject,
  VoiceSubjectAdapter,
} from "../subject-types";

type GameAlertSubject = Extract<VoiceBindingSubject, { kind: "gameAlert" }>;

const ALERT_DEFS: Record<
  GameAlertKind,
  { alert: AlertKind; titleKey: MessageKey; autoTextKey: MessageKey }
> = {
  matchReady: {
    alert: "matchmakingPopped",
    titleKey: "voice.alerts.matchReady.title",
    autoTextKey: "voice.alerts.autoText.matchReady",
  },
  readyCheck: {
    alert: "readyCheckStarted",
    titleKey: "voice.alerts.readyCheck.title",
    autoTextKey: "voice.alerts.autoText.readyCheck",
  },
  teamVote: {
    alert: "teamVoteStarted",
    titleKey: "voice.alerts.teamVote.title",
    autoTextKey: "voice.alerts.autoText.teamVote",
  },
};

export function alertRuleKey(kind: GameAlertKind): string {
  return `voice:alert:${kind}`;
}

/**
 * Game alerts (matchmaking popped, ready check, team vote). The app bundles
 * prompt audio for the `auto` binding in every UI language, so an auto
 * binding is playable even before any phrase is generated.
 */
export const gameAlertAdapter: VoiceSubjectAdapter<GameAlertSubject, void> = {
  kind: "gameAlert",
  runtime: "backend",
  overview: {
    group: "alerts",
    titleKey: "voice.alerts.title",
    navigateKey: "voice.bindings.navigate.alerts",
    route: "/main/voice?tab=alerts",
  },
  ruleKey: (subject) => alertRuleKey(subject.alertKind),
  label: (view, subject) => view.t(ALERT_DEFS[subject.alertKind].titleKey),
  events: (view, subject) => [
    {
      eventKind: "onCast",
      labelKey: "voice.alerts.event",
      expiring: false,
      supportsTierPlaceholder: false,
      autoSourceLabelKey: "voice.binding.source.preset",
      autoText: () => view.t(ALERT_DEFS[subject.alertKind].autoTextKey),
    },
  ],
  readyWithoutPhrase: (view, subject, eventKind) =>
    eventKind === "onCast" &&
    ensureGameAlertVoiceConfigs(view.alertConfigs)[subject.alertKind]?.phrase
      .source === "auto",
  enumerate: () =>
    GAME_ALERT_KINDS.map((alertKind) => ({ kind: "gameAlert", alertKind })),
  read: (view, subject, eventKind) =>
    eventKind === "onCast"
      ? ensureGameAlertVoiceConfigs(view.alertConfigs)[subject.alertKind]
      : undefined,
  write: (writer, subject, eventKind, next) => {
    if (eventKind !== "onCast") return;
    writer.updateAlertConfigs((current) => ({
      ...ensureGameAlertVoiceConfigs(current),
      [subject.alertKind]: next,
    }));
  },
  trigger: (subject, eventKind) =>
    eventKind === "onCast"
      ? {
          subject: {
            kind: "alert",
            alert: ALERT_DEFS[subject.alertKind].alert,
          },
          event: { kind: "started" },
        }
      : null,
  // Bundled prompts exist per UI language, so alerts follow the app locale
  // while every other subject stays on the Chinese TTS voice.
  language: (view) => voiceLanguageForLocale(view.locale),
  // Bundled prompt phrases are always kept, configured or not.
  gcKeys: () => GAME_ALERT_KINDS.map(alertRuleKey),
};
