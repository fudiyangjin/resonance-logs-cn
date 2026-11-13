import { castPresetSkillIds } from "./skill-damage-cast-presets";
import type { SkillDamageCastState, SkillDamageHitState } from "./bindings";
import type { SkillDamageGroup } from "./skill-damage-settings";
import type { SkillDamageRow } from "./skill-damage-groups";

export type ContinuousDamageChain = {
  castSkillId?: number | undefined;
  groupId: string;
  key: string;
  skillId: number;
  amount: string;
  comboCount: string;
  targets: string[];
  startedAtMs: number;
  deadlineMs: number;
  finalExpiresAtMs: number;
};
export type ContinuousDamageRow = SkillDamageRow & {
  comboCount: string;
  phase: "active" | "final";
};

/** Cast windows end only on lifecycle events; timed windows refresh on opening. */
export function advanceContinuousDamage(
  existing: readonly ContinuousDamageChain[],
  hits: readonly SkillDamageHitState[],
  groups: readonly SkillDamageGroup[],
  nowMs: number,
  casts: readonly SkillDamageCastState[] = [],
): ContinuousDamageChain[] {
  return groups.flatMap((group) => {
    if (!group.enabled || group.displayMode !== "continuous") return [];
    const watched = new Set(group.entries.map((entry) => entry.skillId));
    let chain = existing.find((entry) => entry.groupId === group.id);
    const mode = group.continuousWindowMode;
    const presetIds = new Set(castPresetSkillIds(group));
    const ordered = [
      ...hits.map((hit) => ({ kind: "hit" as const, ...hit })),
      ...(mode === "cast"
        ? casts.map((cast) => ({ kind: "cast" as const, ...cast }))
        : []),
    ].sort((a, b) => {
      if (a.kind === "hit" && b.kind === "hit" && mode === "rolling") {
        return (
          a.occurredAtMs - b.occurredAtMs ||
          a.batch - b.batch ||
          Number(group.allSelfDamage || watched.has(b.skillId)) -
            Number(group.allSelfDamage || watched.has(a.skillId)) ||
          a.id - b.id
        );
      }
      return a.occurredAtMs - b.occurredAtMs || a.id - b.id;
    });
    for (const event of ordered) {
      const time = event.occurredAtMs;
      const active = chain && time < chain.deadlineMs;
      const watchedHit =
        event.kind === "hit" &&
        (group.allSelfDamage || watched.has(event.skillId));
      const castMatches = event.kind === "cast" && presetIds.has(event.skillId);
      const opening =
        mode === "rolling"
          ? watchedHit
          : mode === "skills"
            ? event.kind === "hit" &&
              (group.continuousStartSkillIds.length
                ? group.continuousStartSkillIds.includes(event.skillId)
                : watchedHit)
            : castMatches &&
              (event.phase === "start" || event.phase === "durationStart");
      if (!active) {
        if (!opening) continue;
        const windowMs =
          mode === "rolling"
            ? group.continuousWindowMs
            : mode === "cast"
              ? Number.POSITIVE_INFINITY
              : group.continuousTimeoutMs;
        chain = {
          groupId: group.id,
          key: `${group.id}:chain:${event.id}`,
          skillId:
            event.kind === "hit"
              ? event.skillId
              : (group.entries[0]?.skillId ?? event.skillId),
          castSkillId: event.kind === "cast" ? event.skillId : undefined,
          amount: "0",
          comboCount: "0",
          targets: [],
          startedAtMs: time,
          deadlineMs: time + windowMs,
          finalExpiresAtMs: time + windowMs + group.durationMs,
        };
      }
      if (!chain) continue;
      if (opening && mode !== "rolling") {
        const deadlineMs =
          mode === "cast"
            ? Number.POSITIVE_INFINITY
            : time + group.continuousTimeoutMs;
        chain = {
          ...chain,
          castSkillId:
            event.kind === "cast" ? event.skillId : chain.castSkillId,
          deadlineMs,
          finalExpiresAtMs: deadlineMs + group.durationMs,
        };
      }
      if (event.kind === "hit" && (watchedHit || group.continuousAllDamage)) {
        const deadlineMs =
          mode === "rolling" && watchedHit
            ? time + group.continuousWindowMs
            : chain.deadlineMs;
        chain = {
          ...chain,
          amount: (BigInt(chain.amount) + BigInt(event.amount)).toString(),
          comboCount: (BigInt(chain.comboCount) + 1n).toString(),
          targets: [...new Set([...chain.targets, event.targetUuid])],
          deadlineMs,
          finalExpiresAtMs: deadlineMs + group.durationMs,
        };
      }
      const closing =
        mode === "skills"
          ? event.kind === "hit" &&
            group.continuousEndSkillIds.includes(event.skillId)
          : mode === "cast" &&
            event.kind === "cast" &&
            event.skillId === chain.castSkillId &&
            (event.phase === "complete" || event.phase === "end");
      // Duration-end and completion can both describe the same ending.
      // Schedule once, rather than extending the delay on the second event.
      if (closing && (mode !== "cast" || !Number.isFinite(chain.deadlineMs))) {
        const deadlineMs =
          time + (mode === "cast" ? group.continuousCastCloseDelayMs : 0);
        chain = {
          ...chain,
          deadlineMs,
          finalExpiresAtMs: deadlineMs + group.durationMs,
        };
      }
    }
    return chain && chain.finalExpiresAtMs > nowMs ? [chain] : [];
  });
}

export function continuousDamageRows(
  chains: readonly ContinuousDamageChain[],
  groups: readonly SkillDamageGroup[],
  nowMs: number,
): ContinuousDamageRow[] {
  return chains.flatMap((chain) => {
    const group = groups.find((entry) => entry.id === chain.groupId);
    if (
      !group?.enabled ||
      group.displayMode !== "continuous" ||
      chain.comboCount === "0" ||
      chain.finalExpiresAtMs <= nowMs
    )
      return [];
    const phase = nowMs < chain.deadlineMs ? "active" : "final";
    return [
      {
        key: `${chain.key}:${phase}`,
        groupId: chain.groupId,
        skillId: chain.skillId,
        amount: chain.amount,
        hitCount: chain.targets.length,
        merged: true,
        occurredAtMs: phase === "active" ? chain.startedAtMs : chain.deadlineMs,
        expiresAtMs:
          phase === "active" ? chain.deadlineMs : chain.finalExpiresAtMs,
        comboCount: chain.comboCount,
        phase,
      },
    ];
  });
}
