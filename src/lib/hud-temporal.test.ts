import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearHudProjectionDeadline,
  hudProjectionRevision,
  hudTemporalAlert,
  hudTemporalProgressPercent,
  hudTemporalRemainingMs,
  initOverlayClock,
  overlayNow,
  remainingUntilMs,
  setHudProjectionDeadline,
  setOverlayClockActive,
} from "./hud-temporal.svelte";

const source = "test:countdown";
let page: EventTarget & { visibilityState: string };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", page);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      setTimeout: (callback: () => void, delay: number) =>
        setTimeout(callback, delay),
      clearTimeout: (handle: number) => clearTimeout(handle),
    }),
  );
});

afterEach(() => {
  setOverlayClockActive(false);
  clearHudProjectionDeadline(source);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("HUD window clock", () => {
  it("ticks without a registered timer, combat segment, or incoming packets", () => {
    setOverlayClockActive(true);
    const temporal = { deadlineMs: 120_000, durationMs: 20_000 };
    expect(hudTemporalRemainingMs(temporal, overlayNow())).toBe(20_000);
    vi.advanceTimersByTime(5_000);
    expect(hudTemporalRemainingMs(temporal, overlayNow())).toBe(15_000);
    expect(hudTemporalProgressPercent(temporal, overlayNow())).toBe(75);
    expect(remainingUntilMs(120_000, overlayNow())).toBe(15_000);
  });

  it("does not accumulate extra lifetime when a buff repeatedly refreshes", () => {
    setOverlayClockActive(true);
    for (let i = 0; i < 3; i++) {
      const refreshed = { deadlineMs: Date.now() + 20_000, durationMs: 20_000 };
      expect(hudTemporalRemainingMs(refreshed, overlayNow())).toBe(20_000);
      vi.advanceTimersByTime(10_000);
      expect(hudTemporalRemainingMs(refreshed, overlayNow())).toBe(10_000);
      expect(hudTemporalProgressPercent(refreshed, overlayNow())).toBe(50);
    }
  });

  it("keeps one periodic timer across repeated starts and focus changes", () => {
    const cleanup = initOverlayClock();
    expect(initOverlayClock()).toBe(cleanup);
    setOverlayClockActive(true);
    for (const name of ["focus", "pageshow", "blur"]) {
      window.dispatchEvent(new Event(name));
      expect(vi.getTimerCount()).toBe(1);
    }
    vi.advanceTimersByTime(100);
    expect(overlayNow()).toBe(100_100);
    expect(vi.getTimerCount()).toBe(1);
    cleanup();
    cleanup();
    window.dispatchEvent(new Event("focus"));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resynchronizes immediately after a window gate pause and ignores stale cleanup", () => {
    const oldCleanup = initOverlayClock();
    setOverlayClockActive(false);
    vi.advanceTimersByTime(30_000);
    expect(overlayNow()).toBe(100_000);
    expect(vi.getTimerCount()).toBe(0);
    setOverlayClockActive(true);
    expect(overlayNow()).toBe(130_000);
    expect(remainingUntilMs(120_000, overlayNow())).toBe(0);
    oldCleanup();
    vi.advanceTimersByTime(100);
    expect(overlayNow()).toBe(130_100);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("pauses while the document is hidden and expires pending rows on return", () => {
    setOverlayClockActive(true);
    const revision = hudProjectionRevision(source);
    setHudProjectionDeadline(source, 102_000);
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(30_000);
    expect(hudProjectionRevision(source)).toBe(revision);
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(overlayNow()).toBe(130_000);
    expect(hudProjectionRevision(source)).toBe(revision + 1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("changes structural revisions only at deadlines, never on display ticks", () => {
    const revision = hudProjectionRevision(source);
    setHudProjectionDeadline(source, 101_000);
    expect(vi.getTimerCount()).toBe(0);
    setOverlayClockActive(true);
    setHudProjectionDeadline(source, 101_000);
    expect(vi.getTimerCount()).toBe(2);
    vi.advanceTimersByTime(900);
    expect(hudProjectionRevision(source)).toBe(revision);
    vi.advanceTimersByTime(100);
    expect(hudProjectionRevision(source)).toBe(revision + 1);
    vi.advanceTimersByTime(1_000);
    expect(hudProjectionRevision(source)).toBe(revision + 1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("uses actual time after a delayed callback instead of adding tick intervals", () => {
    setOverlayClockActive(true);
    vi.setSystemTime(160_000);
    vi.advanceTimersByTime(100);
    expect(overlayNow()).toBe(160_100);
  });
});

describe("HUD countdown values", () => {
  it("clamps expired progress and preserves alert thresholds", () => {
    const state = {
      highlightColor: "red",
      flash: true,
      flashIntervalMs: 600,
      applyToProgress: true,
    };
    const temporal = {
      deadlineMs: 10_000,
      durationMs: 5_000,
      alert: { thresholdMs: 2_000, state },
    };
    expect(hudTemporalProgressPercent(temporal, 0)).toBe(100);
    expect(hudTemporalProgressPercent(temporal, 11_000)).toBe(0);
    expect(hudTemporalRemainingMs(temporal, 11_000)).toBe(0);
    expect(hudTemporalAlert(temporal, 7_999)).toBeUndefined();
    expect(hudTemporalAlert(temporal, 8_000)).toBe(state);
    expect(
      hudTemporalProgressPercent({ deadlineMs: 10_000, durationMs: 0 }, 0),
    ).toBe(0);
  });
});
