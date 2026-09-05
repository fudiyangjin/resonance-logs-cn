import { describe, expect, it } from "vitest";
import {
  createDefaultDpsColumnLabels,
  normalizeDpsColumnLabels,
  resolveColumnLabel,
} from "./column-labels";

describe("DPS column labels", () => {
  it("creates independent complete maps for all four tables", () => {
    const labels = createDefaultDpsColumnLabels();

    labels.live.players.columns.dps = "Live DPS";

    expect(labels.live.players.columns.dps).toBe("Live DPS");
    expect(labels.live.skills.columns.dps).toBe("");
    expect(labels.history.players.columns.dps).toBe("");
    expect(labels.history.skills.columns.dps).toBe("");
    expect(labels.live.players.first).toBe("");
  });

  it("normalizes missing keys and drops unknown keys", () => {
    const normalized = normalizeDpsColumnLabels({
      live: {
        players: {
          first: "队员",
          columns: { dps: "每秒", unknown: "ignored", totalDmg: 123 },
        },
      },
    });

    expect(normalized.live.players.first).toBe("队员");
    expect(normalized.live.players.columns.dps).toBe("每秒");
    expect(normalized.live.players.columns.totalDmg).toBe("");
    expect("unknown" in normalized.live.players.columns).toBe(false);
    expect(normalized.history.skills.columns.hits).toBe("");
    expect(normalized.history.skills.columns.avgDmg).toBe("");
    expect(normalized.history.skills.columns.maxDmg).toBe("");
    expect(normalized.history.skills.columns.minDmg).toBe("");
  });

  it("falls back for empty overrides and trims custom labels", () => {
    expect(resolveColumnLabel("", "秒伤")).toBe("秒伤");
    expect(resolveColumnLabel("   ", "秒伤")).toBe("秒伤");
    expect(resolveColumnLabel("  每秒伤害  ", "秒伤")).toBe("每秒伤害");
  });
});
