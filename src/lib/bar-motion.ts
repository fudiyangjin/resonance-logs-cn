/**
 * Motion of a horizontal progress bar, expressed as its `scaleX`.
 *
 * A countdown is described once (deadline + span) and played as a single
 * compositor animation, instead of being re-set on every clock tick behind a
 * short CSS transition: re-triggering a transition every 100ms keeps the HUD
 * rendering at the display refresh rate and costs main-thread style work on
 * every tick, while one long animation only needs the main thread when the
 * countdown itself changes.
 */
export type BarMotion =
  | { kind: "static"; scale: number }
  | {
      kind: "countdown";
      /** Wall-clock ms (`Date.now()`) at which the countdown reaches zero. */
      deadlineMs: number;
      /** Wall-clock ms one full bar represents. */
      spanMs: number;
      /** Grow from empty to full instead of draining from full. */
      fill?: boolean;
      /** Restart a full span at every span boundary before the deadline. */
      periodic?: boolean;
    };

/** Matches the CSS transition this replaces: changes still slide, not jump. */
export const BAR_CATCH_UP_MS = 100;

const SCALE_EPSILON = 0.0005;
const TIME_EPSILON_MS = 1;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Remaining part of the current span, 0 at (and after) the deadline. */
function remainingFraction(
  motion: Extract<BarMotion, { kind: "countdown" }>,
  nowMs: number,
): number {
  const remainingMs = motion.deadlineMs - nowMs;
  if (remainingMs <= 0 || motion.spanMs <= 0) return 0;
  const spans = remainingMs / motion.spanMs;
  if (!motion.periodic) return Math.min(1, spans);
  const fraction = spans % 1;
  // On a boundary (up to float noise) the next span has just started.
  return fraction < 1e-9 || fraction > 1 - 1e-9 ? 1 : fraction;
}

export function barScaleAt(motion: BarMotion, nowMs: number): number {
  if (motion.kind === "static") return clamp01(motion.scale);
  const fraction = remainingFraction(motion, nowMs);
  return motion.fill ? 1 - fraction : fraction;
}

export function sameBarMotion(left: BarMotion, right: BarMotion): boolean {
  if (left.kind === "static" || right.kind === "static") {
    return (
      left.kind === right.kind &&
      Math.abs(barScaleAt(left, 0) - barScaleAt(right, 0)) < SCALE_EPSILON
    );
  }
  return (
    Math.abs(left.deadlineMs - right.deadlineMs) <= TIME_EPSILON_MS &&
    Math.abs(left.spanMs - right.spanMs) <= TIME_EPSILON_MS &&
    (left.fill ?? false) === (right.fill ?? false) &&
    (left.periodic ?? false) === (right.periodic ?? false)
  );
}

export type BarKeyframes = {
  /** `scaleX` per keyframe; equal offsets encode an instant jump. */
  frames: { offset: number; scale: number }[];
  durationMs: number;
};

/**
 * Keyframes from `nowMs` to the end of the motion. With `fromScale` (the
 * value currently on screen) the first `BAR_CATCH_UP_MS` slide from it onto
 * the new course; without it the bar starts on course. `null` means the bar
 * no longer moves and should simply rest at `barScaleAt(motion, nowMs)`.
 */
export function barKeyframes(
  motion: BarMotion,
  nowMs: number,
  fromScale: number | null,
): BarKeyframes | null {
  const target = barScaleAt(motion, nowMs);
  const from = fromScale === null ? null : clamp01(fromScale);
  const slides = from !== null && Math.abs(from - target) >= SCALE_EPSILON;

  if (motion.kind === "static" || motion.deadlineMs <= nowMs) {
    if (!slides) return null;
    return {
      frames: [
        { offset: 0, scale: from },
        { offset: 1, scale: barScaleAt(motion, nowMs + BAR_CATCH_UP_MS) },
      ],
      durationMs: BAR_CATCH_UP_MS,
    };
  }

  const endMs = motion.deadlineMs;
  const emptyScale = motion.fill ? 1 : 0;
  const fullScale = motion.fill ? 0 : 1;
  // [time, scale] points; two points at one time are a jump.
  const points: [number, number][] = [[nowMs, slides ? from : target]];
  const breakpoints: [number, number][] = [];
  if (motion.periodic) {
    for (let boundary = endMs - motion.spanMs; boundary > nowMs; ) {
      breakpoints.push([boundary, emptyScale], [boundary, fullScale]);
      boundary -= motion.spanMs;
    }
    breakpoints.sort((a, b) => a[0] - b[0] || (a[1] === emptyScale ? -1 : 1));
  } else if (endMs - motion.spanMs > nowMs) {
    // Longer than one span: the bar stays full until the last span starts.
    breakpoints.push([endMs - motion.spanMs, fullScale]);
  }

  if (slides) {
    const catchUpMs = nowMs + BAR_CATCH_UP_MS;
    const firstBreakMs = breakpoints[0]?.[0] ?? endMs;
    if (catchUpMs < firstBreakMs) {
      points.push([catchUpMs, barScaleAt(motion, catchUpMs)]);
    }
  }
  points.push(...breakpoints, [endMs, emptyScale]);

  const durationMs = endMs - nowMs;
  let lastOffset = 0;
  const frames = points.map(([timeMs, scale]) => {
    const offset = Math.max(
      lastOffset,
      Math.min(1, (timeMs - nowMs) / durationMs),
    );
    lastOffset = offset;
    return { offset, scale };
  });
  return { frames, durationMs };
}
