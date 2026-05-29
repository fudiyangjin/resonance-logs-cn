import modifierDescriptionsUrl from "$parserData/generated/ModifierDescriptions.json?url";
import type { ModifierActivityRow, LocalizedTextMap } from "$lib/history-modifier-report-display";

type ModifierDescriptionEntry = {
  description?: string;
  descriptions?: LocalizedTextMap;
};

type ModifierDescriptionTable = {
  sourcesByRuleId?: Record<string, ModifierDescriptionEntry>;
  sourceRuleIdsBySourceId?: Record<string, string[]>;
  sourcesById?: Record<string, ModifierDescriptionEntry>;
};

let modifierDescriptionTablePromise: Promise<ModifierDescriptionTable> | null = null;
const MODIFIER_DESCRIPTIONS_LOAD_TIMEOUT_MS = 3_000;

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasDescriptions(value: LocalizedTextMap | undefined): boolean {
  return Object.values(value ?? {}).some((text) => hasText(text));
}

function sourceIdCandidates(row: ModifierActivityRow): string[] {
  const ids = new Set<string>();
  for (const rawId of [row.sourceId, ...(row.sourceIds ?? [])]) {
    const id = rawId?.trim();
    if (!id) continue;
    ids.add(id);
    const baseId = id.split("|source-config:")[0]?.trim();
    if (baseId) ids.add(baseId);
  }
  return [...ids];
}

function sourceRuleIdCandidates(row: ModifierActivityRow): string[] {
  return [...new Set([row.sourceRuleId, ...(row.sourceRuleIds ?? [])]
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id)))];
}

function shouldUseSourceIdRuleBridge(row: ModifierActivityRow, sourceId: string): boolean {
  if (!sourceId.startsWith("buff-source:")) return true;
  const sourceKind = String(row.sourceKind ?? "").toLowerCase();
  const sourceType = String(row.sourceType ?? "").toLowerCase();
  return sourceKind !== "runtime-buff" && sourceKind !== "observed-buff" && sourceType !== "runtime-buff";
}

function shouldUseDirectRuleBridge(row: ModifierActivityRow): boolean {
  return sourceIdCandidates(row).some((sourceId) => shouldUseSourceIdRuleBridge(row, sourceId));
}

async function loadModifierDescriptionTable(): Promise<ModifierDescriptionTable> {
  if (modifierDescriptionTablePromise) return modifierDescriptionTablePromise;
  modifierDescriptionTablePromise = (async () => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), MODIFIER_DESCRIPTIONS_LOAD_TIMEOUT_MS)
      : null;
    try {
      const response = await fetch(modifierDescriptionsUrl, {
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        throw new Error(`Failed to load modifier descriptions: ${response.status}`);
      }
      return await response.json() as ModifierDescriptionTable;
    } catch (err) {
      console.warn("[history] modifier descriptions unavailable", err);
      return {};
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  })();
  return modifierDescriptionTablePromise;
}

function descriptionForRow(
  row: ModifierActivityRow,
  table: ModifierDescriptionTable,
): ModifierDescriptionEntry | undefined {
  if (shouldUseDirectRuleBridge(row)) {
    for (const sourceRuleId of sourceRuleIdCandidates(row)) {
      const description = table.sourcesByRuleId?.[sourceRuleId];
      if (description) return description;
    }
  }
  const sourceIds = sourceIdCandidates(row);
  for (const sourceId of sourceIds) {
    if (!shouldUseSourceIdRuleBridge(row, sourceId)) continue;
    for (const sourceRuleId of table.sourceRuleIdsBySourceId?.[sourceId] ?? []) {
      const description = table.sourcesByRuleId?.[sourceRuleId];
      if (description) return description;
    }
  }
  for (const sourceId of sourceIds) {
    const description = table.sourcesById?.[sourceId];
    if (description) return description;
  }
  return undefined;
}

export async function enrichModifierRowsWithDescriptions(
  rows: ModifierActivityRow[],
): Promise<ModifierActivityRow[]> {
  if (rows.length === 0) return rows;
  const table = await loadModifierDescriptionTable();
  if (!table.sourcesByRuleId && !table.sourcesById) return rows;

  let changed = false;
  const enriched = rows.map((row) => {
    if (hasText(row.description) && hasDescriptions(row.descriptions)) return row;
    const description = descriptionForRow(row, table);
    if (!description) return row;
    changed = true;
    return {
      ...row,
      ...(!hasText(row.description) && hasText(description.description)
        ? { description: description.description }
        : {}),
      ...(!hasDescriptions(row.descriptions) && hasDescriptions(description.descriptions)
        ? { descriptions: description.descriptions }
        : {}),
    };
  });

  return changed ? enriched : rows;
}
