import type {
  BuffGrouping,
  TimelineBuffLane,
  TimelinePlayerMeta,
  TimelineTrack,
} from "./timeline-types";

type BuffTrack = Extract<TimelineTrack, { kind: "buff-group" | "buff" }>;

/** Turns the selected owners' buff lanes into header + row tracks.
 *
 * `owners` is already filtered to the selection and ordered for display, so
 * group order never depends on click order. By player: one group per owner,
 * one row per watched buff (lane order). By buff: one group per base id in
 * first-appearance order, one row per owner that carries it. Owners without
 * lanes, and buffs nobody selected carries, produce nothing. */
export function buildBuffTracks(
  lanes: readonly TimelineBuffLane[],
  owners: readonly TimelinePlayerMeta[],
  grouping: BuffGrouping,
): BuffTrack[] {
  const lanesByOwner = new Map<string, TimelineBuffLane[]>();
  for (const lane of lanes) {
    const owned = lanesByOwner.get(lane.entityUuid);
    if (owned) owned.push(lane);
    else lanesByOwner.set(lane.entityUuid, [lane]);
  }
  const tracks: BuffTrack[] = [];

  if (grouping === "player") {
    for (const owner of owners) {
      const owned = lanesByOwner.get(owner.entityUuid);
      if (!owned) continue;
      tracks.push({
        kind: "buff-group",
        key: `buff-group:player:${owner.entityUuid}`,
        label: owner.name,
        player: owner,
      });
      for (const lane of owned) {
        tracks.push({
          kind: "buff",
          key: lane.key,
          lane,
          player: owner,
          caption: "buff",
        });
      }
    }
    return tracks;
  }

  const rowsByBaseId = new Map<
    number,
    { lane: TimelineBuffLane; player: TimelinePlayerMeta }[]
  >();
  for (const owner of owners) {
    for (const lane of lanesByOwner.get(owner.entityUuid) ?? []) {
      const rows = rowsByBaseId.get(lane.baseId);
      if (rows) rows.push({ lane, player: owner });
      else rowsByBaseId.set(lane.baseId, [{ lane, player: owner }]);
    }
  }
  // Lane order, not owner order, decides the group order so it matches the
  // summary table and does not reshuffle as owners are toggled.
  const baseIds = [...new Set(lanes.map((lane) => lane.baseId))];
  for (const baseId of baseIds) {
    const rows = rowsByBaseId.get(baseId);
    if (!rows) continue;
    tracks.push({
      kind: "buff-group",
      key: `buff-group:buff:${baseId}`,
      label: rows[0]!.lane.buffName,
      player: null,
    });
    for (const { lane, player } of rows) {
      tracks.push({
        kind: "buff",
        key: lane.key,
        lane,
        player,
        caption: "player",
      });
    }
  }
  return tracks;
}
