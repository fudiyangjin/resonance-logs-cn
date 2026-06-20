import { s3RaidScene } from "./scenes/s3-raid";
import { s3SeaRingedReefScene } from "./scenes/s3-sea-ringed-reef";
import type { SceneDefinition } from "./scene-types";

const SCENES: readonly SceneDefinition[] = [s3RaidScene, s3SeaRingedReefScene];

export function resolveScene(sceneId: number): SceneDefinition | null {
  return SCENES.find((scene) => scene.sceneIds.includes(sceneId)) ?? null;
}
