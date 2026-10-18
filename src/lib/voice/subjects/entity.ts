import type { VoiceSubject } from "$lib/bindings";
import { ensureEntityDurationEntries } from "$lib/entity-duration-entries";
import {
  ensureEntityVoiceConfigs,
  entityVoiceConfigKey,
  parseEntityVoiceConfigKey,
  type EntityDurationEntry,
  type EntityVoiceConfig,
  type EntityVoiceConfigMap,
} from "$lib/settings-store";
import {
  entityVoiceConfigFor,
  entityVoiceEvents,
  type EntityEventKind,
} from "../association";
import {
  mergeVoiceConfigPatch,
  type MonsterVoiceSlice,
  type VoiceBindingEventKind,
  type VoiceBindingSubject,
  type VoiceBindingView,
  type VoiceEventSpec,
  type VoiceSubjectAdapter,
} from "../subject-types";

export type { EntityEventKind } from "../association";

export function isEntityEventKind(
  kind: VoiceBindingEventKind,
): kind is EntityEventKind {
  return kind === "appeared" || kind === "expiring" || kind === "gone";
}

type EntitySubject = Extract<VoiceBindingSubject, { kind: "entity" }>;

/** The watch entry a subject belongs to; `undefined` once it was removed. */
export function entityEntryOf(
  view: VoiceBindingView,
  subject: Pick<EntitySubject, "monsterId">,
): EntityDurationEntry | undefined {
  return ensureEntityDurationEntries(view.monster.entityDurationEntries).find(
    (entry) => entry.monsterId === subject.monsterId,
  );
}

export function entityLabel(
  view: VoiceBindingView,
  subject: EntitySubject,
): string {
  return entityEntryOf(view, subject)?.label.trim() || `#${subject.monsterId}`;
}

export function entityAutoText(
  name: string,
  event: EntityEventKind,
  secondsBefore = 5,
): string {
  switch (event) {
    case "appeared":
      return `${name}已出现`;
    case "expiring":
      return `${name}还有${secondsBefore}秒消失`;
    case "gone":
      return `${name}已消失`;
  }
}

const ENTITY_EVENT_SPECS: Record<
  EntityEventKind,
  Omit<VoiceEventSpec, "autoText">
> = {
  appeared: {
    eventKind: "appeared",
    labelKey: "voice.binding.event.appeared",
    expiring: false,
    supportsTierPlaceholder: false,
  },
  expiring: {
    eventKind: "expiring",
    labelKey: "voice.binding.event.expiring",
    expiring: true,
    supportsTierPlaceholder: false,
  },
  gone: {
    eventKind: "gone",
    labelKey: "voice.binding.event.gone",
    expiring: false,
    supportsTierPlaceholder: false,
  },
};

/** Specs of `events`; `expiring` only exists for entries with a duration. */
export function entityEventSpecs(
  autoText: (event: EntityEventKind, seconds: number) => string,
  events: readonly EntityEventKind[],
): readonly VoiceEventSpec[] {
  return events.map((event) => ({
    ...ENTITY_EVENT_SPECS[event],
    autoText: (seconds: number) => autoText(event, seconds),
  }));
}

/**
 * Writes one event under the canonical key, starting from the entry's
 * effective config so events still stored under a pre-rekey key carry over.
 */
function writeEntityConfig(
  current: Pick<
    MonsterVoiceSlice,
    "entityVoiceConfigs" | "entityDurationEntries"
  >,
  subject: EntitySubject,
  eventKind: EntityEventKind,
  next: EntityVoiceConfig[EntityEventKind],
): EntityVoiceConfigMap {
  const configs = ensureEntityVoiceConfigs(current.entityVoiceConfigs);
  const entry =
    ensureEntityDurationEntries(current.entityDurationEntries).find(
      (candidate) => candidate.monsterId === subject.monsterId,
    ) ?? subject;
  return mergeVoiceConfigPatch(configs, {
    [entityVoiceConfigKey(subject.monsterId)]: {
      ...entityVoiceConfigFor(configs, entry),
      [eventKind]: next,
    },
  });
}

export const entityAdapter: VoiceSubjectAdapter<EntitySubject> = {
  kind: "entity",
  runtime: "backend",
  overview: {
    group: "entity",
    titleKey: "monsterMonitor.entityDuration.title",
    navigateKey: "voice.bindings.navigate.entity",
    route: "/main/monster-monitor?tab=entityDuration",
  },
  // Scope-less: re-scoping the entry keeps the binding's phrases (the
  // backend renamed pre-rekey names, `phrase_name.rs::current_rule_name`).
  ruleKey: (subject, eventKind) =>
    `voice:entity:${subject.monsterId}:${eventKind}`,
  label: entityLabel,
  events: (view, subject) => {
    const entry = entityEntryOf(view, subject);
    if (!entry) return [];
    const name = entityLabel(view, subject);
    return entityEventSpecs(
      (event, s) => entityAutoText(name, event, s),
      entityVoiceEvents(entry),
    );
  },
  readyWithoutPhrase: () => false,
  // A binding lives exactly as long as its watch entry; the subject takes
  // the entry's current scope.
  enumerate: (view) => {
    const configs = ensureEntityVoiceConfigs(view.monster.entityVoiceConfigs);
    const monsterIds = new Set(
      Object.keys(configs).flatMap((key) => {
        const parsed = parseEntityVoiceConfigKey(key);
        return parsed ? [parsed.monsterId] : [];
      }),
    );
    return ensureEntityDurationEntries(view.monster.entityDurationEntries)
      .filter((entry) => monsterIds.has(entry.monsterId))
      .map((entry) => ({
        kind: "entity" as const,
        monsterId: entry.monsterId,
        scope: entry.scope,
      }));
  },
  read: (view, subject, eventKind) => {
    if (!isEntityEventKind(eventKind)) return undefined;
    const entry = entityEntryOf(view, subject) ?? subject;
    return entityVoiceConfigFor(view.monster.entityVoiceConfigs, entry)?.[
      eventKind
    ];
  },
  write: (writer, subject, eventKind, next) => {
    if (!isEntityEventKind(eventKind)) return;
    writer.patchMonster((current) => ({
      entityVoiceConfigs: writeEntityConfig(current, subject, eventKind, next),
    }));
  },
  trigger: (subject, eventKind, secondsBefore) => {
    const voiceSubject: VoiceSubject = {
      kind: "entity",
      monsterId: subject.monsterId,
      scope: subject.scope,
    };
    switch (eventKind) {
      case "appeared":
        return { subject: voiceSubject, event: { kind: "started" } };
      case "gone":
        return { subject: voiceSubject, event: { kind: "ended" } };
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
