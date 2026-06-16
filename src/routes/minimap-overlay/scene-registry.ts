import { s3RaidScene } from "./scenes/s3-raid";
import type { SceneDefinition } from "./scene-types";

const SCENES: readonly SceneDefinition[] = [s3RaidScene];

export function resolveScene(sceneId: number): SceneDefinition | null {
  return SCENES.find((scene) => scene.sceneIds.includes(sceneId)) ?? null;
}
