import type { SkillDamageFormat } from "./skill-damage-settings";

type BatchHit = { skillId: number; batch: number };

/** New hits enter below for upward scrolling and above for downward scrolling. */
export function orderSkillDamageRows<T>(
  rows: readonly T[],
  direction: "up" | "down",
): T[] {
  return direction === "down" ? [...rows].reverse() : [...rows];
}

const batchSkillKey = (hit: BatchHit) => `${hit.batch}:${hit.skillId}`;

/** Count distinct targets per skill/batch; repeated hits on one target count once. */
export function withSkillDamageTargetCounts<
  T extends BatchHit & { targetUuid: string },
>(hits: readonly T[]): (T & { hitCount: number })[] {
  const targets = new Map<string, Set<string>>();
  for (const hit of hits) {
    const key = batchSkillKey(hit);
    let ids = targets.get(key);
    if (!ids) targets.set(key, (ids = new Set()));
    ids.add(hit.targetUuid);
  }
  return hits.map((hit) => ({
    ...hit,
    hitCount: targets.get(batchSkillKey(hit))!.size,
  }));
}

/** Sum the same skill within one batch, keeping each skill's own label. */
export function sumSimultaneousSkillHits<
  T extends BatchHit & { amount: string },
>(hits: readonly T[]): T[] {
  const totals = new Map<string, T>();
  for (const hit of hits) {
    const key = batchSkillKey(hit);
    const previous = totals.get(key);
    totals.set(
      key,
      previous
        ? {
            ...previous,
            amount: (BigInt(previous.amount) + BigInt(hit.amount)).toString(),
          }
        : { ...hit },
    );
  }
  return [...totals.values()];
}

/** Call after filtering watched skills, so unmonitored damage cannot hide them. */
export function largestSimultaneousSkillHits<
  T extends { batch: number; amount: string },
>(hits: readonly T[]): T[] {
  const largest = new Map<number, T>();
  for (const hit of hits) {
    const previous = largest.get(hit.batch);
    if (!previous || BigInt(hit.amount) > BigInt(previous.amount)) {
      largest.set(hit.batch, hit);
    }
  }
  return [...largest.values()];
}

export function formatSkillDamage(
  amount: string,
  format: SkillDamageFormat,
): string {
  const value = BigInt(amount);
  if (format === "integer") return value.toString();
  if (format === "grouped") return value.toLocaleString("en-US");
  const units: [bigint, string][] =
    format === "cn"
      ? [
          [100000000n, "亿"],
          [10000n, "万"],
        ]
      : [
          [1000000000n, "B"],
          [1000000n, "M"],
          [1000n, "K"],
        ];
  for (const [divisor, suffix] of units) {
    if (value >= divisor) {
      const tenths = (value * 10n + divisor / 2n) / divisor;
      return `${tenths / 10n}.${tenths % 10n}${suffix}`;
    }
  }
  return value.toString();
}
