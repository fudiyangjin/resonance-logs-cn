/**
 * @file Reactive glue between the pure binding layer and the backend.
 *
 * `startVoiceRuntimeSync()` (called once from the main layout) runs an
 * effect that: snapshots the settings view, collects enabled bindings,
 * materializes any phrase whose text is not yet confirmed in the catalog
 * (serially - every upsert takes the backend's `UpdatingCatalog` guard, so
 * parallel calls would only trade `Conflict` errors), and pushes the
 * compiled `VoiceRuntimeSnapshot` down its own debounced IPC lane.
 *
 * The effect never early-returns while phrases are pending: unresolved
 * bindings keep their previous phrase id (old audio keeps playing) and
 * `enabled` / `volume` / `queuePolicy` changes are never held hostage by a
 * long-running generation.
 */
import { SvelteSet } from "svelte/reactivity";
import {
  commands,
  type VoiceLanguage,
  type VoiceRuntimeSnapshot,
} from "$lib/bindings";
import { saveAndApplyVoiceRuntimeSnapshot } from "$lib/runtime-monitor-sync";
import {
  ensureBuffVoiceConfigs,
  ensureDbmVoiceConfigs,
  resolveVoicePriority,
  SETTINGS,
  type BuffVoiceConfig,
  type DbmVoiceConfig,
  type VoiceEventConfig,
  type VoicePhraseBinding,
} from "$lib/settings-store";
import {
  activeProfile,
  updateActiveProfile,
} from "$lib/skill-monitor-profile.svelte.js";
import { VOICE } from "$lib/stores/voice-store.svelte";
import {
  collectBindings,
  compileVoiceRules,
  isResolved,
  phraseRequests,
  type PhraseIndex,
  type PhraseRequest,
  type ResolvedPhrase,
} from "./compile";
import { mergeVoiceConfigPatch } from "./subject-types";
import { buildVoiceBindingView } from "./view";

const SYNC_DEBOUNCE_MS = 50;

const phraseIndex = $state<Record<string, ResolvedPhrase>>({});
/** `${name}|${text}|${language}` of requests the backend rejected for good. */
const unretriable = new SvelteSet<string>();

/** Read-only view of the materialized phrases (reactive when read in runes). */
export function currentPhraseIndex(): PhraseIndex {
  return phraseIndex;
}

function requestKey(request: PhraseRequest): string {
  return `${request.name}|${request.text}|${request.language}`;
}

/**
 * Upserts one managed phrase and records the outcome. Shared with the
 * preview path so previews and compiled rules resolve to the same phrase.
 */
export async function upsertManagedPhrase(
  name: string,
  text: string,
  language: VoiceLanguage,
): Promise<string | null> {
  const result = await commands.voiceUpsertPhrase(name, text, language);
  if (result.status !== "ok") {
    // Validation / security errors won't clear on their own; Conflict and IO
    // errors are retried on the next effect run.
    if (!result.error.retriable) {
      unretriable.add(requestKey({ name, text, language }));
    }
    return null;
  }
  phraseIndex[name] = { phraseId: result.data.id, text, language };
  return result.data.id;
}

let inFlight: Promise<void> | null = null;
let queued: PhraseRequest[] = [];

function materialize(requests: PhraseRequest[]): void {
  queued = requests;
  if (inFlight) return;
  inFlight = (async () => {
    try {
      // `queued` is re-read per iteration so a newer effect run can replace
      // the outstanding list mid-flight instead of racing a second chain.
      while (queued.length > 0) {
        const request = queued[0]!;
        queued = queued.slice(1);
        try {
          await upsertManagedPhrase(
            request.name,
            request.text,
            request.language,
          );
        } catch (error) {
          console.error("[voice-sync] upsert failed", request.name, error);
        }
      }
    } finally {
      inFlight = null;
    }
  })();
}

let lastSnapshotKey = "";
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function queueSnapshot(snapshot: VoiceRuntimeSnapshot): void {
  const key = JSON.stringify(snapshot);
  if (key === lastSnapshotKey) return;
  lastSnapshotKey = key;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void saveAndApplyVoiceRuntimeSnapshot(snapshot).catch((error) => {
      console.error("[voice-sync] failed to apply voice snapshot", error);
    });
  }, SYNC_DEBOUNCE_MS);
}

let legacyMigrationDone = false;

/**
 * One-shot migration of the old manually-authored `voice.rules` (buffGained /
 * buffLost / bossDbm only) into the inline bindings, then clears the list.
 * Buff bindings live on the active skill-monitor profile, which may not be
 * hydrated on the first tick, so the step retries until a profile exists.
 */
function migrateLegacyVoiceRules(): void {
  if (legacyMigrationDone) return;
  const legacyRules = SETTINGS.voice.state.rules ?? [];
  if (legacyRules.length === 0) {
    legacyMigrationDone = true;
    return;
  }
  const profile = activeProfile();
  const needsProfile = legacyRules.some(
    (rule) => rule.trigger.kind !== "bossDbm",
  );
  if (needsProfile && !profile) return;

  const buffPatch: Record<string, Partial<BuffVoiceConfig>> = {};
  const dbmPatch: Record<string, Partial<DbmVoiceConfig>> = {};
  for (const rule of legacyRules) {
    if (!rule.phraseId) continue;
    const phrase: VoicePhraseBinding = {
      source: "phrase",
      phraseId: rule.phraseId,
    };
    const event: VoiceEventConfig = {
      enabled: rule.enabled,
      phrase,
      priority: resolveVoicePriority(rule.priority),
    };
    if (rule.trigger.kind === "buffGained") {
      const key = String(rule.trigger.buffId);
      buffPatch[key] = { ...buffPatch[key], gained: event };
    } else if (rule.trigger.kind === "buffLost") {
      const key = String(rule.trigger.buffId);
      buffPatch[key] = { ...buffPatch[key], lost: event };
    } else if (rule.trigger.kind === "bossDbm") {
      const key = String(rule.trigger.baseSkillId);
      dbmPatch[key] = { ...dbmPatch[key], onCast: event };
    }
  }

  if (profile && Object.keys(buffPatch).length > 0) {
    updateActiveProfile((current) => ({
      ...current,
      buffVoiceConfigs: mergeVoiceConfigPatch(
        ensureBuffVoiceConfigs(current.buffVoiceConfigs),
        buffPatch,
      ),
    }));
  }
  if (Object.keys(dbmPatch).length > 0) {
    SETTINGS.monsterMonitor.state.dbmVoiceConfigs = mergeVoiceConfigPatch(
      ensureDbmVoiceConfigs(SETTINGS.monsterMonitor.state.dbmVoiceConfigs),
      dbmPatch,
    );
  }
  SETTINGS.voice.state.rules = [];
  legacyMigrationDone = true;
}

/** Must be called during component initialisation (it creates effects). */
export function startVoiceRuntimeSync(): () => void {
  $effect(() => {
    migrateLegacyVoiceRules();

    const voice = SETTINGS.voice.state;
    const view = buildVoiceBindingView();
    const bindings = collectBindings(view);
    const catalogPhraseIds: ReadonlySet<string> = new SvelteSet(
      (VOICE.status?.catalog.phrases ?? []).map((phrase) => phrase.id),
    );

    const missing = phraseRequests(bindings).filter(
      (request) =>
        !isResolved(phraseIndex, catalogPhraseIds, request) &&
        !unretriable.has(requestKey(request)),
    );
    if (missing.length > 0) materialize(missing);

    queueSnapshot({
      enabled: voice.enabled,
      volume: voice.volume,
      queuePolicy: voice.queuePolicy,
      rules: voice.enabled ? compileVoiceRules(bindings, phraseIndex) : [],
    });
  });

  // Once the backend is idle again, anything rejected earlier may be
  // retried (the catalog or model state that caused it may have changed).
  $effect(() => {
    if (VOICE.operation.kind === "idle") unretriable.clear();
  });

  return () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
  };
}
