import type {
  MinimapBuffFact,
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import type { MinimapVoiceCueFire } from "./scene-types";

export type VoiceCueIdMap = Readonly<Record<number, string>>;

export function buffInstanceKey(buff: MinimapBuffFact): string {
  return `${buff.targetEntityUuid}:${buff.baseId}:${buff.createTimeMs}:${buff.layer}`;
}

export function skillCastInstanceKey(cast: MinimapSkillCast): string {
  return `${cast.entityUuid}:${cast.skillId}:${cast.timeMs}`;
}

export function entityInstanceKey(entity: MinimapEntity): string {
  return entity.entityUuid;
}

export function resolveBuffVoiceCues(
  snapshot: MinimapSnapshot,
  cueIds: VoiceCueIdMap,
  scope: "global" | "localTarget",
): MinimapVoiceCueFire[] {
  const fires: MinimapVoiceCueFire[] = [];
  for (const buff of snapshot.buffs) {
    const cueId = cueIds[buff.baseId];
    if (!cueId) continue;
    if (
      scope === "localTarget" &&
      buff.targetEntityUuid !== snapshot.localPlayerUuid
    ) {
      continue;
    }
    fires.push({ cueId, instanceKey: buffInstanceKey(buff) });
  }
  return fires;
}

export function resolveSkillVoiceCues(
  skillCasts: MinimapSkillCast[],
  cueIds: VoiceCueIdMap,
): MinimapVoiceCueFire[] {
  const fires: MinimapVoiceCueFire[] = [];
  for (const cast of skillCasts) {
    const cueId = cueIds[cast.skillId];
    if (!cueId) continue;
    fires.push({ cueId, instanceKey: skillCastInstanceKey(cast) });
  }
  return fires;
}
