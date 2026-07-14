import type { MinimapEntity, MinimapMarker } from "$lib/api";
import type { SceneDefinition } from "../../scene-types";
import { arenaLayout, inBossArea, toArenaLocal, yInArena } from "./arena";
import {
  buildMechanicView,
  resolveGiantTowerVoiceCues,
  S3_GIANT_TOWER_VOICE_CUES,
} from "./mechanics";

export const s3GiantTowerScene: SceneDefinition = {
  id: "s3-giant-tower",
  season: 3,
  sceneIds: [1150, 1151, 1152],
  voiceCues: S3_GIANT_TOWER_VOICE_CUES,
  resolveVoiceCues: resolveGiantTowerVoiceCues,
  resolveView(snapshot, displayName, skillCasts = []) {
    const layout = arenaLayout();
    const mechanicView = buildMechanicView(snapshot, displayName, skillCasts);

    return {
      worldHalfX: layout.worldHalfX,
      worldHalfZ: layout.worldHalfZ,
      rotationQuarters: layout.rotationQuarters,
      layout: layout.shapes,
      regions: [],
      rows: mechanicView.rows,
      entityColorSlots: mechanicView.entityColorSlots,
      entities: visibleEntities(
        snapshot.entities,
        mechanicView.entityColorSlots,
      ).map(localizeEntity),
      markers: snapshot.markers.map(localizeMarker),
    };
  },
};

function localizeMarker(marker: MinimapMarker): MinimapMarker {
  if (
    marker.x === null ||
    marker.x === undefined ||
    marker.z === null ||
    marker.z === undefined
  ) {
    return marker;
  }
  const point = toArenaLocal(marker.x, marker.z);
  return { ...marker, x: point.x, z: point.z };
}

function visibleEntities(
  entities: MinimapEntity[],
  entityColorSlots: Map<string, number>,
): MinimapEntity[] {
  return entities.filter(
    (entity) =>
      yInArena(entity.y) &&
      inBossArea(entity.x, entity.z) &&
      (entity.kind === "local" ||
        entity.kind === "teammate" ||
        entity.kind === "boss" ||
        entityColorSlots.has(entity.entityUuid)),
  );
}

function localizeEntity(entity: MinimapEntity): MinimapEntity {
  const point = toArenaLocal(entity.x, entity.z);
  return {
    ...entity,
    x: point.x,
    z: point.z,
  };
}
