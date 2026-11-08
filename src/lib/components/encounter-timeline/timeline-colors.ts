import { getClassColorRaw } from "$lib/utils.svelte";
import {
  ensureContrast,
  hexToOklch,
  normalizeHex,
  oklabDistance,
  oklchToHex,
} from "./timeline-color-math";
import { TIMELINE_PALETTE } from "./timeline-palette";
import type {
  Lane,
  TimelinePlayer,
  TimelinePlayerMeta,
} from "./timeline-types";

/** Lines and dots must stay legible on the fixed dark chart island
 * (WCAG non-text contrast). */
export const MIN_READABLE_CONTRAST = 3;
/** Two players closer than this in OKLab get a variant for the later one. */
export const MIN_PLAYER_COLOR_DISTANCE = 0.07;

/** Variant ladder tried in order when a player's color is taken: lightness
 * first (keeps the spec's hue family), hue rotation only as a last resort. */
const LIGHTNESS_STEPS = [0.1, -0.1, 0.18, -0.18] as const;
const HUE_STEPS = [25, -25, 50, -50] as const;

/** The user's class/spec color, exactly as the live meter resolves it (follows
 * the active loadout and the "use spec colors" switch). */
function userClassColor(player: TimelinePlayerMeta): string {
  return getClassColorRaw(player.className, player.classSpecName);
}

/** The user's color, made readable on the chart background. Colors that are
 * already readable come back unchanged. */
export function readableChartColor(color: string): string {
  return ensureContrast(
    normalizeHex(color) ?? TIMELINE_PALETTE.fallbackPlayer,
    TIMELINE_PALETTE.bg,
    MIN_READABLE_CONTRAST,
  );
}

function colorCandidates(base: string): string[] {
  const color = hexToOklch(base);
  if (!color) return [base];
  const candidates = [base];
  for (const step of LIGHTNESS_STEPS) {
    candidates.push(
      readableChartColor(oklchToHex({ ...color, l: color.l + step })),
    );
  }
  for (const step of HUE_STEPS) {
    candidates.push(
      readableChartColor(
        oklchToHex({ ...color, h: (color.h + step + 360) % 360 }),
      ),
    );
  }
  return candidates;
}

function nearestDistance(color: string, taken: readonly string[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const other of taken) {
    nearest = Math.min(nearest, oklabDistance(color, other));
  }
  return nearest;
}

/** One chart color per player, assigned once for the whole party so a
 * player's color never changes with what is selected. Everyone starts from
 * their class/spec color; the local player is placed first and always keeps
 * it, the rest (in `players` order) step through lighter/darker/hue variants
 * until they are distinguishable from everyone already placed. */
export function assignTimelineColors(
  players: readonly TimelinePlayerMeta[],
  baseColor: (player: TimelinePlayerMeta) => string = userClassColor,
): Map<string, string> {
  const ordered = [
    ...players.filter((player) => player.isLocalPlayer),
    ...players.filter((player) => !player.isLocalPlayer),
  ];
  const colors = new Map<string, string>();
  const taken: string[] = [];
  for (const player of ordered) {
    if (colors.has(player.entityUuid)) continue;
    const candidates = colorCandidates(readableChartColor(baseColor(player)));
    let chosen = candidates[0]!;
    let chosenDistance = -1;
    for (const candidate of candidates) {
      const distance = nearestDistance(candidate, taken);
      if (distance >= MIN_PLAYER_COLOR_DISTANCE) {
        chosen = candidate;
        break;
      }
      if (distance > chosenDistance) {
        chosen = candidate;
        chosenDistance = distance;
      }
    }
    taken.push(chosen);
    colors.set(player.entityUuid, chosen);
  }
  return colors;
}

/** Attaches the assigned chart color to each player, keeping input order. */
export function withTimelineColors(
  players: readonly TimelinePlayerMeta[],
  baseColor?: (player: TimelinePlayerMeta) => string,
): TimelinePlayer[] {
  const colors = assignTimelineColors(players, baseColor);
  return players.map((player) => ({
    ...player,
    color: colors.get(player.entityUuid) ?? TIMELINE_PALETTE.fallbackPlayer,
  }));
}

export function laneColor(lane: Lane): string {
  return lane.type === "boss" ? TIMELINE_PALETTE.boss : lane.player.color;
}
