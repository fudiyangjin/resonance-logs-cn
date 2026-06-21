const SUPPORTED_MINIMAP_SCENE_IDS = [
  6513,
  6514,
  6515,
  6563,
  6564,
  6565,
  13021,
  13022,
  13023,
] as const;

export const SUPPORTED_MINIMAP_SCENES: ReadonlySet<number> = new Set(
  SUPPORTED_MINIMAP_SCENE_IDS,
);

export function isSupportedMinimapScene(
  sceneId: number | null | undefined,
): boolean {
  return sceneId != null && SUPPORTED_MINIMAP_SCENES.has(sceneId);
}
