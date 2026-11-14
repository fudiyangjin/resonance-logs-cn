/**
 * @file Skill damage rows shown on the HUD.
 *
 * The pull session hands over every changed payload; only hits and casts
 * with an id above the cursor are new. Merge-mode rows are built once on
 * arrival; a continuous group keeps one chain that new hits add to. Rows
 * expire, and a chain turns from running to settled, at deadlines served by
 * the shared HUD deadline scheduler, so nothing ticks while the screen is
 * idle. Rows and chains belong to the profile that built them: copied
 * profiles share group ids, so another profile's are never shown.
 */
import type { LiveSkillDamagePayload } from "$lib/bindings";
import {
  clearHudProjectionDeadline,
  hudProjectionRevision,
  setHudProjectionDeadline,
} from "$lib/hud-temporal.svelte.js";
import {
  advanceContinuousDamage,
  continuousDamageRows,
  type ContinuousDamageChain,
} from "$lib/skill-damage-continuous";
import { activeSkillDamageProfile } from "$lib/skill-damage-profile.svelte";
import {
  buildSkillDamageRows,
  mergeSkillDamageRows,
  type SkillDamageRow,
} from "$lib/skill-damage-groups";
import type { HudSkillDamageFrameHandler } from "$lib/stores/live-window-sessions.svelte";

export const SKILL_DAMAGE_DEADLINE_SOURCE = "hud-overlay:skill-damage";

type Feed = {
  profileId: string | null;
  rows: readonly SkillDamageRow[];
  chains: readonly ContinuousDamageChain[];
};

const EMPTY_FEED: Feed = { profileId: null, rows: [], chains: [] };

/** Highest id consumed; null until the first payload after a reset. */
let cursor: number | null = null;
let feed = $state.raw(EMPTY_FEED);

export const skillDamageFeed: HudSkillDamageFrameHandler = {
  apply(payload: LiveSkillDamagePayload) {
    const latest = Math.max(
      payload.hits.at(-1)?.id ?? 0,
      payload.casts.at(-1)?.id ?? 0,
    );
    if (cursor === null) {
      // A (re)started stream only marks its position; old hits are not replayed.
      cursor = latest;
      return;
    }
    // The backend trims its windows only as new entries arrive, so both are
    // empty only after a scene or player reset. A running cast window has no
    // deadline of its own and must not outlive that.
    if (payload.hits.length === 0 && payload.casts.length === 0) {
      feed = EMPTY_FEED;
      return;
    }
    const since = cursor;
    const hits = payload.hits.filter((hit) => hit.id > since);
    const casts = payload.casts.filter((cast) => cast.id > since);
    cursor = Math.max(cursor, latest);
    const profile = activeSkillDamageProfile();
    if (!profile?.enabled || (hits.length === 0 && casts.length === 0)) return;
    const previous = feed.profileId === profile.id ? feed : EMPTY_FEED;
    const now = Date.now();
    const added = buildSkillDamageRows(hits, profile.groups);
    const chains = advanceContinuousDamage(
      previous.chains,
      hits,
      casts,
      profile.groups,
      now,
    );
    if (added.length === 0 && chains === previous.chains) return;
    feed = {
      profileId: profile.id,
      rows:
        added.length === 0
          ? previous.rows
          : mergeSkillDamageRows(previous.rows, added, profile.groups, now),
      chains,
    };
  },
  reset() {
    cursor = null;
    feed = EMPTY_FEED;
  },
};

const visible = $derived.by(() => {
  void hudProjectionRevision(SKILL_DAMAGE_DEADLINE_SOURCE);
  const profile = activeSkillDamageProfile();
  if (!profile?.enabled || feed.profileId !== profile.id) {
    return { rows: [], nextDeadlineMs: null };
  }
  const now = Date.now();
  // A group switched to continuous mode stops showing the rows it built.
  const mergeGroupIds = new Set(
    profile.groups
      .filter((group) => group.displayMode === "merge")
      .map((group) => group.id),
  );
  const rows = [
    ...feed.rows.filter(
      (row) => row.expiresAtMs > now && mergeGroupIds.has(row.groupId),
    ),
    ...continuousDamageRows(feed.chains, profile.groups, now),
  ];
  // The total of a running cast window never expires (Infinity), which the
  // scheduler treats as no deadline.
  const nextDeadlineMs = rows.reduce(
    (earliest, row) => Math.min(earliest, row.expiresAtMs),
    Number.POSITIVE_INFINITY,
  );
  return { rows, nextDeadlineMs };
});

export function visibleSkillDamageRows(): readonly SkillDamageRow[] {
  return visible.rows;
}

export function syncSkillDamageDeadline(): void {
  setHudProjectionDeadline(
    SKILL_DAMAGE_DEADLINE_SOURCE,
    visible.nextDeadlineMs,
  );
}

export function clearSkillDamageDeadline(): void {
  clearHudProjectionDeadline(SKILL_DAMAGE_DEADLINE_SOURCE);
}
