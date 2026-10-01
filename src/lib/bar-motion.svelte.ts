import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import {
  barKeyframes,
  barScaleAt,
  sameBarMotion,
  type BarMotion,
} from "./bar-motion";

export type { BarMotion } from "./bar-motion";

type BarState = { motion: BarMotion; animation: Animation | null };

const barStates = new WeakMap<HTMLElement, BarState>();

function scaleTransform(scale: number): string {
  return `scaleX(${scale})`;
}

/** The `scaleX` currently on screen, including a running animation. */
function displayedScale(node: HTMLElement, state: BarState): number {
  if (!state.animation) return barScaleAt(state.motion, Date.now());
  const transform = getComputedStyle(node).transform;
  if (!transform || transform === "none") return 1;
  const match = /^matrix\(([^,]+),/.exec(transform);
  const scale = match ? Number(match[1]) : NaN;
  return Number.isFinite(scale) ? scale : barScaleAt(state.motion, Date.now());
}

function applyBarMotion(node: HTMLElement, motion: BarMotion): void {
  const state = barStates.get(node);
  // Projections rebuild their rows on every data frame; an unchanged course
  // keeps the running animation untouched.
  if (state && sameBarMotion(state.motion, motion)) return;

  const nowMs = Date.now();
  const fromScale = state ? displayedScale(node, state) : null;
  state?.animation?.cancel();

  const keyframes = barKeyframes(motion, nowMs, fromScale);
  node.style.transform = scaleTransform(
    keyframes
      ? (keyframes.frames.at(-1)?.scale ?? 0)
      : barScaleAt(motion, nowMs),
  );
  const animation = keyframes
    ? node.animate(
        keyframes.frames.map((frame) => ({
          offset: frame.offset,
          transform: scaleTransform(frame.scale),
        })),
        { duration: keyframes.durationMs, easing: "linear", fill: "forwards" },
      )
    : null;
  barStates.set(node, { motion, animation });
}

/**
 * Drives an element's `transform: scaleX(...)` from a {@link BarMotion}.
 * The getter must not read the HUD clock: it should only change when the
 * countdown itself changes (new deadline, span or static value).
 */
export function barMotion(getMotion: () => BarMotion): Attachment<HTMLElement> {
  return (node) => {
    // Position the bar before the first paint; the effect below then only
    // reacts to later changes (the same course is a no-op).
    applyBarMotion(node, untrack(getMotion));
    $effect(() => {
      applyBarMotion(node, getMotion());
    });
    return () => {
      barStates.get(node)?.animation?.cancel();
      barStates.delete(node);
    };
  };
}
