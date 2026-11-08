/**
 * @file Pure view model of the battle roster panel.
 *
 * The roster never truncates: every visible monster either gets a named row
 * or a mini bar in the folded strip. Named rows, in order:
 * - the local player's target (pinned first);
 * - watched monsters — those that can cast a watched skill — by HP%;
 * - blocked watched monsters as skill-only rows (no HP, not counted), in
 *   the order they joined;
 * - every other boss;
 * - in tank mode every normal or elite monster attacking someone else, plus
 *   the first `normalRows` normal and elite monsters in rank order.
 * Blocked monsters without a watched skill are left out entirely.
 *
 * The rank is HP%, highest first, optionally after putting the monsters
 * attacking someone else first. It is refreshed at most once per
 * `ROSTER_RESORT_MS` so rows do not jump with every hit; a monster that just
 * joined is slotted in right away.
 */
import type {
  LiveMonsterRosterPayload,
  RosterMonsterState,
  RosterPlayerState,
} from "$lib/bindings";
import type { MonsterSkillTiming } from "$lib/config/monster-skill-timing";

export const ROSTER_RESORT_MS = 1_000;
/** How long an instant (non-sing) cast is shown as "just cast". */
export const ROSTER_CAST_FLASH_MS = 1_500;

/** Uuids in rank order (see `rosterRankComparator`) as of `sortedAt`. */
export type RosterRank = {
  order: readonly string[];
  sortedAt: number;
};

export type RosterRankResult = RosterRank & {
  /** The kept order differs from a fresh ranking; re-rank at
   * `sortedAt + ROSTER_RESORT_MS`. */
  pending: boolean;
};

export type RosterRowModel = {
  monster: RosterMonsterState;
  ratio: number;
  isTarget: boolean;
  /** The other player this monster attacks; only set in tank mode. */
  looseTarget: RosterPlayerState | null;
  /** A blocked monster shown only for its watched skills. */
  skillOnly: boolean;
  /** The watched skills this monster can cast, in watch-list order. */
  watchedSkillIds: number[];
};

export type RosterLooseSummary = {
  player: RosterPlayerState;
  count: number;
};

export type RosterViewModel = {
  /** Monsters shown with HP; skill-only rows are not counted. */
  count: number;
  /** Monsters attacking a player other than the local one. */
  looseCount: number;
  looseByPlayer: RosterLooseSummary[];
  rows: RosterRowModel[];
  /** Normal and elite monsters without a named row, in rank order. */
  strip: { uuid: string; ratio: number }[];
  /** Current highest and lowest HP ratio among the strip's monsters. */
  stripHighestRatio: number | null;
  stripLowestRatio: number | null;
};

export type RosterViewInput = {
  /** Every roster monster, blocked ones included. */
  monsters: readonly RosterMonsterState[];
  players: readonly RosterPlayerState[];
  currentTargetUuid: string | null;
  /** Rank of the monsters shown with HP (see `rankRoster`). */
  order: readonly string[];
  normalRows: number;
  tankMode: boolean;
  blocked: ReadonlySet<number>;
  /** Watched skill ids in watch-list order. */
  watchedSkillIds: readonly number[];
  /** Skills a monster template can cast. */
  skillIdsOf: (monsterId: number | null) => readonly number[];
};

export function hpRatio(
  monster: Pick<RosterMonsterState, "hp" | "maxHp">,
): number {
  if (monster.maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, monster.hp / monster.maxHp));
}

export type RosterCompare = (
  left: RosterMonsterState,
  right: RosterMonsterState,
) => number;

function byHpDescending(
  left: RosterMonsterState,
  right: RosterMonsterState,
): number {
  return hpRatio(right) - hpRatio(left) || left.joinedSeq - right.joinedSeq;
}

/**
 * The rank order: HP% highest first. With `notAttackingMeFirst`, monsters
 * whose target is known and is not the local player come before the rest
 * (those attacking the local player or with no known target).
 */
export function rosterRankComparator(
  notAttackingMeFirst: boolean,
  localUuid: string | null,
): RosterCompare {
  if (!notAttackingMeFirst || localUuid === null) return byHpDescending;
  const group = (monster: RosterMonsterState) =>
    monster.targetUuid !== null && monster.targetUuid !== localUuid ? 0 : 1;
  return (left, right) =>
    group(left) - group(right) || byHpDescending(left, right);
}

function isBlocked(
  monster: RosterMonsterState,
  blocked: ReadonlySet<number>,
): boolean {
  return monster.monsterId !== null && blocked.has(monster.monsterId);
}

/** The monsters shown with HP: everything not blocked. */
export function visibleRosterMonsters(
  payload: Pick<LiveMonsterRosterPayload, "monsters"> | null,
  blocked: ReadonlySet<number>,
): RosterMonsterState[] {
  if (!payload) return [];
  if (blocked.size === 0) return payload.monsters;
  return payload.monsters.filter((monster) => !isBlocked(monster, blocked));
}

/**
 * Ranks `monsters` by `compare` (HP% highest first by default). Only a
 * resort, at most once per `resortMs`, sorts the whole roster. In between,
 * payloads keep the previous order: departed monsters are dropped and new
 * ones are inserted before the first kept monster ranked after them.
 */
export function rankRoster(
  previous: RosterRank | null,
  monsters: readonly RosterMonsterState[],
  now: number,
  compare: RosterCompare = byHpDescending,
  resortMs = ROSTER_RESORT_MS,
): RosterRankResult {
  if (
    !previous ||
    now - previous.sortedAt >= resortMs ||
    now < previous.sortedAt
  ) {
    const order = [...monsters].sort(compare).map((monster) => monster.uuid);
    return { order, sortedAt: now, pending: false };
  }

  const byUuid = new Map(monsters.map((monster) => [monster.uuid, monster]));
  const order: RosterMonsterState[] = [];
  for (const uuid of previous.order) {
    const monster = byUuid.get(uuid);
    if (monster) order.push(monster);
  }
  const kept = new Set(order);
  // Usually none or a few: only the newcomers are sorted.
  const joined = monsters.filter((monster) => !kept.has(monster)).sort(compare);
  for (const monster of joined) {
    const index = order.findIndex((other) => compare(monster, other) < 0);
    order.splice(index < 0 ? order.length : index, 0, monster);
  }
  // `compare` is a total order (the join sequence breaks ties), so the kept
  // order matches a fresh sort exactly when every neighbour pair is in order.
  let pending = false;
  for (let index = 1; index < order.length && !pending; index += 1) {
    const before = order[index - 1];
    const after = order[index];
    pending =
      before !== undefined && after !== undefined && compare(before, after) > 0;
  }
  return {
    order: order.map((monster) => monster.uuid),
    sortedAt: previous.sortedAt,
    pending,
  };
}

export function buildRosterView(input: RosterViewInput): RosterViewModel {
  const rankOf = new Map(input.order.map((uuid, index) => [uuid, index]));
  const byRank = (left: RosterMonsterState, right: RosterMonsterState) =>
    (rankOf.get(left.uuid) ?? Number.MAX_SAFE_INTEGER) -
      (rankOf.get(right.uuid) ?? Number.MAX_SAFE_INTEGER) ||
    left.joinedSeq - right.joinedSeq;
  const players = new Map(input.players.map((player) => [player.uuid, player]));
  const looseTargetOf = (monster: RosterMonsterState) =>
    monster.targetUuid === null ? undefined : players.get(monster.targetUuid);
  const watchedSkillsOf = (monster: RosterMonsterState): number[] => {
    if (input.watchedSkillIds.length === 0) return [];
    const known = new Set(input.skillIdsOf(monster.monsterId));
    for (const cast of monster.skillCasts) known.add(cast.skillId);
    return input.watchedSkillIds.filter((skillId) => known.has(skillId));
  };

  const shown: RosterMonsterState[] = [];
  const skillOnly = new Map<RosterMonsterState, number[]>();
  const watched = new Map<RosterMonsterState, number[]>();
  for (const monster of input.monsters) {
    const skills = watchedSkillsOf(monster);
    if (isBlocked(monster, input.blocked)) {
      if (skills.length > 0) skillOnly.set(monster, skills);
      continue;
    }
    shown.push(monster);
    if (skills.length > 0) watched.set(monster, skills);
  }

  const looseCounts = new Map<string, RosterLooseSummary>();
  let looseCount = 0;
  for (const monster of shown) {
    const player = looseTargetOf(monster);
    if (!player) continue;
    looseCount += 1;
    const summary = looseCounts.get(player.uuid);
    if (summary) summary.count += 1;
    else looseCounts.set(player.uuid, { player, count: 1 });
  }

  const row = (monster: RosterMonsterState, isTarget: boolean) => {
    const skillOnlySkills = skillOnly.get(monster);
    return {
      monster,
      ratio: hpRatio(monster),
      isTarget,
      looseTarget:
        input.tankMode && !skillOnlySkills
          ? (looseTargetOf(monster) ?? null)
          : null,
      skillOnly: skillOnlySkills !== undefined,
      watchedSkillIds: skillOnlySkills ?? watched.get(monster) ?? [],
    };
  };

  const target =
    input.currentTargetUuid === null
      ? undefined
      : [...shown, ...skillOnly.keys()].find(
          (monster) => monster.uuid === input.currentTargetUuid,
        );
  const others = shown.filter((monster) => monster !== target).sort(byRank);
  const watchedRows = others.filter((monster) => watched.has(monster));
  const skillOnlyRows = [...skillOnly.keys()]
    .filter((monster) => monster !== target)
    .sort((left, right) => left.joinedSeq - right.joinedSeq);
  const unwatched = others.filter((monster) => !watched.has(monster));
  const bosses = unwatched.filter((monster) => monster.kind === "boss");

  // Elites fold like normal monsters.
  const minions = unwatched.filter((monster) => monster.kind !== "boss");
  const named = new Set<RosterMonsterState>();
  let topLeft = Math.max(0, Math.floor(input.normalRows));
  for (const monster of minions) {
    if (input.tankMode && looseTargetOf(monster)) {
      named.add(monster);
    } else if (topLeft > 0) {
      named.add(monster);
      topLeft -= 1;
    }
  }

  const strip = minions
    .filter((monster) => !named.has(monster))
    .map((monster) => ({ uuid: monster.uuid, ratio: hpRatio(monster) }));
  const stripRatios = strip.map((bar) => bar.ratio);

  return {
    count: shown.length,
    looseCount,
    looseByPlayer: Array.from(looseCounts.values()).sort(
      (left, right) => right.count - left.count,
    ),
    rows: [
      ...(target ? [row(target, true)] : []),
      ...watchedRows.map((monster) => row(monster, false)),
      ...skillOnlyRows.map((monster) => row(monster, false)),
      ...bosses.map((monster) => row(monster, false)),
      ...minions
        .filter((monster) => named.has(monster))
        .map((monster) => row(monster, false)),
    ],
    strip,
    stripHighestRatio: stripRatios.length ? Math.max(...stripRatios) : null,
    stripLowestRatio: stripRatios.length ? Math.min(...stripRatios) : null,
  };
}

/** What a watched skill cell shows at one moment. */
export type RosterSkillPhase =
  /** Sing/guide bar in progress. */
  | { kind: "casting"; startedAtMs: number; endsAtMs: number; danger: boolean }
  /** An instant skill was just cast. */
  | { kind: "cast"; untilMs: number }
  /** Not castable before `readyAtMs` (a lower bound). */
  | { kind: "cooling"; readyAtMs: number }
  /** Cooldown over: may be cast at any moment. */
  | { kind: "ready" }
  /** No cooldown data: only casts are shown. */
  | { kind: "unknown" };

export type RosterSkillPhaseInput = {
  timing: MonsterSkillTiming;
  /** User override of the table cooldown. */
  customCooldownSeconds?: number | undefined;
  /** When the monster joined the roster: its battle start. */
  joinedAtMs: number;
  /** Latest cast of this skill by this monster, if any. */
  lastCastAtMs: number | null;
  /** Start of the cast in progress when it is this skill. */
  currentCastAtMs: number | null;
  nowMs: number;
};

/**
 * Cell state of one watched skill on one monster.
 * - A sing skill being cast shows its bar until the sing time ends or the
 *   cast is cut short (another skill, leaving the skill state).
 * - An instant skill flashes for `ROSTER_CAST_FLASH_MS` after it is cast.
 * - After a cast the cooldown counts from the cast start; before the first
 *   cast, from joining the roster when the table has a battle-start window.
 */
export function rosterSkillPhase(
  input: RosterSkillPhaseInput,
): RosterSkillPhase {
  const { timing, nowMs } = input;
  const singMs = timing.singSeconds * 1000;
  if (input.currentCastAtMs !== null && singMs > 0) {
    const endsAtMs = input.currentCastAtMs + singMs;
    if (nowMs < endsAtMs) {
      return {
        kind: "casting",
        startedAtMs: input.currentCastAtMs,
        endsAtMs,
        danger: timing.danger,
      };
    }
  }
  if (input.lastCastAtMs !== null && singMs === 0) {
    const untilMs = input.lastCastAtMs + ROSTER_CAST_FLASH_MS;
    if (nowMs < untilMs) return { kind: "cast", untilMs };
  }

  const cooldownMs =
    (input.customCooldownSeconds ?? timing.cooldownSeconds) * 1000;
  if (input.lastCastAtMs !== null) {
    if (cooldownMs <= 0) return { kind: "unknown" };
    const readyAtMs = input.lastCastAtMs + cooldownMs;
    return nowMs < readyAtMs
      ? { kind: "cooling", readyAtMs }
      : { kind: "ready" };
  }

  const start = timing.battleStart;
  if (start === "never") return { kind: "unknown" };
  if (start) {
    const readyAtMs = input.joinedAtMs + start[0] * 1000;
    return nowMs < readyAtMs
      ? { kind: "cooling", readyAtMs }
      : { kind: "ready" };
  }
  return cooldownMs > 0 ? { kind: "ready" } : { kind: "unknown" };
}

/** HP% text: one decimal below 10%, never "0" for a living monster. */
export function formatRosterPercent(ratio: number): string {
  const percent = ratio * 100;
  if (percent >= 10) return `${Math.floor(percent)}%`;
  if (percent <= 0) return "0%";
  return `${Math.max(0.1, Math.floor(percent * 10) / 10).toFixed(1)}%`;
}

/** Countdown text of a skill cell: whole seconds from 3 s up, one decimal
 * below. */
export function formatSkillSeconds(remainingMs: number): string {
  const seconds = Math.max(0, remainingMs) / 1000;
  return seconds >= 3 ? `${Math.ceil(seconds)}s` : seconds.toFixed(1);
}
