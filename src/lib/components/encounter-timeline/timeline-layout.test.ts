import { describe, expect, it } from "vitest";
import {
  BUFF_BLOCK_GAP,
  BUFF_GROUP_H,
  BUFF_ROW_H,
  DEFAULT_CURVE_H,
  DEFAULT_LANE_H,
  LANE_GAP,
  LANE_TOP,
  MAX_CURVE_H,
  MAX_LANE_H,
  MIN_CURVE_H,
  MIN_LANE_H,
  clampCurveH,
  clampLaneH,
  computeTimelineLayout,
  displayedLaneHToBase,
  trackAt,
  type TimelineTrackKind,
} from "./timeline-layout";

function tracks(...kinds: TimelineTrackKind[]) {
  return kinds.map((kind, index) => ({ kind, key: `${kind}-${index}` }));
}

function casts(count: number) {
  return tracks(...Array.from({ length: count }, () => "cast" as const));
}

describe("computeTimelineLayout", () => {
  it("uses the base sizes at zoom tier 0", () => {
    const layout = computeTimelineLayout(casts(3), 0);
    expect(layout.laneH).toBe(44);
    expect(layout.iconSize).toBe(24);
    expect(layout.castCount).toBe(3);
    expect(layout.lanesHeight).toBe(132);
    expect(layout.curveH).toBe(300);
  });

  it("matches the lanes-only geometry when there are no buff rows", () => {
    const layout = computeTimelineLayout(casts(2), 0);
    expect(layout.buffHeight).toBe(0);
    expect(layout.curveTop).toBe(LANE_TOP + 2 * 44 + LANE_GAP);
    expect(layout.totalHeight).toBe(layout.curveTop + layout.curveH);
    expect(layout.rows.map((row) => row.top)).toEqual([
      LANE_TOP,
      LANE_TOP + 44,
    ]);
  });

  it("scales laneH/iconSize up at zoom tier 1 and 2, keeping curveH fixed", () => {
    const tier0 = computeTimelineLayout(casts(3), 0);
    const tier1 = computeTimelineLayout(casts(3), 1);
    const tier2 = computeTimelineLayout(casts(3), 2);

    expect(tier1.laneH).toBeGreaterThan(tier0.laneH);
    expect(tier1.iconSize).toBeGreaterThan(tier0.iconSize);
    expect(tier2.laneH).toBeGreaterThan(tier1.laneH);
    expect(tier2.iconSize).toBeGreaterThan(tier1.iconSize);

    // The curve grid itself already grows via the ECharts viewport, so its
    // slot height must not also scale with the discrete zoom tier.
    expect(tier1.curveH).toBe(tier0.curveH);
    expect(tier2.curveH).toBe(tier0.curveH);
  });

  it("defaults to zoom tier 0 when omitted", () => {
    expect(computeTimelineLayout(casts(2))).toEqual(
      computeTimelineLayout(casts(2), 0),
    );
  });

  it("stacks the curve below however many lanes there are", () => {
    const two = computeTimelineLayout(casts(2), 0);
    const five = computeTimelineLayout(casts(5), 0);
    expect(five.lanesHeight - two.lanesHeight).toBe(3 * two.laneH);
    expect(five.curveTop - two.curveTop).toBe(3 * two.laneH);
    expect(five.totalHeight).toBe(five.curveTop + five.curveH);
  });

  it("stacks buff rows between the lane resize gap and the curve", () => {
    const layout = computeTimelineLayout(
      tracks("cast", "cast", "buff-group", "buff", "buff"),
      0,
    );
    const castBottom = LANE_TOP + 2 * layout.laneH;
    expect(layout.buffTop).toBe(castBottom + LANE_GAP);
    expect(layout.rows.slice(2).map((row) => [row.top, row.height])).toEqual([
      [layout.buffTop, BUFF_GROUP_H],
      [layout.buffTop + BUFF_GROUP_H, BUFF_ROW_H],
      [layout.buffTop + BUFF_GROUP_H + BUFF_ROW_H, BUFF_ROW_H],
    ]);
    expect(layout.buffHeight).toBe(BUFF_GROUP_H + 2 * BUFF_ROW_H);
    expect(layout.curveTop).toBe(
      layout.buffTop + layout.buffHeight + BUFF_BLOCK_GAP,
    );
  });

  it("keeps buff row heights fixed across zoom tiers", () => {
    const layout = computeTimelineLayout(
      tracks("cast", "buff-group", "buff"),
      2,
    );
    expect(layout.rows[0]?.height).toBe(layout.laneH);
    expect(layout.rows[1]?.height).toBe(BUFF_GROUP_H);
    expect(layout.rows[2]?.height).toBe(BUFF_ROW_H);
  });

  it("lays out buff rows without any cast lanes", () => {
    const layout = computeTimelineLayout(tracks("buff-group", "buff"), 0);
    expect(layout.castCount).toBe(0);
    expect(layout.buffTop).toBe(LANE_TOP + LANE_GAP);
    expect(layout.rows[0]?.top).toBe(layout.buffTop);
  });

  it("carries track fields through to the rows", () => {
    const layout = computeTimelineLayout(tracks("cast", "buff"), 0);
    expect(layout.rows.map((row) => row.key)).toEqual(["cast-0", "buff-1"]);
  });

  it("uses a custom base laneH/curveH at zoom tier 0", () => {
    const layout = computeTimelineLayout(casts(2), 0, {
      laneH: 60,
      curveH: 400,
    });
    expect(layout.laneH).toBe(60);
    expect(layout.curveH).toBe(400);
    expect(layout.lanesHeight).toBe(120);
    expect(layout.iconSize).toBe(Math.round((24 * 60) / 44));
    expect(layout.totalHeight).toBe(layout.curveTop + 400);
  });

  it("scales a custom base laneH with zoom, leaving custom curveH fixed", () => {
    const overrides = { laneH: 60, curveH: 400 };
    const tier1 = computeTimelineLayout(casts(2), 1, overrides);
    const tier2 = computeTimelineLayout(casts(2), 2, overrides);

    expect(tier1.laneH).toBe(Math.round(60 * 1.35));
    expect(tier2.laneH).toBe(Math.round(60 * 1.7));
    expect(tier1.curveH).toBe(400);
    expect(tier2.curveH).toBe(400);
    expect(tier1.iconSize).toBe(
      Math.round((24 * tier1.laneH) / DEFAULT_LANE_H),
    );
  });

  it("clamps custom sizes to the allowed range", () => {
    const tooSmall = computeTimelineLayout(casts(1), 0, {
      laneH: 8,
      curveH: 10,
    });
    expect(tooSmall.laneH).toBe(MIN_LANE_H);
    expect(tooSmall.curveH).toBe(MIN_CURVE_H);

    const tooLarge = computeTimelineLayout(casts(1), 0, {
      laneH: 400,
      curveH: 2000,
    });
    expect(tooLarge.laneH).toBe(MAX_LANE_H);
    expect(tooLarge.curveH).toBe(MAX_CURVE_H);
  });
});

describe("trackAt", () => {
  const { rows } = computeTimelineLayout(
    tracks("cast", "cast", "buff-group", "buff"),
    0,
  );

  it("finds the row under y, top inclusive and bottom exclusive", () => {
    expect(trackAt(rows, LANE_TOP)?.key).toBe("cast-0");
    expect(trackAt(rows, LANE_TOP + 43)?.key).toBe("cast-0");
    expect(trackAt(rows, LANE_TOP + 44)?.key).toBe("cast-1");
    expect(trackAt(rows, rows[3]!.top + BUFF_ROW_H - 1)?.key).toBe("buff-3");
  });

  it("returns null above the first row, in the resize gap and below the last", () => {
    expect(trackAt(rows, 0)).toBeNull();
    expect(trackAt(rows, LANE_TOP + 2 * 44 + 1)).toBeNull();
    expect(trackAt(rows, rows[3]!.top + BUFF_ROW_H)).toBeNull();
  });

  it("returns null for no rows", () => {
    expect(trackAt([], 20)).toBeNull();
  });
});

describe("clampLaneH / clampCurveH", () => {
  it("falls back to defaults for non-finite values", () => {
    expect(clampLaneH(Number.NaN)).toBe(DEFAULT_LANE_H);
    expect(clampCurveH(Number.POSITIVE_INFINITY)).toBe(DEFAULT_CURVE_H);
  });
});

describe("displayedLaneHToBase", () => {
  it("round-trips a zoomed displayed height back to the persisted base", () => {
    const displayed = Math.round(60 * 1.7);
    expect(displayedLaneHToBase(displayed, 2)).toBe(60);
  });
});
