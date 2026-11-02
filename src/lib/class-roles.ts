/**
 * @file Party role of each class, keyed by class id (`CLASS_MAP` keys).
 * Roles are per class, not per spec: every Verdant Oracle / Beat Performer
 * spec counts as a healer, every Heavy Guardian / Shield Knight as a tank.
 */

export type ClassRole = "healer" | "tank" | "dps";

/** Verdant Oracle, Beat Performer. */
const HEALER_CLASS_IDS: ReadonlySet<number> = new Set([5, 13]);
/** Heavy Guardian, Shield Knight. */
const TANK_CLASS_IDS: ReadonlySet<number> = new Set([9, 12]);

const ROLE_RANK: Record<ClassRole, number> = { healer: 0, tank: 1, dps: 2 };
const UNKNOWN_RANK = 3;

/** `null` for an unknown class (id 0 or missing). */
export function classRole(classId: number): ClassRole | null {
  if (!(classId > 0)) return null;
  if (HEALER_CLASS_IDS.has(classId)) return "healer";
  if (TANK_CLASS_IDS.has(classId)) return "tank";
  return "dps";
}

/**
 * Party order: healers, then tanks, then damage dealers, with each class
 * kept together (by class id); unknown classes last. Pair it with a stable
 * sort to keep the incoming order within one class.
 */
export function compareByPartyRole(
  leftClassId: number,
  rightClassId: number,
): number {
  const left = classRole(leftClassId);
  const right = classRole(rightClassId);
  const leftRank = left ? ROLE_RANK[left] : UNKNOWN_RANK;
  const rightRank = right ? ROLE_RANK[right] : UNKNOWN_RANK;
  if (leftRank !== rightRank) return leftRank - rightRank;
  if (!left || !right) return 0;
  return leftClassId - rightClassId;
}
