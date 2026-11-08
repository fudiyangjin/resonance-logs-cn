/**
 * @file Pure helpers for the battle roster settings: the per-profile options
 * and the global block list.
 *
 * Blocking has two sources: the developer presets
 * (`ROSTER_PRESET_BLOCKED_MONSTERS`), always on and never shown in the
 * settings, and the player's own list. Every read path runs persisted values
 * through these helpers so malformed or legacy data never reaches the HUD.
 */
import { ROSTER_PRESET_BLOCKED_IDS } from "./config/roster-preset-blocks";
import type { MonsterRosterOptions } from "./settings-store";

export const MAX_ROSTER_NORMAL_ROWS = 20;
export const DEFAULT_ROSTER_NORMAL_ROWS = 5;
/** Width of the HP column in px; the skill column comes on top of it. */
export const MIN_ROSTER_PANEL_WIDTH = 120;
export const MAX_ROSTER_PANEL_WIDTH = 400;
/** The former minimum width, so the default look is unchanged. */
export const DEFAULT_ROSTER_PANEL_WIDTH = 240;
/** Far above any real setup; keeps a corrupted file from growing forever. */
export const MAX_ROSTER_BLOCKED_MONSTERS = 1_000;
/** Rust side stores monster ids as `i32`. */
const MAX_MONSTER_ID = 2_147_483_647;

export function createDefaultMonsterRosterOptions(): MonsterRosterOptions {
  return {
    normalRows: DEFAULT_ROSTER_NORMAL_ROWS,
    tankMode: false,
    notAttackingMeFirst: false,
    showHpValue: false,
    showDistance: false,
  };
}

/** Fills missing fields with defaults and clamps the row count. */
export function normalizeMonsterRosterOptions(
  options: Partial<MonsterRosterOptions> | null | undefined,
): MonsterRosterOptions {
  const value = options && typeof options === "object" ? options : {};
  const rows = value.normalRows;
  return {
    normalRows:
      typeof rows === "number" && Number.isFinite(rows)
        ? Math.min(MAX_ROSTER_NORMAL_ROWS, Math.max(0, Math.round(rows)))
        : DEFAULT_ROSTER_NORMAL_ROWS,
    tankMode: value.tankMode === true,
    notAttackingMeFirst: value.notAttackingMeFirst === true,
    showHpValue: value.showHpValue === true,
    showDistance: value.showDistance === true,
  };
}

/** A rounded width within the slider's range; the default when unusable. */
export function normalizeRosterPanelWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ROSTER_PANEL_WIDTH;
  }
  return Math.min(
    MAX_ROSTER_PANEL_WIDTH,
    Math.max(MIN_ROSTER_PANEL_WIDTH, Math.round(value)),
  );
}

export function isValidMonsterId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_MONSTER_ID
  );
}

export function isRosterPresetBlock(monsterId: number): boolean {
  return ROSTER_PRESET_BLOCKED_IDS.has(monsterId);
}

/** The player's blocked ids: valid, distinct and in their persisted order
 * (oldest first). Presets are dropped; they are hidden anyway. */
export function ensureRosterBlockedMonsterIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const id of ids) {
    if (result.length >= MAX_ROSTER_BLOCKED_MONSTERS) break;
    if (!isValidMonsterId(id) || isRosterPresetBlock(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** Every id the roster hides: the presets plus the player's. */
export function effectiveRosterBlockedIds(
  blocked: readonly number[],
): Set<number> {
  return new Set([...ROSTER_PRESET_BLOCKED_IDS, ...blocked]);
}

/** Adds `monsterId` to the player's list; a no-op for an invalid id or a
 * preset. */
export function blockRosterMonster(
  blocked: number[],
  monsterId: number,
): number[] {
  if (!isValidMonsterId(monsterId) || isRosterPresetBlock(monsterId)) {
    return blocked;
  }
  return ensureRosterBlockedMonsterIds([...blocked, monsterId]);
}

export function unblockRosterMonster(
  blocked: number[],
  monsterId: number,
): number[] {
  return blocked.filter((id) => id !== monsterId);
}
