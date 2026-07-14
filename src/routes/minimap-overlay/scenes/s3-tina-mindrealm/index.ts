import type { MinimapEntity, MinimapMarker } from "$lib/api";
import type { MechanicRegion, SceneDefinition } from "../../scene-types";
import { arenaLayout, inBossArea, toArenaLocal, yInArena } from "./arena";
import {
  buildMechanicView,
  resolveTinaMindrealmVoiceCues,
  S3_TINA_MINDREALM_VOICE_CUES,
} from "./mechanics";

export const s3TinaMindrealmScene: SceneDefinition = {
  id: "s3-tina-mindrealm",
  season: 3,
  sceneIds: [1631, 1632, 1633],
  voiceCues: S3_TINA_MINDREALM_VOICE_CUES,
  resolveVoiceCues: resolveTinaMindrealmVoiceCues,
  resolveView(snapshot, displayName, skillCasts = []) {
    void skillCasts;
    const layout = arenaLayout();
    const mechanicView = buildMechanicView(snapshot, displayName);

    return {
      worldHalfX: layout.worldHalfX,
      worldHalfZ: layout.worldHalfZ,
      rotationQuarters: layout.rotationQuarters,
      layout: layout.shapes,
      regions: mechanicView.regions.map(localizeRegion),
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

// Markers are not spatially filtered (the player should always see their own
// markers); only the same arena-local translation as entities is applied.
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

function localizeRegion(region: MechanicRegion): MechanicRegion {
  if (region.kind === "ring") return region;
  if (region.kind === "polygon") {
    return {
      ...region,
      points: region.points.map((point) => toArenaLocal(point.x, point.z)),
    };
  }
  if (region.kind === "line") {
    const start = toArenaLocal(region.x1, region.z1);
    const end = toArenaLocal(region.x2, region.z2);
    return {
      ...region,
      x1: start.x,
      z1: start.z,
      x2: end.x,
      z2: end.z,
    };
  }
  const point = toArenaLocal(region.x, region.z);
  return {
    ...region,
    x: point.x,
    z: point.z,
  };
}
