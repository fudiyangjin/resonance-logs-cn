/**
 * @file Display labels shared by the history picker rows and the live
 * window's history banner.
 */
import type { EncounterSummaryDto } from "$lib/bindings";
import { resolveMonsterName, resolveSceneName } from "$lib/config/game-names";
import { formatDateTime, t } from "$lib/i18n/index.svelte";

export function encounterSceneLabel(summary: EncounterSummaryDto): string {
  return (
    resolveSceneName(summary.sceneId, summary.dungeonDifficulty) ||
    t("live.history.noScene")
  );
}

/** First boss, with a "+n" suffix when the encounter recorded several. */
export function encounterBossLabel(summary: EncounterSummaryDto): string {
  const [first] = summary.bosses;
  if (!first) return "";
  const name = resolveMonsterName(first.monsterId) || `#${first.monsterId}`;
  const extra = summary.bosses.length - 1;
  return extra > 0 ? `${name} +${extra}` : name;
}

export function formatEncounterTime(ms: number): string {
  return formatDateTime(ms, { hour: "2-digit", minute: "2-digit" });
}

export function formatEncounterDay(ms: number): string {
  return formatDateTime(ms, { month: "2-digit", day: "2-digit" });
}

export function formatDayHeading(
  kind: "today" | "yesterday" | "date",
  dayMs: number,
): string {
  if (kind === "today") return t("live.history.day.today");
  if (kind === "yesterday") return t("live.history.day.yesterday");
  return formatDateTime(dayMs, {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}
