import type { MinimapEntity, MinimapMarker } from "$lib/api";
import type { MechanicRegion, SceneDefinition } from "../../scene-types";
import { arenaLayout, inBossArea, toArenaLocal, yInArena } from "./arena";
import {
  buildMechanicView,
  resolveLapsisVoiceCues,
  S4_SKY_END_RAID_VOICE_CUES,
} from "./mechanics";

export const s4SkyEndRaidScene: SceneDefinition = {
  id: "s4-sky-end-raid",
  season: 4,
  sceneIds: [13031, 13032, 13033],
  voiceCues: S4_SKY_END_RAID_VOICE_CUES,
  resolveVoiceCues: resolveLapsisVoiceCues,
  resolveView(snapshot, displayName, skillCasts = []) {
    const layout = arenaLayout();
    const mechanicView = buildMechanicView(snapshot, displayName, skillCasts);
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
  return { ...entity, x: point.x, z: point.z };
}

function localizeMarker(marker: MinimapMarker): MinimapMarker {
  if (marker.x == null || marker.z == null) return marker;
  const point = toArenaLocal(marker.x, marker.z);
  return { ...marker, x: point.x, z: point.z };
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
    return { ...region, x1: start.x, z1: start.z, x2: end.x, z2: end.z };
  }
  const point = toArenaLocal(region.x, region.z);
  return { ...region, x: point.x, z: point.z };
}
