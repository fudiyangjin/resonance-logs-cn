import type { MinimapEntity } from "$lib/api";
import type { MechanicRegion, SceneDefinition } from "../../scene-types";
import {
  arenaByPlayerY,
  arenaLayout,
  toArenaLocal,
  yInArena,
  type S3SeaRingedReefArena,
} from "./arena";
import { buildBossMechanicView } from "./mechanics/boss";
import {
  buildMatrixMechanicView,
  type SeaRingedReefMechanicView,
} from "./mechanics/matrix";

export const s3SeaRingedReefScene: SceneDefinition = {
  id: "s3-sea-ringed-reef",
  sceneIds: [6563, 6564, 6565],
  resolveView(snapshot, displayName) {
    const localPlayer =
      snapshot.entities.find(
        (entity) => entity.entityUuid === snapshot.localPlayerUuid,
      ) ?? null;
    const arena = arenaByPlayerY(localPlayer?.y);
    const layout = arenaLayout(arena);
    const mechanicView = buildMechanicView(snapshot, displayName, arena);

    return {
      worldHalfX: layout.worldHalfX,
      worldHalfZ: layout.worldHalfZ,
      rotationQuarters: layout.rotationQuarters,
      layout: layout.shapes,
      regions: mechanicView.regions.map((region) =>
        localizeRegion(region, arena),
      ),
      rows: mechanicView.rows,
      entityColorSlots: mechanicView.entityColorSlots,
      entities: visibleEntities(
        snapshot.entities,
        arena,
        mechanicView.entityColorSlots,
      ).map((entity) => localizeEntity(entity, arena)),
    };
  },
};

function buildMechanicView(
  snapshot: Parameters<SceneDefinition["resolveView"]>[0],
  displayName: Parameters<SceneDefinition["resolveView"]>[1],
  arena: S3SeaRingedReefArena,
): SeaRingedReefMechanicView {
  if (arena === "matrix") return buildMatrixMechanicView(snapshot, displayName);
  return buildBossMechanicView(snapshot, displayName, arena);
}

function visibleEntities(
  entities: MinimapEntity[],
  arena: S3SeaRingedReefArena,
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

function localizeEntity(
  entity: MinimapEntity,
  arena: S3SeaRingedReefArena,
): MinimapEntity {
  const point = toArenaLocal(entity.x, entity.z, arena);
  return {
    ...entity,
    x: point.x,
    z: point.z,
  };
}

function localizeRegion(
  region: MechanicRegion,
  arena: S3SeaRingedReefArena,
): MechanicRegion {
  if (region.kind === "ring") return region;
  if (region.kind === "polygon") {
    return {
      ...region,
      points: region.points.map((point) =>
        toArenaLocal(point.x, point.z, arena),
      ),
    };
  }
  if (region.kind === "line") {
    const start = toArenaLocal(region.x1, region.z1, arena);
    const end = toArenaLocal(region.x2, region.z2, arena);
    return {
      ...region,
      x1: start.x,
      z1: start.z,
      x2: end.x,
      z2: end.z,
    };
  }
  const point = toArenaLocal(region.x, region.z, arena);
  return {
    ...region,
    x: point.x,
    z: point.z,
  };
}
