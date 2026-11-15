/**
 * @file Display text for challenge watch: group names, damage labels and the
 * warning tooltip. Kept apart from `challenge-watch.ts` so the settings
 * store / migrations do not pull in the game name tables.
 */
import { CHALLENGE_PRESETS } from "$lib/challenge-presets";
import type { ChallengeGroup, ForbiddenHit } from "$lib/challenge-watch";
import { lookupKnownDamageIdName } from "$lib/config/recount-table";
import { t, type AppLocale } from "$lib/i18n/index.svelte";

export function builtinChallengePreset(presetId: string | null) {
  return presetId === null
    ? undefined
    : CHALLENGE_PRESETS.find((preset) => preset.id === presetId);
}

/** The group's own name, else its built-in preset's label, else "untitled". */
export function challengeGroupName(group: ChallengeGroup): string {
  const name = group.name.trim();
  if (name) return name;
  const preset = builtinChallengePreset(group.presetId);
  return preset ? t(preset.labelKey) : t("challengeWatch.group.untitled");
}

/** `name #id`, or just `#id` when the tables do not name the damage. */
export function challengeDamageLabel(id: number, locale: AppLocale): string {
  const name = lookupKnownDamageIdName(id, locale);
  return name ? `${name} #${id}` : `#${id}`;
}

export type ForbiddenHitSection = {
  groupName: string;
  items: { id: number; label: string; hits: number }[];
};

/**
 * Groups a player's forbidden hits under the groups that forbid them, in
 * configuration order. An id listed by several groups is shown once, under
 * the first; one no group lists any more (settings just changed) goes last.
 */
export function describeForbiddenHits(
  hits: readonly ForbiddenHit[],
  groups: readonly ChallengeGroup[],
  locale: AppLocale,
): ForbiddenHitSection[] {
  const hitsById = new Map(hits.map((hit) => [hit.id, hit.hits]));
  const sections: ForbiddenHitSection[] = [];
  for (const group of groups) {
    const items: ForbiddenHitSection["items"] = [];
    for (const id of group.damageIds) {
      const count = hitsById.get(id);
      if (count === undefined) continue;
      hitsById.delete(id);
      items.push({ id, label: challengeDamageLabel(id, locale), hits: count });
    }
    if (items.length > 0) {
      sections.push({ groupName: challengeGroupName(group), items });
    }
  }
  if (hitsById.size > 0) {
    sections.push({
      groupName: t("challengeWatch.group.untitled"),
      items: [...hitsById].map(([id, count]) => ({
        id,
        label: challengeDamageLabel(id, locale),
        hits: count,
      })),
    });
  }
  return sections;
}

/** Multi-line tooltip text: title, then each group and its hit damages. */
export function formatForbiddenHitsTooltip(
  sections: readonly ForbiddenHitSection[],
): string {
  const lines = [t("challengeWatch.warningTitle")];
  for (const section of sections) {
    lines.push(section.groupName);
    for (const item of section.items) {
      lines.push(
        t("challengeWatch.warningItem", { label: item.label, hits: item.hits }),
      );
    }
  }
  return lines.join("\n");
}
