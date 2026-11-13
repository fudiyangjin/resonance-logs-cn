/**
 * @file Skill damage rows shown on the HUD.
 *
 * The pull session hands over every changed payload; only hits with an id
 * above the cursor are new. Merge-mode rows are built once; continuous totals
 * update on fresh hits and transition to final totals at the window deadline.
 * Both use the shared HUD deadline scheduler, with no idle frame timer.
 * Rows belong to the profile that built them:
 * copied profiles share group ids, so another profile's rows are never shown.
 */
import {
  advanceContinuousDamage,
  continuousDamageRows,
  type ContinuousDamageChain,
} from "$lib/skill-damage-continuous";
import { untrack } from "svelte";
import type { LiveSkillDamagePayload } from "$lib/bindings";
import {
  clearHudProjectionDeadline,
  hudProjectionRevision,
  setHudProjectionDeadline,
} from "$lib/hud-temporal.svelte.js";
import { activeSkillDamageProfile } from "$lib/skill-damage-profile.svelte";
import {
  buildSkillDamageRows,
  mergeSkillDamageRows,
  type SkillDamageRow,
} from "$lib/skill-damage-groups";
import type { HudSkillDamageFrameHandler } from "$lib/stores/live-window-sessions.svelte";

export const SKILL_DAMAGE_DEADLINE_SOURCE = "hud-overlay:skill-damage";

/** Highest hit id consumed; null until the first payload after a reset. */
let cursor: number | null = null;
let feed = $state.raw<{
  profileId: string | null;
  rows: SkillDamageRow[];
  chains: ContinuousDamageChain[];
}>({
  profileId: null,
  rows: [],
  chains: [],
});

export const skillDamageFeed: HudSkillDamageFrameHandler = {
  apply(payload: LiveSkillDamagePayload) {
    const latest = Math.max(
      payload.hits.at(-1)?.id ?? 0,
      payload.casts?.at(-1)?.id ?? 0,
    );
    if (cursor === null) {
      // A (re)started stream only marks its position; old hits are not replayed.
      cursor = latest;
      return;
    }
    // Empty windows are emitted on scene/player resets, not ordinary expiry.
    if (payload.hits.length === 0 && !payload.casts?.length) {
      feed = { profileId: null, rows: [], chains: [] };
      return;
    }
    const since = cursor;
    const fresh = payload.hits.filter((hit) => hit.id > since);
    const casts = payload.casts?.filter((cast) => cast.id > since) ?? [];
    cursor = Math.max(cursor, latest);
    const profile = activeSkillDamageProfile();
    if (!profile?.enabled || (fresh.length === 0 && casts.length === 0)) return;
    const added = buildSkillDamageRows(fresh, profile.groups);
    const kept = feed.profileId === profile.id ? feed.rows : [];
    feed = {
      profileId: profile.id,
      rows: mergeSkillDamageRows(kept, added, profile.groups, Date.now()),
      chains: advanceContinuousDamage(
        feed.profileId === profile.id ? feed.chains : [],
        fresh,
        profile.groups,
        Date.now(),
        casts,
      ),
    };
  },
  reset() {
    cursor = null;
    feed = { profileId: null, rows: [], chains: [] };
  },
};

const visible = $derived.by(() => {
  void hudProjectionRevision(SKILL_DAMAGE_DEADLINE_SOURCE);
  const profile = activeSkillDamageProfile();
  const now = Date.now();
  const current = profile?.enabled && feed.profileId === profile.id;
  const live: (SkillDamageRow & {
    comboCount?: string;
    phase?: "active" | "final";
  })[] = current
    ? [
        ...feed.rows.filter(
          (row) =>
            row.expiresAtMs > now &&
            profile.groups.some(
              (group) =>
                group.id === row.groupId &&
                group.enabled &&
                group.displayMode !== "continuous",
            ),
        ),
        ...continuousDamageRows(feed.chains, profile.groups, now),
      ]
    : [];
  let nextDeadlineMs: number | null = null;
  for (const row of live) {
    if (
      Number.isFinite(row.expiresAtMs) &&
      (nextDeadlineMs === null || row.expiresAtMs < nextDeadlineMs)
    ) {
      nextDeadlineMs = row.expiresAtMs;
    }
  }
  // Timed windows may open before their first counted hit; casts have no deadline.
  if (current)
    for (const chain of feed.chains) {
      if (
        !profile.groups.some(
          (group) =>
            group.id === chain.groupId &&
            group.enabled &&
            group.displayMode === "continuous",
        )
      )
        continue;
      const deadline =
        now < chain.deadlineMs ? chain.deadlineMs : chain.finalExpiresAtMs;
      if (
        Number.isFinite(deadline) &&
        deadline > now &&
        (nextDeadlineMs === null || deadline < nextDeadlineMs)
      )
        nextDeadlineMs = deadline;
    }
  return { rows: live, nextDeadlineMs };
});

export function visibleSkillDamageRows() {
  return visible.rows;
}

export function syncSkillDamageDeadline(): void {
  const profile = activeSkillDamageProfile();
  const current = untrack(() => feed);
  const groups =
    profile?.enabled && current.profileId === profile.id ? profile.groups : [];
  const now = Date.now();
  const rows = current.rows.filter(
    (row) =>
      row.expiresAtMs > now &&
      groups.some(
        (group) =>
          group.id === row.groupId &&
          group.enabled &&
          group.displayMode !== "continuous",
      ),
  );
  const chains = current.chains.filter(
    (chain) =>
      chain.finalExpiresAtMs > now &&
      groups.some(
        (group) =>
          group.id === chain.groupId &&
          group.enabled &&
          group.displayMode === "continuous",
      ),
  );
  if (
    rows.length !== current.rows.length ||
    chains.length !== current.chains.length
  ) {
    feed = { ...current, rows, chains };
  }
  setHudProjectionDeadline(
    SKILL_DAMAGE_DEADLINE_SOURCE,
    visible.nextDeadlineMs,
  );
}

export function clearSkillDamageDeadline(): void {
  clearHudProjectionDeadline(SKILL_DAMAGE_DEADLINE_SOURCE);
}
