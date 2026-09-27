import type { BuffUpdateState } from "$lib/api";
import type { BuffCategoryKey } from "$lib/config/buff-name-table";
import type { EntityId } from "$lib/entity-id";
import type { TeammateDeadRowPlacement } from "$lib/settings-store";

/**
 * Selects the newest active snapshot Buff for each configured category.
 *
 * The reverse index is built once from the settings-driven column projection;
 * each teammate only scans Buffs present in its own snapshot instead of the
 * complete catalog for every category cell.
 */
export function latestBuffsByCategory(
  buffMap: ReadonlyMap<number, BuffUpdateState>,
  categoryKeysByBuffId: ReadonlyMap<number, BuffCategoryKey[]>,
): Map<BuffCategoryKey, BuffUpdateState> {
  const latestByCategory = new Map<BuffCategoryKey, BuffUpdateState>();
  for (const buff of buffMap.values()) {
    for (const categoryKey of categoryKeysByBuffId.get(buff.baseId) ?? []) {
      const current = latestByCategory.get(categoryKey);
      if (!current || buff.createTimeMs >= current.createTimeMs) {
        latestByCategory.set(categoryKey, buff);
      }
    }
  }
  return latestByCategory;
}

/**
 * Teammate row order: a stable uuid-string order, with dead teammates moved
 * to the end or the front per `placement` ("keep" leaves them in place).
 * Duplicate uuids collapse to one row.
 */
export function orderTeammateUuids(
  uuids: Iterable<EntityId>,
  dead: ReadonlySet<EntityId>,
  placement: TeammateDeadRowPlacement,
): EntityId[] {
  const ordered = Array.from(new Set(uuids)).sort();
  if (placement === "keep" || dead.size === 0) return ordered;
  const living = ordered.filter((uuid) => !dead.has(uuid));
  const fallen = ordered.filter((uuid) => dead.has(uuid));
  return placement === "last" ? [...living, ...fallen] : [...fallen, ...living];
}
