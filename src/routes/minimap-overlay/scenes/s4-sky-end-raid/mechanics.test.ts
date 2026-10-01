import { describe, expect, it } from "vitest";
import type {
  MinimapBuffFact,
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import { resolveScene } from "../../scene-registry";
import { buildMechanicView, resolveLapsisVoiceCues } from "./mechanics";

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
    expect(view.rows.filter((item) => item.key.startsWith("lightSpear:hp"))).toHaveLength(1);
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
    expect(view.regions.some((region) => region.kind === "sector")).toBe(
      false,
    );
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
