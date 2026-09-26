import type { MonsterBuffSourceScope, VoiceLanguage } from "$lib/bindings";
import type { MessageKey } from "$lib/i18n/index.svelte";
import {
  resolveVoicePriority,
  type VoicePhraseBinding,
} from "$lib/settings-store";
import {
  collectBindings,
  resolvePhraseId,
  resolveTierPhraseIds,
  type BindingPhrase,
  type PhraseIndex,
  type VoiceBinding,
} from "./compile";
import { byKind } from "./registry";
import type {
  OverviewGroup,
  OverviewGroupMeta,
  VoiceBindingView,
} from "./subject-types";

export type VoiceBindingOverviewEntry = {
  id: string;
  subjectLabel: string;
  eventLabelKey: MessageKey;
  binding: VoicePhraseBinding;
  /** Auto text for `binding.source === "auto"` (seconds already substituted). */
  autoText: string;
  /**
   * The binding's own phrase, `null` until it exists. Status is exact: a
   * binding whose edited text still plays the previous audio is pending.
   */
  phraseId: string | null;
  language: VoiceLanguage;
  /** True when the app bundle already contains playable audio for this binding. */
  bundledFallback: boolean;
  /** Per-tier (0-5) variant phrase ids for tier-placeholder custom text; empty otherwise. */
  tierPhraseIds: string[];
  /** The managed phrases the binding compiles to (empty for a picked phrase). */
  phrases: readonly BindingPhrase[];
  priority: number;
  navigateTo: OverviewGroup;
  monsterBuffSourceScope?: MonsterBuffSourceScope;
};

export function overviewEntryOf(
  binding: VoiceBinding,
  index: PhraseIndex,
): VoiceBindingOverviewEntry {
  return {
    id: binding.ruleKey,
    subjectLabel: binding.subjectLabel,
    eventLabelKey: `voice.binding.event.${binding.eventKind}`,
    binding: binding.phrase,
    autoText: binding.autoText,
    phraseId: resolvePhraseId(binding, index, "exact"),
    language: binding.language,
    bundledFallback: binding.bundledFallback,
    tierPhraseIds: Object.values(resolveTierPhraseIds(binding, index, "exact")),
    phrases: binding.phrases,
    priority: resolveVoicePriority(binding.config.priority),
    navigateTo: binding.group,
    ...(binding.subject.kind === "monsterBuff"
      ? { monsterBuffSourceScope: binding.subject.sourceScope }
      : {}),
  };
}

/**
 * Every enabled binding (whether or not its phrase has resolved yet), for
 * the read-only "播报总览" tab so pending entries stay visible.
 */
export function listVoiceBindingOverview(
  view: VoiceBindingView,
  index: PhraseIndex,
): VoiceBindingOverviewEntry[] {
  return collectBindings(view).map((binding) =>
    overviewEntryOf(binding, index),
  );
}

/** Group metadata (title / navigation) in display order. */
export function overviewGroups(): readonly OverviewGroupMeta[] {
  return (
    [
      "buff",
      "skill",
      "monsterBuff",
      "counter",
      "dbm",
      "entity",
      "minimap",
      "alerts",
    ] as const
  ).map((group) => {
    const kind = (
      {
        buff: "buff",
        skill: "skill",
        monsterBuff: "monsterBuff",
        counter: "counterSlot",
        dbm: "dbm",
        entity: "entity",
        minimap: "minimapCue",
        alerts: "gameAlert",
      } as const
    )[group];
    return byKind(kind).overview;
  });
}
