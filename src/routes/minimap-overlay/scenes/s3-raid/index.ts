import type { MinimapEntity } from "$lib/api";
import type { SceneDefinition } from "../../scene-types";
import {
  evaluateSkillSequence,
  type SkillSequenceRule,
} from "../../skill-sequence";
import { arenaByPlayerY, arenaLayout, yInArena } from "./arena";
import { buildMechanicView } from "./mechanics";

const ELECTROMAGNETIC_RING_RULE = {
  key: "s3Raid:electromagneticRing",
  groupKey: "minimap.s3Raid.electromagneticRing.group",
  slots: 3,
  skills: {
    10310062: {
      labelKey: "minimap.s3Raid.electromagneticRing.inner",
      colorSlot: 0,
    },
    10310063: {
      labelKey: "minimap.s3Raid.electromagneticRing.mid",
      colorSlot: 1,
    },
    10310064: {
      labelKey: "minimap.s3Raid.electromagneticRing.outer",
      colorSlot: 2,
    },
  },
} satisfies SkillSequenceRule;

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
    };
  },
  resolveSkillRows({ skillCasts }) {
    return evaluateSkillSequence(ELECTROMAGNETIC_RING_RULE, skillCasts);
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
        entityColorSlots.has(entity.entityUuid)),
  );
}
