/**
 * Column data shared across history and live views.
 * This file replaces the previous `history-columns.ts` name to better
 * reflect its purpose as generic column metadata.
 */
import { tl } from "$lib/i18n/index.svelte";

type ColumnDef<K extends string> = {
  key: K;
  header: string;
  label: string;
  description: string;
  format: (v: number) => string;
};

function createColumn<const K extends string>(
  key: K,
  textKey: string,
  descriptionKey: string,
  format: (v: number) => string,
): ColumnDef<K> {
  return {
    key,
    get header() {
      return tl(textKey);
    },
    get label() {
      return tl(textKey);
    },
    get description() {
      return tl(descriptionKey);
    },
    format,
  };
}

export const historyDpsPlayerColumns = [
  createColumn("totalDmg", "Damage", "Show the total damage dealt by the player", (v) => v.toLocaleString()),
  createColumn("dps", "DPS", "Show the player's damage per second (DPS)", (v) => v.toFixed(1)),
  createColumn("tdps", "True DPS", "Show the player's true DPS based on global active combat time", (v) => v.toFixed(1)),
  createColumn("bossDmg", "Boss Damage", "Show the damage dealt by the player to the boss", (v) => v.toLocaleString()),
  createColumn("bossDps", "Boss DPS", "Show the player's boss DPS", (v) => v.toFixed(1)),
  createColumn("dmgPct", "Share %", "Show the player's damage share", (v) => `${v.toFixed(1)}%`),
  createColumn("critRate", "Crit %", "Show the player's critical hit rate", (v) => `${v.toFixed(1)}%`),
  createColumn("critDmgRate", "Crit Damage %", "Show the player's critical damage share", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyRate", "Lucky %", "Show the player's lucky hit rate", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyDmgRate", "Lucky Damage %", "Show the player's lucky damage share", (v) => `${v.toFixed(1)}%`),
  createColumn("hits", "Hits", "Show the player's total hit count", (v) => v.toLocaleString()),
  createColumn("hitsPerMinute", "Hits / Min", "Show the player's hits per minute", (v) => v.toFixed(1)),
] as const;

export const historyDpsSkillColumns = [
  createColumn("totalDmg", "Damage", "Show the total damage dealt by the skill", (v) => v.toLocaleString()),
  createColumn("dps", "DPS", "Show the skill's damage per second (DPS)", (v) => v.toFixed(1)),
  createColumn("dmgPct", "Share %", "Show the skill's damage share", (v) => `${v.toFixed(1)}%`),
  createColumn("critRate", "Crit %", "Show the skill's critical hit rate", (v) => `${v.toFixed(1)}%`),
  createColumn("critDmgRate", "Crit Damage %", "Show the skill's critical damage share", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyRate", "Lucky %", "Show the skill's lucky hit rate", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyDmgRate", "Lucky Damage %", "Show the skill's lucky damage share", (v) => `${v.toFixed(1)}%`),
  createColumn("hits", "Hits", "Show the skill's total hit count", (v) => v.toLocaleString()),
  createColumn("hitsPerMinute", "Hits / Min", "Show the skill's hits per minute", (v) => v.toFixed(1)),
] as const;

export const historyHealPlayerColumns = [
  createColumn("healDealt", "Healing", "Show the total healing done by the player", (v) => v.toLocaleString()),
  createColumn("hps", "HPS", "Show the player's healing per second (HPS)", (v) => v.toFixed(1)),
  createColumn("healPct", "Share %", "Show the player's healing share", (v) => `${v.toFixed(1)}%`),
  createColumn("critHealRate", "Crit %", "Show the player's healing crit rate", (v) => `${v.toFixed(1)}%`),
  createColumn("critDmgRate", "Crit Heal %", "Show the player's critical healing share", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyRate", "Lucky %", "Show the player's lucky heal rate", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyDmgRate", "Lucky Heal %", "Show the player's lucky healing share", (v) => `${v.toFixed(1)}%`),
  createColumn("hitsHeal", "Count", "Show the player's total healing count", (v) => v.toLocaleString()),
  createColumn("hitsPerMinute", "Count / Min", "Show the player's healing casts per minute", (v) => v.toFixed(1)),
] as const;

export const liveHealPlayerColumns = [
  createColumn("totalDmg", "Healing", "Show the total healing done by the player", (v) => v.toLocaleString()),
  createColumn("dps", "HPS", "Show the player's healing per second (HPS)", (v) => v.toFixed(1)),
  createColumn("dmgPct", "Share %", "Show the player's healing share", (v) => `${v.toFixed(1)}%`),
  createColumn("critRate", "Crit %", "Show the player's critical hit rate", (v) => `${v.toFixed(1)}%`),
  createColumn("critDmgRate", "Crit Heal %", "Show the player's critical healing share", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyRate", "Lucky %", "Show the player's lucky hit rate", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyDmgRate", "Lucky Heal %", "Show the player's lucky healing share", (v) => `${v.toFixed(1)}%`),
  createColumn("hits", "Count", "Show the player's total healing count", (v) => v.toLocaleString()),
  createColumn("hitsPerMinute", "Count / Min", "Show the player's healing casts per minute", (v) => v.toFixed(1)),
] as const;

export const liveTankedPlayerColumns = [
  createColumn("totalDmg", "Damage Taken", "Show the total damage taken by the player", (v) => v.toLocaleString()),
  createColumn("dps", "DTPS", "Show the player's damage taken per second (TPS)", (v) => v.toFixed(1)),
  createColumn("dmgPct", "Share %", "Show the player's damage-taken share", (v) => `${v.toFixed(1)}%`),
  createColumn("critRate", "Crit Taken %", "Show the player's chance to take critical hits", (v) => `${v.toFixed(1)}%`),
  createColumn("critDmgRate", "Crit Damage Taken %", "Show the player's critical damage taken share", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyRate", "Lucky Taken %", "Show the player's chance to take lucky hits", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyDmgRate", "Lucky Damage Taken %", "Show the player's lucky damage taken share", (v) => `${v.toFixed(1)}%`),
  createColumn("hits", "Hits Taken", "Show the player's total hits taken", (v) => v.toLocaleString()),
  createColumn("hitsPerMinute", "Hits Taken / Min", "Show the player's hits taken per minute", (v) => v.toFixed(1)),
] as const;

export const liveTankedSkillColumns = [
  createColumn("totalDmg", "Damage Taken", "Show the total damage taken from the skill", (v) => v.toLocaleString()),
  createColumn("dps", "DTPS", "Show the skill's damage taken per second (DTPS)", (v) => v.toFixed(1)),
  createColumn("dmgPct", "Share %", "Show the skill's damage-taken share", (v) => `${v.toFixed(1)}%`),
  createColumn("critRate", "Crit Taken %", "Show the chance for this skill to crit on you", (v) => `${v.toFixed(1)}%`),
  createColumn("critDmgRate", "Crit Damage Taken %", "Show the critical damage taken share for this skill", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyRate", "Lucky Taken %", "Show the chance for this skill to land a lucky hit on you", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyDmgRate", "Lucky Damage Taken %", "Show the lucky damage taken share for this skill", (v) => `${v.toFixed(1)}%`),
  createColumn("hits", "Hits Taken", "Show the total hits taken from this skill", (v) => v.toLocaleString()),
  createColumn("hitsPerMinute", "Hits Taken / Min", "Show the hits taken per minute from this skill", (v) => v.toFixed(1)),
] as const;

export const historyTankedPlayerColumns = [
  createColumn("damageTaken", "Damage Taken", "Show the total damage taken by the player", (v) => v.toLocaleString()),
  createColumn("tankedPS", "DTPS", "Show the player's damage taken per second (TPS)", (v) => v.toFixed(1)),
  createColumn("tankedPct", "Share %", "Show the player's damage-taken share", (v) => `${v.toFixed(1)}%`),
  createColumn("critTakenRate", "Crit Taken %", "Show the player's chance to take critical hits", (v) => `${v.toFixed(1)}%`),
  createColumn("critDmgRate", "Crit Damage Taken %", "Show the player's critical damage taken share", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyRate", "Lucky Taken %", "Show the player's chance to take lucky hits", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyDmgRate", "Lucky Damage Taken %", "Show the player's lucky damage taken share", (v) => `${v.toFixed(1)}%`),
  createColumn("hitsTaken", "Hits Taken", "Show the player's total hits taken", (v) => v.toLocaleString()),
  createColumn("hitsPerMinute", "Hits Taken / Min", "Show the player's hits taken per minute", (v) => v.toFixed(1)),
] as const;

export const historyTankedSkillColumns = [
  createColumn("totalDmg", "Damage Taken", "Show the total damage taken from the skill", (v) => v.toLocaleString()),
  createColumn("dps", "DTPS", "Show the skill's damage taken per second (DTPS)", (v) => v.toFixed(1)),
  createColumn("dmgPct", "Share %", "Show the skill's damage-taken share", (v) => `${v.toFixed(1)}%`),
  createColumn("critRate", "Crit Taken %", "Show the chance for this skill to crit on you", (v) => `${v.toFixed(1)}%`),
  createColumn("critDmgRate", "Crit Damage Taken %", "Show the critical damage taken share for this skill", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyRate", "Lucky Taken %", "Show the chance for this skill to land a lucky hit on you", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyDmgRate", "Lucky Damage Taken %", "Show the lucky damage taken share for this skill", (v) => `${v.toFixed(1)}%`),
  createColumn("hits", "Hits Taken", "Show the total hits taken from this skill", (v) => v.toLocaleString()),
  createColumn("hitsPerMinute", "Hits Taken / Min", "Show the hits taken per minute from this skill", (v) => v.toFixed(1)),
] as const;

export const historyHealSkillColumns = [
  createColumn("totalDmg", "Healing", "Show the total healing done by the skill", (v) => v.toLocaleString()),
  createColumn("dps", "HPS", "Show the skill's healing per second (HPS)", (v) => v.toFixed(1)),
  createColumn("dmgPct", "Share %", "Show the skill's healing share", (v) => `${v.toFixed(1)}%`),
  createColumn("critRate", "Crit %", "Show the skill's critical hit rate", (v) => `${v.toFixed(1)}%`),
  createColumn("critDmgRate", "Crit Heal %", "Show the skill's critical healing share", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyRate", "Lucky %", "Show the skill's lucky hit rate", (v) => `${v.toFixed(1)}%`),
  createColumn("luckyDmgRate", "Lucky Heal %", "Show the skill's lucky healing share", (v) => `${v.toFixed(1)}%`),
  createColumn("hits", "Count", "Show the skill's total healing count", (v) => v.toLocaleString()),
  createColumn("hitsPerMinute", "Count / Min", "Show the skill's healing casts per minute", (v) => v.toFixed(1)),
] as const;

export const liveDpsPlayerColumns = historyDpsPlayerColumns;
export const liveDpsSkillColumns = historyDpsSkillColumns;
export const liveHealSkillColumns = historyHealSkillColumns;
