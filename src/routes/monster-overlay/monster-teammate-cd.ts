import type { SkillCdState, TeammateCdPayload } from "$lib/bindings";
import type { EntityId } from "$lib/entity-id";
import type {
  TeammateCdSkillMap,
  TeammateDeadRowPlacement,
} from "$lib/settings-store";
import type { SkillDisplay } from "../game-overlay/overlay-types";
import { orderTeammateUuids } from "./monster-teammate-projection";
import type {
  MonsterTeammateCdCell,
  MonsterTeammateCdRow,
} from "./monster-types";

export type TeammateCdSkillInfo = { name: string; imagePath?: string };

export type TeammateCdRowInput = {
  teammates: readonly TeammateCdPayload[];
  linkOnline: boolean;
  /** Selected base skill ids per `classKey`. */
  selection: TeammateCdSkillMap;
  classKeyOf: (classId: number) => string | undefined;
  skillInfo: (
    classKey: string,
    skillId: number,
  ) => TeammateCdSkillInfo | undefined;
  classIconOf: (classId: number) => string | undefined;
  dead: ReadonlySet<EntityId>;
  placement: TeammateDeadRowPlacement;
  now: number;
  display: (cd: SkillCdState, now: number) => SkillDisplay | null;
};

/** Newest cooldown per base skill id (several level ids can share one). */
export function latestCdBySkill(
  cds: readonly SkillCdState[],
): Map<number, SkillCdState> {
  const latest = new Map<number, SkillCdState>();
  for (const cd of cds) {
    const skillId = Math.floor(cd.skillLevelId / 100);
    const current = latest.get(skillId);
    if (!current || cd.receivedAt >= current.receivedAt) {
      latest.set(skillId, cd);
    }
  }
  return latest;
}

/**
 * One row per teammate whose class has a skill selection; every selected
 * skill gets a cell, drawn as ready until a cooldown for it arrives.
 */
export function buildTeammateCdRows(
  input: TeammateCdRowInput,
): MonsterTeammateCdRow[] {
  const rows = new Map<EntityId, MonsterTeammateCdRow>();
  for (const teammate of input.teammates) {
    const classKey = input.classKeyOf(teammate.classId);
    const selected = classKey ? (input.selection[classKey] ?? []) : [];
    if (!classKey || selected.length === 0) continue;
    const latest = latestCdBySkill(teammate.skillCds);
    const cells: MonsterTeammateCdCell[] = selected.map((skillId) => {
      const info = input.skillInfo(classKey, skillId);
      const cd = latest.get(skillId);
      return {
        skillId,
        name: info?.name ?? `#${skillId}`,
        imagePath: info?.imagePath,
        display: cd ? input.display(cd, input.now) : null,
      };
    });
    rows.set(teammate.uuid, {
      teammateEntityUuid: teammate.uuid,
      teammateName: teammate.name,
      classId: teammate.classId,
      classIconPath: input.classIconOf(teammate.classId),
      isDead: input.dead.has(teammate.uuid),
      isStale: !input.linkOnline,
      cells,
    });
  }
  return orderTeammateUuids(rows.keys(), input.dead, input.placement).map(
    (uuid) => rows.get(uuid)!,
  );
}
