import { describe, expect, it } from "vitest";
import type { MinimapEntity } from "$lib/api";
import {
  mergeMechanicTargets,
  sortLocalFirst,
  toMechanicTargets,
} from "./mechanic-row";
import type { MechanicRowTarget } from "./scene-types";

function entity(uuid: string, name: string): MinimapEntity {
  return {
    entityUuid: uuid,
    entityType: "char",
    kind: uuid === "local" ? "local" : "teammate",
    x: 0,
    y: 0,
    z: 0,
    name,
    monsterId: null,
    facing: null,
    currentHp: null,
    maxHp: null,
    targetEntityUuid: null,
    isDead: false,
    topSummonerId: null,
  };
}

const displayName = (item: MinimapEntity) => item.name ?? item.entityUuid;

describe("toMechanicTargets", () => {
  it("returns empty when the entity is missing", () => {
    expect(toMechanicTargets(undefined, "local", displayName)).toEqual([]);
  });

  it("marks the local player", () => {
    expect(
      toMechanicTargets(entity("local", "Me"), "local", displayName),
    ).toEqual([
      {
        uuid: "local",
        name: "Me",
        isLocal: true,
      },
    ]);
  });

  it("leaves teammates unmarked", () => {
    expect(
      toMechanicTargets(entity("mate", "Ally"), "local", displayName),
    ).toEqual([
      {
        uuid: "mate",
        name: "Ally",
        isLocal: false,
      },
    ]);
  });
});

describe("mergeMechanicTargets", () => {
  it("appends unseen uuids and skips duplicates", () => {
    const existing: MechanicRowTarget[] = [
      { uuid: "a", name: "A", isLocal: false },
    ];
    mergeMechanicTargets(existing, [
      { uuid: "a", name: "A-renamed", isLocal: true },
      { uuid: "b", name: "B", isLocal: true },
    ]);
    expect(existing).toEqual([
      { uuid: "a", name: "A", isLocal: false },
      { uuid: "b", name: "B", isLocal: true },
    ]);
  });
});

describe("sortLocalFirst", () => {
  it("keeps the local target first without mutating the source", () => {
    const targets: MechanicRowTarget[] = [
      { uuid: "a", name: "A", isLocal: false },
      { uuid: "b", name: "B", isLocal: true },
      { uuid: "c", name: "C", isLocal: false },
    ];
    expect(sortLocalFirst(targets).map((item) => item.uuid)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(targets[0]?.uuid).toBe("a");
  });
});
