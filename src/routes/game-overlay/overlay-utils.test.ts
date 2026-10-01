import { describe, expect, it } from "vitest";

import { barScaleAt } from "$lib/bar-motion";
import type { BuffUpdateState, SkillCdState } from "$lib/bindings";
import { t } from "$lib/i18n/index.svelte";
import type { InlineBuffEntry } from "$lib/settings-store";
import {
  buildBuffTextRow,
  computeDisplay,
  formatTimerText,
  getBuffRemainingMs,
  getCustomPanelDisplayRow,
  isBuffActive,
} from "./overlay-utils";

function buff(overrides: Partial<BuffUpdateState> = {}): BuffUpdateState {
  return {
    baseId: 100,
    durationMs: 1_000,
    createTimeMs: 1_000,
    layer: 1,
    sourceRemodelLevel: null,
    ...overrides,
  };
}

describe("skill cooldown calculation with cached definitions", () => {
  function cd(overrides: Partial<SkillCdState> = {}): SkillCdState {
    return {
      skillLevelId: 100,
      beginTime: 0,
      duration: 10_000,
      skillCdType: 0,
      validCdTime: 0,
      receivedAt: 100_000,
      calculatedDuration: 10_000,
      cdAccelerateRate: 0,
      readyAtMs: null,
      maxCharges: null,
      maxValidCdTime: null,
      ...overrides,
    };
  }

  it("preserves cooldown reduction, elapsed acceleration, and readiness", () => {
    const value = cd({
      calculatedDuration: 5_000,
      validCdTime: 2_000,
      cdAccelerateRate: 1,
    });
    expect(computeDisplay(value, 101_000)).toMatchObject({
      isActive: true,
      percent: 0.4,
      text: "2.0",
      usable: false,
    });
    expect(computeDisplay(value, 102_000)).toMatchObject({
      isActive: false,
      percent: 0,
      text: "",
      usable: true,
    });
  });

  it("preserves each charge boundary while recharging usable skills", () => {
    const value = cd({
      skillCdType: 1,
      calculatedDuration: 5_000,
      cdAccelerateRate: 1,
      maxCharges: 3,
    });
    expect(computeDisplay(value, 102_500)).toMatchObject({
      chargesAvailable: 1,
      maxCharges: 3,
      percent: 1,
      usable: true,
      isActive: true,
    });
    expect(computeDisplay(value, 103_000)).toMatchObject({
      chargesAvailable: 1,
      percent: 0.8,
      text: "4.0",
    });
    expect(computeDisplay(value, 107_500)).toMatchObject({
      chargesAvailable: 3,
      percent: 0,
      text: "",
      usable: true,
      isActive: false,
    });
  });

  it("animates the recharge bar on the same course as the clock", () => {
    const value = cd({
      skillCdType: 1,
      calculatedDuration: 5_000,
      validCdTime: 1_000,
      cdAccelerateRate: 0.5,
      maxCharges: 3,
    });
    const motion = computeDisplay(value, 100_500)?.rechargeMotion;
    expect(motion).toBeDefined();
    // One course for the whole recharge, across charge boundaries.
    for (const now of [100_500, 103_000, 104_200, 106_000, 108_900]) {
      const display = computeDisplay(value, now);
      expect(display?.rechargeMotion).toEqual(motion);
      expect(barScaleAt(motion!, now)).toBeCloseTo(1 - display!.percent, 6);
    }
  });

  it("keeps server-driven resource charging independent of elapsed time", () => {
    const value = cd({
      duration: -1,
      skillCdType: 1,
      validCdTime: 40,
      maxValidCdTime: 100,
    });
    expect(computeDisplay(value, 200_000)).toEqual(
      computeDisplay(value, 100_000),
    );
    expect(computeDisplay(value, 200_000)).toMatchObject({
      percent: 0.6,
      text: "40%",
      usable: false,
    });
    // Capacity comes from the backend charge table; without it the slot
    // has no display.
    expect(
      computeDisplay(cd({ ...value, maxValidCdTime: null }), 200_000),
    ).toBeNull();
  });
});

describe("buff display membership", () => {
  it("hides a finite buff after its estimated deadline", () => {
    const value = buff();

    expect(isBuffActive(value, 1_999)).toBe(true);
    expect(isBuffActive(value, 2_000)).toBe(false);
    expect(getBuffRemainingMs(value, 2_001)).toBe(0);
    expect(buildBuffTextRow("buff_100", "Buff", value, 2_001)).toBeNull();
    expect(formatTimerText(0)).toBe("--");
  });

  it("hides a single-layer zero-duration buff unless forced", () => {
    const value = buff({ durationMs: 0 });

    expect(isBuffActive(value, 10_000)).toBe(true);
    expect(getBuffRemainingMs(value, 10_000)).toBe(Number.POSITIVE_INFINITY);
    expect(buildBuffTextRow("buff_100", "Buff", value, 10_000)).toBeNull();

    const forced = buildBuffTextRow(
      "buff_100",
      "Buff",
      value,
      10_000,
      false,
      true,
    );
    expect(forced).toMatchObject({
      valueText: "∞",
      progressPercent: 0,
      showProgress: false,
    });
  });

  it("shows a multi-layer permanent buff with its layer count", () => {
    const value = buff({ durationMs: 0, layer: 3 });

    const row = buildBuffTextRow("buff_100", "Buff", value, 10_000);
    expect(row).toMatchObject({
      valueText: "∞",
      metaText: "x3",
      progressPercent: 0,
      showProgress: false,
    });
  });

  it("describes finite row timing without coupling structure to the clock", () => {
    const row = buildBuffTextRow(
      "buff_100",
      "Buff",
      buff({ durationMs: 5_000, createTimeMs: 10_000 }),
      11_000,
      false,
      false,
      () => ({
        thresholdSeconds: 2,
        highlightColor: "#ff0000",
        flash: true,
      }),
    );

    expect(row?.temporal).toEqual({
      deadlineMs: 15_000,
      durationMs: 5_000,
      alert: {
        thresholdMs: 2_000,
        state: {
          highlightColor: "#ff0000",
          flash: true,
          flashIntervalMs: 600,
          applyToProgress: true,
        },
      },
    });
  });

  it("keeps placeholders visible regardless of guards", () => {
    const expired = buff();
    expect(
      buildBuffTextRow("buff_100", "Buff", expired, 2_001, true),
    ).toMatchObject({ valueText: "--", isPlaceholder: true });

    const permanentSingleLayer = buff({ durationMs: 0 });
    expect(
      buildBuffTextRow("buff_100", "Buff", permanentSingleLayer, 10_000, true),
    ).toMatchObject({ valueText: "--", isPlaceholder: true });
  });

  it("treats only a missing object as absent", () => {
    expect(isBuffActive(undefined, 1_000)).toBe(false);
  });
});

describe("custom panel buff rows", () => {
  function entry(format: InlineBuffEntry["format"]): InlineBuffEntry {
    return {
      id: "entry",
      sourceType: "buff",
      sourceId: 100,
      label: "",
      format,
    };
  }

  function row(format: InlineBuffEntry["format"], buffs: BuffUpdateState[]) {
    return getCustomPanelDisplayRow(
      entry(format),
      1_500,
      new Map(buffs.map((item) => [item.baseId, item])),
      new Map(),
      new Map(),
      () => "Buff",
    );
  }

  it("shows only the active state without timing", () => {
    expect(row("active", [buff({ layer: 3 })])).toEqual({
      key: "inline_buff_entry",
      label: "Buff",
      valueText: t("gameOverlay.buff.stateActive"),
      metaText: "x3",
      progressPercent: 0,
      showProgress: false,
    });
  });

  it("keeps a state row visible while the buff is missing or expired", () => {
    const inactive = {
      valueText: t("gameOverlay.buff.stateInactive"),
      showProgress: false,
      inactive: true,
    };
    expect(row("active", [])).toMatchObject(inactive);
    expect(row("active", [buff({ durationMs: 100 })])).toMatchObject(inactive);
  });

  it("drops a timer row while the buff is missing", () => {
    expect(row("timer", [])).toBeNull();
    expect(row("timer", [buff()])).toMatchObject({
      key: "inline_buff_entry",
      showProgress: true,
    });
  });
});

describe("custom panel counter rows", () => {
  function frozenRow(freezeDurationMs: number | null) {
    const counterEntry: InlineBuffEntry = {
      id: "counter",
      sourceType: "counter",
      sourceId: 7,
      counterSlotId: 1,
      label: "Counter",
      format: "timer",
    };
    return getCustomPanelDisplayRow(
      counterEntry,
      1_000,
      new Map(),
      new Map([
        [
          7,
          {
            ruleId: 7,
            slots: [
              {
                slotId: 1,
                currentCount: 0,
                threshold: null,
                effectiveThreshold: null,
                isCounting: false,
                resetBuffActive: false,
                freezeUntilMs: 4_000,
                freezeDurationMs,
                effectiveFreezeDurationMs: null,
              },
            ],
          },
        ],
      ]),
      new Map(),
      () => "Buff",
    );
  }

  it("counts a freeze down from its deadline even without a duration", () => {
    expect(frozenRow(null)).toMatchObject({
      showProgress: false,
      temporal: { deadlineMs: 4_000, durationMs: 0 },
    });
    expect(frozenRow(5_000)).toMatchObject({
      showProgress: true,
      temporal: { deadlineMs: 4_000, durationMs: 5_000 },
    });
  });
});
