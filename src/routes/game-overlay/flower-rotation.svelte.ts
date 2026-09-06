import { untrack } from "svelte";
import {
  INITIAL_FLOWER_CYCLE,
  advanceFlowerCycle,
  type FlowerCycleState,
  type FlowerSnapshot,
} from "$lib/flower-rotation";
import type { FlowerRotationResourceDefinition } from "$lib/skill-mappings";

// Module scoped so a calibrated pointer survives the resource panel
// unmounting/remounting (visibility toggles, edit mode, etc.).
let cycle = $state.raw<FlowerCycleState>(INITIAL_FLOWER_CYCLE);

export function flowerCycle(): FlowerCycleState {
  return cycle;
}

export function observeFlowerRotation(
  snapshot: FlowerSnapshot,
  definition: Pick<FlowerRotationResourceDefinition, "petals">,
) {
  // Read without subscribing so a calling `$effect` only depends on the
  // snapshot it feeds in, never on the state it writes.
  const current = untrack(() => cycle);
  const next = advanceFlowerCycle(current, snapshot, definition);
  if (next !== current) cycle = next;
}

export function resetFlowerRotation() {
  cycle = INITIAL_FLOWER_CYCLE;
}
