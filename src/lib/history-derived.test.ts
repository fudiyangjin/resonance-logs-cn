import { describe, expect, it } from "vitest";
import type {
  DeathRecord,
  EncounterBuffTimelineData,
  EncounterDetailData,
  EncounterEntityData,
  EncounterSkillData,
  EncounterStatsData,
  EncounterSummaryDto,
  HistoryMetric,
} from "$lib/bindings";
import { displayElapsedMs } from "$lib/live-display-clock";
import { computePlayerRows } from "$lib/live-derived";
import { RESONANCE_SKILLS } from "$lib/skill-mappings";
import {
  aggregateMetricStats,
  buildHistoryPlayerRows,
  historyBuffCoverageByKey,
  historyBuffLaneKey,
  historyBuffTimeline,
  historyBuffTimelineRange,
  historyCombatForTarget,
  historyDamageHits,
  historyDamageTargets,
  historyDeathEntries,
  historyDetailToLiveSnapshot,
  historyEntityNames,
  historyEntityToRaw,
  historyMarkerEvents,
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

function summary(
  partial: Partial<EncounterSummaryDto> = {},
): EncounterSummaryDto {
  return {
    id: 7,
    startedAtMs: 1_700_000_000_000,
    endedAtMs: 1_700_000_061_000,
    totalDmg: "0",
    totalHeal: "0",
    sceneId: 1001,
    dungeonDifficulty: 2,
    duration: 60.4,
    activeCombatDuration: 45.2,
    localPlayerId: 1,
    bosses: [{ monsterId: 9001, maxHp: 1000, isDefeated: true }],
    players: [],
    remoteEncounterId: null,
    isFavorite: false,
    note: null,
    detailAvailable: true,
    displayIndex: 3,
    ...partial,
  };
}

function deathReplay(victimEntityUuid: string): DeathRecord {
  return {
    victimEntityUuid,
    deathTimestampMs: "1000",
    recentDamages: [],
    victimBuffs: [],
    participantBuffs: [],
  };
}

function detail(
  partial: Partial<EncounterDetailData> = {},
): EncounterDetailData {
  const encounterSummary = partial.summary ?? summary();
  return {
    encounterId: encounterSummary.id,
    summary: encounterSummary,
    detailAvailable: true,
    qualityFlags: [],
    startMs: 0,
    endMsExclusive: 60_400,
    totals: {
      damage: "0",
      bossDamage: "0",
      healing: "0",
      effectiveHealing: "0",
      damageTaken: "0",
    },
    entities: [
      entity({
        entityId: "1",
        totals: {
          damage: "6000",
          bossDamage: "4000",
          healing: "900",
          effectiveHealing: "600",
          damageTaken: "300",
        },
        skills: [
          skill("1", "damage", {
            total: "6000",
            hits: "10",
            criticalHits: "3",
          }),
          skill("5", "healing", { total: "900", effectiveTotal: "600" }),
          skill("2", "damage_taken", { total: "300", hits: "4" }),
        ],
        deaths: [
          { offsetMs: 5, sourceEntityId: null, skillId: null, replay: null },
          {
            offsetMs: 9,
            sourceEntityId: "m",
            skillId: "3",
            replay: deathReplay("1"),
          },
        ],
      }),
      entity({
        entityId: "2",
        displayUid: 1002,
        skills: [
          skill("1", "damage", { total: "3000", hits: "6" }),
          skill("2", "damage_taken", { total: "700", hits: "9" }),
        ],
      }),
      entity({
        entityId: "m",
        monsterId: 9001,
        skills: [skill("3", "damage", { total: "5000", hits: "2" })],
        deaths: [
          {
            offsetMs: 60,
            sourceEntityId: "1",
            skillId: "1",
            replay: deathReplay("m"),
          },
        ],
      }),
    ],
    markers: [],
    ...partial,
  };
}

describe("historyMarkerEvents", () => {
  it("re-bases offsets onto the encounter start and parses skill ids", () => {
    const events = historyMarkerEvents(
      [
        {
          offsetMs: 1_500,
          sequence: 4,
          casterEntityId: "1",
          skillId: "123",
          kind: "fantasy",
          remodelLevel: 3,
        },
        {
          offsetMs: 2_000,
          sequence: 5,
          casterEntityId: "2",
          skillId: "77",
          kind: "boss_skill",
        },
      ],
      500,
    );
    expect(events).toEqual([
      {
        sequence: 4,
        tsOffsetMs: 1_000,
        casterUuid: "1",
        skillId: 123,
        kind: "fantasy",
        remodelLevel: 3,
      },
      {
        sequence: 5,
        tsOffsetMs: 1_500,
        casterUuid: "2",
        skillId: 77,
        kind: "boss_skill",
        remodelLevel: null,
      },
    ]);
  });
});

describe("historyDetailToLiveSnapshot", () => {
  it("matches the history page's player rows for every metric", () => {
    const encounter = detail();
    const snapshot = historyDetailToLiveSnapshot(encounter);
    const players = encounter.entities
      .filter((row) => row.monsterId === null)
      .map(historyEntityToRaw);
    const historyRows = new Map(
      buildHistoryPlayerRows(players, 60_400, 45_200, "1").map((row) => [
        row.entityUuid,
        row,
      ]),
    );

    const dpsRows = computePlayerRows(snapshot.combat, "dps");
    expect(dpsRows.map((row) => row.entityUuid).sort()).toEqual(["1", "2"]);
    for (const row of dpsRows) {
      const expected = historyRows.get(row.entityUuid);
      expect(row.dps).toBe(expected?.dps);
      expect(row.tdps).toBe(expected?.tdps);
      expect(row.dmgPct).toBe(expected?.dmgPct);
      expect(row.bossDps).toBe(expected?.bossDps);
      expect(row.bossDmgPct).toBe(expected?.bossDmgPct);
    }
    for (const row of computePlayerRows(snapshot.combat, "heal")) {
      const expected = historyRows.get(row.entityUuid);
      expect(row.dps).toBe(expected?.hps);
      expect(row.effectiveDps).toBe(expected?.ehps);
      expect(row.dmgPct).toBe(expected?.healPct);
    }
    for (const row of computePlayerRows(snapshot.combat, "tanked")) {
      const expected = historyRows.get(row.entityUuid);
      expect(row.dps).toBe(expected?.tankedPS);
      expect(row.dmgPct).toBe(expected?.tankedPct);
    }
  });

  it("fills the live payload envelope from the summary", () => {
    const snapshot = historyDetailToLiveSnapshot(detail());
    expect(snapshot.encounterId).toBe(7);
    expect(snapshot.combat.elapsedMs).toBe("60400");
    expect(snapshot.combat.damageElapsedMs).toBe("60400");
    expect(snapshot.combat.activeCombatTimeMs).toBe("45200");
    expect(snapshot.combat.fightStartTimestampMs).toBe("1700000000000");
    expect(snapshot.combat.totalDmg).toBe("9000");
    expect(snapshot.combat.totalDmgBossOnly).toBe("4000");
    expect(snapshot.combat.totalHeal).toBe("900");
    expect(snapshot.combat.totalEffectiveHeal).toBe("600");
    expect(snapshot.combat.localPlayerUuid).toBe("1");
    expect(snapshot.combat.sceneId).toBe(1001);
    expect(snapshot.combat.dungeonDifficulty).toBe(2);
    expect(snapshot.combat.isPaused).toBe(false);
    expect(snapshot.combat.bosses).toEqual([]);
  });

  it("freezes the display clock at the recorded duration", () => {
    const snapshot = historyDetailToLiveSnapshot(detail());
    expect(displayElapsedMs(snapshot.displayClock, 0)).toBe(60_400);
    expect(
      displayElapsedMs(snapshot.displayClock, Number.MAX_SAFE_INTEGER),
    ).toBe(60_400);
  });

  it("caps active time at the duration and falls back without it", () => {
    const capped = historyDetailToLiveSnapshot(
      detail({ summary: summary({ activeCombatDuration: 99 }) }),
    );
    expect(capped.combat.activeCombatTimeMs).toBe("60400");
    const missing = historyDetailToLiveSnapshot(
      detail({
        summary: summary({ activeCombatDuration: null, localPlayerId: null }),
      }),
    );
    expect(missing.combat.activeCombatTimeMs).toBe("60400");
    expect(missing.combat.localPlayerUuid).toBe("");
  });

  it("keeps only player deaths that carry a replay", () => {
    const snapshot = historyDetailToLiveSnapshot(detail());
    expect(snapshot.deaths).toEqual([deathReplay("1")]);
  });

  it("derives fantasy casts from the encounter's markers", () => {
    const fantasy = RESONANCE_SKILLS[0];
    if (!fantasy) throw new Error("expected resonance skills");
    const snapshot = historyDetailToLiveSnapshot(
      detail({
        startMs: 100,
        markers: [
          {
            offsetMs: 1_100,
            sequence: 1,
            casterEntityId: "2",
            skillId: String(fantasy.skillId),
            kind: "fantasy",
            remodelLevel: 4,
          },
        ],
      }),
    );
    const [cast] = snapshot.fantasyCasts.get("2") ?? [];
    expect(cast?.id).toBe(String(fantasy.skillId));
    expect(cast?.remodelLevel).toBe(4);
    expect(snapshot.fantasyCasts.has("1")).toBe(false);
  });
});

function damageTarget(
  targetEntityId: string,
  total: string,
  partial: Partial<EncounterEntityData["damageTargets"][number]> = {},
): EncounterEntityData["damageTargets"][number] {
  return {
    targetEntityId,
    targetDisplayUid: 0,
    targetName: null,
    targetMonsterId: null,
    isBoss: false,
    stats: stats({ total, hits: "2" }),
    skills: [skill("1", "damage", { total, hits: "2" })],
    ...partial,
  };
}

function targetedDetail(): EncounterDetailData {
  const base = detail();
  const [first, second, monster] = base.entities;
  if (!first || !second || !monster) throw new Error("fixture entities");
  return {
    ...base,
    entities: [
      {
        ...first,
        damageTargets: [
          damageTarget("boss-1", "5000", {
            isBoss: true,
            targetMonsterId: 9001,
          }),
          damageTarget("add-7", "1000", { targetName: "Add" }),
        ],
      },
      {
        ...second,
        damageTargets: [
          damageTarget("boss-1", "3000", { isBoss: true }),
          damageTarget("x", "2000", { targetDisplayUid: 55 }),
        ],
      },
      monster,
      entity({ entityId: "boss-1", name: "Tina", monsterId: 9001 }),
    ],
  };
}

describe("historyDamageTargets", () => {
  it("merges targets across players, names them and drops bare ids", () => {
    const encounter = targetedDetail();
    const players = encounter.entities
      .filter((row) => row.monsterId === null)
      .map(historyEntityToRaw);
    const targets = historyDamageTargets(
      players,
      historyEntityNames(encounter.entities),
    );
    expect(
      targets.map((target) => [
        target.targetEntityUuid,
        target.targetName,
        target.totalValue,
      ]),
    ).toEqual([
      ["boss-1", "Tina", 8000n],
      ["add-7", "Add", 1000n],
    ]);
    expect(targets[0]?.targetMonsterId).toBe(9001);
  });
});

describe("historyCombatForTarget", () => {
  it("returns the whole-encounter payload without a target", () => {
    const snapshot = historyDetailToLiveSnapshot(targetedDetail());
    expect(historyCombatForTarget(snapshot, null)).toBe(snapshot.combat);
  });

  it("matches the history page's per-target damage rows", () => {
    const encounter = targetedDetail();
    const snapshot = historyDetailToLiveSnapshot(encounter);
    const zero = historyStatsToCombat(stats());
    // The history page's own construction for a selected target.
    const pageEntities = snapshot.players.map((row) => {
      const damage =
        row.dmgPerTarget.find((target) => target.targetEntityUuid === "boss-1")
          ?.damage ?? zero;
      return {
        ...row,
        damage,
        damageBossOnly: damage,
        healing: zero,
        taken: zero,
      };
    });
    const expected = new Map(
      buildHistoryPlayerRows(pageEntities, 60_400, 45_200, "1").map((row) => [
        row.entityUuid,
        row,
      ]),
    );

    const combat = historyCombatForTarget(snapshot, "boss-1");
    expect(combat.totalDmg).toBe("8000");
    expect(combat.totalDmgBossOnly).toBe("8000");
    const rows = computePlayerRows(combat, "dps");
    expect(rows.map((row) => row.entityUuid).sort()).toEqual(["1", "2"]);
    for (const row of rows) {
      const page = expected.get(row.entityUuid);
      expect(row.totalDmg).toBe(page?.totalDmg);
      expect(row.dps).toBe(page?.dps);
      expect(row.tdps).toBe(page?.tdps);
      expect(row.dmgPct).toBe(page?.dmgPct);
      expect(row.bossDps).toBe(page?.bossDps);
    }
  });

  it("narrows skills to the target and leaves healing / taken alone", () => {
    const snapshot = historyDetailToLiveSnapshot(targetedDetail());
    const combat = historyCombatForTarget(snapshot, "add-7");
    const first = combat.entities.find((row) => row.entityUuid === "1");
    expect(first?.dmgSkills[1]?.totalValue).toBe("1000");
    expect(
      computePlayerRows(combat, "dps").map((row) => row.entityUuid),
    ).toEqual(["1"]);
    expect(computePlayerRows(combat, "heal")).toEqual(
      computePlayerRows(snapshot.combat, "heal"),
    );
    expect(computePlayerRows(combat, "tanked")).toEqual(
      computePlayerRows(snapshot.combat, "tanked"),
    );
  });
});
