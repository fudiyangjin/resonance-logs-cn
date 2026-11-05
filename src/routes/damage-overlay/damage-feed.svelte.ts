/**
 * @file Skill damage rows shown on the HUD.
 *
 * The pull session hands over every changed payload; only hits with an id
 * above the cursor are new. Rows are built once on arrival and expire at
 * their own deadline through the shared HUD deadline scheduler, so nothing
 * ticks while the screen is idle. Rows belong to the profile that built them:
 * copied profiles share group ids, so another profile's rows are never shown.
 */
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
let feed = $state.raw<{ profileId: string | null; rows: SkillDamageRow[] }>({
  profileId: null,
  rows: [],
});

export const skillDamageFeed: HudSkillDamageFrameHandler = {
  apply(payload: LiveSkillDamagePayload) {
    const latest = payload.hits.at(-1)?.id ?? 0;
    if (cursor === null) {
      // A (re)started stream only marks its position; old hits are not replayed.
      cursor = latest;
      return;
    }
    const since = cursor;
    const fresh = payload.hits.filter((hit) => hit.id > since);
    cursor = Math.max(cursor, latest);
    const profile = activeSkillDamageProfile();
    if (!profile) return;
    const added = buildSkillDamageRows(fresh, profile.groups);
    if (added.length === 0) return;
    const kept = feed.profileId === profile.id ? feed.rows : [];
    feed = {
      profileId: profile.id,
      rows: mergeSkillDamageRows(kept, added, profile.groups, Date.now()),
    };
  },
  reset() {
    cursor = null;
    feed = { profileId: null, rows: [] };
  },
};

const visible = $derived.by(() => {
  void hudProjectionRevision(SKILL_DAMAGE_DEADLINE_SOURCE);
  const rows =
    feed.profileId === activeSkillDamageProfile()?.id ? feed.rows : [];
  const now = Date.now();
  const live = rows.filter((row) => row.expiresAtMs > now);
  let nextDeadlineMs: number | null = null;
  for (const row of live) {
    if (nextDeadlineMs === null || row.expiresAtMs < nextDeadlineMs) {
      nextDeadlineMs = row.expiresAtMs;
    }
  }
  return { rows: live, nextDeadlineMs };
});

export function visibleSkillDamageRows(): SkillDamageRow[] {
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
