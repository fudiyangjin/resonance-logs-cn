import type { SkillDamageDisplaySettings } from "./settings-store";

/** New hits enter below for upward scrolling and above for downward scrolling. */
export function orderSkillDamageRows<T>(
  rows: readonly T[],
  direction: "up" | "down" | undefined,
): T[] {
  return direction === "down" ? [...rows].reverse() : [...rows];
}

export function skillDamageDurationMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(100, Math.min(60000, Math.round(value)))
    : 2500;
}

/** Count distinct targets per skill/batch; repeated hits on one target count once. */
export function withSkillDamageTargetCounts<
  T extends {
    skillId: number;
    occurredAtMs: number;
    batchId?: string;
    targetUuid?: string;
  },
>(hits: readonly T[]): (T & { hitCount: number })[] {
  const keyOf = (hit: T) =>
    `${hit.batchId ? `batch:${hit.batchId}` : `time:${hit.occurredAtMs}`}:skill:${hit.skillId}`;
  const targets = new Map<string, Set<string>>();
  for (const hit of hits) {
    const key = keyOf(hit);
    let ids = targets.get(key);
    if (!ids) targets.set(key, (ids = new Set()));
    if (hit.targetUuid) ids.add(hit.targetUuid);
  }
  return hits.map((hit) => ({
    ...hit,
    hitCount: Math.max(1, targets.get(keyOf(hit))!.size),
  }));
}

/** Sum the same watched skill within one batch, keeping each skill's own label. */
export function sumSimultaneousSkillHits<
  T extends {
    amount: string;
    skillId: number;
    occurredAtMs: number;
    batchId?: string;
  },
>(hits: readonly T[]): T[] {
  const totals = new Map<string, T>();
  for (const hit of hits) {
    const batch = hit.batchId
      ? `batch:${hit.batchId}`
      : `time:${hit.occurredAtMs}`;
    const key = `${batch}:skill:${hit.skillId}`;
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
  T extends { amount: string; occurredAtMs: number; batchId?: string },
>(hits: readonly T[]): T[] {
  const largest = new Map<string, T>();
  for (const hit of hits) {
    const key = hit.batchId
      ? `batch:${hit.batchId}`
      : `time:${hit.occurredAtMs}`;
    const previous = largest.get(key);
    if (!previous || BigInt(hit.amount) > BigInt(previous.amount)) {
      largest.set(key, hit);
    }
  }
  return [...largest.values()];
}

export function formatSkillDamage(
  amount: string,
  format: SkillDamageDisplaySettings["format"],
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
