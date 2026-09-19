/**
 * @file Pure helpers for the monster-monitor "entity duration" watch list.
 *
 * Entries are persisted inside the monster-monitor profile; every read path
 * runs them through `ensureEntityDurationEntries` so malformed or legacy data
 * never reaches the runtime snapshot or the HUD.
 */
import {
  generateProfileId,
  type EntityDurationEntry,
  type EntityDurationScope,
} from "./settings-store";

export const MAX_ENTITY_DURATION_ENTRIES = 32;
export const MIN_ENTITY_DURATION_MS = 100;
export const MAX_ENTITY_DURATION_MS = 3_600_000;
/** Rust side stores monster ids as `i32`. */
export const MAX_ENTITY_ID = 2_147_483_647;

const ENTRY_ID_PREFIX = "entity_duration";

export function ensureEntityDurationScope(value: unknown): EntityDurationScope {
  return value === "any" ? "any" : "self";
}

export function isValidEntityId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_ENTITY_ID
  );
}

/** Clamps to the allowed range; returns `undefined` for "no countdown". */
export function normalizeEntityDurationMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.min(
    MAX_ENTITY_DURATION_MS,
    Math.max(MIN_ENTITY_DURATION_MS, Math.round(value)),
  );
}

export type EntityDurationEntryInput = {
  monsterId: number;
  label: string;
  durationMs?: number;
  scope: EntityDurationScope;
  presetKey?: string;
};

function buildEntry(
  id: string,
  input: EntityDurationEntryInput,
): EntityDurationEntry {
  const durationMs = normalizeEntityDurationMs(input.durationMs);
  const presetKey = input.presetKey?.trim();
  return {
    id,
    monsterId: input.monsterId,
    label: input.label.trim(),
    scope: ensureEntityDurationScope(input.scope),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(presetKey ? { presetKey } : {}),
  };
}

export function createEntityDurationEntry(
  input: EntityDurationEntryInput,
): EntityDurationEntry {
  return buildEntry(generateProfileId(ENTRY_ID_PREFIX), input);
}

/**
 * Normalizes a persisted list: drops entries with invalid monster ids, keeps
 * the first entry per monster id, regenerates missing/duplicate ids, trims
 * labels, clamps durations and truncates to `MAX_ENTITY_DURATION_ENTRIES`.
 */
export function ensureEntityDurationEntries(
  entries: readonly Partial<EntityDurationEntry>[] | null | undefined,
): EntityDurationEntry[] {
  if (!Array.isArray(entries)) return [];
  const seenMonsterIds = new Set<number>();
  const seenIds = new Set<string>();
  const result: EntityDurationEntry[] = [];
  for (const raw of entries) {
    if (result.length >= MAX_ENTITY_DURATION_ENTRIES) break;
    if (!raw || typeof raw !== "object") continue;
    if (!isValidEntityId(raw.monsterId)) continue;
    if (seenMonsterIds.has(raw.monsterId)) continue;
    seenMonsterIds.add(raw.monsterId);

    let id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || seenIds.has(id)) id = generateProfileId(ENTRY_ID_PREFIX);
    seenIds.add(id);

    const input: EntityDurationEntryInput = {
      monsterId: raw.monsterId,
      label: typeof raw.label === "string" ? raw.label : "",
      scope: ensureEntityDurationScope(raw.scope),
      ...(raw.durationMs !== undefined ? { durationMs: raw.durationMs } : {}),
      ...(typeof raw.presetKey === "string"
        ? { presetKey: raw.presetKey }
        : {}),
    };
    result.push(buildEntry(id, input));
  }
  return result;
}

/** `durationMs: null` clears the countdown (open-ended row). */
export type EntityDurationEntryPatch = {
  label?: string;
  scope?: EntityDurationScope;
  durationMs?: number | null;
};

export function patchEntityDurationEntry(
  entry: EntityDurationEntry,
  patch: EntityDurationEntryPatch,
): EntityDurationEntry {
  const next: EntityDurationEntryInput = {
    monsterId: entry.monsterId,
    label: patch.label ?? entry.label,
    scope: patch.scope ?? entry.scope,
    ...(entry.presetKey ? { presetKey: entry.presetKey } : {}),
  };
  if (patch.durationMs === undefined) {
    if (entry.durationMs !== undefined) next.durationMs = entry.durationMs;
  } else if (patch.durationMs !== null) {
    next.durationMs = patch.durationMs;
  }
  return buildEntry(entry.id, next);
}

export function moveEntityDurationEntry(
  entries: readonly EntityDurationEntry[],
  id: string,
  direction: "up" | "down",
): EntityDurationEntry[] {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return [...entries];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= entries.length) return [...entries];
  const next = [...entries];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}
