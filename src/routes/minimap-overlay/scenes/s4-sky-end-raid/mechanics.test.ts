import { beforeEach, describe, expect, it } from "vitest";
import type {
  MinimapBuffFact,
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import type { MechanicRegion } from "../../scene-types";
import { resolveScene } from "../../scene-registry";
import { predictPair, resetCelestialSpawns } from "./celestial";
import { buildMechanicView, resolveLapsisVoiceCues } from "./mechanics";
import { ritualSides } from "./ritual";
import { shareOrder } from "./share";

function entity(
  entityUuid: string,
  kind: MinimapEntity["kind"],
  monsterId: number | null = null,
  x = 0,
  z = 0,
): MinimapEntity {
  return {
    entityUuid,
    entityType: monsterId == null ? "char" : "monster",
    kind,
    x,
    y: 350.01,
    z,
    name: entityUuid,
    monsterId,
    facing: null,
    currentHp: null,
    maxHp: null,
    targetEntityUuid: null,
    isDead: false,
    topSummonerId: null,
  };
}

function buff(
  targetEntityUuid: string,
  baseId: number,
  createTimeMs = 1_000,
  durationMs = 3_000,
): MinimapBuffFact {
  return {
    targetEntityUuid,
    buffUuid: baseId,
    baseId,
    layer: 1,
    createTimeMs,
    durationMs,
    fireUuid: "boss",
    sourceConfigId: null,
    effectIds: [],
  };
}

function cast(skillId: number, timeMs = 1_000): MinimapSkillCast {
  return { entityUuid: "boss", skillId, timeMs, x: 0, z: 0, facing: null };
}

function snapshot(sceneId = 13032): MinimapSnapshot {
  return {
    sceneId,
    localPlayerUuid: "local",
    entities: [
      entity("local", "local"),
      entity("mate", "teammate", null, 3, 4),
      entity("boss", "boss", 103410),
    ],
    buffs: [],
    markers: [],
  };
}

function chaser(targetEntityUuid: string | null): MinimapEntity {
  const item = entity("chaser", "monster", 103423, 0, 0);
  item.targetEntityUuid = targetEntityUuid;
  return item;
}

const name = (item: MinimapEntity) => item.name ?? item.entityUuid;

describe("S4 Lapsis shared scene", () => {
  it("resolves all three entrances to one definition", () => {
    expect(resolveScene(13031)).toBe(resolveScene(13032));
    expect(resolveScene(13032)).toBe(resolveScene(13033));
  });

  it("renders the full burst at the cast position on every difficulty", () => {
    for (const sceneId of [13031, 13032, 13033]) {
      const view = buildMechanicView(
        snapshot(sceneId),
        name,
        [cast(3395170)],
        1_100,
      );
      expect(view.regions).toContainEqual(
        expect.objectContaining({ radius: 28.67 }),
      );
      expect(view.rows.some((row) => row.key === "fullBurst")).toBe(true);
    }
  });

  it("takes light spear targets only from the callout buff", () => {
    const current = snapshot();
    current.buffs.push(buff("local", 829517), buff("mate", 829533));
    const row = buildMechanicView(current, name, [], 1_100).rows.find(
      (item) => item.key === "lightSpear",
    );
    expect(row?.targets.map((target) => target.uuid)).toEqual(["local"]);
  });

  it("shows spear HP as one percentage line without a countdown", () => {
    const current = snapshot();
    const low = entity("low", "monster", 103404, 5, 5);
    low.currentHp = 42;
    low.maxHp = 100;
    const high = entity("high", "monster", 103404, 6, 6);
    high.currentHp = 8;
    high.maxHp = 10;
    const empty = entity("empty", "monster", 103404, 7, 7);
    empty.maxHp = 0;
    empty.currentHp = 0;
    current.entities.push(low, high, empty);
    const view = buildMechanicView(current, name, [], 1_100);
    const row = view.rows.find((item) => item.key === "lightSpear:hp");
    expect(row?.hideTimer).toBe(true);
    expect(row?.targets).toEqual([]);
    expect(row?.label).toBe("80%  42%");
    expect(
      view.rows.filter((item) => item.key.startsWith("lightSpear:hp")),
    ).toHaveLength(1);
  });

  it("lists shadow callout targets without drawing a sector", () => {
    const current = snapshot();
    current.buffs.push(buff("local", 829537), buff("mate", 829537));
    const view = buildMechanicView(current, name, [], 1_100);
    const row = view.rows.find((item) => item.key === "shadow");
    expect(row?.targets.map((target) => target.uuid)).toEqual([
      "local",
      "mate",
    ]);
    expect(view.regions.some((region) => region.kind === "sector")).toBe(false);
  });

  it("keeps sprout and rain vulnerability on separate buffs", () => {
    const current = snapshot();
    current.buffs.push(buff("local", 829530), buff("mate", 829531));
    const rows = buildMechanicView(current, name, [], 1_100).rows;
    const targetsOf = (key: string) =>
      rows.find((row) => row.key === key)?.targets.map((target) => target.uuid);
    expect(targetsOf("sprout")).toEqual(["local"]);
    expect(targetsOf("rain:vulnerable")).toEqual(["mate"]);
  });

  it("draws a chase line only while the chase link is alive", () => {
    const current = snapshot();
    current.entities.push(chaser("mate"));
    const line = expect.objectContaining({
      kind: "line",
      x1: 0,
      z1: 0,
      x2: 3,
      z2: 4,
    });

    expect(
      buildMechanicView(current, name, [], 1_100).regions,
    ).not.toContainEqual(line);

    current.buffs.push(buff("chaser", 829539, 1_000, -1));
    current.entities[3]!.currentHp = 50;
    current.entities[3]!.maxHp = 200;
    const view = buildMechanicView(current, name, [], 1_100);
    const row = view.rows.find((item) => item.key === "chaser:chaser");
    expect(view.regions).toContainEqual(line);
    expect(row?.label).toBe("25% → mate · 5.0m");
    expect(row?.targets).toEqual([]);
  });

  it("skips the chase line when the target is missing or dead", () => {
    const current = snapshot();
    current.entities.push(chaser("missing"));
    current.buffs.push(buff("chaser", 829539, 1_000, -1));
    expect(
      buildMechanicView(current, name, [], 1_100).regions.some(
        (region) => region.kind === "line",
      ),
    ).toBe(false);

    current.entities[3] = chaser("mate");
    current.entities[1] = { ...current.entities[1]!, isDead: true };
    expect(
      buildMechanicView(current, name, [], 1_100).regions.some(
        (region) => region.kind === "line",
      ),
    ).toBe(false);
  });
});

function ring(
  entityUuid: string,
  monsterId: number,
  facing: number | null,
  x = 0,
): MinimapEntity {
  const item = entity(entityUuid, "monster", monsterId, x, 0);
  item.facing = facing;
  return item;
}

function runeAt(view: ReturnType<typeof buildMechanicView>, rune: number) {
  return view.icons.filter((icon) => icon.fallbackLabel === String(rune));
}

/** Bearing of a point from the arena centre, clockwise from +Z. */
function bearing(point: { x: number; z: number }): number {
  return ((Math.atan2(point.x, point.z) * 180) / Math.PI + 360) % 360;
}

function bearingGap(left: number, right: number): number {
  return Math.abs(((left - right + 540) % 360) - 180);
}

describe("S4 Lapsis turntable runes", () => {
  it("places each glyph on its ring slot and turns it with the ring", () => {
    const current = snapshot();
    current.entities.push(ring("inner", 103401, null));
    current.buffs.push(buff("inner", 829502, 1_000, -1));
    let icons = buildMechanicView(current, name, [], 1_100).icons;
    expect(icons).toHaveLength(4);
    const one = icons.find((icon) => icon.fallbackLabel === "1")!;
    const three = icons.find((icon) => icon.fallbackLabel === "3")!;
    expect(one.x).toBeCloseTo(0);
    expect(one.z).toBeCloseTo(-7.52);
    expect(three.x).toBeCloseTo(7.52);
    expect(three.z).toBeCloseTo(0);
    expect(one.src).toBe("/images/lapsis_rune/rune_01.png");

    current.entities[3]!.facing = 90;
    icons = buildMechanicView(current, name, [], 1_100).icons;
    const turned = icons.find((icon) => icon.fallbackLabel === "1")!;
    expect(turned.x).toBeCloseTo(-7.52);
    expect(turned.z).toBeCloseTo(0);
  });

  it("uses each ring's radius and centre", () => {
    const current = snapshot();
    current.entities.push(
      ring("inner", 103425, 0, 0.12),
      ring("middle", 103426, 0),
      ring("outer", 103427, 0),
    );
    current.buffs.push(
      buff("inner", 829502, 1_000, -1),
      buff("middle", 829503, 1_000, -1),
      buff("outer", 829504, 1_000, -1),
    );
    const fours = runeAt(buildMechanicView(current, name, [], 1_100), 4);
    expect(fours.map((icon) => [icon.x, icon.z])).toEqual([
      [expect.closeTo(-7.4), expect.closeTo(0)],
      [expect.closeTo(0), expect.closeTo(-17.4)],
      [expect.closeTo(0), expect.closeTo(27.7)],
    ]);
  });

  it("draws every glyph alike and writes the boss's rune to the bar", () => {
    const current = snapshot();
    current.entities.push(ring("inner", 103401, 0), ring("middle", 103402, 0));
    current.buffs.push(
      buff("inner", 829502, 1_000, -1),
      buff("middle", 829503, 1_000, -1),
    );
    let view = buildMechanicView(current, name, [], 1_100);
    expect(view.rows.some((row) => row.key === "runeWheel:bossRune")).toBe(
      false,
    );

    current.buffs.push(buff("boss", 829509, 1_200, 0));
    view = buildMechanicView(current, name, [], 1_300);
    expect(view.icons).toHaveLength(8);
    expect(view.icons.every((icon) => icon.sizePx === 22)).toBe(true);
    const row = view.rows.find((item) => item.key === "runeWheel:bossRune");
    expect(row).toMatchObject({
      label: expect.stringContaining("4"),
      colorSlot: 0,
      createTimeMs: 1_200,
      hideTimer: true,
      targets: [],
    });

    current.buffs[current.buffs.length - 1] = buff("boss", 829506, 1_200, 0);
    const greenRow = buildMechanicView(current, name, [], 1_300).rows.find(
      (item) => item.key === "runeWheel:bossRune",
    );
    expect(greenRow?.label).toContain("1");
    expect(greenRow?.colorSlot).toBe(1);
  });

  it("draws nothing without a layout buff or its ring", () => {
    const current = snapshot();
    current.entities.push(ring("inner", 103401, 0));
    expect(buildMechanicView(current, name, [], 1_100).icons).toEqual([]);

    current.buffs.push(buff("gone", 829502, 1_000, -1));
    expect(buildMechanicView(current, name, [], 1_100).icons).toEqual([]);
  });

  it("matches the boss-shape alignment the raid stopped on (1792921157239)", () => {
    // 17:46:24.065: the middle ring stopped with its glyph 4 lined up with
    // the outer ring's; no other shape was anywhere near aligned.
    const current = snapshot();
    current.entities.push(
      ring("middle", 103402, 282.95),
      ring("outer", 103403, 105.89),
    );
    current.buffs.push(
      buff("middle", 829503, 1_000, -1),
      buff("outer", 829504, 1_000, -1),
    );
    const view = buildMechanicView(current, name, [], 1_100);
    for (const rune of [1, 2, 3, 4]) {
      const [middle, outer] = runeAt(view, rune).map(bearing);
      const gap = bearingGap(middle!, outer!);
      if (rune === 4) expect(gap).toBeLessThan(3);
      else expect(gap).toBeGreaterThan(90);
    }
  });
});

describe("S4 Lapsis voice cues", () => {
  it("announces a chaser locking onto the local player once per chaser", () => {
    const current = snapshot();
    current.entities.push(chaser("local"));
    current.buffs.push(buff("chaser", 829539, 1_000, -1));
    expect(resolveLapsisVoiceCues(current, [])).toEqual([
      {
        cueId: "s4-sky-end-raid.chaserTarget",
        instanceKey: "chaser:local",
      },
    ]);

    current.entities[3] = chaser("mate");
    expect(resolveLapsisVoiceCues(current, [])).toEqual([]);
  });

  it("announces rain and wish from the cast only", () => {
    const current = snapshot();
    current.buffs.push(
      buff("local", 829530),
      buff("local", 829531),
      buff("local", 829535),
    );
    expect(
      resolveLapsisVoiceCues(current, [cast(3395174), cast(3395178)]).map(
        (fire) => fire.cueId,
      ),
    ).toEqual(["s4-sky-end-raid.rain", "s4-sky-end-raid.wish"]);
  });
});

function withLayer(item: MinimapBuffFact, layer: number): MinimapBuffFact {
  return { ...item, layer };
}

function rowTargets(view: ReturnType<typeof buildMechanicView>, key: string) {
  return view.rows
    .find((row) => row.key === key)
    ?.targets.map((target) => target.uuid);
}

describe("S4 Lapsis eternal day sin", () => {
  it("groups players by their sin layer", () => {
    const current = snapshot();
    current.entities.push(entity("third", "teammate", null, 1, 1));
    current.buffs.push(
      withLayer(buff("local", 829602, 1_000, 120_000), 1),
      withLayer(buff("third", 829602, 1_000, 120_000), 1),
      withLayer(buff("mate", 829602, 1_000, 120_000), 4),
    );
    const view = buildMechanicView(current, name, [], 1_100);
    expect(rowTargets(view, "sin:1")).toEqual(["local", "third"]);
    expect(rowTargets(view, "sin:4")).toEqual(["mate"]);
    expect(view.rows.find((row) => row.key === "sin:1")).toMatchObject({
      label: "1层",
      hideTimer: true,
    });
    // Rows sort by colour slot, so the slots must rise with the layer.
    const slot = (key: string) =>
      view.rows.find((row) => row.key === key)?.colorSlot ?? -1;
    expect(slot("sin:4")).toBeGreaterThan(slot("sin:1"));
  });

  it("shows extreme sin with its own 12 s timer", () => {
    const current = snapshot();
    current.buffs.push(buff("mate", 829603, 1_000, 12_000));
    const row = buildMechanicView(current, name, [], 1_100).rows.find(
      (item) => item.key === "sin:extreme",
    );
    expect(row).toMatchObject({ label: "极罪", durationMs: 12_000 });
    expect(row?.targets.map((target) => target.uuid)).toEqual(["mate"]);
  });
});

describe("S4 Lapsis eternal day circle share", () => {
  it("calls the earlier of two marks ① and the later ②", () => {
    const current = snapshot();
    current.buffs.push(
      buff("mate", 829649, 5_000, 5_000),
      buff("local", 829649, 1_000, 5_000),
    );
    const view = buildMechanicView(current, name, [], 5_100);
    expect(rowTargets(view, "share:first")).toEqual(["local"]);
    expect(rowTargets(view, "share:second")).toEqual(["mate"]);
    expect(view.rows.find((row) => row.key === "share:second")).toMatchObject({
      label: "② 点名",
      createTimeMs: 5_000,
      durationMs: 5_000,
    });
  });

  it("keeps a lone mark ② once the first share has landed", () => {
    const mark = buff("mate", 829649, 5_000, 5_000);
    const landed = buff("local", 829650, 6_000, 12_000);
    expect(shareOrder([mark], [landed])).toEqual({
      first: [],
      second: [mark],
    });
    // Vulnerability left by the previous round is older than the new mark.
    const stale = buff("local", 829650, 4_000, 12_000);
    expect(shareOrder([mark], [stale])).toEqual({ first: [mark], second: [] });
  });

  it("lists everyone vulnerable across both shares", () => {
    const current = snapshot();
    current.buffs.push(
      buff("local", 829650, 6_000, 12_000),
      buff("mate", 829650, 10_000, 12_000),
    );
    const view = buildMechanicView(current, name, [], 10_100);
    expect(rowTargets(view, "share:vulnerable")).toEqual(["local", "mate"]);
    expect(
      view.rows.find((row) => row.key === "share:vulnerable"),
    ).toMatchObject({ label: "易伤", createTimeMs: 6_000, durationMs: 16_000 });
    expect(view.rows.some((row) => row.key === "share:first")).toBe(false);
  });

  it("lists the tank swap with its 45 s timer", () => {
    const current = snapshot();
    current.buffs.push(buff("mate", 829654, 1_000, 45_000));
    const view = buildMechanicView(current, name, [], 1_100);
    expect(rowTargets(view, "tankSwap")).toEqual(["mate"]);
    expect(view.rows.find((row) => row.key === "tankSwap")).toMatchObject({
      label: "死刑换T",
      durationMs: 45_000,
    });
  });
});

describe("S4 Lapsis eternal night dark erosion", () => {
  it("groups players at 5–9 layers only", () => {
    const current = snapshot();
    current.entities.push(
      entity("third", "teammate", null, 1, 1),
      entity("fourth", "teammate", null, 2, 2),
    );
    current.buffs.push(
      withLayer(buff("local", 829721, 1_000, 15_000), 4),
      withLayer(buff("mate", 829721, 1_000, 15_000), 5),
      withLayer(buff("third", 829721, 1_000, 15_000), 9),
      withLayer(buff("fourth", 829721, 1_000, 15_000), 10),
    );
    const view = buildMechanicView(current, name, [], 1_100);
    expect(
      view.rows
        .filter((row) => row.key.startsWith("erosion:"))
        .map((row) => row.key)
        .sort(),
    ).toEqual(["erosion:5", "erosion:9"]);
    expect(rowTargets(view, "erosion:5")).toEqual(["mate"]);
    expect(rowTargets(view, "erosion:9")).toEqual(["third"]);
    expect(view.rows.find((row) => row.key === "erosion:5")).toMatchObject({
      label: "5层",
      hideTimer: true,
    });
    const slot = (key: string) =>
      view.rows.find((row) => row.key === key)?.colorSlot ?? -1;
    expect(slot("erosion:9")).toBeGreaterThan(slot("erosion:5"));
  });

  it("shows self-destruct after 9 layers with its 5 s timer and colours the holder", () => {
    const current = snapshot();
    current.buffs.push(
      withLayer(buff("local", 829721, 1_000, 15_000), 9),
      buff("mate", 829722, 1_000, 5_000),
    );
    const view = buildMechanicView(current, name, [], 1_100);
    const row = view.rows.find((item) => item.key === "erosion:selfDestruct");
    expect(row).toMatchObject({ label: "自我毁灭", durationMs: 5_000 });
    expect(row?.targets.map((target) => target.uuid)).toEqual(["mate"]);
    expect(view.entityColorSlots.get("mate")).toBe(row?.colorSlot);
    // Same slot as 9 layers; the info bar then sorts by label.
    const nine = view.rows.find((item) => item.key === "erosion:9");
    expect(nine?.colorSlot).toBe(row?.colorSlot);
    expect(nine!.label.localeCompare(row!.label)).toBeLessThan(0);
  });

  it("lists the fog orb target", () => {
    const current = snapshot();
    current.buffs.push(buff("local", 829725, 1_000, 3_000));
    const view = buildMechanicView(current, name, [], 1_100);
    expect(rowTargets(view, "fogOrbTarget")).toEqual(["local"]);
  });
});

/** The 20 CreateTimes of the logged ritual (1792922825153), in ms past …400. */
const LOGGED_RITUAL = [
  9, 9, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 13,
];

function ritualSnapshot(offsets: readonly number[]): MinimapSnapshot {
  const players = offsets.map((_, i) =>
    i === 2 ? "local" : `p${String(i).padStart(2, "0")}`,
  );
  return {
    sceneId: 13032,
    localPlayerUuid: "local",
    entities: players.map((uuid) =>
      entity(uuid, uuid === "local" ? "local" : "teammate", null, 0, 0),
    ),
    buffs: players.map((uuid, i) =>
      buff(uuid, 829712, 1_792_923_126_400 + offsets[i]!, 0),
    ),
    markers: [],
  };
}

describe("S4 Lapsis eternal night evil ritual", () => {
  it("takes the four earliest CreateTimes as light (logged ritual)", () => {
    const current = ritualSnapshot(LOGGED_RITUAL);
    const sides = ritualSides(current.buffs);
    const light = [...sides].filter(([, side]) => side === "light");
    expect(light.map(([uuid]) => uuid).sort()).toEqual([
      "local",
      "p00",
      "p01",
      "p03",
    ]);
    expect([...sides.values()].filter((side) => side === "dark")).toHaveLength(
      16,
    );

    const view = buildMechanicView(current, name, [], 1_792_923_130_000);
    expect(rowTargets(view, "evilRitual:light")).toContain("local");
    expect(rowTargets(view, "evilRitual:dark")).toHaveLength(16);
    expect(view.rows.some((row) => row.key === "evilRitual:unknown")).toBe(
      false,
    );
    expect(view.entityColorSlots.get("local")).toBe(0);
    expect(view.entityColorSlots.get("p04")).toBe(2);
    expect(
      view.rows.find((row) => row.key === "evilRitual:light"),
    ).toMatchObject({ createTimeMs: 1_792_923_126_409, durationMs: 30_450 });
    expect(view.regions).toContainEqual(
      expect.objectContaining({ kind: "polygon", label: "光" }),
    );
  });

  it("marks the millisecond shared by the last light and first dark unknown", () => {
    const offsets = [0, 0, 1, 2, 2, 3, 3, 3];
    expect([...ritualSides(ritualSnapshot(offsets).buffs).values()]).toEqual([
      "light",
      "light",
      "light",
      "unknown",
      "unknown",
      "dark",
      "dark",
      "dark",
    ]);
    const view = buildMechanicView(
      ritualSnapshot(offsets),
      name,
      [],
      1_792_923_130_000,
    );
    expect(rowTargets(view, "evilRitual:unknown")).toEqual(["p03", "p04"]);
    expect(view.entityColorSlots.has("p03")).toBe(false);
  });

  it("does not split with four or fewer holders seen", () => {
    expect(ritualSides(ritualSnapshot([0, 1, 2, 3]).buffs).size).toBe(0);
  });
});

function ball(uuid: string, monsterId: number, x: number, z: number) {
  const item = entity(uuid, "monster", monsterId, x, z);
  item.y = 352;
  return item;
}

function nightSnapshot(balls: MinimapEntity[]): MinimapSnapshot {
  return {
    sceneId: 13032,
    localPlayerUuid: "local",
    entities: [entity("local", "local"), ...balls],
    buffs: [],
    markers: [],
  };
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function explosion(view: ReturnType<typeof buildMechanicView>) {
  return view.regions.find(
    (region) => region.kind === "sector" && region.radius === 48.7,
  );
}

type Polygon = Extract<MechanicRegion, { kind: "polygon" }>;

function spot(view: ReturnType<typeof buildMechanicView>, label: string) {
  return view.regions.find(
    (region): region is Polygon =>
      region.kind === "polygon" && region.label === label,
  );
}

function spotBearing(region: Polygon | undefined): number {
  const points = region?.points ?? [];
  return bearing({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
  });
}

describe("S4 Lapsis eternal night celestial collision", () => {
  beforeEach(() => resetCelestialSpawns());

  it("predicts both logged 90° collisions from the spawn positions", () => {
    // Log A: light +X, dark +Z, collided at 156.3°. Log B: light −Z, dark +X, 247.3°.
    const a = predictPair({ x: 35, z: 0 }, { x: 0, z: 35 });
    const b = predictPair({ x: 0, z: -35 }, { x: 35, z: 0 });
    expect(a.gapDeg).toBeCloseTo(90);
    expect(bearingGap(bearing(a.collision), 156.3)).toBeLessThan(2);
    expect(bearingGap(bearing(b.collision), 247.3)).toBeLessThan(2);
    // Both logs moved for 4.9–5.0 s.
    expect(a.moveMs).toBeGreaterThan(4_700);
    expect(a.moveMs).toBeLessThan(5_100);
  });

  it("separates the players the logged explosions hit from those they spared", () => {
    const a = predictPair({ x: 35, z: 0 }, { x: 0, z: 35 }).collision;
    const b = predictPair({ x: 0, z: -35 }, { x: 35, z: 0 }).collision;
    expect(dist(a, { x: -8.54, z: 8.7 })).toBeLessThan(48.7);
    expect(dist(a, { x: -0.7, z: 19.45 })).toBeGreaterThan(48.7);
    expect(dist(b, { x: 13.19, z: 4.08 })).toBeLessThan(48.7);
    expect(dist(b, { x: 16.24, z: 0.18 })).toBeGreaterThan(48.7);
    expect(dist(b, { x: 16.99, z: -2.39 })).toBeGreaterThan(48.7);
  });

  it("puts the 180° safe spot near the light ball's spawn", () => {
    const { safe } = predictPair({ x: 0, z: -35 }, { x: 0, z: 35 });
    expect(bearingGap(bearing(safe), 180)).toBeLessThan(30);
  });

  it("marks the safe spot at spawn and the explosion only after the cast", () => {
    const current = nightSnapshot([
      ball("light", 103602, 35, 0),
      ball("dark", 103603, 0, 35),
    ]);
    let view = buildMechanicView(current, name, [], 10_000);
    expect(view.entityColorSlots.get("light")).toBe(0);
    expect(view.entityColorSlots.get("dark")).toBe(2);
    expect(bearingGap(spotBearing(spot(view, "安全")), 336.9)).toBeLessThan(2);
    expect(explosion(view)).toBeUndefined();
    expect(view.rows.find((row) => row.key === "celestial")).toMatchObject({
      label: "双球 90°",
      hideTimer: true,
    });

    const control: MinimapSkillCast = {
      entityUuid: "executor",
      skillId: 10360011,
      timeMs: 11_000,
      x: null,
      z: null,
      facing: null,
    };
    view = buildMechanicView(current, name, [control], 12_000);
    expect(explosion(view)).toBeDefined();
    const row = view.rows.find((item) => item.key === "celestial");
    expect(row?.hideTimer).toBe(false);
    expect(row?.createTimeMs).toBe(11_000);
    // 1.5 s to start moving, ~4.9 s chase, 0.5 s to the explosion.
    expect(row?.durationMs).toBeGreaterThan(6_700);
    expect(row?.durationMs).toBeLessThan(7_100);

    view = buildMechanicView(current, name, [control], 19_000);
    expect(explosion(view)).toBeUndefined();
  });

  it("follows the three-ball guide: between the first two, then the second", () => {
    const balls = [
      ball("left", 103603, 0, 35),
      ball("top", 103602, 35, 0),
      ball("right", 103603, 0, -35),
    ];
    let view = buildMechanicView(nightSnapshot(balls), name, [], 10_000);
    expect(spotBearing(spot(view, "①"))).toBeCloseTo(45);
    expect(spotBearing(spot(view, "②"))).toBeCloseTo(90);
    expect(view.rows.find((row) => row.key === "celestial")?.label).toBe(
      "三球（推测）",
    );

    view = buildMechanicView(nightSnapshot(balls.slice(1)), name, [], 16_000);
    expect(spot(view, "①")).toBeUndefined();
    expect(spotBearing(spot(view, "②"))).toBeCloseTo(90);
  });

  it("widens the arena while 老三's entities are around", () => {
    const scene = resolveScene(13032)!;
    const night = scene.resolveView(
      nightSnapshot([ball("light", 103602, 35, 0)]),
      name,
    );
    expect(night.worldHalfX).toBe(37);
    expect(night.entities.some((item) => item.entityUuid === "light")).toBe(
      true,
    );
    expect(scene.resolveView(snapshot(), name).worldHalfX).toBe(30);
  });
});
