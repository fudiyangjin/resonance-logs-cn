const DAILY_SCENE_IDS = [9, 8, 76, 75, 74, 73, 72, 71, 7, 10, 11, 95, 94, 93, 91, 92] as const;

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
  1150,
  1151,
  1152,
  1631,
  1632,
  1633,
  6615,
  13031,
  13032,
  13033,
] as const;

export const DAILY_SCENE_BLACKLIST: ReadonlySet<number> = new Set(
  DAILY_SCENE_IDS,
);

export const SUPPORTED_MINIMAP_SCENES: ReadonlySet<number> = new Set(
  SUPPORTED_MINIMAP_SCENE_IDS,
);

export function isDailyScene(sceneId: number | null | undefined): boolean {
  return sceneId != null && DAILY_SCENE_BLACKLIST.has(sceneId);
}

export function isSupportedMinimapScene(
  sceneId: number | null | undefined,
): boolean {
  return sceneId != null && SUPPORTED_MINIMAP_SCENES.has(sceneId);
}
