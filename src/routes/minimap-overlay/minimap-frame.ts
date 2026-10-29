import type {
  HudFrame,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/bindings";
import type { HudFrameContext } from "$lib/stores/live-window-sessions.svelte";
import { overlayNow } from "../game-overlay/overlay-clock.svelte.js";
import {
  handleMinimapVoiceCues,
  resetMinimapVoiceCues,
} from "./minimap-voice.svelte.js";
import {
  clearSkillCastEntries,
  clearSkillCastLog,
  consumeMinimapSkillCasts,
  minimapRuntime,
  minimapSnapshot,
  setMinimapSnapshot,
  updateElectromagneticRingCycle,
  updateEntityFirstSeen,
} from "./minimap-runtime.svelte.js";
import { resolveScene } from "./scene-registry";

export function handleHudMinimapFrame(
  frame: HudFrame,
  context: HudFrameContext,
): void {
  if (frame.castsReset || context.epochChanged) {
    clearSkillCastEntries();
  }

  const snapshotUpdate = frame.snapshot;
  if (!snapshotUpdate && frame.skillCasts.length === 0) return;

  applyMinimapUpdate(
    snapshotUpdate ? snapshotUpdate.snapshot : minimapSnapshot(),
    frame.skillCasts,
  );
}

export function clearMinimapLayerState(): void {
  setMinimapSnapshot(null);
  minimapRuntime.lastSceneId = null;
  clearSkillCastLog();
  resetMinimapVoiceCues();
}

function applyMinimapUpdate(
  snapshot: MinimapSnapshot | null,
  skillCasts: MinimapSkillCast[],
): void {
  if (snapshot) {
    if (
      minimapRuntime.lastSceneId !== null &&
      minimapRuntime.lastSceneId !== snapshot.sceneId
    ) {
      clearSkillCastLog();
      resetMinimapVoiceCues();
    }
    minimapRuntime.lastSceneId = snapshot.sceneId;
    setMinimapSnapshot(snapshot);
    updateEntityFirstSeen(snapshot, overlayNow());
    updateElectromagneticRingCycle(snapshot, overlayNow());

    // The pulled delta is evaluated exactly once. Scene rendering may use the
    // bounded accumulated log, but voice cues never replay that history.
    const fires = resolveScene(snapshot.sceneId)?.resolveVoiceCues?.(
      snapshot,
      skillCasts,
    );
    // Empty frames release cues that announce once while a mechanic is active.
    handleMinimapVoiceCues(fires ?? []);
  } else if (skillCasts.length === 0) {
    clearMinimapLayerState();
  }

  consumeMinimapSkillCasts(skillCasts);
}
