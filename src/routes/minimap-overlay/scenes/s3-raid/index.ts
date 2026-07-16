import type { MinimapEntity } from "$lib/api";
import type { SceneDefinition } from "../../scene-types";
import { arenaByPlayerY, arenaLayout, yInArena } from "./arena";
import {
  buildMechanicView,
  resolveRaidVoiceCues,
  S3_RAID_VOICE_CUES,
} from "./mechanics";

export const s3RaidScene: SceneDefinition = {
  id: "s3-raid",
  season: 3,
  sceneIds: [13021, 13022, 13023],
  voiceCues: S3_RAID_VOICE_CUES,
  resolveVoiceCues: resolveRaidVoiceCues,
  resolveView(snapshot, displayName, skillCasts = []) {
    const localPlayer =
      snapshot.entities.find(
        (entity) => entity.entityUuid === snapshot.localPlayerUuid,
      ) ?? null;
    const arena = arenaByPlayerY(localPlayer?.y);
    const layout = arenaLayout(arena);
    const mechanicView = buildMechanicView(
      snapshot,
      displayName,
      arena,
      skillCasts,
    );

    return {
      worldHalfX: layout.worldHalfX,
      worldHalfZ: layout.worldHalfZ,
      rotationQuarters: 0,
      layout: layout.shapes,
      regions: mechanicView.regions,
      rows: mechanicView.rows,
      entityColorSlots: mechanicView.entityColorSlots,
      entities: visibleEntities(
        snapshot.entities,
        arena,
        mechanicView.entityColorSlots,
      ),
      // Raid renders in raw world coordinates (entities are not localized), so
      // markers pass through unchanged.
      markers: snapshot.markers,
    };
  },
};

function visibleEntities(
  entities: MinimapEntity[],
  arena: ReturnType<typeof arenaByPlayerY>,
  entityColorSlots: Map<string, number>,
): MinimapEntity[] {
  return entities.filter(
    (entity) =>
      yInArena(entity.y, arena) &&
      (entity.kind === "local" ||
        entity.kind === "teammate" ||
        entity.kind === "boss" ||
        entityColorSlots.has(entity.entityUuid)),
  );
}
