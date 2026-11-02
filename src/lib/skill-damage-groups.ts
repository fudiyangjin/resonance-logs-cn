import {
  defaultSkillDamageDisplay,
  deepCloneSettings,
  type SkillDamageDisplaySettings,
  type SkillDamageGroup,
  type SkillDamageNumberStyle,
  type SkillDamagePaint,
} from "./settings-store";
import {
  largestSimultaneousSkillHits,
  skillDamageDurationMs,
  sumSimultaneousSkillHits,
  withSkillDamageTargetCounts,
} from "./skill-damage-display";
import type { SkillDamageHitState } from "./bindings";

export function damagePaint(color: string): SkillDamagePaint {
  return { mode: "solid", color, endColor: color, angle: 90 };
}
export function defaultDamageNumberStyle(
  color = "#ffd86b",
): SkillDamageNumberStyle {
  return {
    italic: false,
    fill: damagePaint(color),
    innerGlow: false,
    innerGlowSize: 3,
    innerGlowColor: damagePaint("#ffffff"),
    outline: false,
    outlineWidth: 1,
    outlineColor: damagePaint("#000000"),
    outerGlow: false,
    outerGlowSize: 6,
    outerGlowColor: damagePaint("#ffbb33"),
    shadow: true,
    shadowSize: 3,
    shadowColor: damagePaint("#000000"),
  };
}
export function createSkillDamageGroup(
  name: string,
  source: SkillDamageDisplaySettings = defaultSkillDamageDisplay(),
): SkillDamageGroup {
  const { groups: _groups, ...settings } = source;
  void _groups;
  return {
    ...deepCloneSettings(settings),
    enabled: true,
    id: crypto.randomUUID(),
    name,
    mergeSimultaneous: false,
    maxVisible: 8,
    numberStyle: deepCloneSettings(
      source.numberStyle ?? defaultDamageNumberStyle(source.fontColor),
    ),
  };
}
/** Missing groups is the legacy flat configuration; an empty array is intentional. */
export function skillDamageGroups(
  config: SkillDamageDisplaySettings,
): SkillDamageGroup[] {
  if (config.groups) return config.groups;
  const { groups: _groups, ...settings } = config;
  void _groups;
  return [
    {
      ...settings,
      enabled: true,
      id: "legacy",
      name: "",
      mergeSimultaneous: false,
      maxVisible: 8,
    },
  ];
}
function newestGroupRows<T extends { occurredAtMs: number }>(
  rows: T[],
  limit: number | undefined,
): T[] {
  const count =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.max(1, Math.min(8, Math.floor(limit)))
      : 8;
  return rows.sort((a, b) => a.occurredAtMs - b.occurredAtMs).slice(-count);
}

export function groupSkillDamageRows(
  hits: readonly SkillDamageHitState[],
  config: SkillDamageDisplaySettings,
  now: number,
) {
  if (!config.enabled) return [];
  return skillDamageGroups(config)
    .filter((group) => group.enabled)
    .flatMap((group) => {
      const selected = hits.filter(
        (hit) =>
          now >= hit.occurredAtMs &&
          now - hit.occurredAtMs < skillDamageDurationMs(group.durationMs) &&
          group.entries.some((entry) => entry.skillId === hit.skillId),
      );
      if (group.mergeSimultaneous) {
        const batches = new Map<string, SkillDamageHitState[]>();
        for (const hit of selected) {
          const key = hit.batchId || String(hit.occurredAtMs);
          const batch = batches.get(key) ?? [];
          batch.push(hit);
          batches.set(key, batch);
        }
        return newestGroupRows(
          [...batches.values()].map((batch) => ({
            ...batch[0]!,
            amount: batch
              .reduce((sum, hit) => sum + BigInt(hit.amount), 0n)
              .toString(),
            hitCount: Math.max(
              1,
              new Set(batch.map((hit) => hit.targetUuid).filter(Boolean)).size,
            ),
            key: `${group.id}:${batch[0]!.id}`,
            group,
            merged: true,
          })),
          group.maxVisible,
        );
      }
      const counted = withSkillDamageTargetCounts(selected);
      return newestGroupRows(
        (group.mergeHits
          ? sumSimultaneousSkillHits(counted)
          : largestSimultaneousSkillHits(counted)
        ).map((hit) => ({
          ...hit,
          key: `${group.id}:${hit.id}`,
          group,
          merged: false,
        })),
        group.maxVisible,
      );
    })
    .sort((a, b) => a.occurredAtMs - b.occurredAtMs);
}
