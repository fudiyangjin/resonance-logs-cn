import { buffAdapter } from "./subjects/buff";
import { counterSlotAdapter } from "./subjects/counter-slot";
import { dbmAdapter } from "./subjects/dbm";
import { entityAdapter } from "./subjects/entity";
import { gameAlertAdapter } from "./subjects/game-alert";
import { minimapCueAdapter } from "./subjects/minimap-cue";
import { monsterBuffAdapter } from "./subjects/monster-buff";
import { skillAdapter } from "./subjects/skill";
import type {
  VoiceBindingSubject,
  VoiceBindingSubjectKind,
  VoiceSubjectAdapter,
} from "./subject-types";

/**
 * Every subject that can carry a voice binding, in the order the overview
 * lists them. Adding a subject means adding one adapter here; compile,
 * overview and GC all iterate this list.
 */
export const VOICE_SUBJECT_ADAPTERS: readonly VoiceSubjectAdapter[] = [
  buffAdapter,
  skillAdapter,
  monsterBuffAdapter,
  counterSlotAdapter,
  dbmAdapter,
  entityAdapter,
  minimapCueAdapter,
  gameAlertAdapter,
] as readonly VoiceSubjectAdapter[];

const BY_KIND = new Map(
  VOICE_SUBJECT_ADAPTERS.map((adapter) => [adapter.kind, adapter] as const),
);

export function byKind<K extends VoiceBindingSubjectKind>(
  kind: K,
): VoiceSubjectAdapter<Extract<VoiceBindingSubject, { kind: K }>> {
  const adapter = BY_KIND.get(kind);
  if (!adapter) throw new Error(`no voice subject adapter for kind ${kind}`);
  return adapter as VoiceSubjectAdapter<
    Extract<VoiceBindingSubject, { kind: K }>
  >;
}

export function adapterFor<S extends VoiceBindingSubject>(
  subject: S,
): VoiceSubjectAdapter<S> {
  return byKind(subject.kind) as unknown as VoiceSubjectAdapter<S>;
}
