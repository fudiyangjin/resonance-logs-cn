import type { MinimapEntity } from "$lib/api";
import type { SceneDefinition } from "../../scene-types";
import { arenaByPlayerY, arenaLayout, yInArena } from "./arena";
import { buildMechanicView } from "./mechanics";

export const s3RaidScene: SceneDefinition = {
  id: "s3-raid",
  sceneIds: [13021, 13022, 13023],
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
      layout: layout.shapes,
      regions: mechanicView.regions,
      rows: mechanicView.rows,
      entityColorSlots: mechanicView.entityColorSlots,
      entities: visibleEntities(snapshot.entities, arena),
    };
  },
};

function visibleEntities(
  entities: MinimapEntity[],
  arena: ReturnType<typeof arenaByPlayerY>,
): MinimapEntity[] {
  return entities.filter((entity) => yInArena(entity.y, arena));
}
