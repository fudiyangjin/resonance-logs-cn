import { untrack } from "svelte";
import { createDeadlineScheduler } from "./hud-scheduler.svelte.js";

const CLOCK_INTERVAL_MS = 100;

export type HudAlertState = {
  highlightColor: string;
  flash: boolean;
  flashIntervalMs: number;
  applyToProgress: boolean;
};

export type HudTemporalValue = {
  deadlineMs: number;
  durationMs: number;
  alert?: {
    thresholdMs: number;
    state: HudAlertState;
  };
};

const overlayClock = $state({
  nowMs: Date.now(),
});
let overlayClockTimerId: number | null = null;
let overlayClockCleanup: (() => void) | null = null;

const projectionRevisions = $state<Record<string, number>>({});
const projectionDeadlines = new Map<string, number>();
let projectionScheduler: ReturnType<typeof createDeadlineScheduler> | null =
  null;

function getAlignedNowMs(timestamp = Date.now()) {
  return timestamp - (timestamp % CLOCK_INTERVAL_MS);
}

function refreshOverlayClockNow(timestamp = Date.now()) {
  overlayClock.nowMs = getAlignedNowMs(timestamp);
}

function clearOverlayClockTimer() {
  if (overlayClockTimerId === null) return;
  window.clearTimeout(overlayClockTimerId);
  overlayClockTimerId = null;
}

function scheduleNextOverlayClockTick() {
  clearOverlayClockTimer();
  if (!overlayClockCleanup || document.visibilityState === "hidden") return;
  const now = Date.now();
  const remainder = now % CLOCK_INTERVAL_MS;
  const delay =
    remainder === 0 ? CLOCK_INTERVAL_MS : CLOCK_INTERVAL_MS - remainder;
  overlayClockTimerId = window.setTimeout(() => {
    refreshOverlayClockNow();
    scheduleNextOverlayClockTick();
  }, delay);
}

function nearestProjectionDeadline(): number | null {
  let nearest: number | null = null;
  for (const deadlineMs of projectionDeadlines.values()) {
    if (nearest === null || deadlineMs < nearest) nearest = deadlineMs;
  }
  return nearest;
}

function rescheduleProjectionDeadline() {
  if (typeof window === "undefined") return;
  if (!overlayClockCleanup || document.visibilityState === "hidden") {
    projectionScheduler?.cancel();
    return;
  }
  projectionScheduler ??= createDeadlineScheduler(
    (firedDeadlineMs) => {
      expireProjectionDeadlines(Math.max(Date.now(), firedDeadlineMs));
      rescheduleProjectionDeadline();
    },
    {
      now: () => Date.now(),
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (handle) => window.clearTimeout(handle),
    },
  );
  projectionScheduler.schedule(nearestProjectionDeadline());
}

function expireProjectionDeadlines(nowMs: number) {
  // Lifecycle effects must not subscribe to the revisions they invalidate.
  untrack(() => {
    for (const [source, deadlineMs] of projectionDeadlines) {
      if (deadlineMs > nowMs) continue;
      projectionDeadlines.delete(source);
      projectionRevisions[source] = (projectionRevisions[source] ?? 0) + 1;
    }
  });
}

/** Reactive display time. Only countdown leaves should subscribe to ticks. */
export function overlayNow() {
  return overlayClock.nowMs;
}

export function refreshOverlayClock() {
  refreshOverlayClockNow();
}

export function initOverlayClock() {
  if (overlayClockCleanup) {
    return overlayClockCleanup;
  }

  if (typeof window === "undefined") {
    return () => {};
  }

  const resyncOverlayClock = () => {
    if (document.visibilityState === "hidden") return;
    refreshOverlayClockNow();
    expireProjectionDeadlines(Date.now());
    rescheduleProjectionDeadline();
    scheduleNextOverlayClockTick();
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      clearOverlayClockTimer();
      projectionScheduler?.cancel();
    } else {
      resyncOverlayClock();
    }
  };

  window.addEventListener("focus", resyncOverlayClock);
  window.addEventListener("pageshow", resyncOverlayClock);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  const cleanup = () => {
    if (overlayClockCleanup !== cleanup) return;
    overlayClockCleanup = null;
    clearOverlayClockTimer();
    projectionScheduler?.cancel();
    window.removeEventListener("focus", resyncOverlayClock);
    window.removeEventListener("pageshow", resyncOverlayClock);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
  overlayClockCleanup = cleanup;
  resyncOverlayClock();
  return cleanup;
}

export function setOverlayClockActive(active: boolean) {
  if (active) {
    if (!overlayClockCleanup) initOverlayClock();
    return;
  }
  overlayClockCleanup?.();
}

export function hudProjectionRevision(source: string) {
  return projectionRevisions[source] ?? 0;
}

export function setHudProjectionDeadline(
  source: string,
  deadlineMs: number | null,
) {
  if (deadlineMs === null || !Number.isFinite(deadlineMs)) {
    projectionDeadlines.delete(source);
  } else {
    projectionDeadlines.set(source, deadlineMs);
  }
  rescheduleProjectionDeadline();
}

export function clearHudProjectionDeadline(source: string) {
  projectionDeadlines.delete(source);
  rescheduleProjectionDeadline();
}

export function hudTemporalRemainingMs(
  temporal: HudTemporalValue,
  nowMs: number,
) {
  return remainingUntilMs(temporal.deadlineMs, nowMs);
}

/** Wall-clock deadlines also cover timers with no known total duration. */
export function remainingUntilMs(deadlineMs: number, nowMs: number) {
  return Math.max(0, deadlineMs - nowMs);
}

export function remainingProgressPercent(
  remainingMs: number,
  durationMs: number,
) {
  if (durationMs <= 0) return 0;
  return Math.max(0, Math.min(100, (remainingMs / durationMs) * 100));
}

export function hudTemporalProgressPercent(
  temporal: HudTemporalValue,
  nowMs: number,
) {
  return remainingProgressPercent(
    hudTemporalRemainingMs(temporal, nowMs),
    temporal.durationMs,
  );
}

export function hudTemporalAlert(
  temporal: HudTemporalValue,
  nowMs: number,
): HudAlertState | undefined {
  const alert = temporal.alert;
  if (!alert) return undefined;
  return hudTemporalRemainingMs(temporal, nowMs) <= alert.thresholdMs
    ? alert.state
    : undefined;
}
