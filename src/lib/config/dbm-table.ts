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
): string {
  return (
    lookupDbmEntry(skillEffectId)?.Content ??
    lookupDbmEntry(baseSkillId * 100 + 1)?.Content ??
    `#${skillEffectId}`
  );
}
