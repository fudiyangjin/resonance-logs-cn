import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  hexToOklch,
  oklabDistance,
} from "./timeline-color-math";
import {
  MIN_PLAYER_COLOR_DISTANCE,
  MIN_READABLE_CONTRAST,
  assignTimelineColors,
  laneColor,
  readableChartColor,
  withTimelineColors,
} from "./timeline-colors";
import { TIMELINE_PALETTE } from "./timeline-palette";
import type { TimelinePlayerMeta } from "./timeline-types";

const IAIDO = "#9b6cf0";
const SMITE = "#b9f36e";
const MOONSTRIKE = "#4a2f80";

function player(
  entityUuid: string,
  classSpecName: string,
  isLocalPlayer = false,
): TimelinePlayerMeta {
  return {
    entityUuid,
    name: `name-${entityUuid}`,
    className: "",
    classSpecName,
    isLocalPlayer,
  };
}

/** Test stand-in for the user's class/spec colors. */
const SPEC_COLORS: Record<string, string> = {
  Iaido: IAIDO,
  Smite: SMITE,
  Moonstrike: MOONSTRIKE,
};
const specColor = (p: TimelinePlayerMeta) =>
  SPEC_COLORS[p.classSpecName] ?? "not-a-color";

describe("readableChartColor", () => {
  it("keeps colors that are already readable on the chart", () => {
    expect(readableChartColor(IAIDO)).toBe(IAIDO);
  });

  it("lifts a dark color to readable contrast without changing its hue", () => {
    expect(contrastRatio(MOONSTRIKE, TIMELINE_PALETTE.bg)).toBeLessThan(
      MIN_READABLE_CONTRAST,
    );
    const lifted = readableChartColor(MOONSTRIKE);
    expect(contrastRatio(lifted, TIMELINE_PALETTE.bg)).toBeGreaterThanOrEqual(
      MIN_READABLE_CONTRAST,
    );
    const before = hexToOklch(MOONSTRIKE)!;
    const after = hexToOklch(lifted)!;
    expect(after.l).toBeGreaterThan(before.l);
    expect(Math.abs(after.h - before.h)).toBeLessThan(8);
  });

  it("falls back for values that are not hex colors", () => {
    expect(readableChartColor("rgb(1, 2, 3)")).toBe(
      TIMELINE_PALETTE.fallbackPlayer,
    );
  });
});

describe("assignTimelineColors", () => {
  it("uses each player's own color when nobody collides", () => {
    const colors = assignTimelineColors(
      [player("1", "Iaido", true), player("2", "Smite")],
      specColor,
    );
    expect(colors.get("1")).toBe(IAIDO);
    expect(colors.get("2")).toBe(SMITE);
  });

  it("separates players that share a spec color", () => {
    const players = [
      player("1", "Iaido", true),
      player("2", "Iaido"),
      player("3", "Iaido"),
    ];
    const colors = [...assignTimelineColors(players, specColor).values()];
    expect(colors[0]).toBe(IAIDO);
    for (let i = 0; i < colors.length; i += 1) {
      for (let j = i + 1; j < colors.length; j += 1) {
        expect(oklabDistance(colors[i]!, colors[j]!)).toBeGreaterThanOrEqual(
          MIN_PLAYER_COLOR_DISTANCE,
        );
      }
    }
    for (const color of colors) {
      expect(contrastRatio(color, TIMELINE_PALETTE.bg)).toBeGreaterThanOrEqual(
        MIN_READABLE_CONTRAST,
      );
    }
  });

  it("lets the local player keep their color wherever they are listed", () => {
    const colors = assignTimelineColors(
      [player("2", "Iaido"), player("1", "Iaido", true)],
      specColor,
    );
    expect(colors.get("1")).toBe(IAIDO);
    expect(colors.get("2")).not.toBe(IAIDO);
  });

  it("is deterministic for the same party", () => {
    const players = [
      player("1", "Iaido", true),
      player("2", "Iaido"),
      player("3", "Smite"),
      player("4", "Smite"),
    ];
    expect([...assignTimelineColors(players, specColor)]).toEqual([
      ...assignTimelineColors(players, specColor),
    ]);
  });

  it("keeps earlier players' colors when later players leave", () => {
    const full = assignTimelineColors(
      [player("1", "Iaido", true), player("2", "Iaido"), player("3", "Iaido")],
      specColor,
    );
    const partial = assignTimelineColors(
      [player("1", "Iaido", true), player("2", "Iaido")],
      specColor,
    );
    expect(partial.get("1")).toBe(full.get("1"));
    expect(partial.get("2")).toBe(full.get("2"));
  });
});

describe("withTimelineColors", () => {
  it("attaches colors and keeps input order", () => {
    const players = [player("2", "Smite"), player("1", "Iaido", true)];
    const colored = withTimelineColors(players, specColor);
    expect(colored.map((p) => p.entityUuid)).toEqual(["2", "1"]);
    expect(colored[1]!.color).toBe(IAIDO);
  });
});

describe("laneColor", () => {
  it("uses the boss color for boss lanes and the player color otherwise", () => {
    expect(
      laneColor({ key: "boss-1", type: "boss", name: "Boss", points: [] }),
    ).toBe(TIMELINE_PALETTE.boss);
    expect(
      laneColor({
        key: "mine",
        type: "mine",
        player: { ...player("1", "Iaido", true), color: IAIDO },
        points: [],
      }),
    ).toBe(IAIDO);
  });
});
