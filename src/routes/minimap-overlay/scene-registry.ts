import { s3CursedTombScene } from "./scenes/s3-cursed-tomb";
import { s3GiantTowerScene } from "./scenes/s3-giant-tower";
import { s3RaidScene } from "./scenes/s3-raid";
import { s3SeaRingedReefScene } from "./scenes/s3-sea-ringed-reef";
import { s3TinaMindrealmScene } from "./scenes/s3-tina-mindrealm";
import type { MinimapVoiceCueDef, SceneDefinition } from "./scene-types";

const SCENES: readonly SceneDefinition[] = [
  s3RaidScene,
  s3SeaRingedReefScene,
  s3CursedTombScene,
  s3GiantTowerScene,
  s3TinaMindrealmScene,
];

export function resolveScene(sceneId: number): SceneDefinition | null {
  return SCENES.find((scene) => scene.sceneIds.includes(sceneId)) ?? null;
}

export type MinimapVoiceCueSceneGroup = {
  scene: SceneDefinition;
  cues: MinimapVoiceCueDef[];
};

export type MinimapVoiceCueSeasonGroup = {
  season: number;
  scenes: MinimapVoiceCueSceneGroup[];
};

/** Every scene's registered voice cues, grouped by season then scene. */
export function allMinimapVoiceCueSeasonGroups(): MinimapVoiceCueSeasonGroup[] {
  const scenes = SCENES.filter(
    (scene) => (scene.voiceCues?.length ?? 0) > 0,
  ).map((scene) => ({ scene, cues: scene.voiceCues! }));
  const seasons = new Map<number, MinimapVoiceCueSceneGroup[]>();
  for (const scene of scenes) {
    const entries = seasons.get(scene.scene.season) ?? [];
    entries.push(scene);
    seasons.set(scene.scene.season, entries);
  }
  return [...seasons.entries()]
    .sort(([left], [right]) => right - left)
    .map(([season, groupedScenes]) => ({ season, scenes: groupedScenes }));
}

export function allMinimapVoiceCues(): MinimapVoiceCueDef[] {
  return SCENES.flatMap((scene) => scene.voiceCues ?? []);
}

export function findMinimapVoiceCue(cueId: string): MinimapVoiceCueDef | null {
  for (const scene of SCENES) {
    const cue = scene.voiceCues?.find((candidate) => candidate.id === cueId);
    if (cue) return cue;
  }
  return null;
}
