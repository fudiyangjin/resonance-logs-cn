import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEATH_REPLAY_COLUMN_ORDER,
  createDefaultCustomPanelStyle,
  ensureTeammatePanelStyle,
  normalizeDeathReplayColumnOrder,
} from "./settings-store";

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
    } as Parameters<typeof ensureTeammatePanelStyle>[0]);
    expect(style.deadNameColor).toBe("#123456");
    expect(style.deadRowPlacement).toBe("last");
  });

  it("fills dead-teammate defaults for a plain panel style", () => {
    const style = ensureTeammatePanelStyle(createDefaultCustomPanelStyle());
    expect(style.deadNameColor).toBe("#ef4444");
    expect(style.deadRowPlacement).toBe("last");
  });
});
