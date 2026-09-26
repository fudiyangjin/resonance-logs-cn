import { describe, expect, it } from "vitest";
import type {
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import { overlayNow } from "../../../game-overlay/overlay-clock.svelte.js";
import {
  buildMechanicView,
  groupComplementaryPairs,
  isComplementaryPartner,
  parsePairMark,
  unlockedColors,
} from "./mechanics";

function entity(entityUuid: string, name: string): MinimapEntity {
  return {
    entityUuid,
    entityType: "char",
    kind: entityUuid === "local" ? "local" : "teammate",
    x: 0,
    y: 129,
    z: 0,
    name,
    monsterId: null,
    facing: null,
    currentHp: null,
    maxHp: null,
    targetEntityUuid: null,
    topSummonerId: null,
    isDead: false,
  };
}

function mechanicEntity(
  entityUuid: string,
  monsterId: number,
  x: number,
  z: number,
): MinimapEntity {
  return {
    entityUuid,
    entityType: "dummy",
    kind: "dummy",
    x,
    y: 129,
    z,
    name: null,
    monsterId,
    facing: null,
    currentHp: null,
    maxHp: null,
    targetEntityUuid: null,
    topSummonerId: null,
    isDead: false,
  };
}

function pairBuff(
  targetEntityUuid: string,
  effectIds: number[],
  extras: { baseId?: number; createTimeMs?: number } = {},
) {
  return {
    targetEntityUuid,
    buffUuid: 1,
    baseId: extras.baseId ?? 884659,
    layer: 1,
    createTimeMs: extras.createTimeMs ?? overlayNow(),
    durationMs: 0,
    fireUuid: null,
    sourceConfigId: 884666,
    effectIds,
  };
}

function snapshot(buffs: MinimapSnapshot["buffs"]): MinimapSnapshot {
  return {
    sceneId: 6615,
    localPlayerUuid: "local",
    entities: [
      entity("local", "本机"),
      entity("ice", "冰魔"),
      entity("bow", "神射"),
      entity("forest", "森语"),
    ],
    buffs,
    markers: [],
  };
}

function mechanicBuff(
  targetEntityUuid: string,
  baseId: number,
  extras: { fireUuid?: string; createTimeMs?: number } = {},
): MinimapSnapshot["buffs"][number] {
  return {
    targetEntityUuid,
    buffUuid: 2,
    baseId,
    layer: 1,
    createTimeMs: extras.createTimeMs ?? overlayNow(),
    durationMs: 0,
    fireUuid: extras.fireUuid ?? null,
    sourceConfigId: null,
    effectIds: [],
  };
}

function skillCast(
  entityUuid: string,
  skillId: number,
  timeMs = overlayNow(),
): MinimapSkillCast {
  return {
    entityUuid,
    skillId,
    timeMs,
    x: null,
    z: null,
    facing: null,
  };
}

describe("parsePairMark", () => {
  it("decodes black-white-black locked on slot 2", () => {
    expect(parsePairMark([1, 5, 3, 8])).toEqual({
      slots: ["black", "white", "black"],
      lockIndex: 2,
      target: "white",
      alreadyMatched: false,
    });
  });

  it("decodes white-black-white locked on slot 2", () => {
    expect(parsePairMark([4, 2, 6, 8])).toEqual({
      slots: ["white", "black", "white"],
      lockIndex: 2,
      target: "black",
      alreadyMatched: false,
    });
  });

  it("reads lock 1/2/3 from customize values 7/8/9", () => {
    expect(parsePairMark([1, 2, 6, 7])?.lockIndex).toBe(1);
    expect(parsePairMark([1, 5, 3, 8])?.lockIndex).toBe(2);
    expect(parsePairMark([1, 5, 6, 9])?.lockIndex).toBe(3);
  });

  it("decodes the 1787243563888 opening marks", () => {
    expect(parsePairMark([1, 5, 6, 9])).toEqual({
      slots: ["black", "white", "white"],
      lockIndex: 3,
      target: "white",
      alreadyMatched: false,
    });
    expect(parsePairMark([4, 5, 3, 7])).toEqual({
      slots: ["white", "white", "black"],
      lockIndex: 1,
      target: "white",
      alreadyMatched: false,
    });
    expect(parsePairMark([1, 2, 6, 7])).toEqual({
      slots: ["black", "black", "white"],
      lockIndex: 1,
      target: "black",
      alreadyMatched: false,
    });
    expect(parsePairMark([4, 2, 3, 9])).toEqual({
      slots: ["white", "black", "black"],
      lockIndex: 3,
      target: "black",
      alreadyMatched: false,
    });
  });

  it("returns null without four parameters or mismatched slots", () => {
    expect(parsePairMark([])).toBeNull();
    expect(parsePairMark([1, 5, 3])).toBeNull();
    expect(parsePairMark([1, 4, 3, 8])).toBeNull();
    expect(parsePairMark([1, 2, 3, 4])).toBeNull();
    expect(parsePairMark([4, 5, 6, 12])).toBeNull();
  });
});

describe("pair partners", () => {
  it("matches complementary unlocked slots", () => {
    const blackWhiteBlack = parsePairMark([1, 5, 3, 8])!;
    const whiteBlackWhite = parsePairMark([4, 2, 6, 8])!;

    expect(unlockedColors(blackWhiteBlack)).toEqual(["black", "black"]);
    expect(unlockedColors(whiteBlackWhite)).toEqual(["white", "white"]);
    expect(isComplementaryPartner(blackWhiteBlack, whiteBlackWhite)).toBe(true);
    expect(isComplementaryPartner(blackWhiteBlack, blackWhiteBlack)).toBe(
      false,
    );
  });

  it("does not pair already-matched marks", () => {
    const matched = parsePairMark([4, 5, 6, 8])!;
    const mixed = parsePairMark([1, 5, 3, 8])!;
    expect(matched.alreadyMatched).toBe(true);
    expect(isComplementaryPartner(matched, mixed)).toBe(false);
  });

  it("does not treat the same-lock ice/bow swap as complementary", () => {
    const ice = parsePairMark([1, 2, 6, 7])!;
    const bow = parsePairMark([4, 5, 3, 7])!;
    expect(isComplementaryPartner(ice, bow)).toBe(false);
  });

  it("pairs cross-lock partners who copy the same slot into their target color", () => {
    const local = parsePairMark([1, 5, 6, 9])!;
    const bow = parsePairMark([4, 5, 3, 7])!;
    const ice = parsePairMark([1, 2, 6, 7])!;
    const forest = parsePairMark([4, 2, 3, 9])!;

    expect(isComplementaryPartner(local, bow)).toBe(true);
    expect(isComplementaryPartner(ice, forest)).toBe(true);
    expect(isComplementaryPartner(local, ice)).toBe(false);
    expect(isComplementaryPartner(bow, forest)).toBe(false);
  });

  it("groups complementary players into one pair", () => {
    const marks = new Map([
      ["a", parsePairMark([1, 5, 3, 8])!],
      ["b", parsePairMark([4, 2, 6, 8])!],
      ["c", parsePairMark([4, 5, 6, 8])!],
    ]);
    expect(groupComplementaryPairs(marks)).toEqual({
      pairs: [["a", "b"]],
      unmatched: ["c"],
    });
  });
});

describe("buildMechanicView pair rows", () => {
  it("puts complementary partners on one row with a shared color", () => {
    const view = buildMechanicView(
      snapshot([pairBuff("ice", [1, 5, 3, 8]), pairBuff("bow", [4, 2, 6, 8])]),
      (player) => player.name ?? player.entityUuid,
      [],
    );

    const pairRows = view.rows.filter((row) =>
      row.key.startsWith("wasteland:pair:"),
    );
    expect(pairRows).toHaveLength(1);
    expect(pairRows[0]?.targets.map((target) => target.uuid).sort()).toEqual([
      "bow",
      "ice",
    ]);
    expect(view.entityColorSlots.get("ice")).toBe(
      view.entityColorSlots.get("bow"),
    );
    expect(view.entityColorSlots.get("ice")).toBe(0);
    expect(pairRows[0]?.label).toContain("↔");
  });

  it("groups the 1787243563888 opening into two swap rows", () => {
    const view = buildMechanicView(
      snapshot([
        pairBuff("local", [1, 5, 6, 9]),
        pairBuff("bow", [4, 5, 3, 7]),
        pairBuff("ice", [1, 2, 6, 7]),
        pairBuff("forest", [4, 2, 3, 9]),
      ]),
      (player) => player.name ?? player.entityUuid,
      [],
    );
    const pairRows = view.rows.filter((row) =>
      row.key.startsWith("wasteland:pair:"),
    );
    expect(pairRows).toHaveLength(2);
    expect(view.entityColorSlots.get("local")).toBe(
      view.entityColorSlots.get("bow"),
    );
    expect(view.entityColorSlots.get("ice")).toBe(
      view.entityColorSlots.get("forest"),
    );
    expect(view.entityColorSlots.get("local")).not.toBe(
      view.entityColorSlots.get("ice"),
    );
    const targetSets = pairRows
      .map((row) =>
        row.targets
          .map((target) => target.uuid)
          .sort()
          .join("+"),
      )
      .sort();
    expect(targetSets).toEqual(["bow+local", "forest+ice"]);
  });

  it("does not treat empty customize as already matched", () => {
    const view = buildMechanicView(
      snapshot([pairBuff("ice", []), pairBuff("bow", [1, 5, 3, 8])]),
      (player) => player.name ?? player.entityUuid,
      [],
    );
    const pairRows = view.rows.filter((row) =>
      row.key.startsWith("wasteland:pair:"),
    );
    expect(pairRows).toHaveLength(1);
    expect(pairRows[0]?.label).not.toContain("已同色");
    expect(pairRows[0]?.targets.map((target) => target.uuid)).toEqual(["bow"]);
  });

  it("hides pair marks after settle", () => {
    const view = buildMechanicView(
      snapshot([
        pairBuff("ice", [1, 5, 3, 8]),
        pairBuff("bow", [4, 2, 6, 8]),
        pairBuff("ice", [], { baseId: 884660, createTimeMs: 26_000 }),
      ]),
      (player) => player.name ?? player.entityUuid,
      [],
    );
    expect(
      view.rows.filter(
        (row) =>
          row.key.startsWith("wasteland:pair:ice") ||
          row.key.includes("pair:bow"),
      ),
    ).toHaveLength(0);
    expect(view.rows.some((row) => row.key === "wasteland:pair:settle")).toBe(
      true,
    );
  });
});

describe("buildMechanicView Heluga shadow", () => {
  it("colors every energy ball by its targeted player", () => {
    const state = snapshot([
      mechanicBuff("local", 884641, { fireUuid: "ball-a" }),
      mechanicBuff("local", 884641, { fireUuid: "ball-b" }),
      mechanicBuff("ice", 884641, { fireUuid: "ball-c" }),
    ]);
    state.entities.push(
      mechanicEntity("ball-a", 884640, -25, 30),
      mechanicEntity("ball-b", 884668, -35, 40),
      mechanicEntity("ball-c", 884669, -15, 40),
      mechanicEntity("pool", 884642, -18, 33),
    );

    const view = buildMechanicView(
      state,
      (player) => player.name ?? player.entityUuid,
      [],
    );

    expect(view.entityColorSlots.get("ball-a")).toBe(
      view.entityColorSlots.get("local"),
    );
    expect(view.entityColorSlots.get("ball-b")).toBe(
      view.entityColorSlots.get("local"),
    );
    expect(view.entityColorSlots.get("ball-c")).toBe(
      view.entityColorSlots.get("ice"),
    );
    expect(view.entityColorSlots.get("ball-c")).not.toBe(
      view.entityColorSlots.get("ball-a"),
    );
    expect(view.entityColorSlots.has("pool")).toBe(true);
    expect(
      view.regions.filter((region) => region.kind === "line"),
    ).toHaveLength(3);
    expect(
      view.rows
        .filter((row) => row.key.startsWith("wasteland:shadow:target:"))
        .map((row) => row.targets[0]?.uuid)
        .sort(),
    ).toEqual(["ice", "local"]);
  });
});

describe("buildMechanicView near/far chain", () => {
  it("shows the marked distribution and numbers observed casts in order", () => {
    const now = overlayNow();
    const state = snapshot([
      mechanicBuff("near-a", 884609, { createTimeMs: now - 20_000 }),
      mechanicBuff("near-b", 884609, { createTimeMs: now - 20_000 }),
      mechanicBuff("far-a", 884610, { createTimeMs: now - 20_000 }),
      mechanicBuff("far-b", 884610, { createTimeMs: now - 20_000 }),
    ]);
    state.entities.push(
      mechanicEntity("near-a", 884606, -37, 39),
      mechanicEntity("near-b", 884607, -26, 52),
      mechanicEntity("far-a", 884607, -24, 28),
      mechanicEntity("far-b", 884606, -13, 41),
    );

    const view = buildMechanicView(
      state,
      (player) => player.name ?? player.entityUuid,
      [
        skillCast("far-a", 470113, now - 3_000),
        skillCast("near-a", 470112, now - 1_000),
      ],
    );

    expect(
      view.rows.find((row) => row.key === "wasteland:chain:overview")?.label,
    ).toContain("近圈 ×2 / 远圈 ×2");
    const castRows = view.rows
      .filter((row) => row.key.startsWith("wasteland:chain:cast:"))
      .sort((left, right) => left.createTimeMs - right.createTimeMs);
    expect(castRows.map((row) => row.label)).toEqual([
      "第 1 炸：远圈",
      "第 2 炸：近圈",
    ]);
    expect(view.entityColorSlots.get("near-a")).not.toBe(
      view.entityColorSlots.get("far-a"),
    );
  });
});
