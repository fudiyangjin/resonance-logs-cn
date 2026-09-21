import type { EntityOwnerScope, VoiceSubject } from "$lib/bindings";
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
  mergeVoiceConfigPatch,
  type MonsterVoiceSlice,
  type VoiceBindingEventKind,
  type VoiceBindingSubject,
  type VoiceBindingView,
  type VoiceEventSpec,
  type VoiceSubjectAdapter,
} from "../subject-types";

export type EntityEventKind = "appeared" | "expiring" | "gone";
export const ENTITY_EVENTS: readonly EntityEventKind[] = [
  "appeared",
  "expiring",
  "gone",
];
const ENTITY_SCOPES: readonly EntityOwnerScope[] = ["self", "any"];

export function isEntityEventKind(
  kind: VoiceBindingEventKind,
): kind is EntityEventKind {
  return kind === "appeared" || kind === "expiring" || kind === "gone";
}

type EntitySubject = Extract<VoiceBindingSubject, { kind: "entity" }>;

/** The watch entry a subject belongs to; `undefined` once it was removed. */
export function entityEntryOf(
  view: VoiceBindingView,
  subject: EntitySubject,
): EntityDurationEntry | undefined {
  return ensureEntityDurationEntries(view.monster.entityDurationEntries).find(
    (entry) =>
      entry.monsterId === subject.monsterId && entry.scope === subject.scope,
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

/**
 * `expiring` needs a configured duration to count down from; entries
 * without one (open-ended rows) only expose appear / gone.
 */
export function entityEventSpecs(
  autoText: (event: EntityEventKind, seconds: number) => string,
  hasDuration: boolean,
): readonly VoiceEventSpec[] {
  const specs: VoiceEventSpec[] = [
    {
      eventKind: "appeared",
      labelKey: "voice.binding.event.appeared",
      expiring: false,
      supportsTierPlaceholder: false,
      autoText: () => autoText("appeared", 0),
    },
  ];
  if (hasDuration) {
    specs.push({
      eventKind: "expiring",
      labelKey: "voice.binding.event.expiring",
      expiring: true,
      supportsTierPlaceholder: false,
      autoText: (s) => autoText("expiring", s),
    });
  }
  specs.push({
    eventKind: "gone",
    labelKey: "voice.binding.event.gone",
    expiring: false,
    supportsTierPlaceholder: false,
    autoText: () => autoText("gone", 0),
  });
  return specs;
}

function writeEntityConfig(
  configs: EntityVoiceConfigMap | null | undefined,
  subject: EntitySubject,
  eventKind: EntityEventKind,
  next: EntityVoiceConfig[EntityEventKind],
): EntityVoiceConfigMap {
  return mergeVoiceConfigPatch(ensureEntityVoiceConfigs(configs), {
    [entityVoiceConfigKey(subject.monsterId, subject.scope)]: {
      [eventKind]: next,
    },
  });
}

export const entityAdapter: VoiceSubjectAdapter<
  EntitySubject,
  MonsterVoiceSlice
> = {
  kind: "entity",
  runtime: "backend",
  overview: {
    group: "entity",
    titleKey: "monsterMonitor.entityDuration.title",
    navigateKey: "voice.bindings.navigate.entity",
    route: "/main/monster-monitor",
  },
  ruleKey: (subject, eventKind) =>
    `voice:entity:${subject.monsterId}:${subject.scope}:${eventKind}`,
  label: entityLabel,
  events: (view, subject) => {
    const name = entityLabel(view, subject);
    const hasDuration = entityEntryOf(view, subject)?.durationMs !== undefined;
    return entityEventSpecs(
      (event, s) => entityAutoText(name, event, s),
      hasDuration,
    );
  },
  readyWithoutPhrase: () => false,
  // Bindings whose entry was removed (or re-scoped) stay in settings but
  // are dormant: the backend only tracks entities from the watch list.
  enumerate: (view) =>
    Object.keys(ensureEntityVoiceConfigs(view.monster.entityVoiceConfigs))
      .map(parseEntityVoiceConfigKey)
      .flatMap((parsed) =>
        parsed ? [{ kind: "entity" as const, ...parsed }] : [],
      )
      .filter((subject) => entityEntryOf(view, subject) !== undefined),
  read: (view, subject, eventKind) => {
    if (!isEntityEventKind(eventKind)) return undefined;
    const configs = ensureEntityVoiceConfigs(view.monster.entityVoiceConfigs);
    return configs[entityVoiceConfigKey(subject.monsterId, subject.scope)]?.[
      eventKind
    ];
  },
  write: (writer, subject, eventKind, next) => {
    if (!isEntityEventKind(eventKind)) return;
    writer.patchMonster((current) => ({
      entityVoiceConfigs: writeEntityConfig(
        current.entityVoiceConfigs,
        subject,
        eventKind,
        next,
      ),
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
  gcKeys: (slice) =>
    Object.keys(slice.entityVoiceConfigs ?? {}).flatMap((key) => {
      const parsed = parseEntityVoiceConfigKey(key);
      if (!parsed) return [];
      // Keep both scopes: re-scoping an entry must not orphan its audio.
      return ENTITY_SCOPES.flatMap((scope) =>
        ENTITY_EVENTS.map(
          (event) => `voice:entity:${parsed.monsterId}:${scope}:${event}`,
        ),
      );
    }),
};
