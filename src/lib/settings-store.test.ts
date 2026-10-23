import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEATH_REPLAY_COLUMN_ORDER,
  DEFAULT_HISTORY_RETENTION_LIMIT,
  MAX_HISTORY_RETENTION_LIMIT,
  MIN_HISTORY_RETENTION_LIMIT,
  createDefaultBuffAlertRule,
  createDefaultCustomPanelStyle,
  createDefaultTeammateCdSlotLayout,
  ensureBuffAlerts,
  ensureTeammateCdPanelStyle,
  ensureTeammatePanelStyle,
  normalizeDeathReplayColumnOrder,
  normalizeHistoryRetentionLimit,
  parseBuffAlertThresholdInput,
  type BuffAlertMap,
} from "./settings-store";

describe("parseBuffAlertThresholdInput", () => {
  it("rounds typed seconds to 0.1 within the supported range", () => {
    expect(parseBuffAlertThresholdInput("2.5")).toBe(2.5);
    expect(parseBuffAlertThresholdInput("2.55")).toBe(2.6);
    expect(parseBuffAlertThresholdInput(" 3 ")).toBe(3);
    expect(parseBuffAlertThresholdInput("0.3")).toBe(0.3);
    expect(parseBuffAlertThresholdInput("0")).toBe(0.1);
    expect(parseBuffAlertThresholdInput("0.04")).toBe(0.1);
    expect(parseBuffAlertThresholdInput("61")).toBe(60);
  });

  it("rejects blank and non-numeric text", () => {
    for (const text of ["", "   ", "abc", "2,5", "2.5s"]) {
      expect(parseBuffAlertThresholdInput(text)).toBeUndefined();
    }
  });
});

describe("ensureBuffAlerts", () => {
  function thresholdOf(thresholdSeconds: unknown): number | undefined {
    const alerts = {
      "1": { ...createDefaultBuffAlertRule(), thresholdSeconds },
    } as unknown as BuffAlertMap;
    return ensureBuffAlerts(alerts)["1"]?.thresholdSeconds;
  }

  it("keeps 0.1 s precision and clamps to the supported range", () => {
    expect(thresholdOf(2.5)).toBe(2.5);
    expect(thresholdOf(2.55)).toBe(2.6);
    expect(thresholdOf(0)).toBe(0.1);
    expect(thresholdOf(100)).toBe(60);
  });

  it("falls back to the default for missing or invalid values", () => {
    expect(thresholdOf(Number.NaN)).toBe(5);
    expect(thresholdOf(undefined)).toBe(5);
    expect(thresholdOf("abc")).toBe(5);
  });
});

describe("normalizeHistoryRetentionLimit", () => {
  it("accepts the configured inclusive boundaries", () => {
    expect(normalizeHistoryRetentionLimit(MIN_HISTORY_RETENTION_LIMIT)).toBe(
      MIN_HISTORY_RETENTION_LIMIT,
    );
    expect(normalizeHistoryRetentionLimit(MAX_HISTORY_RETENTION_LIMIT)).toBe(
      MAX_HISTORY_RETENTION_LIMIT,
    );
  });

  it("falls back to the default for invalid values", () => {
    for (const value of [0, 200.5, 2001, "200", null, undefined]) {
      expect(normalizeHistoryRetentionLimit(value)).toBe(
        DEFAULT_HISTORY_RETENTION_LIMIT,
      );
    }
  });
});

describe("normalizeDeathReplayColumnOrder", () => {
  it("appends missing default keys at the end", () => {
    expect(
      normalizeDeathReplayColumnOrder(["time", "skill", "source", "damage"]),
    ).toEqual([...DEFAULT_DEATH_REPLAY_COLUMN_ORDER]);
  });

  it("drops unknown keys and keeps the remaining order", () => {
    expect(
      normalizeDeathReplayColumnOrder([
        "damage",
        "unknown",
        "time",
        "skill",
        "source",
      ]),
    ).toEqual([
      "damage",
      "time",
      "skill",
      "source",
      "share",
      "property",
      "damageMode",
    ]);
  });

  it("uses the default order when the saved list is empty", () => {
    expect(normalizeDeathReplayColumnOrder([])).toEqual([
      ...DEFAULT_DEATH_REPLAY_COLUMN_ORDER,
    ]);
    expect(normalizeDeathReplayColumnOrder(undefined)).toEqual([
      ...DEFAULT_DEATH_REPLAY_COLUMN_ORDER,
    ]);
  });
});

describe("ensureTeammatePanelStyle", () => {
  it("fills dead-teammate defaults when the fields are missing", () => {
    const style = ensureTeammatePanelStyle({ nameColor: "#111111" });
    expect(style.deadNameColor).toBe("#ef4444");
    expect(style.deadRowPlacement).toBe("last");
    expect(style.nameColor).toBe("#111111");
  });

  it("falls back when the placement is not one of the allowed values", () => {
    const style = ensureTeammatePanelStyle({
      deadNameColor: "#123456",
      deadRowPlacement: "beside",
    } as unknown as Parameters<typeof ensureTeammatePanelStyle>[0]);
    expect(style.deadNameColor).toBe("#123456");
    expect(style.deadRowPlacement).toBe("last");
  });

  it("fills dead-teammate defaults for a plain panel style", () => {
    const style = ensureTeammatePanelStyle(createDefaultCustomPanelStyle());
    expect(style.deadNameColor).toBe("#ef4444");
    expect(style.deadRowPlacement).toBe("last");
    expect(style.preciseTimer).toBe(false);
  });

  it("keeps an enabled precise timer and rejects non-boolean values", () => {
    expect(ensureTeammatePanelStyle({ preciseTimer: true }).preciseTimer).toBe(
      true,
    );
    expect(
      ensureTeammatePanelStyle({
        preciseTimer: "yes",
      } as unknown as Parameters<typeof ensureTeammatePanelStyle>[0])
        .preciseTimer,
    ).toBe(false);
  });
});

describe("ensureTeammateCdPanelStyle", () => {
  it("fills the slot layout and display mode for older settings", () => {
    const style = ensureTeammateCdPanelStyle({ iconSize: 40 });
    expect(style.iconSize).toBe(40);
    expect(style.displayMode).toBe("slots");
    expect(style.slots).toEqual(createDefaultTeammateCdSlotLayout());
  });

  it("keeps partial grids and clamps or replaces invalid values", () => {
    const style = ensureTeammateCdPanelStyle({
      displayMode: "grid",
      slots: {
        previewKind: "twenty",
        iconSize: 500,
        five: { rowPitch: 12.4, side: "up" },
        twenty: { rowPitch: 2, rightSide: "left" },
      },
    } as unknown as Parameters<typeof ensureTeammateCdPanelStyle>[0]);
    const defaults = createDefaultTeammateCdSlotLayout();
    expect(style.displayMode).toBe("slots");
    expect(style.slots.previewKind).toBe("twenty");
    expect(style.slots.iconSize).toBe(72);
    expect(style.slots.five).toEqual({ ...defaults.five, rowPitch: 12 });
    expect(style.slots.twenty).toEqual({
      ...defaults.twenty,
      rowPitch: 10,
      rightSide: "left",
    });
  });
});
