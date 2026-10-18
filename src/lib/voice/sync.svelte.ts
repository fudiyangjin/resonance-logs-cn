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
import { untrack } from "svelte";
import {
  commands,
  type Result,
  type VoiceCommandError,
  type VoiceLanguage,
} from "$lib/bindings";
import { lookupDbmDefaultName } from "$lib/config/dbm-table";
import { updateMonsterMonitor } from "$lib/monster-monitor-profile.svelte.js";
import { saveAndApplyVoiceRuntimeSnapshot } from "$lib/runtime-monitor-sync";
import {
  ensureBuffVoiceConfigs,
  ensureDbmAliases,
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
import {
  VOICE,
  ensureVoiceCatalog,
  mergeVoicePhrase,
  requestVoiceCatalogRefresh,
  runVoiceOperation,
  voiceOperationActive,
  voiceErrorMessage,
} from "$lib/stores/voice-store.svelte";
import { collectVoicePhraseRefs, silentOrphanPhrases } from "./gc";
import { createPhraseResolver } from "./phrase-resolver";
import { createVoiceSnapshotSync } from "./snapshot-sync";
import {
  collectBindings,
  compileVoiceRules,
  phraseRequests,
  type PhraseIndex,
  type ResolvedPhrase,
} from "./compile";
import { mergeVoiceConfigPatch } from "./subject-types";
import { buildVoiceBindingView, buildVoiceGcViews } from "./view";

const phraseIndex = $derived.by(() => {
  const index: Record<string, ResolvedPhrase> = {};
  for (const phrase of VOICE.status?.catalog.phrases ?? []) {
    index[phrase.name] = {
      phraseId: phrase.id,
      text: phrase.text,
      language: phrase.language,
      hasAudio: phrase.activeAssetId != null,
      updatedAtMs: phrase.updatedAtMs,
    };
  }
  return index;
});

export function currentPhraseIndex(): PhraseIndex {
  return phraseIndex;
}

const resolver = createPhraseResolver({
  ensureCatalog: ensureVoiceCatalog,
  index: currentPhraseIndex,
  upsert: ({ name, text, language }) =>
    commands.voiceUpsertPhrase(name, text, language),
  merge: mergeVoicePhrase,
  refresh: requestVoiceCatalogRefresh,
  reportError: (error) => {
    VOICE.phraseError = error ? voiceErrorMessage(error) : null;
  },
});

/** Interactive retries and background sync share pending IPC and confirmed data. */
export function upsertManagedPhrase(
  name: string,
  text: string,
  language: VoiceLanguage,
): Promise<string | null> {
  return resolver.resolve({ name, text, language });
}

/**
 * Deletes the phrases among `names` that a binding edit left unused and
 * that never got audio (`gc.ts::silentOrphanPhrases`). Best effort: while
 * another voice operation runs, or when a delete fails, they stay for the
 * phrase library's cleanup. A phrase needed again later is simply recreated.
 */
export async function releaseSilentPhrases(
  names: readonly string[],
): Promise<void> {
  const catalog = VOICE.status?.catalog;
  if (!catalog || voiceOperationActive()) return;
  const targets = silentOrphanPhrases(
    names,
    catalog.phrases,
    catalog.assets,
    collectVoicePhraseRefs(buildVoiceGcViews()),
  );
  if (targets.length === 0) return;
  // One operation for the batch keeps background upserts paused throughout.
  const res = await runVoiceOperation(
    { kind: "updatingCatalog" },
    async (): Promise<Result<null, VoiceCommandError>> => {
      for (const target of targets) {
        const deleted = await commands.voiceDeletePhrase(target.id);
        if (deleted.status === "error") return deleted;
      }
      return { status: "ok", data: null };
    },
  );
  if (res.status === "error") {
    console.warn("[voice-sync] failed to release unused phrases", res.error);
  }
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
    // A DBM binding lives as long as its DBM entry (`association.ts`).
    updateMonsterMonitor((state) => ({
      dbmAliases: {
        ...Object.fromEntries(
          Object.keys(dbmPatch).map((id) => [
            id,
            lookupDbmDefaultName(Number(id)) ?? `#${id}`,
          ]),
        ),
        ...ensureDbmAliases(state.dbmAliases),
      },
      dbmVoiceConfigs: mergeVoiceConfigPatch(
        ensureDbmVoiceConfigs(state.dbmVoiceConfigs),
        dbmPatch,
      ),
    }));
  }
  SETTINGS.voice.state.rules = [];
  legacyMigrationDone = true;
}

/** Must be called during component initialisation (it creates effects). */
export function startVoiceRuntimeSync(): () => void {
  const snapshots = createVoiceSnapshotSync(
    saveAndApplyVoiceRuntimeSnapshot,
    (error) => {
      console.error("[voice-sync] failed to apply voice snapshot", error);
    },
  );
  $effect(() => {
    migrateLegacyVoiceRules();
  });

  $effect(() => {
    const voice = SETTINGS.voice.state;
    const bindings = collectBindings(buildVoiceBindingView());
    const index = phraseIndex;
    const missing = phraseRequests(bindings).filter((request) => {
      const known = index[request.name];
      return (
        known?.text !== request.text || known.language !== request.language
      );
    });
    const busy = voiceOperationActive();
    const snapshot = {
      enabled: voice.enabled,
      volume: voice.volume,
      queuePolicy: voice.queuePolicy,
      rules: voice.enabled ? compileVoiceRules(bindings, index) : [],
    };
    untrack(() => {
      resolver.sync(missing, busy);
      snapshots.queue(snapshot);
    });
  });

  const cleanup = () => {
    resolver.cancelBackground();
    snapshots.dispose();
  };
  $effect(() => cleanup);
  return cleanup;
}
