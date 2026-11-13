import { describe, expect, it } from "vitest";
import {
  advanceContinuousDamage,
  continuousDamageRows,
} from "./skill-damage-continuous";
import {
  createSkillDamageGroup,
  normalizeSkillDamageGroup,
  monitorAllSkillDamage,
  createSkillDamageProfile,
} from "./skill-damage-settings";
import { buildSkillDamageRows } from "./skill-damage-groups";
import type { SkillDamageHitState } from "./bindings";
import { watchedSkillDamageKeys } from "./skill-damage-settings";
import {
  castPresetSkillIds,
  watchedSkillDamageCastIds,
} from "./skill-damage-cast-presets";

const hit = (
  id: number,
  time: number,
  skillId = 10,
  amount = "100",
  batch = id,
): SkillDamageHitState => ({
  id,
  batch,
  skillId,
  amount,
  targetUuid: String(skillId),
  occurredAtMs: time,
});
function group() {
  const result = createSkillDamageGroup("Chain");
  result.displayMode = "continuous";
  result.continuousWindowMs = 1000;
  result.durationMs = 500;
  result.entries = [{ skillId: 10, alias: "" }];
  return result;
}
describe("continuous damage windows", () => {
  it.each([0, 250, 1000])(
    "settles cast windows %i ms after ending and counts damage during the delay",
    (delay) => {
      const g = group();
      g.continuousWindowMode = "cast";
      g.continuousCastCloseDelayMs = delay;
      const casts = [
        { id: 1, skillId: 1241, phase: "start", occurredAtMs: 1000 },
        { id: 3, skillId: 1241, phase: "end", occurredAtMs: 2000 },
      ];
      const first = advanceContinuousDamage(
        [],
        [hit(2, 1100)],
        [g],
        2000,
        casts,
      );
      expect(first[0]).toMatchObject({
        amount: "100",
        deadlineMs: 2000 + delay,
        finalExpiresAtMs: 2500 + delay,
      });
      const during = advanceContinuousDamage(
        first,
        [hit(4, 2000 + Math.floor(delay / 2))],
        [g],
        2000 + Math.floor(delay / 2),
      );
      expect(during[0]?.amount).toBe(delay === 0 ? "100" : "200");
      if (delay > 0)
        expect(
          continuousDamageRows(during, [g], 2000 + delay - 1)[0]?.phase,
        ).toBe("active");
      expect(continuousDamageRows(during, [g], 2000 + delay)[0]?.phase).toBe(
        "final",
      );
      const after = advanceContinuousDamage(
        during,
        [hit(5, 2000 + delay)],
        [g],
        2000 + delay,
      );
      expect(after[0]?.amount).toBe(during[0]?.amount);
      expect(continuousDamageRows(after, [g], 2500 + delay)).toEqual([]);
    },
  );
  it("does not postpone settlement for duplicate completion events and cancels pending closing on a new cast", () => {
    const g = group();
    g.continuousWindowMode = "cast";
    g.continuousCastCloseDelayMs = 500;
    const cast = (id: number, time: number, phase: string) => ({
      id,
      skillId: 1241,
      occurredAtMs: time,
      phase,
    });
    const first = advanceContinuousDamage([], [hit(2, 1100)], [g], 2100, [
      cast(1, 1000, "start"),
      cast(3, 2000, "end"),
      cast(4, 2100, "complete"),
    ]);
    expect(first[0]?.deadlineMs).toBe(2500);
    const reopened = advanceContinuousDamage(first, [hit(6, 3000)], [g], 3000, [
      cast(5, 2200, "start"),
    ]);
    expect(reopened[0]).toMatchObject({
      key: first[0]!.key,
      amount: "200",
      deadlineMs: Number.POSITIVE_INFINITY,
    });
  });
  it("defaults and clamps cast closing delays", () => {
    expect(normalizeSkillDamageGroup({}).continuousCastCloseDelayMs).toBe(0);
    expect(
      normalizeSkillDamageGroup({ continuousCastCloseDelayMs: -100 })
        .continuousCastCloseDelayMs,
    ).toBe(0);
    expect(
      normalizeSkillDamageGroup({ continuousCastCloseDelayMs: 5000 })
        .continuousCastCloseDelayMs,
    ).toBe(1000);
    expect(
      normalizeSkillDamageGroup({ continuousCastCloseDelayMs: 250 })
        .continuousCastCloseDelayMs,
    ).toBe(250);
  });
  it("opens and refreshes rolling windows on any local damage when the whole group watches all damage", () => {
    const g = group();
    g.allSelfDamage = true;
    g.entries = [];
    const state = advanceContinuousDamage(
      [],
      [hit(1, 1000, 20), hit(2, 1800, 30)],
      [g],
      1900,
    );
    expect(state[0]).toMatchObject({
      amount: "200",
      comboCount: "2",
      deadlineMs: 2800,
    });
    const profile = createSkillDamageProfile("");
    profile.enabled = true;
    profile.groups = [g];
    expect(monitorAllSkillDamage(profile)).toBe(true);
    g.displayMode = "merge";
    expect(monitorAllSkillDamage(profile)).toBe(true);
    g.enabled = false;
    expect(monitorAllSkillDamage(profile)).toBe(false);
  });
  it("counts all group damage while preserving explicit opening and closing triggers", () => {
    const g = group();
    g.allSelfDamage = true;
    g.entries = [];
    g.continuousWindowMode = "skills";
    g.continuousStartSkillIds = [20];
    g.continuousEndSkillIds = [40];
    const state = advanceContinuousDamage(
      [],
      [
        hit(1, 900, 99),
        hit(2, 1000, 20),
        hit(3, 1100, 30),
        hit(4, 1200, 40),
        hit(5, 1300, 99),
      ],
      [g],
      1300,
    );
    expect(state[0]).toMatchObject({
      amount: "300",
      comboCount: "3",
      deadlineMs: 1200,
    });
    expect(
      normalizeSkillDamageGroup({ allSelfDamage: true }).allSelfDamage,
    ).toBe(true);
    expect(normalizeSkillDamageGroup({}).allSelfDamage).toBe(false);
    expect(
      normalizeSkillDamageGroup({ continuousCastPreset: "flame" })
        .continuousCastPreset,
    ).toBe("ray");
  });
  it("accepts any selected opening/closing skill and watches every trigger", () => {
    const g = group();
    g.continuousWindowMode = "skills";
    g.continuousStartSkillIds = [20, 21];
    g.continuousEndSkillIds = [30, 31];
    g.continuousAllDamage = true;
    for (const start of g.continuousStartSkillIds) {
      for (const end of g.continuousEndSkillIds) {
        const state = advanceContinuousDamage(
          [],
          [
            hit(1, 1000, 99),
            hit(2, 1100, start),
            hit(3, 1200),
            hit(4, 1300, end),
            hit(5, 1400),
          ],
          [g],
          1400,
        );
        expect(state[0]).toMatchObject({
          amount: "300",
          comboCount: "3",
          deadlineMs: 1300,
        });
        expect(continuousDamageRows(state, [g], 1400)[0]?.phase).toBe("final");
      }
    }
    const profile = createSkillDamageProfile("");
    profile.enabled = true;
    profile.groups = [g];
    expect(watchedSkillDamageKeys(profile)).toEqual([10, 20, 21, 30, 31]);
  });
  it("migrates single trigger profiles and validates deduplicated multiple selections", () => {
    expect(
      normalizeSkillDamageGroup({
        continuousStartSkillId: 20,
        continuousEndSkillId: 30,
      }),
    ).toMatchObject({
      continuousStartSkillIds: [20],
      continuousEndSkillIds: [30],
    });
    expect(
      normalizeSkillDamageGroup({
        continuousStartSkillId: 20,
        continuousStartSkillIds: [],
        continuousEndSkillIds: [30, 31, 30, -1, 0, 1.5, "32", null],
      }),
    ).toMatchObject({
      continuousStartSkillIds: [],
      continuousEndSkillIds: [30, 31],
    });
  });
  it("waits for the opening hit, includes the closing hit and settles immediately", () => {
    const g = group();
    g.continuousWindowMode = "skills";
    g.continuousStartSkillIds = [10];
    g.continuousEndSkillIds = [20];
    g.entries.push({ skillId: 20, alias: "" });
    const state = advanceContinuousDamage(
      [],
      [hit(1, 100, 20), hit(2, 200), hit(3, 300, 20), hit(4, 400, 20)],
      [g],
      400,
    );
    expect(state[0]).toMatchObject({
      amount: "200",
      comboCount: "2",
      deadlineMs: 300,
      finalExpiresAtMs: 800,
    });
    expect(continuousDamageRows(state, [g], 400)[0]?.phase).toBe("final");
  });
  it("refreshes the timeout on repeated opening hits without clearing totals", () => {
    const g = group();
    g.continuousWindowMode = "skills";
    g.continuousTimeoutMs = 1000;
    const state = advanceContinuousDamage(
      [],
      [hit(1, 1000), hit(2, 1900)],
      [g],
      2000,
    );
    expect(state[0]).toMatchObject({
      amount: "200",
      comboCount: "2",
      startedAtMs: 1000,
      deadlineMs: 2900,
      finalExpiresAtMs: 3400,
    });
    expect(continuousDamageRows(state, [g], 2000)[0]?.phase).toBe("active");
    expect(continuousDamageRows(state, [g], 2900)[0]?.phase).toBe("final");
  });
  it("refreshes outside-group opening triggers but not ordinary counted damage", () => {
    const g = group();
    g.continuousWindowMode = "skills";
    g.continuousStartSkillIds = [20, 21];
    g.continuousTimeoutMs = 1000;
    const first = advanceContinuousDamage(
      [],
      [hit(1, 1000, 20), hit(2, 1100)],
      [g],
      1100,
    );
    const refreshed = advanceContinuousDamage(
      first,
      [hit(3, 1800, 21), hit(4, 1900)],
      [g],
      1900,
    );
    expect(refreshed[0]).toMatchObject({
      key: first[0]!.key,
      amount: "200",
      comboCount: "2",
      deadlineMs: 2800,
    });
    g.continuousAllDamage = true;
    const counted = advanceContinuousDamage(
      refreshed,
      [hit(5, 2700, 99)],
      [g],
      2700,
    );
    expect(counted[0]).toMatchObject({ amount: "300", deadlineMs: 2800 });
  });
  it.each(["ray", "infusion"] as const)(
    "keeps %s cast windows open without timeouts while preserving the total on reopening",
    (preset) => {
      const g = group();
      g.continuousWindowMode = "cast";
      g.continuousCastPreset = preset;
      g.continuousTimeoutMs = 1000;
      const cast = (id: number, time: number, phase: string) => ({
        id,
        occurredAtMs: time,
        phase,
        skillId: preset === "ray" ? 1241 : 1520,
      });
      const opening = preset === "ray" ? "durationStart" : "start";
      const first = advanceContinuousDamage([], [hit(2, 1100)], [g], 1100, [
        cast(1, 1000, opening),
      ]);
      const refreshed = advanceContinuousDamage(
        first,
        [hit(4, 1900)],
        [g],
        2000,
        [cast(3, 1800, opening)],
      );
      expect(refreshed[0]).toMatchObject({
        key: first[0]!.key,
        amount: "200",
        comboCount: "2",
        deadlineMs: Number.POSITIVE_INFINITY,
        finalExpiresAtMs: Number.POSITIVE_INFINITY,
      });
      expect(continuousDamageRows(refreshed, [g], 2000)[0]?.phase).toBe(
        "active",
      );
      const ended = advanceContinuousDamage(refreshed, [], [g], 2200, [
        cast(5, 2200, preset === "ray" ? "end" : "complete"),
      ]);
      expect(ended[0]).toMatchObject({ amount: "200", deadlineMs: 2200 });
    },
  );
  it("uses outside-group triggers without counting their damage unless all-damage is enabled", () => {
    const g = group();
    g.continuousWindowMode = "skills";
    g.continuousStartSkillIds = [20];
    g.continuousEndSkillIds = [30];
    const hits = [hit(1, 1000, 20), hit(2, 1100), hit(3, 1200, 30)];
    expect(advanceContinuousDamage([], hits, [g], 1200)[0]?.amount).toBe("100");
    g.continuousAllDamage = true;
    expect(advanceContinuousDamage([], hits, [g], 1200)[0]?.amount).toBe("300");
    const profile = createSkillDamageProfile("");
    profile.enabled = true;
    profile.groups = [g];
    expect(watchedSkillDamageKeys(profile)).toEqual([10, 20, 30]);
  });
  it("opens and closes ray windows using the counter's duration events, with no zero-damage row", () => {
    const g = group();
    g.continuousWindowMode = "cast";
    g.continuousCastPreset = "ray";
    expect(castPresetSkillIds(g)).toEqual([1241]);
    const cast = (id: number, time: number, phase: string, skillId = 1241) => ({
      id,
      occurredAtMs: time,
      phase,
      skillId,
    });
    let state = advanceContinuousDamage([], [], [g], 1000, [
      cast(1, 1000, "start"),
    ]);
    expect(state).toHaveLength(1);
    expect(continuousDamageRows(state, [g], 1000)).toEqual([]);
    state = advanceContinuousDamage(state, [], [g], 1000, [
      cast(2, 1000, "durationStart"),
    ]);
    expect(continuousDamageRows(state, [g], 1000)).toEqual([]);
    state = advanceContinuousDamage(state, [hit(3, 1100)], [g], 1200, [
      cast(4, 1200, "end", 1520),
    ]);
    expect(continuousDamageRows(state, [g], 1200)[0]?.phase).toBe("active");
    state = advanceContinuousDamage(state, [], [g], 1300, [
      cast(5, 1300, "end"),
    ]);
    expect(continuousDamageRows(state, [g], 1300)[0]).toMatchObject({
      amount: "100",
      phase: "final",
      occurredAtMs: 1300,
    });
  });
  it("counts ray damage before a delayed duration-start and settles on completion without a duration-end", () => {
    const g = group();
    g.continuousWindowMode = "cast";
    g.continuousCastPreset = "ray";
    g.allSelfDamage = true;
    g.entries = [];
    g.continuousTimeoutMs = 1000;
    const cast = (id: number, time: number, phase: string, skillId = 1241) => ({
      id,
      occurredAtMs: time,
      phase,
      skillId,
    });
    // Another skill may occupy the duration slot; the local request still emits start.
    const first = advanceContinuousDamage(
      [],
      [hit(2, 1100, 112410104)],
      [g],
      1100,
      [cast(1, 1000, "start")],
    );
    expect(first[0]).toMatchObject({
      amount: "100",
      comboCount: "1",
      deadlineMs: Number.POSITIVE_INFINITY,
    });
    const continued = advanceContinuousDamage(
      first,
      [hit(4, 1400, 112410104)],
      [g],
      1400,
      [cast(3, 1300, "durationStart")],
    );
    expect(continued[0]).toMatchObject({
      key: first[0]!.key,
      amount: "200",
      comboCount: "2",
      deadlineMs: Number.POSITIVE_INFINITY,
    });
    const ended = advanceContinuousDamage(continued, [], [g], 1500, [
      cast(5, 1500, "complete"),
    ]);
    expect(continuousDamageRows(ended, [g], 1500)[0]).toMatchObject({
      amount: "200",
      comboCount: "2",
      phase: "final",
      occurredAtMs: 1500,
    });
    const after = advanceContinuousDamage(
      ended,
      [hit(6, 1600, 112410104)],
      [g],
      1600,
    );
    expect(after[0]?.amount).toBe("200");
  });
  it("keeps ray windows active indefinitely when no end event has arrived", () => {
    const g = group();
    g.continuousWindowMode = "cast";
    g.continuousTimeoutMs = 1000;
    const state = advanceContinuousDamage([], [hit(2, 1100)], [g], 1100, [
      { id: 1, skillId: 1241, phase: "start", occurredAtMs: 1000 },
    ]);
    expect(continuousDamageRows(state, [g], 1999)[0]?.phase).toBe("active");
    expect(continuousDamageRows(state, [g], 2000)[0]?.phase).toBe("active");
    const later = advanceContinuousDamage(
      state,
      [hit(3, 3601000)],
      [g],
      3601000,
    );
    expect(later[0]).toMatchObject({
      amount: "200",
      comboCount: "2",
      deadlineMs: Number.POSITIVE_INFINITY,
    });
    expect(continuousDamageRows(later, [g], 3601000)[0]?.phase).toBe("active");
    const ended = advanceContinuousDamage(later, [], [g], 3602000, [
      { id: 4, skillId: 1241, phase: "end", occurredAtMs: 3602000 },
    ]);
    expect(ended[0]).toMatchObject({
      amount: "200",
      deadlineMs: 3602000,
      finalExpiresAtMs: 3602500,
    });
    expect(continuousDamageRows(ended, [g], 3602000)[0]?.phase).toBe("final");
    expect(continuousDamageRows(ended, [g], 3602500)).toEqual([]);
  });
  it("settles infusion only on completion and ignores its old timeout setting", () => {
    const g = group();
    g.continuousWindowMode = "cast";
    g.continuousCastPreset = "infusion";
    g.continuousTimeoutMs = 1000;
    const cast = (id: number, time: number, phase: string) => ({
      id,
      occurredAtMs: time,
      phase,
      skillId: 1520,
    });
    const state = advanceContinuousDamage([], [hit(2, 1100)], [g], 1200, [
      cast(1, 1000, "start"),
      cast(3, 1200, "complete"),
    ]);
    expect(state[0]).toMatchObject({ amount: "100", deadlineMs: 1200 });
    const fallback = advanceContinuousDamage([], [hit(2, 1100)], [g], 2000, [
      cast(1, 1000, "start"),
    ]);
    expect(continuousDamageRows(fallback, [g], 2000)[0]?.phase).toBe("active");
    const profile = createSkillDamageProfile("");
    profile.enabled = true;
    profile.groups = [g];
    expect(watchedSkillDamageCastIds(profile)).toEqual([1520]);
    g.enabled = false;
    expect(watchedSkillDamageCastIds(profile)).toEqual([]);
  });
  it("normalizes legacy and malformed window settings", () => {
    expect(normalizeSkillDamageGroup({})).toMatchObject({
      continuousWindowMode: "rolling",
      continuousEndSkillIds: [],
      continuousTimeoutMs: 15000,
    });
    expect(
      normalizeSkillDamageGroup({
        continuousWindowMode: "invalid",
        continuousStartSkillId: -1,
        continuousEndSkillId: 1.2,
        continuousTimeoutMs: 1e9,
      }),
    ).toMatchObject({
      continuousWindowMode: "rolling",
      continuousStartSkillIds: [],
      continuousEndSkillIds: [],
      continuousTimeoutMs: 3600000,
    });
  });
  it("updates one total and refreshes the window only on group skill hits", () => {
    const g = group();
    let state = advanceContinuousDamage([], [hit(1, 1000)], [g], 1000);
    const key = state[0]!.key;
    state = advanceContinuousDamage(
      state,
      [hit(2, 1900), hit(3, 1950, 20)],
      [g],
      1950,
    );
    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({
      key,
      amount: "200",
      comboCount: "2",
      deadlineMs: 2900,
    });
    const active = continuousDamageRows(state, [g], 2899);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      phase: "active",
      amount: "200",
      expiresAtMs: 2900,
    });
    const final = continuousDamageRows(state, [g], 2900);
    expect(final[0]).toMatchObject({
      phase: "final",
      amount: "200",
      comboCount: "2",
      expiresAtMs: 3400,
    });
    expect(final[0]!.key).not.toBe(active[0]!.key);
    expect(continuousDamageRows(state, [g], 3400)).toEqual([]);
    expect(buildSkillDamageRows([hit(1, 1000)], [g])).toEqual([]);
  });
  it("counts other own damage only inside an open all-damage window without renewing it", () => {
    const g = group();
    g.continuousAllDamage = true;
    const state = advanceContinuousDamage(
      [],
      [hit(1, 900, 20), hit(2, 1000), hit(3, 1999, 20), hit(4, 2000, 20)],
      [g],
      2000,
    );
    expect(state[0]).toMatchObject({
      amount: "200",
      comboCount: "2",
      deadlineMs: 2000,
    });
    expect(continuousDamageRows(state, [g], 2000)[0]?.phase).toBe("final");
    expect(advanceContinuousDamage([], [hit(1, 1000, 20)], [g], 1000)).toEqual(
      [],
    );
  });
  it("includes simultaneous outside hits even when the packet lists them before the trigger", () => {
    const g = group();
    g.continuousAllDamage = true;
    const state = advanceContinuousDamage(
      [],
      [hit(1, 1000, 20, "50", 1), hit(2, 1000, 10, "100", 1)],
      [g],
      1000,
    );
    expect(state[0]).toMatchObject({ amount: "150", comboCount: "2" });
  });
  it("starts a new chain at the exact deadline and replaces the previous total", () => {
    const g = group();
    const first = advanceContinuousDamage([], [hit(1, 1000)], [g], 1000);
    const next = advanceContinuousDamage(
      first,
      [hit(2, 2000, 10, "7")],
      [g],
      2000,
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      amount: "7",
      comboCount: "1",
      deadlineMs: 3000,
    });
    expect(next[0]!.key).not.toBe(first[0]!.key);
  });
  it("keeps exact damage and unlimited HIT counts beyond 9999 and Number.MAX_SAFE_INTEGER", () => {
    const g = group();
    const state = advanceContinuousDamage(
      [],
      [hit(1, 1000, 10, "9007199254740993")],
      [g],
      1000,
    );
    for (const count of ["9999", "9007199254740993"]) {
      const updated = advanceContinuousDamage(
        [{ ...state[0]!, comboCount: count }],
        [hit(2, 1100, 10, "7")],
        [g],
        1100,
      );
      expect(updated[0]!.comboCount).toBe((BigInt(count) + 1n).toString());
      expect(updated[0]!.amount).toBe("9007199254741000");
      expect(continuousDamageRows(updated, [g], 1100)[0]!.comboCount).toBe(
        (BigInt(count) + 1n).toString(),
      );
    }
  });
  it("isolates groups and stops disabled or switched modes", () => {
    const g = group();
    const other = group();
    other.entries = [{ skillId: 20, alias: "" }];
    const state = advanceContinuousDamage(
      [],
      [hit(1, 1000), hit(2, 1000, 20, "7")],
      [g, other],
      1000,
    );
    expect(state.map((chain) => chain.amount)).toEqual(["100", "7"]);
    g.enabled = false;
    other.displayMode = "merge";
    expect(continuousDamageRows(state, [g, other], 1100)).toEqual([]);
    expect(advanceContinuousDamage(state, [], [g, other], 1100)).toEqual([]);
  });
  it("defaults old profiles to merge mode and enables backend all-damage collection only when needed", () => {
    const old = normalizeSkillDamageGroup({
      entries: [{ skillId: 10, alias: "" }],
    });
    expect(old.displayMode).toBe("merge");
    const profile = createSkillDamageProfile("");
    profile.enabled = true;
    profile.groups = [group()];
    expect(monitorAllSkillDamage(profile)).toBe(false);
    profile.groups[0]!.continuousAllDamage = true;
    expect(monitorAllSkillDamage(profile)).toBe(true);
    profile.enabled = false;
    expect(monitorAllSkillDamage(profile)).toBe(false);
  });
});
