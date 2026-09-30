import { describe, expect, it } from "vitest";
import type { SkillCdState, TeammateCdPayload } from "$lib/bindings";
import { buildTeammateCdRows, latestCdBySkill } from "./monster-teammate-cd";

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
