/**
 * Column data shared across history and live views.
 * This file replaces the previous `history-columns.ts` name to better
 * reflect its purpose as generic column metadata.
 */

import { damageModeLabel, propertyLabel } from "./damage-type";
import { formatNumber, t, type MessageKey } from "./i18n/index.svelte";

type ColumnFormat = (value: number) => string;

interface ColumnDefinition<Key extends string> {
  readonly key: Key;
  readonly header: string;
  readonly label: string;
  readonly description: string;
  readonly format: ColumnFormat;
}

function createColumn<const Key extends string>({
  key,
  labelKey,
  descriptionKey,
  format,
}: {
  key: Key;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  format: ColumnFormat;
}): ColumnDefinition<Key> {
  return {
    key,
    get header() {
      return t(labelKey);
    },
    get label() {
      return t(labelKey);
    },
    get description() {
      return t(descriptionKey);
    },
    format,
  };
}

const formatInteger = (value: number) => formatNumber(value);
const formatDecimal = (value: number) =>
  formatNumber(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const formatPercent = (value: number) => `${formatDecimal(value)}%`;

export const historyDpsPlayerColumns = [
  createColumn({
    key: "totalDmg",
    labelKey: "columns.dps.totalDmg",
    descriptionKey: "columns.description.dps.player.totalDmg",
    format: formatInteger,
  }),
  createColumn({
    key: "dps",
    labelKey: "columns.dps.dps",
    descriptionKey: "columns.description.dps.player.dps",
    format: formatDecimal,
  }),
  createColumn({
    key: "tdps",
    labelKey: "columns.dps.tdps",
    descriptionKey: "columns.description.dps.player.tdps",
    format: formatDecimal,
  }),
  createColumn({
    key: "bossDmg",
    labelKey: "columns.dps.bossDmg",
    descriptionKey: "columns.description.dps.player.bossDmg",
    format: formatInteger,
  }),
  createColumn({
    key: "bossDps",
    labelKey: "columns.dps.bossDps",
    descriptionKey: "columns.description.dps.player.bossDps",
    format: formatDecimal,
  }),
  createColumn({
    key: "dmgPct",
    labelKey: "columns.dps.dmgPct",
    descriptionKey: "columns.description.dps.player.dmgPct",
    format: formatPercent,
  }),
  createColumn({
    key: "critRate",
    labelKey: "columns.dps.critRate",
    descriptionKey: "columns.description.dps.player.critRate",
    format: formatPercent,
  }),
  createColumn({
    key: "critDmgRate",
    labelKey: "columns.dps.critDmgRate",
    descriptionKey: "columns.description.dps.player.critDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyRate",
    labelKey: "columns.dps.luckyRate",
    descriptionKey: "columns.description.dps.player.luckyRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyDmgRate",
    labelKey: "columns.dps.luckyDmgRate",
    descriptionKey: "columns.description.dps.player.luckyDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "hits",
    labelKey: "columns.dps.hits",
    descriptionKey: "columns.description.dps.player.hits",
    format: formatInteger,
  }),
  createColumn({
    key: "hitsPerMinute",
    labelKey: "columns.dps.hitsPerMinute",
    descriptionKey: "columns.description.dps.player.hitsPerMinute",
    format: formatDecimal,
  }),
] as const;

export const historyDpsSkillColumns = [
  createColumn({
    key: "totalDmg",
    labelKey: "columns.dps.totalDmg",
    descriptionKey: "columns.description.dps.skill.totalDmg",
    format: formatInteger,
  }),
  createColumn({
    key: "dps",
    labelKey: "columns.dps.dps",
    descriptionKey: "columns.description.dps.skill.dps",
    format: formatDecimal,
  }),
  createColumn({
    key: "dmgPct",
    labelKey: "columns.dps.dmgPct",
    descriptionKey: "columns.description.dps.skill.dmgPct",
    format: formatPercent,
  }),
  createColumn({
    key: "critRate",
    labelKey: "columns.dps.critRate",
    descriptionKey: "columns.description.dps.skill.critRate",
    format: formatPercent,
  }),
  createColumn({
    key: "critDmgRate",
    labelKey: "columns.dps.critDmgRate",
    descriptionKey: "columns.description.dps.skill.critDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyRate",
    labelKey: "columns.dps.luckyRate",
    descriptionKey: "columns.description.dps.skill.luckyRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyDmgRate",
    labelKey: "columns.dps.luckyDmgRate",
    descriptionKey: "columns.description.dps.skill.luckyDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "hits",
    labelKey: "columns.dps.hits",
    descriptionKey: "columns.description.dps.skill.hits",
    format: formatInteger,
  }),
  createColumn({
    key: "hitsPerMinute",
    labelKey: "columns.dps.hitsPerMinute",
    descriptionKey: "columns.description.dps.skill.hitsPerMinute",
    format: formatDecimal,
  }),
] as const;

export const historyHealPlayerColumns = [
  createColumn({
    key: "healDealt",
    labelKey: "columns.heal.total",
    descriptionKey: "columns.description.heal.player.total",
    format: formatInteger,
  }),
  createColumn({
    key: "hps",
    labelKey: "columns.heal.hps",
    descriptionKey: "columns.description.heal.player.hps",
    format: formatDecimal,
  }),
  createColumn({
    key: "effectiveHeal",
    labelKey: "columns.heal.effectiveTotal",
    descriptionKey: "columns.description.heal.player.effectiveTotal",
    format: formatInteger,
  }),
  createColumn({
    key: "ehps",
    labelKey: "columns.heal.effectiveHps",
    descriptionKey: "columns.description.heal.player.effectiveHps",
    format: formatDecimal,
  }),
  createColumn({
    key: "healPct",
    labelKey: "columns.heal.healPct",
    descriptionKey: "columns.description.heal.player.healPct",
    format: formatPercent,
  }),
  createColumn({
    key: "critHealRate",
    labelKey: "columns.heal.critRate",
    descriptionKey: "columns.description.heal.player.critRate",
    format: formatPercent,
  }),
  createColumn({
    key: "critDmgRate",
    labelKey: "columns.heal.critHealRate",
    descriptionKey: "columns.description.heal.player.critHealRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyRate",
    labelKey: "columns.heal.luckyRate",
    descriptionKey: "columns.description.heal.player.luckyRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyDmgRate",
    labelKey: "columns.heal.luckyHealRate",
    descriptionKey: "columns.description.heal.player.luckyHealRate",
    format: formatPercent,
  }),
  createColumn({
    key: "hitsHeal",
    labelKey: "columns.heal.hits",
    descriptionKey: "columns.description.heal.player.hits",
    format: formatInteger,
  }),
  createColumn({
    key: "hitsPerMinute",
    labelKey: "columns.heal.hitsPerMinute",
    descriptionKey: "columns.description.heal.player.hitsPerMinute",
    format: formatDecimal,
  }),
] as const;

// Live meter heal player columns with correct headers
export const liveHealPlayerColumns = [
  createColumn({
    key: "totalDmg",
    labelKey: "columns.heal.total",
    descriptionKey: "columns.description.heal.player.total",
    format: formatInteger,
  }),
  createColumn({
    key: "dps",
    labelKey: "columns.heal.hps",
    descriptionKey: "columns.description.heal.player.hps",
    format: formatDecimal,
  }),
  createColumn({
    key: "effectiveTotal",
    labelKey: "columns.heal.effectiveTotal",
    descriptionKey: "columns.description.heal.player.effectiveTotal",
    format: formatInteger,
  }),
  createColumn({
    key: "effectiveDps",
    labelKey: "columns.heal.effectiveHps",
    descriptionKey: "columns.description.heal.player.effectiveHps",
    format: formatDecimal,
  }),
  createColumn({
    key: "dmgPct",
    labelKey: "columns.heal.healPct",
    descriptionKey: "columns.description.heal.player.healPct",
    format: formatPercent,
  }),
  createColumn({
    key: "critRate",
    labelKey: "columns.heal.critRate",
    descriptionKey: "columns.description.heal.player.critRate",
    format: formatPercent,
  }),
  createColumn({
    key: "critDmgRate",
    labelKey: "columns.heal.critHealRate",
    descriptionKey: "columns.description.heal.player.critHealRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyRate",
    labelKey: "columns.heal.luckyRate",
    descriptionKey: "columns.description.heal.player.luckyRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyDmgRate",
    labelKey: "columns.heal.luckyHealRate",
    descriptionKey: "columns.description.heal.player.luckyHealRate",
    format: formatPercent,
  }),
  createColumn({
    key: "hits",
    labelKey: "columns.heal.hits",
    descriptionKey: "columns.description.heal.player.hits",
    format: formatInteger,
  }),
  createColumn({
    key: "hitsPerMinute",
    labelKey: "columns.heal.hitsPerMinute",
    descriptionKey: "columns.description.heal.player.hitsPerMinute",
    format: formatDecimal,
  }),
] as const;

// Live meter tanked player columns with correct headers
export const liveTankedPlayerColumns = [
  createColumn({
    key: "totalDmg",
    labelKey: "columns.tanked.total",
    descriptionKey: "columns.description.tanked.player.total",
    format: formatInteger,
  }),
  createColumn({
    key: "dps",
    labelKey: "columns.tanked.tps",
    descriptionKey: "columns.description.tanked.player.tps",
    format: formatDecimal,
  }),
  createColumn({
    key: "dmgPct",
    labelKey: "columns.tanked.tankedPct",
    descriptionKey: "columns.description.tanked.player.tankedPct",
    format: formatPercent,
  }),
  createColumn({
    key: "critRate",
    labelKey: "columns.tanked.critTakenRate",
    descriptionKey: "columns.description.tanked.player.critTakenRate",
    format: formatPercent,
  }),
  createColumn({
    key: "critDmgRate",
    labelKey: "columns.tanked.critDmgRate",
    descriptionKey: "columns.description.tanked.player.critDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyRate",
    labelKey: "columns.tanked.luckyRate",
    descriptionKey: "columns.description.tanked.player.luckyRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyDmgRate",
    labelKey: "columns.tanked.luckyDmgRate",
    descriptionKey: "columns.description.tanked.player.luckyDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "blockRate",
    labelKey: "columns.tanked.blockRate",
    descriptionKey: "columns.description.tanked.player.blockRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyBlockRate",
    labelKey: "columns.tanked.luckyBlockRate",
    descriptionKey: "columns.description.tanked.player.luckyBlockRate",
    format: formatPercent,
  }),
  createColumn({
    key: "hits",
    labelKey: "columns.tanked.hits",
    descriptionKey: "columns.description.tanked.player.hits",
    format: formatInteger,
  }),
  createColumn({
    key: "hitsPerMinute",
    labelKey: "columns.tanked.hitsPerMinute",
    descriptionKey: "columns.description.tanked.player.hitsPerMinute",
    format: formatDecimal,
  }),
] as const;

export const liveTankedSkillColumns = [
  createColumn({
    key: "totalDmg",
    labelKey: "columns.tanked.total",
    descriptionKey: "columns.description.tanked.skill.total",
    format: formatInteger,
  }),
  createColumn({
    key: "dps",
    labelKey: "columns.tanked.tps",
    descriptionKey: "columns.description.tanked.skill.tps",
    format: formatDecimal,
  }),
  createColumn({
    key: "dmgPct",
    labelKey: "columns.tanked.tankedPct",
    descriptionKey: "columns.description.tanked.skill.tankedPct",
    format: formatPercent,
  }),
  createColumn({
    key: "critRate",
    labelKey: "columns.tanked.critTakenRate",
    descriptionKey: "columns.description.tanked.skill.critTakenRate",
    format: formatPercent,
  }),
  createColumn({
    key: "critDmgRate",
    labelKey: "columns.tanked.critDmgRate",
    descriptionKey: "columns.description.tanked.skill.critDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyRate",
    labelKey: "columns.tanked.luckyRate",
    descriptionKey: "columns.description.tanked.skill.luckyRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyDmgRate",
    labelKey: "columns.tanked.luckyDmgRate",
    descriptionKey: "columns.description.tanked.skill.luckyDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "blockRate",
    labelKey: "columns.tanked.blockRate",
    descriptionKey: "columns.description.tanked.skill.blockRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyBlockRate",
    labelKey: "columns.tanked.luckyBlockRate",
    descriptionKey: "columns.description.tanked.skill.luckyBlockRate",
    format: formatPercent,
  }),
  createColumn({
    key: "hits",
    labelKey: "columns.tanked.hits",
    descriptionKey: "columns.description.tanked.skill.hits",
    format: formatInteger,
  }),
  createColumn({
    key: "hitsPerMinute",
    labelKey: "columns.tanked.hitsPerMinute",
    descriptionKey: "columns.description.tanked.skill.hitsPerMinute",
    format: formatDecimal,
  }),
  createColumn({
    key: "property",
    labelKey: "columns.skill.property",
    descriptionKey: "columns.description.skill.property",
    format: propertyLabel,
  }),
  createColumn({
    key: "damageMode",
    labelKey: "columns.skill.damageMode",
    descriptionKey: "columns.description.skill.damageMode",
    format: damageModeLabel,
  }),
] as const;

export const historyTankedPlayerColumns = [
  createColumn({
    key: "damageTaken",
    labelKey: "columns.tanked.total",
    descriptionKey: "columns.description.tanked.player.total",
    format: formatInteger,
  }),
  createColumn({
    key: "tankedPS",
    labelKey: "columns.tanked.tps",
    descriptionKey: "columns.description.tanked.player.tps",
    format: formatDecimal,
  }),
  createColumn({
    key: "tankedPct",
    labelKey: "columns.tanked.tankedPct",
    descriptionKey: "columns.description.tanked.player.tankedPct",
    format: formatPercent,
  }),
  createColumn({
    key: "critTakenRate",
    labelKey: "columns.tanked.critTakenRate",
    descriptionKey: "columns.description.tanked.player.critTakenRate",
    format: formatPercent,
  }),
  createColumn({
    key: "critDmgRate",
    labelKey: "columns.tanked.critDmgRate",
    descriptionKey: "columns.description.tanked.player.critDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyRate",
    labelKey: "columns.tanked.luckyRate",
    descriptionKey: "columns.description.tanked.player.luckyRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyDmgRate",
    labelKey: "columns.tanked.luckyDmgRate",
    descriptionKey: "columns.description.tanked.player.luckyDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "blockRate",
    labelKey: "columns.tanked.blockRate",
    descriptionKey: "columns.description.tanked.player.blockRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyBlockRate",
    labelKey: "columns.tanked.luckyBlockRate",
    descriptionKey: "columns.description.tanked.player.luckyBlockRate",
    format: formatPercent,
  }),
  createColumn({
    key: "hitsTaken",
    labelKey: "columns.tanked.hits",
    descriptionKey: "columns.description.tanked.player.hits",
    format: formatInteger,
  }),
  createColumn({
    key: "hitsPerMinute",
    labelKey: "columns.tanked.hitsPerMinute",
    descriptionKey: "columns.description.tanked.player.hitsPerMinute",
    format: formatDecimal,
  }),
] as const;

export const historyTankedSkillColumns = [
  createColumn({
    key: "totalDmg",
    labelKey: "columns.tanked.total",
    descriptionKey: "columns.description.tanked.skill.total",
    format: formatInteger,
  }),
  createColumn({
    key: "dps",
    labelKey: "columns.tanked.tps",
    descriptionKey: "columns.description.tanked.skill.tps",
    format: formatDecimal,
  }),
  createColumn({
    key: "dmgPct",
    labelKey: "columns.tanked.tankedPct",
    descriptionKey: "columns.description.tanked.skill.tankedPct",
    format: formatPercent,
  }),
  createColumn({
    key: "critRate",
    labelKey: "columns.tanked.critTakenRate",
    descriptionKey: "columns.description.tanked.skill.critTakenRate",
    format: formatPercent,
  }),
  createColumn({
    key: "critDmgRate",
    labelKey: "columns.tanked.critDmgRate",
    descriptionKey: "columns.description.tanked.skill.critDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyRate",
    labelKey: "columns.tanked.luckyRate",
    descriptionKey: "columns.description.tanked.skill.luckyRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyDmgRate",
    labelKey: "columns.tanked.luckyDmgRate",
    descriptionKey: "columns.description.tanked.skill.luckyDmgRate",
    format: formatPercent,
  }),
  createColumn({
    key: "blockRate",
    labelKey: "columns.tanked.blockRate",
    descriptionKey: "columns.description.tanked.skill.blockRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyBlockRate",
    labelKey: "columns.tanked.luckyBlockRate",
    descriptionKey: "columns.description.tanked.skill.luckyBlockRate",
    format: formatPercent,
  }),
  createColumn({
    key: "hits",
    labelKey: "columns.tanked.hits",
    descriptionKey: "columns.description.tanked.skill.hits",
    format: formatInteger,
  }),
  createColumn({
    key: "hitsPerMinute",
    labelKey: "columns.tanked.hitsPerMinute",
    descriptionKey: "columns.description.tanked.skill.hitsPerMinute",
    format: formatDecimal,
  }),
  createColumn({
    key: "property",
    labelKey: "columns.skill.property",
    descriptionKey: "columns.description.skill.property",
    format: propertyLabel,
  }),
  createColumn({
    key: "damageMode",
    labelKey: "columns.skill.damageMode",
    descriptionKey: "columns.description.skill.damageMode",
    format: damageModeLabel,
  }),
] as const;

export const historyHealSkillColumns = [
  createColumn({
    key: "totalDmg",
    labelKey: "columns.heal.total",
    descriptionKey: "columns.description.heal.skill.total",
    format: formatInteger,
  }),
  createColumn({
    key: "dps",
    labelKey: "columns.heal.hps",
    descriptionKey: "columns.description.heal.skill.hps",
    format: formatDecimal,
  }),
  createColumn({
    key: "effectiveTotal",
    labelKey: "columns.heal.effectiveTotal",
    descriptionKey: "columns.description.heal.skill.effectiveTotal",
    format: formatInteger,
  }),
  createColumn({
    key: "effectiveDps",
    labelKey: "columns.heal.effectiveHps",
    descriptionKey: "columns.description.heal.skill.effectiveHps",
    format: formatDecimal,
  }),
  createColumn({
    key: "dmgPct",
    labelKey: "columns.heal.healPct",
    descriptionKey: "columns.description.heal.skill.healPct",
    format: formatPercent,
  }),
  createColumn({
    key: "critRate",
    labelKey: "columns.heal.critRate",
    descriptionKey: "columns.description.heal.skill.critRate",
    format: formatPercent,
  }),
  createColumn({
    key: "critDmgRate",
    labelKey: "columns.heal.critHealRate",
    descriptionKey: "columns.description.heal.skill.critHealRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyRate",
    labelKey: "columns.heal.luckyRate",
    descriptionKey: "columns.description.heal.skill.luckyRate",
    format: formatPercent,
  }),
  createColumn({
    key: "luckyDmgRate",
    labelKey: "columns.heal.luckyHealRate",
    descriptionKey: "columns.description.heal.skill.luckyHealRate",
    format: formatPercent,
  }),
  createColumn({
    key: "hits",
    labelKey: "columns.heal.hits",
    descriptionKey: "columns.description.heal.skill.hits",
    format: formatInteger,
  }),
  createColumn({
    key: "hitsPerMinute",
    labelKey: "columns.heal.hitsPerMinute",
    descriptionKey: "columns.description.heal.skill.hitsPerMinute",
    format: formatDecimal,
  }),
] as const;

// Aliases for live views: reuse history DPS/Heal skill definitions where appropriate
export const liveDpsPlayerColumns = historyDpsPlayerColumns;
export const liveDpsSkillColumns = historyDpsSkillColumns;
export const liveHealSkillColumns = historyHealSkillColumns;
