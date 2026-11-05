/**
 * @file Turns newly arrived skill damage hits into display rows.
 *
 * Rows are built once, when their hits arrive, and carry their own expiry.
 * Later setting changes (duration, watched skills) therefore only affect new
 * hits; a hit can never reappear because a filter was loosened. Labels and
 * styles are read from the group at render time, so they stay live.
 */
import type { SkillDamageHitState } from "./bindings";
import {
  largestSimultaneousSkillHits,
  sumSimultaneousSkillHits,
  withSkillDamageTargetCounts,
} from "./skill-damage-display";
import type { SkillDamageGroup } from "./skill-damage-settings";

export type SkillDamageRow = {
  /** Unique per group and hit; stable for keyed rendering. */
  key: string;
  groupId: string;
  skillId: number;
  amount: string;
  /** Distinct targets the row's hits landed on. */
  hitCount: number;
  /** A group-wide batch sum, labelled with the group name. */
  merged: boolean;
  occurredAtMs: number;
  expiresAtMs: number;
};

/** Rows for hits not seen before, in arrival order, across enabled groups. */
export function buildSkillDamageRows(
  hits: readonly SkillDamageHitState[],
  groups: readonly SkillDamageGroup[],
): SkillDamageRow[] {
  return groups.flatMap((group) => {
    if (!group.enabled) return [];
    const watched = new Set(group.entries.map((entry) => entry.skillId));
    const selected = hits.filter((hit) => watched.has(hit.skillId));
    if (selected.length === 0) return [];
    const row = (
      hit: SkillDamageHitState,
      amount: string,
      hitCount: number,
      merged: boolean,
    ): SkillDamageRow => ({
      key: `${group.id}:${hit.id}`,
      groupId: group.id,
      skillId: hit.skillId,
      amount,
      hitCount,
      merged,
      occurredAtMs: hit.occurredAtMs,
      expiresAtMs: hit.occurredAtMs + group.durationMs,
    });
    if (group.mergeSimultaneous) {
      return mergeBatches(selected).map((batch) =>
        row(
          batch[0]!,
          batch.reduce((sum, hit) => sum + BigInt(hit.amount), 0n).toString(),
          new Set(batch.map((hit) => hit.targetUuid)).size,
          true,
        ),
      );
    }
    const counted = withSkillDamageTargetCounts(selected);
    const reduced = group.mergeHits
      ? sumSimultaneousSkillHits(counted)
      : largestSimultaneousSkillHits(counted);
    return reduced.map((hit) => row(hit, hit.amount, hit.hitCount, false));
  });
}

/**
 * Appends new rows, then drops expired rows, rows of removed or disabled
 * groups, and each group's oldest rows beyond its `maxVisible`.
 */
export function mergeSkillDamageRows(
  existing: readonly SkillDamageRow[],
  added: readonly SkillDamageRow[],
  groups: readonly SkillDamageGroup[],
  nowMs: number,
): SkillDamageRow[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const kept: SkillDamageRow[] = [];
  const counts = new Map<string, number>();
  const all = [...existing, ...added];
  for (let index = all.length - 1; index >= 0; index -= 1) {
    const row = all[index]!;
    const group = groupById.get(row.groupId);
    if (!group?.enabled || row.expiresAtMs <= nowMs) continue;
    const count = counts.get(row.groupId) ?? 0;
    if (count >= group.maxVisible) continue;
    counts.set(row.groupId, count + 1);
    kept.push(row);
  }
  return kept.reverse();
}

function mergeBatches(
  hits: readonly SkillDamageHitState[],
): SkillDamageHitState[][] {
  const batches = new Map<number, SkillDamageHitState[]>();
  for (const hit of hits) {
    const batch = batches.get(hit.batch);
    if (batch) batch.push(hit);
    else batches.set(hit.batch, [hit]);
  }
  return [...batches.values()];
}
