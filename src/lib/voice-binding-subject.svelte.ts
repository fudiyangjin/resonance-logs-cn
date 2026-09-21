/**
 * @file Per-subject read+write access to the inline voice bindings, shared
 * by `voice-binding-control.svelte` and the pages that show a "has voice"
 * badge. Thin forwarding over the subject registry in `$lib/voice`.
 */
import type { MessageKey } from "$lib/i18n/index.svelte";
import type { VoiceLanguage } from "$lib/bindings";
import {
  createDefaultVoiceEventConfig,
  createDefaultVoiceExpiringEventConfig,
  type VoiceEventConfig,
  type VoiceExpiringEventConfig,
} from "$lib/settings-store";
import { adapterFor } from "$lib/voice/registry";
import type {
  VoiceBindingEventKind,
  VoiceBindingSubject,
} from "$lib/voice/subject-types";
import { buildVoiceBindingView, SETTINGS_WRITER } from "$lib/voice/view";

export type { VoiceBindingEventKind, VoiceBindingSubject };

export type VoiceBindingEventDef = {
  key: string;
  eventKind: VoiceBindingEventKind;
  labelKey: MessageKey;
  expiring: boolean;
  config: VoiceEventConfig | VoiceExpiringEventConfig | undefined;
  autoText: (secondsBefore: number) => string;
  language?: VoiceLanguage;
  /** Label for `phrase.source === "auto"`. Alerts use bundled presets. */
  autoSourceLabelKey?: MessageKey;
  /** Whether custom text may use the `${阶数}` / `${remodelLevel}` placeholder. */
  supportsTierPlaceholder: boolean;
};

function defaultEventConfig(
  expiring: boolean,
): VoiceEventConfig | VoiceExpiringEventConfig {
  return expiring
    ? createDefaultVoiceExpiringEventConfig()
    : createDefaultVoiceEventConfig();
}

export function subjectLabel(subject: VoiceBindingSubject): string {
  return adapterFor(subject).label(buildVoiceBindingView(), subject);
}

/** The events configurable for `subject`, in display order. */
export function subjectEvents(
  subject: VoiceBindingSubject,
): VoiceBindingEventDef[] {
  const adapter = adapterFor(subject);
  const view = buildVoiceBindingView();
  const language = adapter.language(view);
  return adapter.events(view, subject).map((spec) => ({
    key: adapter.ruleKey(subject, spec.eventKind),
    eventKind: spec.eventKind,
    labelKey: spec.labelKey,
    expiring: spec.expiring,
    config: adapter.read(view, subject, spec.eventKind),
    autoText: spec.autoText,
    language,
    ...(spec.autoSourceLabelKey
      ? { autoSourceLabelKey: spec.autoSourceLabelKey }
      : {}),
    supportsTierPlaceholder: spec.supportsTierPlaceholder,
  }));
}

/** Whether `subject` has at least one enabled event bound. */
export function subjectHasBindings(subject: VoiceBindingSubject): boolean {
  return subjectEvents(subject).some((event) => event.config?.enabled);
}

export function updateSubjectEvent(
  subject: VoiceBindingSubject,
  eventKind: VoiceBindingEventKind,
  patch: Partial<VoiceEventConfig & VoiceExpiringEventConfig>,
): void {
  const adapter = adapterFor(subject);
  const view = buildVoiceBindingView();
  const current = adapter.read(view, subject, eventKind);
  const expiring =
    adapter.events(view, subject).find((spec) => spec.eventKind === eventKind)
      ?.expiring ?? false;
  adapter.write(SETTINGS_WRITER, subject, eventKind, {
    ...(current ?? defaultEventConfig(expiring)),
    ...patch,
  });
}
