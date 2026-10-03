import { describe, expect, it } from "vitest";
import type {
  SkillCdState,
  TeamLayoutPayload,
  TeammateCdPayload,
} from "$lib/bindings";
import { createDefaultTeammateCdSlotLayout } from "$lib/settings-store";
import {
  buildTeammateCdRows,
  buildTeammateCdSlots,
  latestCdBySkill,
  teammateCdGridSlots,
  teammateCdSlotPlacement,
} from "./monster-teammate-cd";

function cd(skillLevelId: number, receivedAt: number): SkillCdState {
  return {
    skillLevelId,
    beginTime: 0,
    duration: 30_000,
    skillCdType: 0,
    validCdTime: 0,
    receivedAt,
    calculatedDuration: 30_000,
    cdAccelerateRate: 0,
    readyAtMs: receivedAt + 30_000,
    maxCharges: null,
    maxValidCdTime: null,
  };
}

function mate(
  uuid: string,
  classId: number,
  skillCds: SkillCdState[],
): TeammateCdPayload {
  return { uuid, name: `P${uuid}`, classId, skillCds };
}

const base = {
  linkOnline: true,
  layout: null,
  selection: { wind_knight: [1420, 1430] },
  classKeyOf: (classId: number) => (classId === 4 ? "wind_knight" : undefined),
  skillInfo: (_classKey: string, skillId: number) => ({
    name: `S${skillId}`,
    imagePath: `/s/${skillId}.png`,
  }),
  classIconOf: () => "/images/classes/Wind Knight.png",
  dead: new Set<string>(),
  placement: "last" as const,
  now: 1_000,
  display: (state: SkillCdState) => ({
    isActive: true,
    percent: 0.5,
    text: String(state.skillLevelId),
    usable: false,
  }),
};

describe("latestCdBySkill", () => {
  it("keeps the newest level id per base skill", () => {
    const latest = latestCdBySkill([
      cd(142_001, 5),
      cd(142_002, 9),
      cd(142_003, 7),
    ]);
    expect(latest.get(1420)?.skillLevelId).toBe(142_002);
  });
});

describe("buildTeammateCdRows", () => {
  it("renders every selected skill and leaves missing ones ready", () => {
    const rows = buildTeammateCdRows({
      ...base,
      teammates: [mate("2", 4, [cd(142_001, 1)])],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells.map((cell) => cell.skillId)).toEqual([1420, 1430]);
    expect(rows[0]!.cells[0]!.display?.text).toBe("142001");
    expect(rows[0]!.cells[1]!.display).toBeNull();
    expect(rows[0]!.isStale).toBe(false);
  });

  it("hides classes without a selection and orders dead teammates last", () => {
    const rows = buildTeammateCdRows({
      ...base,
      linkOnline: false,
      dead: new Set(["1"]),
      teammates: [mate("3", 4, []), mate("1", 4, []), mate("9", 2, [])],
    });
    expect(rows.map((row) => row.teammateEntityUuid)).toEqual(["3", "1"]);
    expect(rows[1]!.isDead).toBe(true);
    expect(rows.every((row) => row.isStale)).toBe(true);
  });
});

function layout(
  kind: TeamLayoutPayload["kind"],
  slots: [uuid: string, group: number, row: number, isSelf?: boolean][],
): TeamLayoutPayload {
  return {
    kind,
    slots: slots.map(([uuid, group, row, isSelf = false]) => ({
      uuid,
      group,
      row,
      isSelf,
    })),
  };
}

describe("buildTeammateCdRows with a team layout", () => {
  it("follows the team panel order and puts unplaced teammates last", () => {
    const rows = buildTeammateCdRows({
      ...base,
      layout: layout("twenty", [
        ["1", 1, 1, true],
        ["9", 2, 1],
        ["3", 1, 2],
      ]),
      teammates: [mate("2", 4, []), mate("9", 4, []), mate("3", 4, [])],
    });
    expect(rows.map((row) => row.teammateEntityUuid)).toEqual(["3", "9", "2"]);
  });
});

describe("buildTeammateCdSlots", () => {
  it("fills only sharing teammates' rows and leaves the local row empty", () => {
    const slots = buildTeammateCdSlots({
      ...base,
      dead: new Set(["5"]),
      layout: layout("five", [
        ["1", 1, 1, true],
        ["5", 1, 2],
        ["6", 1, 3],
        ["7", 1, 4],
      ]),
      teammates: [
        mate("1", 4, []),
        mate("5", 4, [cd(142_001, 1)]),
        mate("7", 2, []),
      ],
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      teammateEntityUuid: "5",
      group: 1,
      row: 2,
      isDead: true,
      isStale: false,
    });
    expect(slots[0]!.cells.map((cell) => cell.skillId)).toEqual([1420, 1430]);
  });

  it("draws nothing without a layout", () => {
    expect(
      buildTeammateCdSlots({ ...base, teammates: [mate("5", 4, [])] }),
    ).toEqual([]);
  });
});

describe("teammateCdSlotPlacement", () => {
  const grid = createDefaultTeammateCdSlotLayout();
  grid.five = { rowPitch: 40, side: "left" };
  grid.twenty = {
    rowPitch: 30,
    columnOffset: 300,
    blockOffset: 170,
    leftSide: "left",
    rightSide: "right",
  };

  it("steps five-member rows by the row pitch", () => {
    expect(teammateCdSlotPlacement(grid, "five", 1, 3)).toEqual({
      left: 0,
      top: 80,
      side: "left",
    });
  });

  it("places twenty-member groups in two columns and two halves", () => {
    expect(teammateCdSlotPlacement(grid, "twenty", 1, 1)).toEqual({
      left: 0,
      top: 0,
      side: "left",
    });
    expect(teammateCdSlotPlacement(grid, "twenty", 2, 2)).toEqual({
      left: 300,
      top: 30,
      side: "right",
    });
    expect(teammateCdSlotPlacement(grid, "twenty", 3, 1)).toEqual({
      left: 0,
      top: 170,
      side: "left",
    });
    expect(teammateCdSlotPlacement(grid, "twenty", 4, 5)).toEqual({
      left: 300,
      top: 290,
      side: "right",
    });
  });
});

describe("teammateCdGridSlots", () => {
  it("numbers slots like the game's member badges", () => {
    expect(teammateCdGridSlots("five").map((slot) => slot.number)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    const twenty = teammateCdGridSlots("twenty");
    expect(twenty).toHaveLength(20);
    expect(twenty[7]).toEqual({ group: 2, row: 3, number: 8 });
  });
});
