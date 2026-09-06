import type { BuffUpdateState } from "$lib/bindings";
import type {
  FlowerColor,
  FlowerRotationResourceDefinition,
} from "$lib/skill-mappings";

/**
 * Backend re-anchors `createTimeMs` on every duration delta, so the only
 * reliable "new countdown instance" signal is the deadline jumping forward.
 * Within one instance haste can only pull the deadline earlier.
 */
export const FLOWER_RESTART_JUMP_MS = 1_000;

export type FlowerSnapshot = {
  /** `createTimeMs + durationMs` of the countdown buff; null when absent. */
  deadlineMs: number | null;
  petals: ReadonlySet<FlowerColor>;
};

export type FlowerCycleState = {
  prevDeadlineMs: number | null;
  prevPetals: ReadonlySet<FlowerColor>;
  /** Colour the next natural spawn will produce; null until calibrated. */
  nextColor: FlowerColor | null;
};

const EMPTY_PETALS: ReadonlySet<FlowerColor> = new Set<FlowerColor>();

export const INITIAL_FLOWER_CYCLE: FlowerCycleState = {
  prevDeadlineMs: null,
  prevPetals: EMPTY_PETALS,
  nextColor: null,
};

export function nextFlowerColor(
  definition: Pick<FlowerRotationResourceDefinition, "petals">,
  color: FlowerColor,
): FlowerColor | null {
  const petals = definition.petals;
  if (petals.length === 0) return null;
  const index = petals.findIndex((petal) => petal.color === color);
  if (index < 0) return null;
  return petals[(index + 1) % petals.length]?.color ?? null;
}

export function readFlowerSnapshot(
  buffMap: ReadonlyMap<number, BuffUpdateState>,
  definition: Pick<
    FlowerRotationResourceDefinition,
    "countdownBuffId" | "petals"
  >,
): FlowerSnapshot {
  const countdown = buffMap.get(definition.countdownBuffId);
  const deadlineMs =
    countdown && countdown.durationMs > 0
      ? countdown.createTimeMs + countdown.durationMs
      : null;
  const petals = new Set<FlowerColor>();
  for (const petal of definition.petals) {
    if (buffMap.has(petal.buffBaseId)) petals.add(petal.color);
  }
  return { deadlineMs, petals };
}

function samePetals(
  a: ReadonlySet<FlowerColor>,
  b: ReadonlySet<FlowerColor>,
): boolean {
  if (a.size !== b.size) return false;
  for (const color of a) if (!b.has(color)) return false;
  return true;
}

/**
 * Pointer rules (see plan):
 * - countdown absent: forget everything (talent not equipped / scene change)
 * - restart + exactly one new petal: natural spawn, pin pointer after it
 * - restart + no new petal: colour was already held, server skipped it and
 *   moved on, so advance the pointer
 * - restart + several new petals: ambiguous coincidence, keep pointer
 * - no restart (haste ticks, consumption, 三色启示): keep pointer
 */
export function advanceFlowerCycle(
  prev: FlowerCycleState,
  snapshot: FlowerSnapshot,
  definition: Pick<FlowerRotationResourceDefinition, "petals">,
): FlowerCycleState {
  if (snapshot.deadlineMs === null) {
    if (
      prev.prevDeadlineMs === null &&
      prev.nextColor === null &&
      samePetals(prev.prevPetals, snapshot.petals)
    ) {
      return prev;
    }
    return {
      prevDeadlineMs: null,
      prevPetals: snapshot.petals,
      nextColor: null,
    };
  }

  const restart =
    prev.prevDeadlineMs !== null &&
    snapshot.deadlineMs > prev.prevDeadlineMs + FLOWER_RESTART_JUMP_MS;

  let nextColor = prev.nextColor;
  if (restart) {
    const newPetals: FlowerColor[] = [];
    for (const color of snapshot.petals) {
      if (!prev.prevPetals.has(color)) newPetals.push(color);
    }
    const [spawned] = newPetals;
    if (newPetals.length === 1 && spawned !== undefined) {
      nextColor = nextFlowerColor(definition, spawned);
    } else if (newPetals.length === 0 && nextColor !== null) {
      nextColor = nextFlowerColor(definition, nextColor);
    }
  }

  if (
    prev.prevDeadlineMs === snapshot.deadlineMs &&
    prev.nextColor === nextColor &&
    samePetals(prev.prevPetals, snapshot.petals)
  ) {
    return prev;
  }

  return {
    prevDeadlineMs: snapshot.deadlineMs,
    prevPetals: snapshot.petals,
    nextColor,
  };
}
