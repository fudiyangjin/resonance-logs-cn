import type { MinimapEntity } from "$lib/api";

/** Local players always retain their existing glyph, even when marked in game. */
export function visibleTeamMark(
  entity: Pick<MinimapEntity, "kind" | "teamMark">,
  enabled: boolean,
): number | null {
  const mark = entity.teamMark;
  return enabled &&
    entity.kind === "teammate" &&
    mark != null &&
    Number.isInteger(mark) &&
    mark >= 1 &&
    mark <= 6
    ? mark
    : null;
}

export function hideTeammate(
  kind: MinimapEntity["kind"],
  hasMechanic: boolean,
  hasTeamMark: boolean,
  settings: { hideAllTeammates: boolean; hideNormalTeammates: boolean },
): boolean {
  return (
    kind === "teammate" &&
    (settings.hideAllTeammates ||
      (settings.hideNormalTeammates && !hasMechanic && !hasTeamMark))
  );
}
