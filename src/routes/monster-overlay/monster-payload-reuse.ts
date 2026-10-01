import type { BuffUpdateState } from "$lib/api";
import type { EntityId } from "$lib/entity-id";

/**
 * Structural sharing for the replace-only `live-monster` payload.
 *
 * Every frame (boss HP, hate, stun …) replaces the whole payload, so derived
 * views rebuilt from it would invalidate every consumer at ~20Hz. These
 * helpers hand back the previous instance when the content is unchanged, so
 * `$derived` equality (`Object.is`) stops the fan-out at the source.
 */

export function definedEntries<T>(
  source: Partial<Record<string, T>>,
): Array<[EntityId, T]> {
  const result: Array<[EntityId, T]> = [];
  for (const [entityUuid, value] of Object.entries(source)) {
    if (value !== undefined) result.push([entityUuid, value]);
  }
  return result;
}

function sameBuffState(left: BuffUpdateState, right: BuffUpdateState) {
  return (
    left.baseId === right.baseId &&
    left.layer === right.layer &&
    left.durationMs === right.durationMs &&
    left.createTimeMs === right.createTimeMs &&
    left.sourceRemodelLevel === right.sourceRemodelLevel
  );
}

/** Order-sensitive: the backend sorts each list by (baseId, createTimeMs). */
export function sameBuffStates(
  left: readonly BuffUpdateState[],
  right: readonly BuffUpdateState[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((buff, index) => sameBuffState(buff, right[index]!));
}

export type EntityBuffMapCache = {
  sources: Map<EntityId, readonly BuffUpdateState[]>;
  value: Map<EntityId, Map<number, BuffUpdateState>>;
};

/**
 * Per-entity buff maps that keep the previous map for every entity whose
 * buff list is unchanged, and the previous outer map when no entity changed.
 */
export function reuseEntityBuffMap(
  previous: EntityBuffMapCache | null,
  source: Partial<Record<string, BuffUpdateState[]>>,
  build: (buffs: BuffUpdateState[]) => Map<number, BuffUpdateState>,
): EntityBuffMapCache {
  const sources = new Map<EntityId, readonly BuffUpdateState[]>();
  const value = new Map<EntityId, Map<number, BuffUpdateState>>();
  let changed = previous === null;
  for (const [entityUuid, buffs] of definedEntries(source)) {
    const previousSource = previous?.sources.get(entityUuid);
    const previousMap = previous?.value.get(entityUuid);
    if (
      previousSource !== undefined &&
      previousMap !== undefined &&
      sameBuffStates(previousSource, buffs)
    ) {
      sources.set(entityUuid, previousSource);
      value.set(entityUuid, previousMap);
    } else {
      sources.set(entityUuid, buffs);
      value.set(entityUuid, build(buffs));
      changed = true;
    }
  }
  if (!changed && previous !== null && previous.value.size === value.size) {
    return previous;
  }
  return { sources, value };
}

/** A uuid-keyed map of primitives; the previous map when entries match. */
export function reuseEntityMap<T extends string | number>(
  previous: Map<EntityId, T> | null,
  source: Partial<Record<string, T>>,
): Map<EntityId, T> {
  const next = new Map<EntityId, T>(definedEntries(source));
  if (previous === null || previous.size !== next.size) return next;
  for (const [entityUuid, value] of next) {
    if (previous.get(entityUuid) !== value) return next;
  }
  return previous;
}

/** A uuid set; the previous set when it holds the same members. */
export function reuseEntitySet(
  previous: ReadonlySet<EntityId> | null,
  source: readonly EntityId[],
): ReadonlySet<EntityId> {
  const next = new Set(source);
  if (previous === null || previous.size !== next.size) return next;
  for (const entityUuid of next) {
    if (!previous.has(entityUuid)) return next;
  }
  return previous;
}
