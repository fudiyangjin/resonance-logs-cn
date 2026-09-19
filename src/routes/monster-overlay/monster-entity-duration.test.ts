import { describe, expect, it } from "vitest";
import type { WatchedEntityState } from "$lib/api";
import type { EntityDurationEntry } from "$lib/settings-store";
import {
  buildEntityDurationRows,
  matchesEntityDurationScope,
  type EntityDurationRowsInput,
} from "./monster-entity-duration";

function entry(
  overrides: Partial<EntityDurationEntry> & { monsterId: number },
): EntityDurationEntry {
  return {
    id: `e${overrides.monsterId}`,
    label: `L${overrides.monsterId}`,
    scope: "self",
    durationMs: 10_000,
    ...overrides,
  };
}

function watched(
  overrides: Partial<WatchedEntityState> & { entityUuid: string },
): WatchedEntityState {
  return {
    monsterId: 179901,
    ownerUuid: "10",
    ownerName: "Me",
    ownerIsLocalPlayer: true,
    detectedAtMs: 1_000,
    ...overrides,
  };
}

function build(
  overrides: Partial<EntityDurationRowsInput>,
): ReturnType<typeof buildEntityDurationRows> {
  return buildEntityDurationRows({
    entries: [],
    watched: [],
    now: 2_000,
    resolveEntryLabel: (e) => e.label || `#${e.monsterId}`,
    resolveOwnerName: (w) => w.ownerName ?? "",
    formatRemaining: (ms) => `${(ms / 1000).toFixed(1)}s`,
    infiniteText: "∞",
    ...overrides,
  });
}

describe("matchesEntityDurationScope", () => {
  it("self requires the local player, any accepts everyone", () => {
    expect(
      matchesEntityDurationScope("self", { ownerIsLocalPlayer: true }),
    ).toBe(true);
    expect(
      matchesEntityDurationScope("self", { ownerIsLocalPlayer: false }),
    ).toBe(false);
    expect(
      matchesEntityDurationScope("any", { ownerIsLocalPlayer: false }),
    ).toBe(true);
  });
});

describe("buildEntityDurationRows", () => {
  it("builds a countdown row with progress and reports the deadline", () => {
    const result = build({
      entries: [entry({ monsterId: 179901, label: "镰车" })],
      watched: [watched({ entityUuid: "500" })],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      key: "entity_duration_500",
      label: "镰车",
      valueText: "9.0s",
      progressPercent: 90,
      showProgress: true,
      temporal: { deadlineMs: 11_000, durationMs: 10_000 },
    });
    expect(result.nextDeadlineMs).toBe(11_000);
  });

  it("filters by scope and only suffixes the caster for scope=any", () => {
    const mine = watched({ entityUuid: "500" });
    const theirs = watched({
      entityUuid: "501",
      ownerUuid: "20",
      ownerName: "Rin",
      ownerIsLocalPlayer: false,
    });
    const selfOnly = build({
      entries: [entry({ monsterId: 179901, scope: "self" })],
      watched: [mine, theirs],
    });
    expect(selfOnly.rows.map((r) => r.key)).toEqual(["entity_duration_500"]);
    expect(selfOnly.rows[0]?.label).toBe("L179901");

    const anyone = build({
      entries: [entry({ monsterId: 179901, scope: "any" })],
      watched: [mine, theirs],
    });
    expect(anyone.rows.map((r) => r.label)).toEqual([
      "L179901-Me",
      "L179901-Rin",
    ]);
  });

  it("omits the suffix when the caster is unknown", () => {
    const result = build({
      entries: [entry({ monsterId: 179901, scope: "any" })],
      watched: [
        watched({
          entityUuid: "500",
          ownerUuid: null,
          ownerName: null,
          ownerIsLocalPlayer: false,
        }),
      ],
    });
    expect(result.rows[0]?.label).toBe("L179901");
  });

  it("renders an open-ended row without progress when no duration is set", () => {
    const noDuration = entry({ monsterId: 179901 });
    delete noDuration.durationMs;
    const result = build({
      entries: [noDuration],
      watched: [watched({ entityUuid: "500" })],
    });
    expect(result.rows[0]).toMatchObject({
      valueText: "∞",
      showProgress: false,
      progressPercent: 0,
    });
    expect(result.rows[0]?.temporal).toBeUndefined();
    expect(result.nextDeadlineMs).toBeNull();
  });

  it("drops expired rows and ignores unmatched monster ids", () => {
    const result = build({
      entries: [entry({ monsterId: 179901, durationMs: 500 })],
      watched: [
        watched({ entityUuid: "500" }),
        watched({ entityUuid: "600", monsterId: 42 }),
      ],
    });
    expect(result.rows).toEqual([]);
    expect(result.nextDeadlineMs).toBeNull();
  });

  it("orders by detection time and keeps one row per entity instance", () => {
    const result = build({
      entries: [
        entry({ monsterId: 1, durationMs: 60_000 }),
        entry({ monsterId: 2, durationMs: 5_000 }),
      ],
      watched: [
        watched({ entityUuid: "b", monsterId: 1, detectedAtMs: 1_500 }),
        watched({ entityUuid: "a", monsterId: 1, detectedAtMs: 1_500 }),
        watched({ entityUuid: "c", monsterId: 2, detectedAtMs: 1_000 }),
      ],
    });
    expect(result.rows.map((r) => r.key)).toEqual([
      "entity_duration_c",
      "entity_duration_a",
      "entity_duration_b",
    ]);
    expect(result.nextDeadlineMs).toBe(6_000);
  });

  it("uses the first entry when monster ids are duplicated", () => {
    const result = build({
      entries: [
        entry({ id: "first", monsterId: 1, label: "first" }),
        entry({ id: "second", monsterId: 1, label: "second" }),
      ],
      watched: [watched({ entityUuid: "x", monsterId: 1 })],
    });
    expect(result.rows[0]?.label).toBe("first");
  });
});
