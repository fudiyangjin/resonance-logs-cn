import dbmTableZhCN from "$lib/config/DbmTable.json";
import dbmTableEnUS from "$lib/config/en-US/DbmTable.json";
import dbmTableJaJP from "$lib/config/ja-JP/DbmTable.json";
import { getLocale } from "$lib/i18n/index.svelte";
import { getLocaleFallbackChain, type AppLocale } from "$lib/i18n/locales";

export type DbmTableEntry = {
  Id: number;
  CountCDTime: number;
  Content: string;
};

const DBM_TABLE_BY_LOCALE: Record<AppLocale, Record<string, DbmTableEntry>> = {
  "zh-CN": dbmTableZhCN,
  "en-US": dbmTableEnUS,
  "ja-JP": dbmTableJaJP,
};

function lookupDbmEntry(id: number): DbmTableEntry | undefined {
  for (const locale of getLocaleFallbackChain(getLocale())) {
    const entry = DBM_TABLE_BY_LOCALE[locale][String(id)];
    if (entry?.Content?.trim()) return entry;
  }
  return undefined;
}

export function resolveDbmSkillName(
  skillEffectId: number,
  baseSkillId: number,
  aliases?: Record<string, string>,
): string {
  const fallbackId = baseSkillId * 100 + 1;
  const alias =
    aliases?.[String(skillEffectId)] ?? aliases?.[String(fallbackId)];
  if (alias?.trim()) return alias;
  return (
    lookupDbmEntry(skillEffectId)?.Content ??
    lookupDbmEntry(fallbackId)?.Content ??
    `#${skillEffectId}`
  );
}

export type DbmSearchItem = { id: number; name: string };

export function lookupDbmDefaultName(id: number): string | undefined {
  const name = lookupDbmEntry(id)?.Content;
  return name?.trim() ? name : undefined;
}

export function searchDbmEntries(keyword: string): DbmSearchItem[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];
  const seen = new Set<number>();
  const items: DbmSearchItem[] = [];
  for (const locale of getLocaleFallbackChain(getLocale())) {
    const table = DBM_TABLE_BY_LOCALE[locale];
    for (const entry of Object.values(table)) {
      if (!entry?.Content?.trim()) continue;
      const id = entry.Id;
      if (seen.has(id)) continue;
      const name = entry.Content.trim();
      if (`${id}`.includes(kw) || name.toLowerCase().includes(kw)) {
        seen.add(id);
        items.push({ id, name });
      }
    }
  }
  return items.sort((a, b) => a.id - b.id).slice(0, 60);
}
