import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import {
  barKeyframes,
  barScaleAt,
  sameBarMotion,
  type BarMotion,
} from "./bar-motion";

export type { BarMotion } from "./bar-motion";

/** How a bar scale is written to `transform` and read back from it. */
export type BarAxis = {
  write: (scale: number) => string;
  /** Scale shown by a computed `matrix(a, b, c, d, e, f)`, as numbers. */
  read: (matrix: number[]) => number;
};

export const SCALE_X: BarAxis = {
  write: (scale) => `scaleX(${scale})`,
  read: (matrix) => matrix[0] ?? NaN,
};

export const SCALE_Y: BarAxis = {
  write: (scale) => `scaleY(${scale})`,
  read: (matrix) => matrix[3] ?? NaN,
};

/** Horizontal offset of `scale × widthPx` (an indicator line on a track). */
export function offsetAxis(widthPx: number): BarAxis {
  return {
    write: (scale) => `translateX(${scale * widthPx}px)`,
    read: (matrix) => (matrix[4] ?? NaN) / widthPx,
  };
}

/**
 * Reveal of a fixed-size image (`ZImageClipAnim`): the `clip` element
 * (overflow hidden) shifts by the hidden part and the `content` inside shifts
 * back by the same amount, so only `scale × widthPx` stays visible without
 * stretching the image. `anchor` is the side that stays put (direction Right
 * keeps the left). Both are translations, so the reveal still runs as one
 * compositor animation.
 */
export function revealAxes(
  widthPx: number,
  anchor: "left" | "right" = "left",
): { clip: BarAxis; content: BarAxis } {
  const sign = anchor === "left" ? -1 : 1;
  return {
    clip: {
      write: (scale) => `translateX(${sign * (1 - scale) * widthPx}px)`,
      read: (matrix) => 1 - (sign * (matrix[4] ?? NaN)) / widthPx,
    },
    content: {
      write: (scale) => `translateX(${-sign * (1 - scale) * widthPx}px)`,
      read: (matrix) => 1 + (sign * (matrix[4] ?? NaN)) / widthPx,
    },
  };
}

type BarState = { motion: BarMotion; animation: Animation | null };

const barStates = new WeakMap<HTMLElement, BarState>();

/** The scale currently on screen, including a running animation. */
function displayedScale(
  node: HTMLElement,
  state: BarState,
  axis: BarAxis,
): number {
  if (!state.animation) return barScaleAt(state.motion, Date.now());
  const transform = getComputedStyle(node).transform;
  if (!transform || transform === "none") return 1;
  const values = /^matrix\(([^)]+)\)/.exec(transform)?.[1]?.split(",");
  const scale = values ? axis.read(values.map(Number)) : NaN;
  return Number.isFinite(scale) ? scale : barScaleAt(state.motion, Date.now());
}

function applyBarMotion(
  node: HTMLElement,
  motion: BarMotion,
  axis: BarAxis,
): void {
  const state = barStates.get(node);
  // Projections rebuild their rows on every data frame; an unchanged course
  // keeps the running animation untouched.
  if (state && sameBarMotion(state.motion, motion)) return;

  const nowMs = Date.now();
  const fromScale = state ? displayedScale(node, state, axis) : null;
  state?.animation?.cancel();

  const keyframes = barKeyframes(motion, nowMs, fromScale);
  node.style.transform = axis.write(
    keyframes
      ? (keyframes.frames.at(-1)?.scale ?? 0)
      : barScaleAt(motion, nowMs),
  );
  const animation = keyframes
    ? node.animate(
        keyframes.frames.map((frame) => ({
          offset: frame.offset,
          transform: axis.write(frame.scale),
        })),
        { duration: keyframes.durationMs, easing: "linear", fill: "forwards" },
      )
    : null;
  barStates.set(node, { motion, animation });
}

/**
 * Drives an element's `transform` from a {@link BarMotion}, as `scaleX` unless
 * another `axis` is given. The getter must not read the HUD clock: it should
 * only change when the countdown itself changes (new deadline, span or static
 * value).
 */
export function barMotion(
  getMotion: () => BarMotion,
  axis: BarAxis = SCALE_X,
): Attachment<HTMLElement> {
  return (node) => {
    // Position the bar before the first paint; the effect below then only
    // reacts to later changes (the same course is a no-op).
    applyBarMotion(node, untrack(getMotion), axis);
    $effect(() => {
      applyBarMotion(node, getMotion(), axis);
    });
    return () => {
      barStates.get(node)?.animation?.cancel();
      barStates.delete(node);
    };
  };
}

/** `ZImageClipAnim` speed and `maxEndTime` of the weapon bar prefabs. */
const CLIP_SPEED_PER_S = 0.05;
const CLIP_MAX_END_S = 1;

/** `from` is where the running slide started; `scale` where it ends. */
type FillState = { from: number; scale: number; animation: Animation | null };

const fillStates = new WeakMap<HTMLElement, FillState>();

/**
 * `ZImageClipAnim.SetFilled`: slide to the new fill at 0.05 per second, the
 * whole move squeezed into at most one second. The first fill grows from 0.
 */
export function clipFillDurationMs(from: number, to: number): number {
  const naturalS = Math.abs(to - from) / CLIP_SPEED_PER_S;
  return Math.min(naturalS, CLIP_MAX_END_S) * 1000;
}

/**
 * The fill on screen, interpolated from the running slide's own progress.
 * A slide is linear between two values, so this needs no
 * `getComputedStyle` (which would force a style recalculation on every
 * value that arrives mid-slide).
 */
function displayedFill(state: FillState): number {
  const progress = state.animation?.effect?.getComputedTiming().progress;
  if (progress === null || progress === undefined) return state.scale;
  return state.from + (state.scale - state.from) * progress;
}

function applyClipFill(
  node: HTMLElement,
  target: number,
  axis: BarAxis,
  fixedMs: number | undefined,
): void {
  const state = fillStates.get(node);
  if (state && Math.abs(state.scale - target) < 1e-4) return;
  const from = state ? displayedFill(state) : 0;
  state?.animation?.cancel();
  node.style.transform = axis.write(target);
  const durationMs = fixedMs ?? clipFillDurationMs(from, target);
  const animation =
    durationMs > 0 && Math.abs(target - from) >= 1e-4
      ? node.animate(
          [{ transform: axis.write(from) }, { transform: axis.write(target) }],
          { duration: durationMs, easing: "linear" },
        )
      : null;
  fillStates.set(node, { from, scale: target, animation });
}

/**
 * Drives `transform` towards a fill value the way the game's clip images do
 * (see {@link clipFillDurationMs}); `fixedMs` replaces that timing, e.g. the
 * beat performer's ten 10ms steps.
 */
export function clipFill(
  getScale: () => number,
  axis: BarAxis = SCALE_X,
  fixedMs?: number,
): Attachment<HTMLElement> {
  return (node) => {
    $effect(() => {
      applyClipFill(node, getScale(), axis, fixedMs);
    });
    return () => {
      fillStates.get(node)?.animation?.cancel();
      fillStates.delete(node);
    };
  };
}
