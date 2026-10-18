/**
 * @file Shared vocabulary of the voice binding layer: which subjects can carry
 * bindings, which events each exposes, the read-only view adapters consume,
 * and the adapter contract itself. Everything here is plain data / pure
 * functions so the registry can be unit-tested without Svelte runes.
 */
import type {
  EntityOwnerScope,
  MonsterBuffSourceScope,
  VoiceLanguage,
  VoiceTrigger,
} from "$lib/bindings";
import type { MessageKey, MessageParams } from "$lib/i18n/index.svelte";
import type { AppLocale } from "$lib/i18n/locales";
import type {
  BuffAliasMap,
  GameAlertKind,
  GameAlertVoiceConfigMap,
  MechanicVoiceConfigMap,
  MonsterMonitorConfig,
  SkillMonitorProfile,
  VoiceEventConfig,
  VoiceExpiringEventConfig,
} from "$lib/settings-store";
import type { MinimapVoiceCueDef } from "../../routes/minimap-overlay/scene-types";

export type VoiceBindingSubject =
  | { kind: "buff"; buffId: number }
  | { kind: "monsterBuff"; buffId: number; sourceScope: MonsterBuffSourceScope }
  /**
   * One of the local player's skills (base skill id), from the profile's own
   * skill voice list; the cooldown HUD list plays no part.
   */
  | { kind: "skill"; skillId: number }
  | { kind: "counterSlot"; ruleId: number; slotId: number }
  | { kind: "dbm"; baseSkillId: number }
  /** An entity-duration watch entry; `scope` mirrors `EntityDurationScope`. */
  | { kind: "entity"; monsterId: number; scope: EntityOwnerScope }
  /** A monster-skill watch entry: any nearby monster cast the skill. */
  | { kind: "monsterSkill"; skillId: number }
  | { kind: "minimapCue"; cueId: string }
  | { kind: "gameAlert"; alertKind: GameAlertKind };

export type VoiceBindingSubjectKind = VoiceBindingSubject["kind"];

export type VoiceBindingEventKind =
  | "gained"
  | "expiring"
  | "lost"
  | "threshold"
  | "onCast"
  | "cast"
  | "ready"
  | "readyIn"
  | "appeared"
  | "gone";

export type VoiceEventConfigAny = VoiceEventConfig | VoiceExpiringEventConfig;

/** Static description of one configurable event of a subject. */
export type VoiceEventSpec = {
  eventKind: VoiceBindingEventKind;
  labelKey: MessageKey;
  /** Whether the config carries `secondsBefore` (an `ExpiringIn` trigger). */
  expiring: boolean;
  /**
   * Whether custom text for this event may use the `${阶数}` /
   * `${remodelLevel}` fantasy-tier placeholder. Only buff/monsterBuff
   * gained/lost triggers carry a resolvable tier.
   */
  supportsTierPlaceholder: boolean;
  /** Label for `phrase.source === "auto"`; alerts use bundled presets. */
  autoSourceLabelKey?: MessageKey;
  autoText: (secondsBefore: number) => string;
};

export type OverviewGroup =
  | "buff"
  | "skill"
  | "monsterBuff"
  | "counter"
  | "dbm"
  | "entity"
  | "monsterSkill"
  | "minimap"
  | "alerts";

export type OverviewGroupMeta = {
  group: OverviewGroup;
  titleKey: MessageKey;
  navigateKey: MessageKey;
  route: string;
};

export type SkillProfileVoiceSlice = Pick<
  SkillMonitorProfile,
  | "selectedClass"
  | "buffVoiceConfigs"
  | "skillVoiceConfigs"
  | "userCounterRules"
  | "presetCounterVoiceConfigs"
>;

export type MonsterVoiceSlice = Pick<
  MonsterMonitorConfig,
  | "monsterBuffVoiceConfigs"
  | "dbmVoiceConfigs"
  | "dbmAliases"
  | "monitoredBuffIds"
  | "selfAppliedBuffIds"
  | "selfAppliedMonitorAll"
  | "entityDurationEntries"
  | "entityVoiceConfigs"
  | "monsterSkillEntries"
  | "monsterSkillVoiceConfigs"
>;

/**
 * Snapshot of everything the adapters need to enumerate, label and read
 * bindings. Built from `SETTINGS` by the reactive layer; tests construct it
 * by hand. Contains no runes so it can be passed anywhere.
 */
export type VoiceBindingView = {
  skillProfile: SkillProfileVoiceSlice | null;
  monster: MonsterVoiceSlice;
  mechanicVoiceConfigs: MechanicVoiceConfigMap | null | undefined;
  alertConfigs: GameAlertVoiceConfigMap | null | undefined;
  minimapCues: readonly MinimapVoiceCueDef[];
  buffAliases: BuffAliasMap;
  locale: AppLocale;
  t: (key: MessageKey, params?: MessageParams) => string;
};

/** The only side-effecting seam: how adapters commit a binding edit. */
export type VoiceBindingWriter = {
  updateSkillProfile(
    update: (profile: SkillMonitorProfile) => SkillMonitorProfile,
  ): void;
  patchMonster(
    patch: (
      current: MonsterVoiceSlice,
    ) => Partial<
      Pick<
        MonsterVoiceSlice,
        | "monsterBuffVoiceConfigs"
        | "dbmVoiceConfigs"
        | "entityVoiceConfigs"
        | "monsterSkillVoiceConfigs"
      >
    >,
  ): void;
  updateMechanicVoiceConfigs(
    update: (
      current: MechanicVoiceConfigMap | null | undefined,
    ) => MechanicVoiceConfigMap,
  ): void;
  updateAlertConfigs(
    update: (
      current: GameAlertVoiceConfigMap | null | undefined,
    ) => GameAlertVoiceConfigMap,
  ): void;
};

export interface VoiceSubjectAdapter<
  S extends VoiceBindingSubject = VoiceBindingSubject,
> {
  readonly kind: S["kind"];
  /** `frontend` subjects never compile to a backend rule (the HUD plays them). */
  readonly runtime: "backend" | "frontend";
  readonly overview: OverviewGroupMeta;
  /** `voice:buff:101:gained` — the stable part of the managed phrase name. */
  ruleKey(subject: S, eventKind: VoiceBindingEventKind): string;
  label(view: VoiceBindingView, subject: S): string;
  events(view: VoiceBindingView, subject: S): readonly VoiceEventSpec[];
  /** True when the bundle ships playable audio for the auto binding. */
  readyWithoutPhrase(
    view: VoiceBindingView,
    subject: S,
    eventKind: VoiceBindingEventKind,
  ): boolean;
  /**
   * Bundled-prompt subjects whose managed phrases keep fixed names instead
   * of content-addressed ones (see `phrase-key.ts`).
   */
  readonly fixedPhraseName?: boolean;
  /**
   * Subjects of `view` that carry a binding and are associated (see
   * `association.ts`); `events` then lists only the events that apply.
   */
  enumerate(view: VoiceBindingView): S[];
  read(
    view: VoiceBindingView,
    subject: S,
    eventKind: VoiceBindingEventKind,
  ): VoiceEventConfigAny | undefined;
  write(
    writer: VoiceBindingWriter,
    subject: S,
    eventKind: VoiceBindingEventKind,
    next: VoiceEventConfigAny,
  ): void;
  trigger(
    subject: S,
    eventKind: VoiceBindingEventKind,
    secondsBefore: number,
  ): VoiceTrigger | null;
  language(view: VoiceBindingView): VoiceLanguage;
}

export function mergeVoiceConfigPatch<T extends object>(
  base: Record<string, T>,
  patch: Record<string, Partial<T>>,
): Record<string, T> {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = { ...(next[key] ?? ({} as T)), ...value };
  }
  return next;
}
