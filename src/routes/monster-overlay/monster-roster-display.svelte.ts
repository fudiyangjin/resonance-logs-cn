/**
 * @file Battle roster panel projection, fed by the monster roster topic.
 *
 * Blocked templates (developer presets still on, plus the player's own)
 * leave the HP rank and the counts; `buildRosterView` keeps the blocked ones
 * that can cast a watched skill as skill-only rows. Watched skill cells only
 * carry timestamps here, so a cast or a cooldown never rebuilds the rows;
 * each cell follows the overlay clock itself.
 */
import type { RosterMonsterState, RosterPlayerState } from "$lib/bindings";
import { resolveMonsterName } from "$lib/config/game-names";
import { lookupMonsterSkillDefaultName } from "$lib/config/monster-skill-search";
import {
  monsterSkillIdsOf,
  monsterSkillTiming,
} from "$lib/config/monster-skill-timing";
import { hudProjectionRevision } from "$lib/hud-temporal.svelte.js";
import { getLocale, t } from "$lib/i18n/index.svelte";
import {
  effectiveRosterBlockedIds,
  ensureRosterBlockedMonsterIds,
  normalizeMonsterRosterOptions,
} from "$lib/monster-roster-settings";
import { abbreviateNumber } from "$lib/number-format";
import { ensureRosterSkillEntries } from "$lib/roster-skill-entries";
import {
  SETTINGS,
  type MonsterRosterOptions,
  type RosterSkillEntry,
} from "$lib/settings-store";
import { getClassConfigs } from "$lib/skill-mappings";
import { liveMonsterRosterStore } from "$lib/stores/live-topics.svelte";
import { reuseIfSame } from "$lib/structural-reuse";
import { getMonsterOverlayVisibility } from "./monster-layout.svelte.js";
import {
  buildRosterView,
  formatRosterPercent,
  rankRoster,
  ROSTER_RESORT_MS,
  rosterRankComparator,
  visibleRosterMonsters,
  type RosterRank,
  type RosterViewModel,
} from "./monster-roster";
import { isMonsterLayoutScaffold } from "./monster-runtime.svelte.js";
import type {
  MonsterRosterDisplay,
  MonsterRosterRow,
  MonsterRosterSkillChip,
} from "./monster-types";

export const MONSTER_ROSTER_DEADLINE_SOURCE = "hud-overlay:monster-roster";

type RosterProjection = {
  roster: MonsterRosterDisplay | null;
  nextDeadlineMs: number | null;
};

// Plain module state, not `$state`: the previous ranking and displays only
// feed the next recomputation (stable order, instance reuse) and must not
// trigger one.
let lastRank: RosterRank | null = null;
let lastRoster: MonsterRosterDisplay | null = null;

const rosterOptions = $derived(
  normalizeMonsterRosterOptions(SETTINGS.monsterMonitor.state.roster),
);

const blockedMonsterIds = $derived(
  effectiveRosterBlockedIds(
    ensureRosterBlockedMonsterIds(
      SETTINGS.monsterMonitor.state.rosterBlockedMonsterIds,
    ),
  ),
);

const skillEntries = $derived(
  ensureRosterSkillEntries(SETTINGS.monsterMonitor.state.rosterSkillEntries),
);
const watchedSkillIds = $derived(skillEntries.map((entry) => entry.skillId));
const skillEntryById = $derived(
  new Map(skillEntries.map((entry) => [entry.skillId, entry])),
);

const classNames = $derived(
  new Map(
    getClassConfigs(getLocale()).map((config) => [
      config.classId,
      config.className,
    ]),
  ),
);

const abbreviationStyle = $derived(
  SETTINGS.live.general.state.abbreviationStyle,
);
const abbreviatedDecimalPlaces = $derived(
  SETTINGS.live.general.state.abbreviatedDecimalPlaces ?? 1,
);

function monsterName(monsterId: number | null): string {
  return monsterId === null
    ? t("monsterOverlay.roster.unknownMonster")
    : resolveMonsterName(monsterId);
}

function playerName(player: RosterPlayerState): string {
  return (
    player.name ||
    (player.professionId === null
      ? undefined
      : classNames.get(player.professionId)) ||
    t("monsterOverlay.roster.otherPlayer")
  );
}

function skillLabel(skillId: number, entry: RosterSkillEntry | undefined) {
  return (
    entry?.label ||
    lookupMonsterSkillDefaultName(skillId, getLocale()) ||
    `#${skillId}`
  );
}

function skillChips(
  monster: RosterMonsterState,
  skillIds: readonly number[],
): MonsterRosterSkillChip[] {
  return skillIds.map((skillId) => {
    const entry = skillEntryById.get(skillId);
    const current = monster.currentCast;
    return {
      skillId,
      label: skillLabel(skillId, entry),
      timing: monsterSkillTiming(skillId),
      customCooldownSeconds: entry?.cooldownSeconds ?? null,
      joinedAtMs: monster.joinedAtMs,
      lastCastAtMs:
        monster.skillCasts.find((cast) => cast.skillId === skillId)?.castAtMs ??
        null,
      currentCastAtMs:
        current && current.skillId === skillId ? current.castAtMs : null,
    };
  });
}

function toRosterDisplay(
  view: RosterViewModel,
  options: MonsterRosterOptions,
): MonsterRosterDisplay {
  const previousRows = new Map(
    (lastRoster?.rows ?? []).map((row) => [row.uuid, row]),
  );
  const rows = view.rows.map((row): MonsterRosterRow => {
    const next: MonsterRosterRow = {
      uuid: row.monster.uuid,
      name: monsterName(row.monster.monsterId),
      kind: row.monster.kind,
      isTarget: row.isTarget,
      ratio: row.ratio,
      percentText: formatRosterPercent(row.ratio),
      hpText: options.showHpValue
        ? abbreviateNumber(
            row.monster.hp,
            abbreviatedDecimalPlaces,
            abbreviationStyle,
          )
        : null,
      distanceText:
        options.showDistance && row.monster.distanceM !== null
          ? `${Math.round(row.monster.distanceM)}m`
          : null,
      looseTargetName: row.looseTarget ? playerName(row.looseTarget) : null,
      skillOnly: row.skillOnly,
      skills: skillChips(row.monster, row.watchedSkillIds),
    };
    return reuseIfSame(previousRows.get(next.uuid), next);
  });
  return {
    count: view.count,
    tankMode: options.tankMode,
    looseCount: view.looseCount,
    looseSummary: view.looseByPlayer
      .map((summary) => `${playerName(summary.player)} ${summary.count}`)
      .join(" · "),
    rows,
    strip: view.strip,
    stripHighestText:
      view.stripHighestRatio === null
        ? null
        : formatRosterPercent(view.stripHighestRatio),
    stripLowestText:
      view.stripLowestRatio === null
        ? null
        : formatRosterPercent(view.stripLowestRatio),
    isPlaceholder: false,
  };
}

/** Preview cells: a cooldown, a sing bar and a ready skill. */
function placeholderChips(nowMs: number): MonsterRosterSkillChip[] {
  const chip = (
    skillId: number,
    overrides: Partial<MonsterRosterSkillChip>,
  ): MonsterRosterSkillChip => ({
    skillId,
    label: t("monsterOverlay.roster.previewSkill"),
    timing: {
      cooldownSeconds: 20,
      battleStart: null,
      singSeconds: 0,
      danger: false,
    },
    customCooldownSeconds: null,
    joinedAtMs: nowMs,
    lastCastAtMs: null,
    currentCastAtMs: null,
    ...overrides,
  });
  return [
    chip(1, { lastCastAtMs: nowMs - 8_000 }),
    chip(2, {
      timing: {
        cooldownSeconds: 20,
        battleStart: null,
        singSeconds: 6,
        danger: true,
      },
      lastCastAtMs: nowMs,
      currentCastAtMs: nowMs,
    }),
    chip(3, {}),
  ];
}

function rosterPlaceholder(
  options: MonsterRosterOptions,
): MonsterRosterDisplay {
  const row = (
    uuid: string,
    kind: MonsterRosterRow["kind"],
    ratio: number,
    isTarget = false,
  ): MonsterRosterRow => ({
    uuid,
    name: t("monsterOverlay.roster.previewMonster"),
    kind,
    isTarget,
    ratio,
    percentText: formatRosterPercent(ratio),
    hpText: options.showHpValue
      ? abbreviateNumber(
          ratio * 10_000_000,
          abbreviatedDecimalPlaces,
          abbreviationStyle,
        )
      : null,
    distanceText: options.showDistance ? "12m" : null,
    looseTargetName: null,
    skillOnly: false,
    skills: [],
  });
  return {
    count: 6,
    tankMode: options.tankMode,
    looseCount: 0,
    looseSummary: "",
    rows: [
      row("preview-target", "normal", 0.58, true),
      {
        ...row("preview-watched", "elite", 0.41),
        skills: placeholderChips(Date.now()),
      },
      row("preview-boss", "boss", 0.76),
      row("preview-normal", "normal", 0.92),
    ],
    strip: [
      { uuid: "preview-strip-1", ratio: 0.7 },
      { uuid: "preview-strip-2", ratio: 0.45 },
      { uuid: "preview-strip-3", ratio: 0.08 },
    ],
    stripHighestText: formatRosterPercent(0.7),
    stripLowestText: formatRosterPercent(0.08),
    isPlaceholder: true,
  };
}

const rosterProjection = $derived.by((): RosterProjection => {
  void hudProjectionRevision(MONSTER_ROSTER_DEADLINE_SOURCE);
  const visibility = getMonsterOverlayVisibility();
  if (!visibility.showRosterPanel) {
    lastRank = null;
    lastRoster = null;
    return { roster: null, nextDeadlineMs: null };
  }

  const options = rosterOptions;
  const scaffold = isMonsterLayoutScaffold();
  const payload = liveMonsterRosterStore.data;
  const monsters = payload?.monsters ?? [];

  const rank = rankRoster(
    lastRank,
    visibleRosterMonsters(payload, blockedMonsterIds),
    Date.now(),
    rosterRankComparator(
      options.notAttackingMeFirst,
      payload?.localUuid ?? null,
    ),
  );
  lastRank = rank;
  const nextDeadlineMs = rank.pending ? rank.sortedAt + ROSTER_RESORT_MS : null;

  const view =
    monsters.length > 0
      ? buildRosterView({
          monsters,
          players: payload?.players ?? [],
          currentTargetUuid: payload?.currentTargetUuid ?? null,
          order: rank.order,
          normalRows: options.normalRows,
          tankMode: options.tankMode,
          blocked: blockedMonsterIds,
          watchedSkillIds,
          skillIdsOf: monsterSkillIdsOf,
        })
      : null;

  let roster: MonsterRosterDisplay | null = null;
  if (view && (view.rows.length > 0 || view.strip.length > 0)) {
    roster = toRosterDisplay(view, options);
  } else if (scaffold) {
    roster = rosterPlaceholder(options);
  }

  lastRoster = roster ? reuseIfSame(lastRoster ?? undefined, roster) : null;
  return { roster: lastRoster, nextDeadlineMs };
});

export function monsterRosterDisplay(): MonsterRosterDisplay | null {
  return rosterProjection.roster;
}

/** When the kept roster order should be re-ranked, if it is stale. */
export function monsterRosterNextDeadlineMs(): number | null {
  return rosterProjection.nextDeadlineMs;
}

/** Forgets the kept ranking, e.g. when the overlay data is cleared. */
export function resetMonsterRosterDisplay(): void {
  lastRank = null;
  lastRoster = null;
}
