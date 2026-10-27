/**
 * @file Frontend-driven voice announcements for minimap scene mechanics.
 *
 * Judgment for *when* a mechanic should announce lives entirely in each
 * scene's `resolveVoiceCues` (entity presence, skill-cast matching, etc. -
 * whatever that scene's mechanic logic already tracks). This module only
 * handles the generic part shared by every cue: deduplicating repeated
 * instances and enqueueing the bound phrase. Phrase references play by id;
 * auto/custom bindings play by managed name, so the HUD window needs no
 * phrase-id cache of its own (the main window materializes the phrases).
 * Driven from pulled minimap frames in `minimap-events.svelte.ts`.
 */
import { commands } from "$lib/bindings";
import {
  ensureMechanicVoiceConfigs,
  resolveVoicePriority,
  SETTINGS,
} from "$lib/settings-store";
import { bindingPhrases } from "$lib/voice/phrase-key";
import {
  MINIMAP_CUE_LANGUAGE,
  minimapCueRuleKey,
} from "$lib/voice/subjects/minimap-cue";
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
  const priority = resolveVoicePriority(config.priority);

  if (config.phrase.source === "phrase") {
    const phraseId = config.phrase.phraseId.trim();
    if (phraseId) await commands.voiceEnqueuePhrase(phraseId, priority);
    return;
  }
  // Same name the main window materializes (`bindingPhrases`); the backend
  // falls back to the cue's previous text while this one has no audio.
  const [phrase] = bindingPhrases({
    ruleKey: minimapCueRuleKey(cueId),
    phrase: config.phrase,
    autoText: findMinimapVoiceCue(cueId)?.autoText ?? "",
    language: MINIMAP_CUE_LANGUAGE,
    supportsTier: false,
  });
  if (phrase) await commands.voiceEnqueuePhraseByName(phrase.name, priority);
}

/**
 * Fires (enqueues playback for) every cue instance that hasn't already been
 * seen. Safe to call every pulled minimap frame with a scene's
 * `resolveVoiceCues` output.
 */
export function handleMinimapVoiceCues(fires: MinimapVoiceCueFire[]): void {
  for (const fire of cueDeduper.filterFrame(fires)) {
    void playCue(fire.cueId);
  }
}
