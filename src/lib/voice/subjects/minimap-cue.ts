import {
  ensureMechanicVoiceConfigs,
  type MechanicVoiceConfigMap,
} from "$lib/settings-store";
import type {
  VoiceBindingSubject,
  VoiceSubjectAdapter,
} from "../subject-types";

type MinimapCueSubject = Extract<VoiceBindingSubject, { kind: "minimapCue" }>;

export function minimapCueRuleKey(cueId: string): string {
  return `voice:minimapCue:${cueId}`;
}

/**
 * Minimap mechanic cues are judged and played by the HUD itself
 * (`minimap-voice.svelte.ts`), so this adapter only owns configuration,
 * naming and the overview; `runtime: "frontend"` keeps it out of the
 * compiled rule set.
 */
export const minimapCueAdapter: VoiceSubjectAdapter<
  MinimapCueSubject,
  MechanicVoiceConfigMap | null | undefined
> = {
  kind: "minimapCue",
  runtime: "frontend",
  overview: {
    group: "minimap",
    titleKey: "minimap.settings.voiceCues.title",
    navigateKey: "voice.bindings.navigate.minimap",
    route: "/main/minimap",
  },
  ruleKey: (subject) => minimapCueRuleKey(subject.cueId),
  label: (view, subject) => {
    const cue = view.minimapCues.find(
      (candidate) => candidate.id === subject.cueId,
    );
    return cue ? view.t(cue.labelKey) : subject.cueId;
  },
  events: (view, subject) => {
    const cue = view.minimapCues.find(
      (candidate) => candidate.id === subject.cueId,
    );
    return [
      {
        eventKind: "onCast",
        labelKey: "voice.binding.event.onCast",
        expiring: false,
        supportsTierPlaceholder: false,
        autoText: () => cue?.autoText ?? "",
      },
    ];
  },
  readyWithoutPhrase: () => false,
  // Every registered cue is a subject: the overview lists cues in scene
  // order, configured or not (only enabled ones end up shown).
  enumerate: (view) =>
    view.minimapCues.map((cue) => ({ kind: "minimapCue", cueId: cue.id })),
  read: (view, subject, eventKind) =>
    eventKind === "onCast"
      ? ensureMechanicVoiceConfigs(view.mechanicVoiceConfigs)[subject.cueId]
      : undefined,
  write: (writer, subject, eventKind, next) => {
    if (eventKind !== "onCast") return;
    writer.updateMechanicVoiceConfigs((current) => ({
      ...ensureMechanicVoiceConfigs(current),
      [subject.cueId]: next,
    }));
  },
  trigger: () => null,
  language: () => "zhCn",
  gcKeys: (slice) => Object.keys(slice ?? {}).map(minimapCueRuleKey),
};
