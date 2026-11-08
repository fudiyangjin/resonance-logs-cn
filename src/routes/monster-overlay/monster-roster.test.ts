import { describe, expect, it } from "vitest";

import type { RosterMonsterState, RosterPlayerState } from "$lib/bindings";
import type { MonsterSkillTiming } from "$lib/config/monster-skill-timing";
import {
  buildRosterView,
  formatRosterPercent,
  formatSkillSeconds,
  rankRoster,
  ROSTER_CAST_FLASH_MS,
  ROSTER_RESORT_MS,
  rosterRankComparator,
  rosterSkillPhase,
  visibleRosterMonsters,
  type RosterCompare,
  type RosterSkillPhaseInput,
  type RosterViewInput,
} from "./monster-roster";

let nextSeq = 0;

function monster(
  uuid: string,
  percent: number,
  overrides: Partial<RosterMonsterState> = {},
): RosterMonsterState {
  nextSeq += 1;
  return {
    uuid,
    monsterId: 100,
    kind: "normal",
    hp: percent * 10,
    maxHp: 1_000,
    targetUuid: null,
    distanceM: null,
    joinedSeq: nextSeq,
    joinedAtMs: 0,
    skillCasts: [],
    currentCast: null,
    ...overrides,
  };
}

const priest: RosterPlayerState = {
  uuid: "p1",
  name: "牧师",
  professionId: null,
};
const archer: RosterPlayerState = {
  uuid: "p2",
  name: "弓手",
  professionId: null,
};

/** Template 200 can cast skills 7 and 8; every other template none. */
const skillIdsOf = (monsterId: number | null) =>
  monsterId === 200 ? [7, 8] : [];

function view(
  monsters: RosterMonsterState[],
  overrides: Partial<RosterViewInput> = {},
) {
  const blocked = overrides.blocked ?? new Set<number>();
  const order = rankRoster(
    null,
    visibleRosterMonsters({ monsters }, blocked),
    0,
  ).order;
  return buildRosterView({
    monsters,
    players: [priest, archer],
    currentTargetUuid: null,
    order,
    normalRows: 5,
    tankMode: false,
    blocked,
    watchedSkillIds: [],
    skillIdsOf,
    ...overrides,
  });
}

const uuids = (rows: { monster: RosterMonsterState }[]) =>
  rows.map((row) => row.monster.uuid);

describe("rankRoster", () => {
  it("ranks by HP% and keeps the order between resorts", () => {
    const a = monster("a", 90);
    const b = monster("b", 50);
    const first = rankRoster(null, [a, b], 1_000);
    expect(first).toEqual({
      order: ["a", "b"],
      sortedAt: 1_000,
      pending: false,
    });

    const hitA = { ...a, hp: 100 };
    const kept = rankRoster(first, [hitA, b], 1_500);
    expect(kept.order).toEqual(["a", "b"]);
    expect(kept.pending).toBe(true);
    expect(kept.sortedAt).toBe(1_000);

    const resorted = rankRoster(kept, [hitA, b], 1_000 + ROSTER_RESORT_MS);
    expect(resorted).toEqual({
      order: ["b", "a"],
      sortedAt: 1_000 + ROSTER_RESORT_MS,
      pending: false,
    });
  });

  it("inserts new monsters by current HP and drops departed ones at once", () => {
    const a = monster("a", 90);
    const b = monster("b", 50);
    const first = rankRoster(null, [a, b], 0);

    const c = monster("c", 70);
    const next = rankRoster(first, [b, c], 100);
    expect(next.order).toEqual(["c", "b"]);
    expect(next.pending).toBe(false);
  });

  it("only checks neighbours between resorts instead of sorting again", () => {
    const monsters = Array.from({ length: 30 }, (_, index) =>
      monster(`m${index}`, 90 - index),
    );
    const byHp = rosterRankComparator(false, null);
    let calls = 0;
    const counting: RosterCompare = (left, right) => {
      calls += 1;
      return byHp(left, right);
    };
    const first = rankRoster(null, monsters, 0, counting);

    calls = 0;
    expect(rankRoster(first, monsters, 100, counting).pending).toBe(false);
    expect(calls).toBeLessThanOrEqual(monsters.length - 1);

    // A hit that breaks the order is still noticed.
    const hit = monsters.map((entry, index) =>
      index === 0 ? { ...entry, hp: 0 } : entry,
    );
    expect(rankRoster(first, hit, 100, counting)).toMatchObject({
      order: first.order,
      pending: true,
    });
  });

  it("can rank monsters attacking someone else first, each group by HP", () => {
    const onMe = monster("on-me", 90, { targetUuid: "local" });
    const noTarget = monster("no-target", 70);
    const onPriest = monster("on-priest", 50, { targetUuid: "p1" });
    const onSummon = monster("on-summon", 30, { targetUuid: "summon" });
    const monsters = [onMe, noTarget, onPriest, onSummon];

    const first = rankRoster(
      null,
      monsters,
      0,
      rosterRankComparator(true, "local"),
    );
    expect(first.order).toEqual([
      "on-priest",
      "on-summon",
      "on-me",
      "no-target",
    ]);

    // Off, or without a known local player, it is the plain HP rank.
    for (const compare of [
      rosterRankComparator(false, "local"),
      rosterRankComparator(true, null),
    ]) {
      expect(rankRoster(null, monsters, 0, compare).order).toEqual([
        "on-me",
        "no-target",
        "on-priest",
        "on-summon",
      ]);
    }

    // A newcomer attacking someone else is slotted in ahead of the rest.
    const newcomer = monster("new", 10, { targetUuid: "p2" });
    const next = rankRoster(
      first,
      [...monsters, newcomer],
      100,
      rosterRankComparator(true, "local"),
    );
    expect(next.order).toEqual([
      "on-priest",
      "on-summon",
      "new",
      "on-me",
      "no-target",
    ]);
  });
});

describe("buildRosterView", () => {
  it("pins the target, lists bosses, then the thickest normals and elites", () => {
    const monsters = [
      monster("n1", 20),
      monster("n2", 95),
      monster("elite", 40, { kind: "elite" }),
      monster("boss", 60, { kind: "boss" }),
      monster("target", 10),
      monster("n3", 80),
      monster("n4", 30),
    ];

    const result = view(monsters, {
      currentTargetUuid: "target",
      normalRows: 2,
    });

    expect(uuids(result.rows)).toEqual(["target", "boss", "n2", "n3"]);
    expect(result.rows[0]?.isTarget).toBe(true);
    expect(result.strip.map((bar) => bar.uuid)).toEqual(["elite", "n4", "n1"]);
    expect(result.stripHighestRatio).toBeCloseTo(0.4);
    expect(result.stripLowestRatio).toBeCloseTo(0.2);
    expect(result.count).toBe(7);
  });

  it("lists every boss even with no rows left, folding elites", () => {
    const monsters = [
      monster("b1", 10, { kind: "boss" }),
      monster("b2", 90, { kind: "boss" }),
      monster("e1", 50, { kind: "elite" }),
      monster("n1", 50),
    ];

    const result = view(monsters, { normalRows: 0 });

    expect(uuids(result.rows)).toEqual(["b2", "b1"]);
    expect(result.strip.map((bar) => bar.uuid)).toEqual(["e1", "n1"]);
  });

  it("promotes monsters attacking someone else in tank mode", () => {
    const monsters = [
      monster("n1", 90),
      monster("n2", 80),
      monster("loose", 10, { targetUuid: "p1" }),
      monster("loose2", 5, { targetUuid: "p1", kind: "elite" }),
      monster("loose3", 20, { targetUuid: "p2" }),
    ];

    const tank = view(monsters, { normalRows: 1, tankMode: true });
    expect(uuids(tank.rows)).toEqual(["n1", "loose3", "loose", "loose2"]);
    expect(
      tank.rows.find((row) => row.monster.uuid === "loose")?.looseTarget,
    ).toEqual(priest);
    expect(tank.strip.map((bar) => bar.uuid)).toEqual(["n2"]);
    expect(tank.looseCount).toBe(3);
    expect(tank.looseByPlayer).toEqual([
      { player: priest, count: 2 },
      { player: archer, count: 1 },
    ]);

    const dps = view(monsters, { normalRows: 1 });
    expect(uuids(dps.rows)).toEqual(["n1"]);
    expect(dps.rows.every((row) => row.looseTarget === null)).toBe(true);
  });

  it("does not count a monster attacking the local player as loose", () => {
    // The payload's players never include the local player.
    const result = view([monster("a", 50, { targetUuid: "local" })], {
      tankMode: true,
    });
    expect(result.looseCount).toBe(0);
  });
});

describe("visibleRosterMonsters", () => {
  it("drops blocked templates from the rows and the count", () => {
    const monsters = [
      monster("a", 90, { monsterId: 1 }),
      monster("b", 10, { monsterId: 2 }),
      monster("c", 50, { monsterId: 3 }),
    ];
    const visible = visibleRosterMonsters({ monsters }, new Set([2]));

    expect(visible.map((entry) => entry.uuid)).toEqual(["a", "c"]);
    expect(view(visible).count).toBe(2);
  });
});

describe("formatRosterPercent", () => {
  it("shows a decimal below 10% and never 0 for a living monster", () => {
    expect(formatRosterPercent(1)).toBe("100%");
    expect(formatRosterPercent(0.999)).toBe("99%");
    expect(formatRosterPercent(0.0567)).toBe("5.6%");
    expect(formatRosterPercent(0.0001)).toBe("0.1%");
    expect(formatRosterPercent(0)).toBe("0%");
  });
});

describe("watched monsters", () => {
  it("come right below the target by HP and do not use the normal row quota", () => {
    const monsters = [
      monster("n1", 90),
      monster("w-low", 20, { monsterId: 200 }),
      monster("boss", 60, { kind: "boss" }),
      monster("w-high", 80, { monsterId: 200 }),
      monster("target", 50),
      monster("n2", 70),
    ];

    const result = view(monsters, {
      currentTargetUuid: "target",
      normalRows: 1,
      watchedSkillIds: [8, 7],
    });

    expect(uuids(result.rows)).toEqual([
      "target",
      "w-high",
      "w-low",
      "boss",
      "n1",
    ]);
    expect(result.rows[1]?.watchedSkillIds).toEqual([8, 7]);
    expect(result.strip.map((bar) => bar.uuid)).toEqual(["n2"]);
  });

  it("include monsters seen casting a watched skill their template lacks", () => {
    const caster = monster("caster", 40, {
      skillCasts: [{ skillId: 9, castAtMs: 0 }],
    });
    const result = view([monster("n1", 90), caster], {
      normalRows: 0,
      watchedSkillIds: [9],
    });
    expect(uuids(result.rows)).toEqual(["caster"]);
    expect(result.rows[0]?.watchedSkillIds).toEqual([9]);
  });

  it("show blocked watched monsters as uncounted skill-only rows", () => {
    const monsters = [
      monster("matrix-b", 90, { monsterId: 200 }),
      monster("hidden", 50, { monsterId: 300 }),
      monster("matrix-a", 10, { monsterId: 200 }),
      monster("n1", 70),
    ];
    const result = view(monsters, {
      blocked: new Set([200, 300]),
      watchedSkillIds: [7],
    });

    expect(uuids(result.rows)).toEqual(["matrix-b", "matrix-a", "n1"]);
    expect(result.rows.map((row) => row.skillOnly)).toEqual([
      true,
      true,
      false,
    ]);
    expect(result.count).toBe(1);
  });

  it("keep a blocked watched target pinned as a skill-only row", () => {
    const result = view(
      [monster("n1", 90), monster("t", 50, { monsterId: 200 })],
      {
        currentTargetUuid: "t",
        blocked: new Set([200]),
        watchedSkillIds: [7],
      },
    );
    expect(uuids(result.rows)).toEqual(["t", "n1"]);
    expect(result.rows[0]).toMatchObject({ isTarget: true, skillOnly: true });
  });
});

describe("rosterSkillPhase", () => {
  const timing = (
    overrides: Partial<MonsterSkillTiming> = {},
  ): MonsterSkillTiming => ({
    cooldownSeconds: 10,
    battleStart: null,
    singSeconds: 0,
    danger: false,
    ...overrides,
  });
  const phase = (overrides: Partial<RosterSkillPhaseInput>) =>
    rosterSkillPhase({
      timing: timing(),
      joinedAtMs: 0,
      lastCastAtMs: null,
      currentCastAtMs: null,
      nowMs: 0,
      ...overrides,
    });

  it("counts the battle-start window from joining the roster", () => {
    const start = timing({ battleStart: [5, 20] });
    expect(phase({ timing: start, joinedAtMs: 1_000, nowMs: 3_000 })).toEqual({
      kind: "cooling",
      readyAtMs: 6_000,
    });
    expect(phase({ timing: start, joinedAtMs: 1_000, nowMs: 6_000 })).toEqual({
      kind: "ready",
    });
    expect(phase({ timing: timing({ battleStart: "never" }) })).toEqual({
      kind: "unknown",
    });
    expect(phase({})).toEqual({ kind: "ready" });
    expect(phase({ timing: timing({ cooldownSeconds: 0 }) })).toEqual({
      kind: "unknown",
    });
  });

  it("flashes an instant cast, then counts its cooldown", () => {
    expect(phase({ lastCastAtMs: 1_000, nowMs: 2_000 })).toEqual({
      kind: "cast",
      untilMs: 1_000 + ROSTER_CAST_FLASH_MS,
    });
    expect(phase({ lastCastAtMs: 1_000, nowMs: 5_000 })).toEqual({
      kind: "cooling",
      readyAtMs: 11_000,
    });
    expect(phase({ lastCastAtMs: 1_000, nowMs: 11_000 })).toEqual({
      kind: "ready",
    });
    expect(
      phase({ lastCastAtMs: 1_000, nowMs: 5_000, customCooldownSeconds: 3 }),
    ).toEqual({ kind: "ready" });
  });

  it("shows the sing bar until it ends or the cast is cut short", () => {
    const sing = timing({ singSeconds: 3, danger: true });
    expect(
      phase({
        timing: sing,
        lastCastAtMs: 1_000,
        currentCastAtMs: 1_000,
        nowMs: 2_000,
      }),
    ).toEqual({
      kind: "casting",
      startedAtMs: 1_000,
      endsAtMs: 4_000,
      danger: true,
    });
    expect(
      phase({
        timing: sing,
        lastCastAtMs: 1_000,
        currentCastAtMs: 1_000,
        nowMs: 4_000,
      }),
    ).toEqual({ kind: "cooling", readyAtMs: 11_000 });
    // Interrupted: no current cast any more, and no instant-cast flash.
    expect(phase({ timing: sing, lastCastAtMs: 1_000, nowMs: 1_500 })).toEqual({
      kind: "cooling",
      readyAtMs: 11_000,
    });
  });
});

describe("formatSkillSeconds", () => {
  it("shows whole seconds from 3 s and one decimal below", () => {
    expect(formatSkillSeconds(12_300)).toBe("13s");
    expect(formatSkillSeconds(3_000)).toBe("3s");
    expect(formatSkillSeconds(1_240)).toBe("1.2");
    expect(formatSkillSeconds(-5)).toBe("0.0");
  });
});
