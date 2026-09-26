import {
  ensureCounterVoiceConfigs,
  ensurePresetCounterVoiceConfigs,
  type CounterSlotVoiceConfig,
} from "$lib/settings-store";
import {
  counterSlotLabel,
  counterSlotSupportsExpiry,
  counterSlotSupportsThreshold,
  findCounterVoiceRule,
  findCounterVoiceSlot,
  resolveCounterVoiceRules,
  type ResolvedCounterVoiceRule,
} from "$lib/voice-binding-counter";
import type { CounterEventKind } from "../association";
import {
  mergeVoiceConfigPatch,
  type SkillProfileVoiceSlice,
  type VoiceBindingEventKind,
  type VoiceBindingSubject,
  type VoiceEventSpec,
  type VoiceSubjectAdapter,
} from "../subject-types";

export type { CounterEventKind } from "../association";

function isCounterEventKind(
  kind: VoiceBindingEventKind,
): kind is CounterEventKind {
  return kind === "threshold" || kind === "expiring";
}

export function counterAutoText(
  label: string,
  event: CounterEventKind,
  secondsBefore = 5,
): string {
  return event === "threshold"
    ? `${label}已达到目标`
    : `${label}还有${secondsBefore}秒`;
}

type CounterSubject = Extract<VoiceBindingSubject, { kind: "counterSlot" }>;

function ruleFor(
  profile: SkillProfileVoiceSlice | null,
  ruleId: number,
): ResolvedCounterVoiceRule | undefined {
  // `resolveCounterVoiceRules` only reads the three voice-related fields.
  return findCounterVoiceRule(
    profile as Parameters<typeof findCounterVoiceRule>[0],
    ruleId,
  );
}

export const counterSlotAdapter: VoiceSubjectAdapter<CounterSubject> = {
  kind: "counterSlot",
  runtime: "backend",
  overview: {
    group: "counter",
    titleKey: "skillMonitor.customPanel.rule.title",
    navigateKey: "voice.bindings.navigate.counter",
    route: "/main/skill-monitor",
  },
  ruleKey: (subject, eventKind) =>
    `voice:counter:${subject.ruleId}:${subject.slotId}:${eventKind}`,
  label: (view, subject) => {
    const rule = ruleFor(view.skillProfile, subject.ruleId);
    return rule ? counterSlotLabel(rule, subject.slotId) : `#${subject.slotId}`;
  },
  events: (view, subject) => {
    const rule = ruleFor(view.skillProfile, subject.ruleId);
    const slot = rule ? findCounterVoiceSlot(rule, subject.slotId) : undefined;
    if (!rule || !slot) return [];
    const label = counterSlotLabel(rule, subject.slotId);
    const events: VoiceEventSpec[] = [];
    if (counterSlotSupportsThreshold(slot)) {
      events.push({
        eventKind: "threshold",
        labelKey: "voice.binding.event.threshold",
        expiring: false,
        supportsTierPlaceholder: false,
        autoText: () => counterAutoText(label, "threshold"),
      });
    }
    if (counterSlotSupportsExpiry(slot)) {
      events.push({
        eventKind: "expiring",
        labelKey: "voice.binding.event.expiring",
        expiring: true,
        supportsTierPlaceholder: false,
        autoText: (s) => counterAutoText(label, "expiring", s),
      });
    }
    return events;
  },
  readyWithoutPhrase: () => false,
  enumerate: (view) => {
    if (!view.skillProfile) return [];
    const subjects: CounterSubject[] = [];
    for (const rule of resolveCounterVoiceRules(
      view.skillProfile as Parameters<typeof resolveCounterVoiceRules>[0],
    )) {
      for (const slot of rule.effectSlots) {
        if (!rule.voice[String(slot.slotId)]) continue;
        subjects.push({
          kind: "counterSlot",
          ruleId: rule.ruleId,
          slotId: slot.slotId,
        });
      }
    }
    return subjects;
  },
  read: (view, subject, eventKind) => {
    if (!isCounterEventKind(eventKind)) return undefined;
    const rule = ruleFor(view.skillProfile, subject.ruleId);
    return rule?.voice[String(subject.slotId)]?.[eventKind];
  },
  write: (writer, subject, eventKind, next) => {
    if (!isCounterEventKind(eventKind)) return;
    writer.updateSkillProfile((profile) => {
      const resolvedRule = findCounterVoiceRule(profile, subject.ruleId);
      const slot = resolvedRule
        ? findCounterVoiceSlot(resolvedRule, subject.slotId)
        : undefined;
      const supported =
        slot &&
        (eventKind === "threshold"
          ? counterSlotSupportsThreshold(slot)
          : counterSlotSupportsExpiry(slot));
      if (!resolvedRule || !supported) return profile;

      const slotKey = String(subject.slotId);
      const nextConfigs = mergeVoiceConfigPatch(
        ensureCounterVoiceConfigs(resolvedRule.voice),
        { [slotKey]: { [eventKind]: next } as Partial<CounterSlotVoiceConfig> },
      );

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
      return {
        ...profile,
        presetCounterVoiceConfigs: {
          ...ensurePresetCounterVoiceConfigs(profile.presetCounterVoiceConfigs),
          [String(subject.ruleId)]: nextConfigs,
        },
      };
    });
  },
  trigger: (subject, eventKind, secondsBefore) => {
    const voiceSubject = {
      kind: "counter" as const,
      ruleId: subject.ruleId,
      slotId: subject.slotId,
    };
    switch (eventKind) {
      case "threshold":
        return { subject: voiceSubject, event: { kind: "threshold" } };
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
