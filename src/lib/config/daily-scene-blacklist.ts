const DAILY_SCENE_IDS = [9, 8, 76, 75, 74, 73, 72, 71, 7, 10, 11, 95, 94, 93, 91, 92] as const;

export const DAILY_SCENE_BLACKLIST: ReadonlySet<number> = new Set(
  DAILY_SCENE_IDS,
);

export function isDailyScene(sceneId: number | null | undefined): boolean {
  return sceneId != null && DAILY_SCENE_BLACKLIST.has(sceneId);
}
