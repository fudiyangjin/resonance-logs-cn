import { t } from "$lib/i18n/index.svelte";

export type MonitorProfileKind = "skill" | "monster" | "live";

export function profileDisplayName(
  kind: MonitorProfileKind,
  name: string | undefined,
  index: number,
): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (kind === "skill") {
    return index === 0
      ? t("skillMonitor.defaults.defaultProfileName")
      : t("skillMonitor.defaults.profileName", { index: index + 1 });
  }
  if (kind === "monster") {
    return index === 0
      ? t("monsterMonitor.defaults.defaultProfileName")
      : t("monsterMonitor.defaults.profileName", { index: index + 1 });
  }
  return index === 0
    ? t("live.defaults.defaultProfileName")
    : t("live.defaults.profileName", { index: index + 1 });
}
