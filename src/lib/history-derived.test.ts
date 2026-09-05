import { describe, expect, it } from "vitest";
import type {
  EncounterBuffTimelineData,
  EncounterEntityData,
  EncounterSkillData,
  EncounterStatsData,
  HistoryMetric,
} from "$lib/bindings";
import {
  aggregateMetricStats,
  historyBuffCoverageByKey,
  historyBuffLaneKey,
  historyBuffTimeline,
  historyBuffTimelineRange,
  historyDamageHits,
  historyDeathEntries,
  historyEntityToRaw,
  historySkillRecord,
  historyStatsToCombat,
} from "./history-derived";

function stats(partial: Partial<EncounterStatsData> = {}): EncounterStatsData {
  return {
    total: "0",
    effectiveTotal: "0",
    hits: "0",
    criticalHits: "0",
    criticalTotal: "0",
    luckyHits: "0",
    luckyTotal: "0",
    triggerHits: "0",
    blockedHits: "0",
    luckyBlockHits: "0",
    extrema: null,
    ...partial,
  };
}

function skill(
  skillId: string,
  metric: HistoryMetric,
  statValues: Partial<EncounterStatsData> = {},
): EncounterSkillData {
  return {
    skillId,
    metric,
    property: null,
    damageMode: null,
    stats: stats(statValues),
  };
}

function entity(
  partial: Partial<EncounterEntityData> = {},
): EncounterEntityData {
  return {
    entityId: "1",
    displayUid: 1001,
    name: "player",
    classId: 1,
    classSpec: 1,
    classSpecName: "Iaido",
    abilityScore: 3200,
    seasonStrength: 15,
    monsterId: null,
    totals: {
      damage: "0",
      bossDamage: "0",
      healing: "0",
      effectiveHealing: "0",
      damageTaken: "0",
    },
    skills: [],
    damageTargets: [],
    healingTargets: [],
    takenSources: [],
    deaths: [],
    ...partial,
  };
}

describe("historyStatsToCombat", () => {
  it("renames every field without dropping precision", () => {
    const combat = historyStatsToCombat(
      stats({
        total: "99999999999999999999",
        criticalHits: "7",
        criticalTotal: "42",
        blockedHits: "3",
        luckyBlockHits: "2",
      }),
    );
    expect(combat.total).toBe("99999999999999999999");
    expect(combat.critHits).toBe("7");
    expect(combat.critTotal).toBe("42");
    expect(combat.blockHits).toBe("3");
    expect(combat.luckyBlockHits).toBe("2");
  });
});

describe("aggregateMetricStats", () => {
  it("sums only the requested metric with bigint precision", () => {
    const skills = [
      skill("1", "damage", { total: "9007199254740993", hits: "2" }),
      skill("2", "damage", { total: "9007199254740993", hits: "3" }),
      skill("3", "healing", { total: "777", hits: "9" }),
    ];
    const damage = aggregateMetricStats(skills, "damage");
    expect(damage.total).toBe("18014398509481986");
    expect(damage.hits).toBe("5");
    const healing = aggregateMetricStats(skills, "healing");
    expect(healing.total).toBe("777");
  });
});

describe("historySkillRecord", () => {
  it("keys by numeric skill id and skips other metrics / bad ids", () => {
    const record = historySkillRecord(
      [
        skill("123", "damage", { total: "10" }),
        skill("456", "healing", { total: "20" }),
        skill("not-a-number", "damage", { total: "30" }),
      ],
      "damage",
    );
    expect(Object.keys(record)).toEqual(["123"]);
    expect(record[123]?.totalValue).toBe("10");
  });
});

describe("historyEntityToRaw", () => {
  it("fills identity, per-metric aggregates, boss-only total, and breakdowns", () => {
    const raw = historyEntityToRaw(
      entity({
        totals: {
          damage: "0",
          bossDamage: "500",
          healing: "0",
          effectiveHealing: "0",
          damageTaken: "0",
        },
        skills: [
          skill("1", "damage", { total: "100", criticalHits: "2" }),
          skill("2", "damage_taken", { total: "40", blockedHits: "1" }),
        ],
        damageTargets: [
          {
            targetEntityId: "boss-1",
            targetDisplayUid: 0,
            targetName: null,
            targetMonsterId: 9001,
            isBoss: true,
            stats: stats({ total: "100" }),
            skills: [skill("1", "damage", { total: "100" })],
          },
        ],
        takenSources: [
          {
            sourceMonsterId: 9001,
            stats: stats({ total: "40", blockedHits: "1" }),
            skills: [skill("2", "damage_taken", { total: "40" })],
          },
        ],
      }),
    );
    expect(raw.entityUuid).toBe("1");
    expect(raw.className).toBe("Stormblade");
    expect(raw.classSpecName).toBe("Iaido");
    expect(raw.damage.total).toBe("100");
    expect(raw.damage.critHits).toBe("2");
    expect(raw.damageBossOnly.total).toBe("500");
    expect(raw.taken.blockHits).toBe("1");
    expect(raw.dmgPerTarget[0]?.targetMonsterId).toBe(9001);
    expect(raw.dmgPerTarget[0]?.isBoss).toBe(true);
    expect(raw.takenPerSource[0]?.taken.total).toBe("40");
    expect(raw.takenPerSource[0]?.skills[2]?.totalValue).toBe("40");
  });

  it("tolerates missing optional fields", () => {
    const raw = historyEntityToRaw(
      entity({
        name: null,
        classId: null,
        classSpec: null,
        classSpecName: null,
        abilityScore: null,
        seasonStrength: null,
      }),
    );
    expect(raw.name).toBe("");
    expect(raw.className).toBe("");
    expect(raw.classSpecName).toBe("");
    expect(raw.abilityScore).toBe(0);
  });
});

describe("historyDeathEntries", () => {
  it("keeps only player deaths that carry a replay", () => {
    const replay = {
      victimEntityUuid: "1",
      deathTimestampMs: "1000",
      recentDamages: [],
      victimBuffs: [],
      participantBuffs: [],
    };
    const entries = historyDeathEntries([
      entity({
        entityId: "1",
        deaths: [
          { offsetMs: 10, sourceEntityId: null, skillId: null, replay: null },
          { offsetMs: 20, sourceEntityId: "2", skillId: "9", replay },
        ],
      }),
      entity({ entityId: "2", monsterId: 9001, deaths: [] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.entityUuid).toBe("1");
    expect(entries[0]?.deaths).toEqual([replay]);
  });
});

describe("historyDamageHits", () => {
  it("passes the columnar hit stream through per entity", () => {
    const mapped = historyDamageHits([
      { entityId: "1", offsetsMs: [100, 900], amounts: [100, 50] },
      { entityId: "2", offsetsMs: [0], amounts: [25] },
    ]);
    expect(mapped[0]).toEqual({
      entityUuid: "1",
      timesMs: [100, 900],
      amounts: [100, 50],
    });
    expect(mapped[1]).toEqual({
      entityUuid: "2",
      timesMs: [0],
      amounts: [25],
    });
  });

  it("returns an empty array for missing hits", () => {
    expect(historyDamageHits(undefined)).toEqual([]);
  });
});

describe("historyBuffLaneKey", () => {
  it("joins entity and buff id with a colon", () => {
    expect(historyBuffLaneKey("player-1", 42)).toBe("player-1:42");
  });
});

describe("historyBuffTimeline", () => {
  it("returns null for encounters recorded before buff persistence existed", () => {
    expect(historyBuffTimeline(null)).toBeNull();
    expect(historyBuffTimeline(undefined)).toBeNull();
  });

  it("derives coverage percent from covered/active time and counts spans as triggers", () => {
    const data: EncounterBuffTimelineData = {
      activeWindowMs: 10_000,
      activeSpans: [{ startMs: 0, endMsExclusive: 10_000 }],
      gracePoints: [],
      lanes: [
        {
          entityId: "player-1",
          baseId: 42,
          coveredActiveMs: 2_500,
          spans: [
            { startMs: 0, endMsExclusive: 1_000 },
            { startMs: 5_000, endMsExclusive: 6_500 },
          ],
          gracePoints: [],
        },
      ],
    };

    const view = historyBuffTimeline(data);
    expect(view?.activeWindowMs).toBe(10_000);
    expect(view?.lanes).toHaveLength(1);
    const lane = view?.lanes[0];
    expect(lane?.key).toBe("player-1:42");
    expect(lane?.coveredActiveMs).toBe(2_500);
    expect(lane?.coveragePct).toBeCloseTo(25, 5);
    expect(lane?.triggerCount).toBe(2);
    expect(lane?.spans).toEqual([
      { startMs: 0, endMs: 1_000 },
      { startMs: 5_000, endMs: 6_500 },
    ]);
  });

  it("clamps coverage percent to 100 and avoids division by zero", () => {
    const overCovered: EncounterBuffTimelineData = {
      activeWindowMs: 1_000,
      activeSpans: [{ startMs: 0, endMsExclusive: 1_000 }],
      gracePoints: [],
      lanes: [
        {
          entityId: "player-1",
          baseId: 1,
          coveredActiveMs: 1_500,
          spans: [{ startMs: 0, endMsExclusive: 1_500 }],
          gracePoints: [],
        },
      ],
    };
    expect(historyBuffTimeline(overCovered)?.lanes[0]?.coveragePct).toBe(100);

    const zeroWindow: EncounterBuffTimelineData = {
      activeWindowMs: 0,
      activeSpans: [],
      gracePoints: [],
      lanes: [
        {
          entityId: "player-1",
          baseId: 1,
          coveredActiveMs: 0,
          spans: [],
          gracePoints: [],
        },
      ],
    };
    expect(historyBuffTimeline(zeroWindow)?.lanes[0]?.coveragePct).toBe(0);
  });
});

describe("historyBuffCoverageByKey", () => {
  it("maps each lane's key to its coverage percent", () => {
    const view = historyBuffTimeline({
      activeWindowMs: 100,
      activeSpans: [{ startMs: 0, endMsExclusive: 100 }],
      gracePoints: [],
      lanes: [
        {
          entityId: "a",
          baseId: 1,
          coveredActiveMs: 50,
          spans: [],
          gracePoints: [],
        },
        {
          entityId: "b",
          baseId: 2,
          coveredActiveMs: 25,
          spans: [],
          gracePoints: [],
        },
      ],
    });

    const map = historyBuffCoverageByKey(view);
    expect(map?.get("a:1")).toBe(50);
    expect(map?.get("b:2")).toBe(25);
  });

  it("returns null when the view is null", () => {
    expect(historyBuffCoverageByKey(null)).toBeNull();
  });
});

describe("historyBuffTimelineRange", () => {
  it("clips global windows without granting a new range-first-hit grace", () => {
    const view = historyBuffTimeline({
      activeWindowMs: 1_500,
      activeSpans: [{ startMs: 1_000, endMsExclusive: 2_000 }],
      gracePoints: [{ offsetMs: 5_000, creditedMs: 500 }],
      lanes: [
        {
          entityId: "a",
          baseId: 1,
          coveredActiveMs: 1_500,
          spans: [{ startMs: 1_200, endMsExclusive: 6_000 }],
          gracePoints: [{ offsetMs: 5_000, creditedMs: 500 }],
        },
      ],
    });

    const range = historyBuffTimelineRange(view, 1_500, 5_500);
    expect(range?.activeWindowMs).toBe(1_000);
    expect(range?.lanes[0]?.coveredActiveMs).toBe(1_000);
    expect(range?.lanes[0]?.coveragePct).toBe(100);

    const noHitRange = historyBuffTimelineRange(view, 2_000, 4_000);
    expect(noHitRange?.activeWindowMs).toBe(0);
  });
});
