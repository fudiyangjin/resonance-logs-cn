/**
 * @file Per-subject (buff / counter-slot / DBM mechanic) read+write access
 * to the inline voice bindings, shared by `voice-binding-control.svelte` so
 * the three integration points (buff monitor, counter editor, DBM table)
 * don't each need their own plumbing of getters/setters through props.
 */
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import type { MonsterBuffSourceScope } from "$lib/bindings";
import {
  activeProfile,
  updateActiveProfile,
} from "$lib/skill-monitor-profile.svelte.js";
import {
  createDefaultVoiceEventConfig,
  createDefaultVoiceExpiringEventConfig,
  ensureBuffVoiceConfigs,
  ensureCounterVoiceConfigs,
  ensureDbmVoiceConfigs,
  ensureMechanicVoiceConfigs,
  ensurePresetCounterVoiceConfigs,
  SETTINGS,
  type VoiceEventConfig,
  type VoiceExpiringEventConfig,
} from "$lib/settings-store";
import {
  counterSlotLabel,
  counterSlotSupportsExpiry,
  counterSlotSupportsThreshold,
  findCounterVoiceRule,
  findCounterVoiceSlot,
} from "$lib/voice-binding-counter";
import {
  buffAutoText,
  buffEventKey,
  buffSubjectLabel,
  counterAutoText,
  counterEventKey,
  dbmAutoText,
  dbmEventKey,
  dbmSubjectLabel,
  mergeVoiceConfigPatch,
  minimapCueEventKey,
  monsterBuffAutoText,
  monsterBuffEventKey,
} from "$lib/voice-binding-compile.svelte.js";
import { findMinimapVoiceCue } from "../routes/minimap-overlay/scene-registry";

export type VoiceBindingSubject =
  | { kind: "buff"; buffId: number }
  | {
      kind: "monsterBuff";
      buffId: number;
      sourceScope: MonsterBuffSourceScope;
    }
  | { kind: "counterSlot"; ruleId: number; slotId: number }
  | { kind: "dbm"; baseSkillId: number }
  | { kind: "minimapCue"; cueId: string };

export type VoiceBindingEventKind =
  | "gained"
  | "expiring"
  | "lost"
  | "threshold"
  | "onCast";

export type VoiceBindingEventDef = {
  key: string;
  eventKind: VoiceBindingEventKind;
  labelKey: MessageKey;
  expiring: boolean;
  config: VoiceEventConfig | VoiceExpiringEventConfig | undefined;
  autoText: (secondsBefore: number) => string;
};

function defaultEventConfig(
  eventKind: VoiceBindingEventKind,
): VoiceEventConfig | VoiceExpiringEventConfig {
  return eventKind === "expiring"
    ? createDefaultVoiceExpiringEventConfig()
    : createDefaultVoiceEventConfig();
}

export function subjectLabel(subject: VoiceBindingSubject): string {
  if (subject.kind === "buff" || subject.kind === "monsterBuff") {
    return buffSubjectLabel(subject.buffId);
  }
  if (subject.kind === "dbm") return dbmSubjectLabel(subject.baseSkillId);
  if (subject.kind === "minimapCue") {
    const cue = findMinimapVoiceCue(subject.cueId);
    return cue ? t(cue.labelKey) : subject.cueId;
  }
  const rule = findCounterVoiceRule(activeProfile(), subject.ruleId);
  return rule ? counterSlotLabel(rule, subject.slotId) : `#${subject.slotId}`;
}

/** The events configurable for `subject`, in display order. */
export function subjectEvents(
  subject: VoiceBindingSubject,
): VoiceBindingEventDef[] {
  if (subject.kind === "buff") {
    const configs = ensureBuffVoiceConfigs(activeProfile()?.buffVoiceConfigs);
    const config = configs[String(subject.buffId)] ?? {};
    const name = buffSubjectLabel(subject.buffId);
    return [
      {
        key: buffEventKey(subject.buffId, "gained"),
        eventKind: "gained",
        labelKey: "voice.binding.event.gained",
        expiring: false,
        config: config.gained,
        autoText: () => buffAutoText(name, "gained"),
      },
      {
        key: buffEventKey(subject.buffId, "expiring"),
        eventKind: "expiring",
        labelKey: "voice.binding.event.expiring",
        expiring: true,
        config: config.expiring,
        autoText: (s) => buffAutoText(name, "expiring", s),
      },
      {
        key: buffEventKey(subject.buffId, "lost"),
        eventKind: "lost",
        labelKey: "voice.binding.event.lost",
        expiring: false,
        config: config.lost,
        autoText: () => buffAutoText(name, "lost"),
      },
    ];
  }

  if (subject.kind === "monsterBuff") {
    const configs = ensureBuffVoiceConfigs(
      SETTINGS.monsterMonitor.state.monsterBuffVoiceConfigs,
    );
    const config = configs[String(subject.buffId)] ?? {};
    const name = buffSubjectLabel(subject.buffId);
    return [
      {
        key: monsterBuffEventKey(subject.sourceScope, subject.buffId, "gained"),
        eventKind: "gained",
        labelKey: "voice.binding.event.gained",
        expiring: false,
        config: config.gained,
        autoText: () => monsterBuffAutoText(name, "gained"),
      },
      {
        key: monsterBuffEventKey(
          subject.sourceScope,
          subject.buffId,
          "expiring",
        ),
        eventKind: "expiring",
        labelKey: "voice.binding.event.expiring",
        expiring: true,
        config: config.expiring,
        autoText: (s) => monsterBuffAutoText(name, "expiring", s),
      },
      {
        key: monsterBuffEventKey(subject.sourceScope, subject.buffId, "lost"),
        eventKind: "lost",
        labelKey: "voice.binding.event.lost",
        expiring: false,
        config: config.lost,
        autoText: () => monsterBuffAutoText(name, "lost"),
      },
    ];
  }

  if (subject.kind === "minimapCue") {
    const configs = ensureMechanicVoiceConfigs(
      SETTINGS.minimap.state.mechanicVoiceConfigs,
    );
    const config = configs[subject.cueId];
    const cue = findMinimapVoiceCue(subject.cueId);
    return [
      {
        key: minimapCueEventKey(subject.cueId),
        eventKind: "onCast",
        labelKey: "voice.binding.event.onCast",
        expiring: false,
        config,
        autoText: () => cue?.autoText ?? "",
      },
    ];
  }

  if (subject.kind === "counterSlot") {
    const rule = findCounterVoiceRule(activeProfile(), subject.ruleId);
    const slot = rule ? findCounterVoiceSlot(rule, subject.slotId) : undefined;
    if (!rule || !slot) return [];
    const config = rule.voice[String(subject.slotId)] ?? {};
    const label = counterSlotLabel(rule, subject.slotId);
    const events: VoiceBindingEventDef[] = [];
    if (counterSlotSupportsThreshold(slot)) {
      events.push({
        key: counterEventKey(subject.ruleId, subject.slotId, "threshold"),
        eventKind: "threshold",
        labelKey: "voice.binding.event.threshold",
        expiring: false,
        config: config.threshold,
        autoText: () => counterAutoText(label, "threshold"),
      });
    }
    if (counterSlotSupportsExpiry(slot)) {
      events.push({
        key: counterEventKey(subject.ruleId, subject.slotId, "expiring"),
        eventKind: "expiring",
        labelKey: "voice.binding.event.expiring",
        expiring: true,
        config: config.expiring,
        autoText: (s) => counterAutoText(label, "expiring", s),
      });
    }
    return events;
  }

  const configs = ensureDbmVoiceConfigs(
    SETTINGS.monsterMonitor.state.dbmVoiceConfigs,
  );
  const config = configs[String(subject.baseSkillId)] ?? {};
  const name = dbmSubjectLabel(subject.baseSkillId);
  return [
    {
      key: dbmEventKey(subject.baseSkillId, "onCast"),
      eventKind: "onCast",
      labelKey: "voice.binding.event.onCast",
      expiring: false,
      config: config.onCast,
      autoText: () => dbmAutoText(name, "onCast"),
    },
    {
      key: dbmEventKey(subject.baseSkillId, "expiring"),
      eventKind: "expiring",
      labelKey: "voice.binding.event.expiring",
      expiring: true,
      config: config.expiring,
      autoText: (s) => dbmAutoText(name, "expiring", s),
    },
  ];
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
  if (subject.kind === "buff") {
    const key = String(subject.buffId);
    updateActiveProfile((profile) => {
      const configs = ensureBuffVoiceConfigs(profile.buffVoiceConfigs);
      const current =
        configs[key]?.[eventKind as "gained" | "expiring" | "lost"];
      return {
        ...profile,
        buffVoiceConfigs: mergeVoiceConfigPatch(configs, {
          [key]: {
            [eventKind]: {
              ...(current ?? defaultEventConfig(eventKind)),
              ...patch,
            },
          },
        }),
      };
    });
    return;
  }

  if (subject.kind === "monsterBuff") {
    const key = String(subject.buffId);
    const configs = ensureBuffVoiceConfigs(
      SETTINGS.monsterMonitor.state.monsterBuffVoiceConfigs,
    );
    const current = configs[key]?.[eventKind as "gained" | "expiring" | "lost"];
    SETTINGS.monsterMonitor.state.monsterBuffVoiceConfigs =
      mergeVoiceConfigPatch(configs, {
        [key]: {
          [eventKind]: {
            ...(current ?? defaultEventConfig(eventKind)),
            ...patch,
          },
        },
      });
    return;
  }

  if (subject.kind === "minimapCue") {
    const configs = ensureMechanicVoiceConfigs(
      SETTINGS.minimap.state.mechanicVoiceConfigs,
    );
    const current = configs[subject.cueId];
    SETTINGS.minimap.state.mechanicVoiceConfigs = {
      ...configs,
      [subject.cueId]: {
        ...(current ?? defaultEventConfig("onCast")),
        ...patch,
      },
    };
    return;
  }

  if (subject.kind === "counterSlot") {
    const slotKey = String(subject.slotId);
    updateActiveProfile((profile) => {
      const resolvedRule = findCounterVoiceRule(profile, subject.ruleId);
      const slot = resolvedRule
        ? findCounterVoiceSlot(resolvedRule, subject.slotId)
        : undefined;
      const supported =
        slot &&
        (eventKind === "threshold"
          ? counterSlotSupportsThreshold(slot)
          : eventKind === "expiring" && counterSlotSupportsExpiry(slot));
      if (!resolvedRule || !supported) return profile;

      const configs = ensureCounterVoiceConfigs(resolvedRule.voice);
      const current = configs[slotKey]?.[eventKind as "threshold" | "expiring"];
      const nextConfigs = mergeVoiceConfigPatch(configs, {
        [slotKey]: {
          [eventKind]: {
            ...(current ?? defaultEventConfig(eventKind)),
            ...patch,
          },
        },
      });

      if (resolvedRule.origin === "user") {
        return {
          ...profile,
          userCounterRules: (profile.userCounterRules ?? []).map((rule) =>
            rule.ruleId === subject.ruleId
              ? { ...rule, voice: nextConfigs }
              : rule,
          ),
        };
      }

      const presetConfigs = ensurePresetCounterVoiceConfigs(
        profile.presetCounterVoiceConfigs,
      );
      return {
        ...profile,
        presetCounterVoiceConfigs: {
          ...presetConfigs,
          [String(subject.ruleId)]: nextConfigs,
        },
      };
    });
    return;
  }

  const key = String(subject.baseSkillId);
  const configs = ensureDbmVoiceConfigs(
    SETTINGS.monsterMonitor.state.dbmVoiceConfigs,
  );
  const current = configs[key]?.[eventKind as "onCast" | "expiring"];
  SETTINGS.monsterMonitor.state.dbmVoiceConfigs = mergeVoiceConfigPatch(
    configs,
    {
      [key]: {
        [eventKind]: {
          ...(current ?? defaultEventConfig(eventKind)),
          ...patch,
        },
      },
    },
  );
}
