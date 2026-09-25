import { describe, expect, it } from "vitest";
import type { EntityDurationTrackState } from "$lib/api";
import type { EntityDurationEntry } from "$lib/settings-store";
import {
  buildEntityDurationRows,
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

function track(
  overrides: Partial<EntityDurationTrackState> & { key: string },
): EntityDurationTrackState {
  return {
    monsterId: 179901,
    scope: "self",
    ownerUuid: "10",
    ownerName: "Me",
    durationMs: 10_000,
    deadlinesMs: [11_000],
    ...overrides,
  };
}

function build(
  overrides: Partial<EntityDurationRowsInput>,
): ReturnType<typeof buildEntityDurationRows> {
  return buildEntityDurationRows({
    entries: [],
    tracks: [],
    now: 2_000,
    resolveEntryLabel: (e) => e.label || `#${e.monsterId}`,
    resolveOwnerName: (t) => t.ownerName ?? "",
    formatRemaining: (ms) => `${(ms / 1000).toFixed(1)}s`,
    infiniteText: "∞",
    ...overrides,
  });
}

describe("buildEntityDurationRows", () => {
  it("builds a countdown row with progress and reports the deadline", () => {
    const result = build({
      entries: [entry({ monsterId: 179901, label: "镰车" })],
      tracks: [track({ key: "179901:self:e500" })],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      key: "entity_duration_179901:self:e500",
      label: "镰车",
      valueText: "9.0s",
      progressPercent: 90,
      showProgress: true,
      temporal: { deadlineMs: 11_000, durationMs: 10_000 },
    });
    expect(result.nextDeadlineMs).toBe(11_000);
  });

  it("hands a merged row over to the next member under the same key", () => {
    const merged = {
      entries: [entry({ monsterId: 179901 })],
      tracks: [
        track({
          key: "179901:self:c10",
          deadlinesMs: [11_000, 11_300, 20_000],
        }),
      ],
    };
    const first = build({ ...merged, now: 2_000 });
    expect(first.rows[0]?.temporal?.deadlineMs).toBe(11_000);

    // A deadline that is due counts as ended: the next member takes over.
    const handover = build({ ...merged, now: 11_000 });
    expect(handover.rows[0]).toMatchObject({
      key: "entity_duration_179901:self:c10",
      valueText: "0.3s",
      temporal: { deadlineMs: 11_300 },
    });
    expect(handover.nextDeadlineMs).toBe(11_300);

    const last = build({ ...merged, now: 12_000 });
    expect(last.rows[0]?.temporal?.deadlineMs).toBe(20_000);

    const ended = build({ ...merged, now: 20_000 });
    expect(ended.rows).toEqual([]);
    expect(ended.nextDeadlineMs).toBeNull();
  });

  it("skips tracks without an entry or for another scope", () => {
    const result = build({
      entries: [entry({ monsterId: 179901, scope: "self" })],
      tracks: [
        track({ key: "179901:any:e500", scope: "any" }),
        track({ key: "42:self:e600", monsterId: 42 }),
      ],
    });
    expect(result.rows).toEqual([]);
    expect(result.nextDeadlineMs).toBeNull();
  });

  it("only suffixes the caster for scope=any, and not when unknown", () => {
    const anyone = build({
      entries: [entry({ monsterId: 179901, scope: "any" })],
      tracks: [
        track({ key: "179901:any:c10", scope: "any" }),
        track({
          key: "179901:any:c20",
          scope: "any",
          ownerUuid: "20",
          ownerName: "Rin",
        }),
        track({
          key: "179901:any:c-",
          scope: "any",
          ownerUuid: null,
          ownerName: null,
        }),
      ],
    });
    expect(anyone.rows.map((r) => r.label)).toEqual([
      "L179901-Me",
      "L179901-Rin",
      "L179901",
    ]);

    const selfOnly = build({
      entries: [entry({ monsterId: 179901, scope: "self" })],
      tracks: [track({ key: "179901:self:e500" })],
    });
    expect(selfOnly.rows[0]?.label).toBe("L179901");
  });

  it("renders an open-ended row without progress when no duration is set", () => {
    const result = build({
      entries: [entry({ monsterId: 179901 })],
      tracks: [
        track({ key: "179901:self:e500", durationMs: null, deadlinesMs: [] }),
      ],
    });
    expect(result.rows[0]).toMatchObject({
      valueText: "∞",
      showProgress: false,
      progressPercent: 0,
    });
    expect(result.rows[0]?.temporal).toBeUndefined();
    expect(result.nextDeadlineMs).toBeNull();
  });

  it("keeps the published order and reports the nearest deadline", () => {
    const result = build({
      entries: [
        entry({ monsterId: 1, durationMs: 60_000 }),
        entry({ monsterId: 2, durationMs: 5_000 }),
      ],
      tracks: [
        track({
          key: "1:self:e10",
          monsterId: 1,
          durationMs: 60_000,
          deadlinesMs: [61_000],
        }),
        track({
          key: "2:self:e20",
          monsterId: 2,
          durationMs: 5_000,
          deadlinesMs: [6_000],
        }),
      ],
    });
    expect(result.rows.map((r) => r.key)).toEqual([
      "entity_duration_1:self:e10",
      "entity_duration_2:self:e20",
    ]);
    expect(result.nextDeadlineMs).toBe(6_000);
  });

  it("uses the first entry when monster ids are duplicated", () => {
    const result = build({
      entries: [
        entry({ id: "first", monsterId: 1, label: "first" }),
        entry({ id: "second", monsterId: 1, label: "second" }),
      ],
      tracks: [track({ key: "1:self:e10", monsterId: 1 })],
    });
    expect(result.rows[0]?.label).toBe("first");
  });
});
