/**
 * Structural sharing for replace-only live payloads.
 *
 * A pulled topic replaces its whole payload whenever any field changes, so a
 * view rebuilt from it is a new object on every frame even when its own part
 * did not change. Handing back the previous instance for equal content lets
 * `$derived` equality (`Object.is`) stop the recomputation at the source.
 * Order is part of the content: a reused value iterates exactly like the new
 * one would.
 */

/** Deep equality for JSON-shaped IPC data: primitives, arrays, plain objects. */
export function sameJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false;
  }
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameJson(item, right[index]))
    );
  }
  if (Array.isArray(right)) return false;
  // `for...in` instead of `Object.keys`: no key arrays are allocated, which
  // matters when a payload carries hundreds of small objects per frame.
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  let leftKeyCount = 0;
  for (const key in leftRecord) {
    if (!Object.hasOwn(leftRecord, key)) continue;
    leftKeyCount += 1;
    if (
      !Object.hasOwn(rightRecord, key) ||
      !sameJson(leftRecord[key], rightRecord[key])
    ) {
      return false;
    }
  }
  let rightKeyCount = 0;
  for (const key in rightRecord) {
    if (Object.hasOwn(rightRecord, key)) rightKeyCount += 1;
  }
  return leftKeyCount === rightKeyCount;
}

/** `previous` when `next` has the same content, else `next`. */
export function reuseIfSame<T>(previous: T | undefined, next: T): T {
  return previous !== undefined && sameJson(previous, next) ? previous : next;
}

/**
 * A map whose equal entries keep their previous value instance; the whole
 * previous map when every entry, in order, is unchanged. Large maps of one
 * known shape should pass a field-by-field `equal`: the generic deep compare
 * is several times slower per entry.
 */
export function reuseMap<K, V>(
  previous: ReadonlyMap<K, V> | undefined,
  next: Map<K, V>,
  equal: (previous: V, next: V) => boolean = sameJson,
): Map<K, V> {
  if (!previous) return next;
  const result = new Map<K, V>();
  const previousKeys = previous.keys();
  let unchanged = previous.size === next.size;
  for (const [key, value] of next) {
    const previousValue = previous.get(key);
    const reused =
      previousValue !== undefined && equal(previousValue, value)
        ? previousValue
        : value;
    result.set(key, reused);
    if (unchanged) {
      unchanged = previousKeys.next().value === key && reused === previousValue;
    }
  }
  return unchanged ? (previous as Map<K, V>) : result;
}

/** The previous set when it holds the same members in the same order. */
export function reuseSet<T>(
  previous: ReadonlySet<T> | undefined,
  next: Set<T>,
): Set<T> {
  if (!previous || previous.size !== next.size) return next;
  const previousValues = previous.values();
  for (const value of next) {
    if (previousValues.next().value !== value) return next;
  }
  return previous as Set<T>;
}
