/**
 * @file Continuous display mode: one running damage total per group.
 *
 * A group holds at most one chain: the window it is counting, or the settled
 * total it is still showing. Windows are driven by event time alone, so a
 * late payload is counted exactly as a punctual one; wall-clock time only
 * decides which phase is shown and when a settled total leaves.
 */
import type { SkillDamageCastState, SkillDamageHitState } from "./bindings";
import type { SkillDamageRow } from "./skill-damage-groups";
import {
  skillDamageCastPresetSkillId,
  type SkillDamageGroup,
} from "./skill-damage-settings";

export type ContinuousDamageChain = {
  groupId: string;
  /** Unique per window; stable while it counts. */
  key: string;
  /** Names the row when it is not labelled with the group name. */
  skillId: number;
  /** The cast that opened a `cast` window; only its own end settles it. */
  castSkillId: number | null;
  /** Exact decimal total. */
  amount: string;
  comboCount: number;
  startedAtMs: number;
  /**
   * The window counts events before this time and is settled from it on.
   * Infinity while a cast is still running.
   */
  deadlineMs: number;
};

type WindowEvent =
  | { id: number; atMs: number; hit: SkillDamageHitState; cast?: undefined }
  | { id: number; atMs: number; hit?: undefined; cast: SkillDamageCastState };

/**
 * Feeds newly arrived hits and casts to every continuous group's window and
 * drops totals that finished showing. Returns `existing` itself when nothing
 * changed, so callers can skip the update.
 */
export function advanceContinuousDamage(
  existing: readonly ContinuousDamageChain[],
  hits: readonly SkillDamageHitState[],
  casts: readonly SkillDamageCastState[],
  groups: readonly SkillDamageGroup[],
  nowMs: number,
): readonly ContinuousDamageChain[] {
  const events = arrivalOrder(hits, casts);
  const next: ContinuousDamageChain[] = [];
  for (const group of groups) {
    if (!group.enabled || group.displayMode !== "continuous") continue;
    const chain = advanceGroup(
      existing.find((entry) => entry.groupId === group.id),
      events,
      group,
      nowMs,
    );
    if (chain) next.push(chain);
  }
  const unchanged =
    next.length === existing.length &&
    next.every((chain, index) => chain === existing[index]);
  return unchanged ? existing : next;
}

/** The single row each counted chain shows: its running or settled total. */
export function continuousDamageRows(
  chains: readonly ContinuousDamageChain[],
  groups: readonly SkillDamageGroup[],
  nowMs: number,
): SkillDamageRow[] {
  return chains.flatMap((chain): SkillDamageRow[] => {
    const group = groups.find((entry) => entry.id === chain.groupId);
    if (
      !group?.enabled ||
      group.displayMode !== "continuous" ||
      // A window can open before anything it counts has landed.
      chain.comboCount === 0
    ) {
      return [];
    }
    const leavesAtMs = chain.deadlineMs + group.durationMs;
    if (leavesAtMs <= nowMs) return [];
    const phase = nowMs < chain.deadlineMs ? "active" : "final";
    return [
      {
        key: `${chain.key}:${phase}`,
        groupId: chain.groupId,
        skillId: chain.skillId,
        amount: chain.amount,
        hitCount: 1,
        merged: true,
        occurredAtMs: phase === "active" ? chain.startedAtMs : chain.deadlineMs,
        expiresAtMs: phase === "active" ? chain.deadlineMs : leavesAtMs,
        comboCount: chain.comboCount,
        phase,
      },
    ];
  });
}

function advanceGroup(
  previous: ContinuousDamageChain | undefined,
  arrivals: readonly WindowEvent[],
  group: SkillDamageGroup,
  nowMs: number,
): ContinuousDamageChain | undefined {
  const mode = group.continuousWindowMode;
  const listed = new Set(group.entries.map((entry) => entry.skillId));
  const isGroupHit = (hit: SkillDamageHitState) =>
    group.allSelfDamage || listed.has(hit.skillId);
  const presetSkillId = skillDamageCastPresetSkillId(group);
  // Other own damage only counts inside an open window, yet one batch may
  // list it ahead of the group hit that opens the window.
  const events =
    mode === "rolling" && group.continuousAllDamage && !group.allSelfDamage
      ? groupHitsFirstInBatch(arrivals, isGroupHit)
      : arrivals;

  let total = previous ? BigInt(previous.amount) : 0n;
  let chain = previous && { ...previous };
  let touched = false;
  for (const event of events) {
    const { hit, cast, atMs } = event;
    const groupHit = hit !== undefined && isGroupHit(hit);
    const opening =
      mode === "rolling"
        ? groupHit
        : mode === "skills"
          ? hit !== undefined &&
            (group.continuousStartSkillIds.length > 0
              ? group.continuousStartSkillIds.includes(hit.skillId)
              : groupHit)
          : cast !== undefined &&
            cast.skillId === presetSkillId &&
            (cast.phase === "start" || cast.phase === "durationStart");

    if (!chain || atMs >= chain.deadlineMs) {
      if (!opening) continue;
      total = 0n;
      chain = {
        groupId: group.id,
        key: `${group.id}:chain:${event.id}`,
        skillId: hit?.skillId ?? group.entries[0]?.skillId ?? presetSkillId,
        castSkillId: null,
        amount: "0",
        comboCount: 0,
        startedAtMs: atMs,
        deadlineMs: atMs,
      };
    }
    if (opening) {
      // Opening an open window extends it, and revives a cast window that
      // was already closing.
      chain.deadlineMs =
        mode === "rolling"
          ? atMs + group.continuousWindowMs
          : mode === "skills"
            ? atMs + group.continuousTimeoutMs
            : Number.POSITIVE_INFINITY;
      if (cast) chain.castSkillId = cast.skillId;
      touched = true;
    }
    if (hit && (groupHit || group.continuousAllDamage)) {
      total += BigInt(hit.amount);
      chain.comboCount += 1;
      touched = true;
    }
    if (mode === "skills") {
      if (hit && group.continuousEndSkillIds.includes(hit.skillId)) {
        chain.deadlineMs = atMs;
        touched = true;
      }
    } else if (
      mode === "cast" &&
      cast?.skillId === chain.castSkillId &&
      (cast.phase === "end" || cast.phase === "complete") &&
      // A cast reports both its duration end and its completion; only the
      // first starts the closing delay.
      chain.deadlineMs === Number.POSITIVE_INFINITY
    ) {
      chain.deadlineMs = atMs + group.continuousCastCloseDelayMs;
      touched = true;
    }
  }

  if (!chain || chain.deadlineMs + group.durationMs <= nowMs) return undefined;
  if (!touched) return previous;
  chain.amount = total.toString();
  return chain;
}

/** Hits and casts share one id sequence, which breaks ties in time. */
function arrivalOrder(
  hits: readonly SkillDamageHitState[],
  casts: readonly SkillDamageCastState[],
): WindowEvent[] {
  const events: WindowEvent[] = [
    ...hits.map((hit) => ({ id: hit.id, atMs: hit.occurredAtMs, hit })),
    ...casts.map((cast) => ({ id: cast.id, atMs: cast.occurredAtMs, cast })),
  ];
  return events.sort((a, b) => a.atMs - b.atMs || a.id - b.id);
}

function groupHitsFirstInBatch(
  events: readonly WindowEvent[],
  isGroupHit: (hit: SkillDamageHitState) => boolean,
): WindowEvent[] {
  return events
    .flatMap((event) => (event.hit ? [event] : []))
    .sort(
      (a, b) =>
        a.atMs - b.atMs ||
        a.hit.batch - b.hit.batch ||
        Number(isGroupHit(b.hit)) - Number(isGroupHit(a.hit)) ||
        a.id - b.id,
    );
}
