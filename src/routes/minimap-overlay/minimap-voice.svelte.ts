/**
 * @file Frontend-driven voice announcements for minimap scene mechanics.
 *
 * Judgment for *when* a mechanic should announce lives entirely in each
 * scene's `resolveVoiceCues` (entity presence, skill-cast matching, etc. -
 * whatever that scene's mechanic logic already tracks). This module only
 * handles the generic part shared by every cue: deduplicating repeated
 * instances, resolving the bound phrase, and calling `voiceEnqueuePhrase`.
 * Driven from `onMinimapUpdate` in
 * `minimap-events.svelte.ts`.
 */
import { commands } from "$lib/bindings";
import {
  ensureMechanicVoiceConfigs,
  resolveVoicePriority,
  SETTINGS,
} from "$lib/settings-store";
import {
  ensurePhraseId,
  minimapCueEventKey,
} from "$lib/voice-binding-compile.svelte.js";
import { findMinimapVoiceCue } from "./scene-registry";
import type { MinimapVoiceCueFire } from "./scene-types";
import { MinimapVoiceCueDeduper } from "./minimap-voice-dedupe";

const cueDeduper = new MinimapVoiceCueDeduper();

/** Clears all dedup state. Call on scene change (a `cueId` from a
 * previous scene should never suppress the same id re-registered by a new
 * one) and when the minimap snapshot is lost. */
export function resetMinimapVoiceCues(): void {
  cueDeduper.reset();
}

export function shouldFireMinimapVoiceCue(
  cueId: string,
  instanceKey: string,
): boolean {
  return cueDeduper.shouldFire(cueId, instanceKey);
}

async function playCue(cueId: string): Promise<void> {
  const config = ensureMechanicVoiceConfigs(
    SETTINGS.minimap.state.mechanicVoiceConfigs,
  )[cueId];
  if (!config?.enabled) return;

  const autoText = findMinimapVoiceCue(cueId)?.autoText ?? "";
  const phraseId = ensurePhraseId(
    minimapCueEventKey(cueId),
    config.phrase,
    autoText,
  );
  if (!phraseId) return;

  await commands.voiceEnqueuePhrase(
    phraseId,
    resolveVoicePriority(config.priority),
  );
}

/**
 * Fires (enqueues playback for) every cue instance that hasn't already been
 * seen. Safe to call every `minimap-update` tick with a scene's
 * `resolveVoiceCues` output.
 */
export function handleMinimapVoiceCues(fires: MinimapVoiceCueFire[]): void {
  for (const fire of fires) {
    if (!shouldFireMinimapVoiceCue(fire.cueId, fire.instanceKey)) continue;
    void playCue(fire.cueId);
  }
}
