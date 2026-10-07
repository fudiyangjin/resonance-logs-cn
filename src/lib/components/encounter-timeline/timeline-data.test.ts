import { describe, expect, it } from "vitest";
import {
  clampInstantDpsWindowSec,
  clampViewportWindow,
  collapseHoverLanePoints,
  complementSpans,
  curveMaxValue,
  dedupeMarkersByPixel,
  dpsValueAt,
  foldEncounterDamageHits,
  laneMarkerTier,
  normalizeEncounterBrushRange,
  panViewportWindow,
  resolveHoverDisplayTimeMs,
  sampleDpsCurve,
  sliceLanePointsByTime,
  spanAt,
  timeToX,
  teammateDpsSources,
  visibleSpanRects,
  xToTime,
  zoomTierFor,
  zoomViewportWindow,
  type DamageHitIndex,
  type EncounterChart,
  type EncounterTimelineEvent,
  type EntityDamageHits,
  type TeammateCurveMode,
} from "./timeline-data";

const DEFAULT_WINDOW_MS = 10_000;

function hits(
  entityUuid: string,
  timesMs: number[],
  amounts: number[],
): EntityDamageHits {
  return { entityUuid, timesMs, amounts };
}

function indexed(timesMs: number[], amounts: number[]): DamageHitIndex {
  const result = foldEncounterDamageHits({
    durationMs: 60_000,
    damageHits: [hits("player", timesMs, amounts)],
  }).perEntityHits.get("player");
  if (!result) throw new Error("expected indexed hit stream");
  return result;
}

describe("foldEncounterDamageHits", () => {
  it("indexes per-entity hit streams and skips empty ones", () => {
    const chart: EncounterChart = {
      durationMs: 1_500,
      damageHits: [
        hits("a", [100, 900], [100, 50]),
        hits("empty", [], []),
        hits("b", [0], [25]),
      ],
    };

    const result = foldEncounterDamageHits(chart);

    expect(result.durationMs).toBe(1_500);
    expect(result.perEntityHits.size).toBe(2);
    expect(result.perEntityHits.get("a")?.timesMs).toEqual([100, 900]);
    expect(result.perEntityHits.get("a")?.amounts).toEqual([100, 50]);
    expect(result.perEntityHits.get("a")?.prefixAmounts).toEqual(
      new Float64Array([0, 100, 150]),
    );
    expect(result.perEntityHits.get("b")?.timesMs).toEqual([0]);
  });

  it("normalizes a degenerate duration to 1ms", () => {
    const result = foldEncounterDamageHits({
      durationMs: 0,
      damageHits: [hits("a", [0], [1])],
    });

    expect(result.durationMs).toBe(1);
  });
  it("clips mismatched columns so prefix sums and times stay aligned", () => {
    const result = foldEncounterDamageHits({
      durationMs: 1_000,
      damageHits: [hits("a", [0, 100], [25])],
    }).perEntityHits.get("a");

    expect(result?.timesMs).toEqual([0]);
    expect(result?.amounts).toEqual([25]);
    expect(result?.prefixAmounts).toEqual(new Float64Array([0, 25]));
  });
});

describe("dpsValueAt", () => {
  it("uses the 500ms startup grace for a hit at segment offset zero", () => {
    const source = indexed([0], [10_000]);

    expect(dpsValueAt(source, "instant", 0, DEFAULT_WINDOW_MS)).toBe(20_000);
    expect(dpsValueAt(source, "average", 0, DEFAULT_WINDOW_MS)).toBe(20_000);
    expect(dpsValueAt(source, "instant", 500, DEFAULT_WINDOW_MS)).toBe(20_000);
  });

  it("returns zero before the first hit instead of leaking future damage", () => {
    const source = indexed([5_000], [10_000]);

    expect(dpsValueAt(source, "instant", 4_999, DEFAULT_WINDOW_MS)).toBe(0);
    expect(dpsValueAt(source, "average", 4_999, DEFAULT_WINDOW_MS)).toBe(0);
    expect(dpsValueAt(source, "instant", 5_000, DEFAULT_WINDOW_MS)).toBe(2_000);
  });

  it("uses a left-open 10s rolling window and merges same-ms hits", () => {
    const source = indexed([5_000, 15_000, 15_000], [1_000, 200, 300]);

    expect(dpsValueAt(source, "instant", 14_999, DEFAULT_WINDOW_MS)).toBe(100);
    // At exactly 15s the 5s hit has expired; both new hits count.
    expect(dpsValueAt(source, "instant", 15_000, DEFAULT_WINDOW_MS)).toBe(50);
    expect(dpsValueAt(source, "average", 15_000, DEFAULT_WINDOW_MS)).toBe(100);
  });

  it("uses the configured rolling window", () => {
    const source = indexed([5_000, 10_000], [1_000, 500]);

    expect(dpsValueAt(source, "instant", 9_999, 5_000)).toBe(200);
    expect(dpsValueAt(source, "instant", 10_000, 5_000)).toBe(100);
  });

  it("divides cumulative damage by the complete elapsed fight time", () => {
    const source = indexed([1_000, 2_000, 4_000], [100, 100, 200]);

    expect(dpsValueAt(source, "average", 1_000, DEFAULT_WINDOW_MS)).toBe(100);
    expect(dpsValueAt(source, "average", 2_000, DEFAULT_WINDOW_MS)).toBe(100);
    expect(dpsValueAt(source, "average", 4_000, DEFAULT_WINDOW_MS)).toBe(100);
    expect(dpsValueAt(source, "average", 8_000, DEFAULT_WINDOW_MS)).toBe(50);
  });
});

describe("clampInstantDpsWindowSec", () => {
  it("clamps and rounds the setting to a whole second", () => {
    expect(clampInstantDpsWindowSec(0)).toBe(1);
    expect(clampInstantDpsWindowSec(4.6)).toBe(5);
    expect(clampInstantDpsWindowSec(31)).toBe(30);
    expect(clampInstantDpsWindowSec(Number.NaN)).toBe(10);
  });
});

describe("sampleDpsCurve", () => {
  it("samples both viewport boundaries with exact values", () => {
    const source = indexed([1_000], [5_000]);
    const curve = sampleDpsCurve(
      source,
      "average",
      1_000,
      10_000,
      2,
      DEFAULT_WINDOW_MS,
    );

    expect(curve).toEqual([
      [1_000, 5_000],
      [5_500, 5_000_000 / 5_500],
      [10_000, 500],
    ]);
  });

  it("returns no points without a hit source", () => {
    expect(
      sampleDpsCurve(null, "instant", 0, 10_000, 100, DEFAULT_WINDOW_MS),
    ).toEqual([]);
  });

  it("keeps instant intervals within the rolling window on narrow plots", () => {
    const source = indexed([15_000], [1_000]);
    const curve = sampleDpsCurve(
      source,
      "instant",
      0,
      30_000,
      1,
      DEFAULT_WINDOW_MS,
    );

    expect(curve).toHaveLength(4);
    expect(curve.some(([, value]) => value > 0)).toBe(true);
  });

  it("bounds a 100k-hit encounter by the requested pixel intervals", () => {
    const count = 100_000;
    const timesMs = Array.from({ length: count }, (_, index) => index * 10);
    const source = indexed(timesMs, new Array<number>(count).fill(1));

    const curve = sampleDpsCurve(
      source,
      "instant",
      0,
      1_000_000,
      800,
      DEFAULT_WINDOW_MS,
    );

    expect(curve).toHaveLength(801);
    expect(curve[0]?.[0]).toBe(0);
    expect(curve.at(-1)?.[0]).toBe(1_000_000);
  });
});

describe("teammateDpsSources", () => {
  it("resolves the selected mode only for indexed entities with damage", () => {
    const perEntityHits = foldEncounterDamageHits({
      durationMs: 3_000,
      damageHits: [
        hits("a", [1_000, 3_000], [100, 200]),
        hits("b", [1_000, 2_000], [50, 50]),
        hits("empty", [1_000], [0]),
      ],
    }).perEntityHits;
    const modes = new Map<string, TeammateCurveMode>([
      ["b", "instant"],
      ["missing", "average"],
      ["empty", "instant"],
      ["a", "average"],
    ]);

    const result = teammateDpsSources(modes, perEntityHits);

    expect(result.map((row) => row.entityUuid)).toEqual(["b", "a"]);
    expect(result.map((row) => row.mode)).toEqual(["instant", "average"]);
    expect(result[0]?.hits.entityUuid).toBe("b");
    expect(result[1]?.hits.entityUuid).toBe("a");
  });
});

describe("normalizeEncounterBrushRange", () => {
  it("returns a clamped half-open integer range", () => {
    expect(normalizeEncounterBrushRange([120.2, 980.1], 1_000)).toEqual([
      120, 981,
    ]);
    expect(normalizeEncounterBrushRange([900.8, 100.2], 1_000)).toEqual([
      100, 901,
    ]);
    expect(normalizeEncounterBrushRange([-20, 2_000], 1_000)).toEqual([
      0, 1_000,
    ]);
  });

  it("keeps a zero-width brush queryable and rejects non-finite input", () => {
    expect(normalizeEncounterBrushRange([500, 500], 1_000)).toEqual([500, 501]);
    expect(normalizeEncounterBrushRange([Number.NaN, 500], 1_000)).toBeNull();
  });
});

describe("clampViewportWindow", () => {
  it("clamps a window fully inside the encounter unchanged", () => {
    expect(clampViewportWindow(1_000, 2_000, 10_000)).toEqual({
      startMs: 1_000,
      endMs: 2_000,
    });
  });

  it("pins the start so the window never exceeds the encounter bounds", () => {
    expect(clampViewportWindow(-500, 500, 10_000)).toEqual({
      startMs: 0,
      endMs: 1_000,
    });
    expect(clampViewportWindow(9_500, 10_500, 10_000)).toEqual({
      startMs: 9_000,
      endMs: 10_000,
    });
  });

  it("enforces a minimum span instead of collapsing to zero", () => {
    expect(clampViewportWindow(500, 500, 10_000, 200)).toEqual({
      startMs: 500,
      endMs: 700,
    });
  });

  it("caps the span to the full duration when it is shorter than minSpanMs", () => {
    expect(clampViewportWindow(-100, 5_000, 3_000, 1_000)).toEqual({
      startMs: 0,
      endMs: 3_000,
    });
  });
});

describe("zoomViewportWindow", () => {
  it("keeps the anchor's relative position stable while zooming in", () => {
    // Window [0, 10_000), anchor at 8_000 (80% across); zooming in 2x should
    // halve the span while keeping the anchor at the same 80% position.
    const next = zoomViewportWindow(
      { startMs: 0, endMs: 10_000 },
      2,
      8_000,
      10_000,
    );

    expect(next.endMs - next.startMs).toBe(5_000);
    const ratio = (8_000 - next.startMs) / (next.endMs - next.startMs);
    expect(ratio).toBeCloseTo(0.8, 5);
  });

  it("zooming out never exceeds the full encounter duration", () => {
    const next = zoomViewportWindow(
      { startMs: 4_000, endMs: 6_000 },
      0.1,
      5_000,
      10_000,
    );

    expect(next).toEqual({ startMs: 0, endMs: 10_000 });
  });
});

describe("panViewportWindow", () => {
  it("shifts both edges by the same delta", () => {
    expect(
      panViewportWindow({ startMs: 2_000, endMs: 4_000 }, 500, 10_000),
    ).toEqual({ startMs: 2_500, endMs: 4_500 });
  });

  it("stops at the encounter bounds without changing the span", () => {
    expect(
      panViewportWindow({ startMs: 8_000, endMs: 9_500 }, 5_000, 10_000),
    ).toEqual({ startMs: 8_500, endMs: 10_000 });
    expect(
      panViewportWindow({ startMs: 500, endMs: 2_000 }, -5_000, 10_000),
    ).toEqual({ startMs: 0, endMs: 1_500 });
  });
});

describe("timeToX / xToTime", () => {
  it("round-trip a value inside the window", () => {
    const window = { startMs: 1_000, endMs: 5_000 };
    const x = timeToX(3_000, window, 400);
    expect(x).toBe(200);
    expect(xToTime(x, window, 400)).toBe(3_000);
  });
});

describe("curveMaxValue", () => {
  it("finds the maximum across the pixel-bounded viewport samples", () => {
    const curve: [number, number][] = [
      [0, 10],
      [1_000, 100],
      [2_000, 5],
    ];
    expect(curveMaxValue(curve)).toBe(100);
  });

  it("returns 0 for an empty or missing curve", () => {
    expect(curveMaxValue(null)).toBe(0);
    expect(curveMaxValue([])).toBe(0);
  });
});

describe("laneMarkerTier", () => {
  it("shows a label pill when there is room for one", () => {
    expect(laneMarkerTier(60, 50, 12)).toBe("label");
    expect(laneMarkerTier(50, 50, 12)).toBe("label");
  });

  it("degrades to a tick, then a dot, as room shrinks", () => {
    expect(laneMarkerTier(30, 50, 12)).toBe("tick");
    expect(laneMarkerTier(12, 50, 12)).toBe("tick");
    expect(laneMarkerTier(5, 50, 12)).toBe("dot");
  });

  it("shows a label for an isolated marker with no neighbour", () => {
    expect(laneMarkerTier(Number.POSITIVE_INFINITY, 50, 12)).toBe("label");
  });
});

describe("sliceLanePointsByTime", () => {
  const points = [0, 100, 200, 300, 400, 500].map((timeMs) => ({ timeMs }));

  it("returns the visible run padded by one point on each side", () => {
    // Padding keeps a marker straddling the viewport edge from vanishing
    // entirely instead of showing its visible half.
    expect(sliceLanePointsByTime(points, 200, 300)).toEqual([
      { timeMs: 100 },
      { timeMs: 200 },
      { timeMs: 300 },
      { timeMs: 400 },
    ]);
  });

  it("clamps the padding at both ends of the lane", () => {
    expect(sliceLanePointsByTime(points, 0, 100)).toEqual([
      { timeMs: 0 },
      { timeMs: 100 },
      { timeMs: 200 },
    ]);
    expect(sliceLanePointsByTime(points, 500, 600)).toEqual([
      { timeMs: 400 },
      { timeMs: 500 },
    ]);
  });

  it("returns everything when the window covers the whole lane", () => {
    expect(sliceLanePointsByTime(points, -50, 1_000)).toEqual(points);
  });

  it("returns the neighbouring points for a window that contains none", () => {
    expect(sliceLanePointsByTime(points, 210, 240)).toEqual([
      { timeMs: 200 },
      { timeMs: 300 },
    ]);
  });

  it("handles an empty lane", () => {
    expect(sliceLanePointsByTime([], 0, 100)).toEqual([]);
  });
});

describe("dedupeMarkersByPixel", () => {
  it("keeps every marker when they are more than a pixel apart", () => {
    const points = [0, 250, 500, 750, 1_000].map((timeMs) => ({ timeMs }));
    expect(dedupeMarkersByPixel(points, 0, 1_000, 100)).toEqual(points);
  });

  it("keeps only the last marker of a pixel column, in time order", () => {
    // 1000ms across 10px: all four land inside the same rounded pixel, so the
    // three underneath are fully covered by the one drawn last.
    const points = [500, 520, 540, 900].map((timeMs) => ({ timeMs }));
    expect(dedupeMarkersByPixel(points, 0, 1_000, 10)).toEqual([
      { timeMs: 540 },
      { timeMs: 900 },
    ]);
  });

  it("passes short or unmeasured lanes through untouched", () => {
    const single = [{ timeMs: 10 }];
    expect(dedupeMarkersByPixel(single, 0, 100, 500)).toEqual(single);
    const points = [{ timeMs: 10 }, { timeMs: 20 }];
    expect(dedupeMarkersByPixel(points, 0, 100, 0)).toEqual(points);
  });
});

describe("zoomTierFor", () => {
  it("stays at tier 0 below the first threshold", () => {
    expect(zoomTierFor(100_000, 100_000)).toBe(0);
    expect(zoomTierFor(100_000, 30_000)).toBe(0);
  });

  it("steps to tier 1 once zoomed in 4x or more", () => {
    expect(zoomTierFor(100_000, 25_000)).toBe(1);
    expect(zoomTierFor(100_000, 11_000)).toBe(1);
  });

  it("steps to tier 2 once zoomed in 10x or more", () => {
    expect(zoomTierFor(100_000, 10_000)).toBe(2);
    expect(zoomTierFor(100_000, 500)).toBe(2);
  });

  it("treats a zero/degenerate span as unzoomed", () => {
    expect(zoomTierFor(100_000, 0)).toBe(0);
  });
});

function hoverPoint(
  sequence: number,
  timeMs: number,
  extras: Partial<
    Pick<
      EncounterTimelineEvent,
      "kind" | "skillId" | "casterUuid" | "remodelLevel"
    >
  > = {},
) {
  return {
    timeMs,
    event: {
      sequence,
      tsOffsetMs: timeMs,
      casterUuid: extras.casterUuid ?? "1",
      skillId: extras.skillId ?? 3946,
      kind: extras.kind ?? ("fantasy" as const),
      remodelLevel: extras.remodelLevel ?? null,
    },
  };
}

describe("collapseHoverLanePoints", () => {
  it("keeps the first of identical same-millisecond casts", () => {
    const first = hoverPoint(10, 423_074);
    const second = hoverPoint(11, 423_074);
    expect(collapseHoverLanePoints([first, second])).toEqual([first]);
  });

  it("keeps casts 1ms apart", () => {
    const earlier = hoverPoint(10, 100);
    const later = hoverPoint(11, 101);
    expect(collapseHoverLanePoints([earlier, later])).toEqual([earlier, later]);
  });

  it("keeps the same skill under a different kind", () => {
    const fantasy = hoverPoint(10, 100, { kind: "fantasy" });
    const keySkill = hoverPoint(11, 100, { kind: "key_skill" });
    expect(collapseHoverLanePoints([fantasy, keySkill])).toEqual([
      fantasy,
      keySkill,
    ]);
  });

  it("keeps different skill ids at the same millisecond", () => {
    const goblinMarch = hoverPoint(10, 100, { skillId: 3946 });
    const other = hoverPoint(11, 100, { skillId: 3901 });
    expect(collapseHoverLanePoints([goblinMarch, other])).toEqual([
      goblinMarch,
      other,
    ]);
  });

  it("passes a single point through", () => {
    const only = hoverPoint(1, 50);
    expect(collapseHoverLanePoints([only])).toEqual([only]);
  });
});

describe("visibleSpanRects", () => {
  it("converts a fully-visible span to left/width percentages", () => {
    expect(
      visibleSpanRects([{ startMs: 1_000, endMs: 3_000 }], 0, 10_000),
    ).toEqual([{ startMs: 1_000, endMs: 3_000, leftPct: 10, widthPct: 20 }]);
  });

  it("clamps a span straddling the window edges without changing its reported times", () => {
    const [rect] = visibleSpanRects(
      [{ startMs: -1_000, endMs: 2_000 }],
      0,
      10_000,
    );
    expect(rect).toEqual({
      startMs: -1_000,
      endMs: 2_000,
      leftPct: 0,
      widthPct: 20,
    });
  });

  it("drops spans entirely outside the window", () => {
    expect(
      visibleSpanRects(
        [
          { startMs: -2_000, endMs: -1_000 },
          { startMs: 11_000, endMs: 12_000 },
        ],
        0,
        10_000,
      ),
    ).toEqual([]);
  });

  it("keeps a span that exactly touches the window boundary excluded (half-open)", () => {
    expect(
      visibleSpanRects([{ startMs: -1_000, endMs: 0 }], 0, 10_000),
    ).toEqual([]);
  });

  it("returns an empty array for a degenerate window", () => {
    expect(visibleSpanRects([{ startMs: 0, endMs: 100 }], 500, 500)).toEqual(
      [],
    );
  });

  it("merges neighbours closer than one pixel when given a plot width", () => {
    // 10s over 100px: 1px = 100ms. A 50ms gap merges, a 200ms gap does not.
    const spans = [
      { startMs: 1_000, endMs: 2_000 },
      { startMs: 2_050, endMs: 3_000 },
      { startMs: 3_200, endMs: 4_000 },
    ];
    expect(visibleSpanRects(spans, 0, 10_000, 100)).toEqual([
      { startMs: 1_000, endMs: 3_000, leftPct: 10, widthPct: 20 },
      { startMs: 3_200, endMs: 4_000, leftPct: 32, widthPct: 8 },
    ]);
  });

  it("never merges without a plot width, even touching spans", () => {
    const spans = [
      { startMs: 1_000, endMs: 2_000 },
      { startMs: 2_000, endMs: 3_000 },
    ];
    expect(visibleSpanRects(spans, 0, 10_000)).toHaveLength(2);
  });

  it("clamps a merged rect to the window", () => {
    const spans = [
      { startMs: 8_000, endMs: 9_000 },
      { startMs: 9_010, endMs: 12_000 },
    ];
    expect(visibleSpanRects(spans, 0, 10_000, 100)).toEqual([
      { startMs: 8_000, endMs: 12_000, leftPct: 80, widthPct: 20 },
    ]);
  });
});

describe("spanAt", () => {
  const spans = [
    { startMs: 1_000, endMs: 2_000 },
    { startMs: 3_000, endMs: 4_000 },
    { startMs: 6_000, endMs: 9_000 },
  ];

  it("finds the span containing the time (half-open)", () => {
    expect(spanAt(spans, 1_000)).toBe(spans[0]);
    expect(spanAt(spans, 3_999)).toBe(spans[1]);
    expect(spanAt(spans, 8_500)).toBe(spans[2]);
  });

  it("returns null in gaps, at an end edge and outside", () => {
    expect(spanAt(spans, 2_000)).toBeNull();
    expect(spanAt(spans, 5_000)).toBeNull();
    expect(spanAt(spans, 500)).toBeNull();
    expect(spanAt(spans, 9_000)).toBeNull();
  });

  it("returns null for no spans", () => {
    expect(spanAt([], 1_000)).toBeNull();
  });
});

describe("complementSpans", () => {
  it("returns leading, inner and trailing gaps", () => {
    expect(
      complementSpans(
        [
          { startMs: 1_000, endMs: 2_000 },
          { startMs: 5_000, endMs: 7_000 },
        ],
        10_000,
      ),
    ).toEqual([
      { startMs: 0, endMs: 1_000 },
      { startMs: 2_000, endMs: 5_000 },
      { startMs: 7_000, endMs: 10_000 },
    ]);
  });

  it("returns no gaps when the spans cover the whole duration", () => {
    expect(complementSpans([{ startMs: 0, endMs: 10_000 }], 10_000)).toEqual(
      [],
    );
  });

  it("treats an empty span list as unknown, not as one big gap", () => {
    expect(complementSpans([], 10_000)).toEqual([]);
  });

  it("clamps spans that run past the duration", () => {
    expect(
      complementSpans(
        [
          { startMs: 2_000, endMs: 12_000 },
          { startMs: 13_000, endMs: 14_000 },
        ],
        10_000,
      ),
    ).toEqual([{ startMs: 0, endMs: 2_000 }]);
  });
});

describe("resolveHoverDisplayTimeMs", () => {
  it("uses the nearest event time when one is present", () => {
    expect(resolveHoverDisplayTimeMs(12_345, 10_000)).toBe(10_000);
  });

  it("keeps the pointer time when no event is hit", () => {
    expect(resolveHoverDisplayTimeMs(12_345, undefined)).toBe(12_345);
  });
});
