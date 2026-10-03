import type {
  SkillCdState,
  TeamLayoutPayload,
  TeammateCdPayload,
} from "$lib/bindings";
import type { EntityId } from "$lib/entity-id";
import type {
  TeammateCdSkillMap,
  TeammateCdSlotKind,
  TeammateCdSlotLayout,
  TeammateCdSlotSide,
  TeammateDeadRowPlacement,
} from "$lib/settings-store";
import type { SkillDisplay } from "../game-overlay/overlay-types";
import { orderTeammateUuids } from "./monster-teammate-projection";
import type {
  MonsterTeammateCdCell,
  MonsterTeammateCdRow,
  MonsterTeammateCdSlot,
} from "./monster-types";

export type TeammateCdSkillInfo = { name: string; imagePath?: string };

type TeammateCdCellInput = {
  /** Selected base skill ids per `classKey`. */
  selection: TeammateCdSkillMap;
  classKeyOf: (classId: number) => string | undefined;
  skillInfo: (
    classKey: string,
    skillId: number,
  ) => TeammateCdSkillInfo | undefined;
  now: number;
  display: (cd: SkillCdState, now: number) => SkillDisplay | null;
};

export type TeammateCdSlotInput = TeammateCdCellInput & {
  teammates: readonly TeammateCdPayload[];
  linkOnline: boolean;
  layout: TeamLayoutPayload | null;
  dead: ReadonlySet<EntityId>;
};

export type TeammateCdRowInput = TeammateCdSlotInput & {
  classIconOf: (classId: number) => string | undefined;
  placement: TeammateDeadRowPlacement;
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
 * One cell per skill selected for the teammate's class, drawn as ready until
 * a cooldown for it arrives; `null` when the class has no selection.
 */
function teammateCells(
  input: TeammateCdCellInput,
  teammate: TeammateCdPayload,
): MonsterTeammateCdCell[] | null {
  const classKey = input.classKeyOf(teammate.classId);
  const selected = classKey ? (input.selection[classKey] ?? []) : [];
  if (!classKey || selected.length === 0) return null;
  const latest = latestCdBySkill(teammate.skillCds);
  return selected.map((skillId) => {
    const info = input.skillInfo(classKey, skillId);
    const cd = latest.get(skillId);
    return {
      skillId,
      name: info?.name ?? `#${skillId}`,
      imagePath: info?.imagePath,
      display: cd ? input.display(cd, input.now) : null,
    };
  });
}

/** Position of a team panel row in game order: group first, then row. */
function slotRank(group: number, row: number): number {
  return (group - 1) * 5 + row;
}

/**
 * One row per sharing teammate whose class has a skill selection, in the
 * game's team panel order when the layout is known.
 */
export function buildTeammateCdRows(
  input: TeammateCdRowInput,
): MonsterTeammateCdRow[] {
  const rows = new Map<EntityId, MonsterTeammateCdRow>();
  for (const teammate of input.teammates) {
    const cells = teammateCells(input, teammate);
    if (!cells) continue;
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
  const rank = input.layout
    ? new Map(
        input.layout.slots.map((slot) => [
          slot.uuid,
          slotRank(slot.group, slot.row),
        ]),
      )
    : undefined;
  return orderTeammateUuids(rows.keys(), input.dead, input.placement, rank).map(
    (uuid) => rows.get(uuid)!,
  );
}

/**
 * The icons beside each teammate's row of the in-game team panel. The local
 * character's row and rows of teammates without shared cooldowns stay empty.
 */
export function buildTeammateCdSlots(
  input: TeammateCdSlotInput,
): MonsterTeammateCdSlot[] {
  if (!input.layout) return [];
  const teammates = new Map(
    input.teammates.map((teammate) => [teammate.uuid, teammate]),
  );
  const slots: MonsterTeammateCdSlot[] = [];
  for (const slot of input.layout.slots) {
    if (slot.isSelf) continue;
    const teammate = teammates.get(slot.uuid);
    const cells = teammate ? teammateCells(input, teammate) : null;
    if (!cells) continue;
    slots.push({
      teammateEntityUuid: slot.uuid,
      group: slot.group,
      row: slot.row,
      isDead: input.dead.has(slot.uuid),
      isStale: !input.linkOnline,
      cells,
    });
  }
  return slots;
}

export type TeammateCdSlotPlacement = {
  left: number;
  top: number;
  side: TeammateCdSlotSide;
};

/**
 * Where a team panel row's icons start relative to the grid's first row, in
 * HUD pixels: the icon edge facing the team panel, at the top of the icons.
 * Twenty-member groups 1/3 are the left column and 2/4 the right one; 3/4 sit
 * one block below 1/2.
 */
export function teammateCdSlotPlacement(
  layout: TeammateCdSlotLayout,
  kind: TeammateCdSlotKind,
  group: number,
  row: number,
): TeammateCdSlotPlacement {
  if (kind === "five") {
    const grid = layout.five;
    return { left: 0, top: (row - 1) * grid.rowPitch, side: grid.side };
  }
  const grid = layout.twenty;
  const rightColumn = group % 2 === 0;
  const lowerBlock = group > 2;
  return {
    left: rightColumn ? grid.columnOffset : 0,
    top: (lowerBlock ? grid.blockOffset : 0) + (row - 1) * grid.rowPitch,
    side: rightColumn ? grid.rightSide : grid.leftSide,
  };
}

/** Every slot of a team panel, in game order, for the layout editor. */
export function teammateCdGridSlots(
  kind: TeammateCdSlotKind,
): { group: number; row: number; number: number }[] {
  const groups = kind === "five" ? [1] : [1, 2, 3, 4];
  return groups.flatMap((group) =>
    [1, 2, 3, 4, 5].map((row) => ({
      group,
      row,
      number: slotRank(group, row),
    })),
  );
}
