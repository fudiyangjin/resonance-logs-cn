/**
 * Column data shared across history and live views.
 * This file replaces the previous `history-columns.ts` name to better
 * reflect its purpose as generic column metadata.
 */

export const historyDpsPlayerColumns = [
  { key: 'totalDmg', header: 'Damage', label: 'Damage', description: "Total damage dealt by the player", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: 'DPS', label: 'DPS', description: "Damage per second dealt by the player", format: (v: number) => v.toFixed(1) },
  { key: 'tdps', header: 'True DPS', label: 'True DPS', description: "True DPS based on global active combat time", format: (v: number) => v.toFixed(1) },
  { key: 'bossDmg', header: 'Boss Dmg', label: 'Boss Dmg', description: "Damage dealt to bosses by the player", format: (v: number) => v.toLocaleString() },
  { key: 'bossDps', header: 'Boss DPS', label: 'Boss DPS', description: "Boss damage per second (Boss DPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: 'Dmg%', label: 'Dmg%', description: "Player damage share percentage", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: 'Crit%', label: 'Crit%', description: "Player crit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: 'Crit Dmg%', label: 'Crit Dmg%', description: "Percentage of damage from crits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: 'Lucky%', label: 'Lucky%', description: "Player lucky hit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: 'Lucky Dmg%', label: 'Lucky Dmg%', description: "Percentage of damage from lucky hits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: 'Hits', label: 'Hits', description: "Total hit count", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: 'Hits/min', label: 'Hits/min', description: "Hits per minute", format: (v: number) => v.toFixed(1) },
] as const;

export const historyDpsSkillColumns = [
  { key: 'totalDmg', header: 'Damage', label: 'Damage', description: "Total damage dealt by the skill", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: 'DPS', label: 'DPS', description: "Damage per second for the skill", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: 'Dmg%', label: 'Dmg%', description: "Skill damage share percentage", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: 'Crit%', label: 'Crit%', description: "Skill crit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: 'Crit Dmg%', label: 'Crit Dmg%', description: "Percentage of skill damage from crits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: 'Lucky%', label: 'Lucky%', description: "Skill lucky hit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: 'Lucky Dmg%', label: 'Lucky Dmg%', description: "Percentage of skill damage from lucky hits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: 'Hits', label: 'Hits', description: "Total hit count for skill", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: 'Hits/min', label: 'Hits/min', description: "Skill hits per minute", format: (v: number) => v.toFixed(1) },
] as const;

export const historyHealPlayerColumns = [
  { key: 'healDealt', header: 'Healing', label: 'Healing', description: "Total healing dealt by the player", format: (v: number) => v.toLocaleString() },
  { key: 'hps', header: 'HPS', label: 'HPS', description: "Healing per second (HPS)", format: (v: number) => v.toFixed(1) },
  { key: 'healPct', header: 'Heal%', label: 'Heal%', description: "Player healing share percentage", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critHealRate', header: 'Crit%', label: 'Crit%', description: "Player healing crit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: 'Crit Heal%', label: 'Crit Heal%', description: "Percentage of healing from crits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: 'Lucky%', label: 'Lucky%', description: "Player healing lucky hit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: 'Lucky Heal%', label: 'Lucky Heal%', description: "Percentage of healing from lucky hits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hitsHeal', header: 'Casts', label: 'Casts', description: "Total heal cast count", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: 'Casts/min', label: 'Casts/min', description: "Heal casts per minute", format: (v: number) => v.toFixed(1) },
] as const;

// Live meter heal player columns with correct headers
export const liveHealPlayerColumns = [
  { key: 'totalDmg', header: 'Healing', label: 'Healing', description: "Total healing dealt by the player", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: 'HPS', label: 'HPS', description: "Healing per second (HPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: 'Heal%', label: 'Heal%', description: "Player healing share percentage", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: 'Crit%', label: 'Crit%', description: "Player crit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: 'Crit Heal%', label: 'Crit Heal%', description: "Percentage of healing from crits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: 'Lucky%', label: 'Lucky%', description: "Player lucky hit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: 'Lucky Heal%', label: 'Lucky Heal%', description: "Percentage of healing from lucky hits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: 'Casts', label: 'Casts', description: "Total heal cast count", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: 'Casts/min', label: 'Casts/min', description: "Heal casts per minute", format: (v: number) => v.toFixed(1) },
] as const;

// Live meter tanked player columns with correct headers
export const liveTankedPlayerColumns = [
  { key: 'totalDmg', header: 'Tanked', label: 'Tanked', description: "Total damage tanked by the player", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: 'TPS', label: 'TPS', description: "Damage tanked per second (TPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: 'Tanked%', label: 'Tanked%', description: "Player tanked share percentage", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: 'Crit Taken%', label: 'Crit Taken%', description: "Rate at which the player is crit", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: 'Crit Tanked%', label: 'Crit Tanked%', description: "Percentage of tanked damage from crits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: 'Lucky Taken%', label: 'Lucky Taken%', description: "Rate at which the player is lucky hit", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: 'Lucky Tanked%', label: 'Lucky Tanked%', description: "Percentage of tanked damage from lucky hits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: 'Hits Taken', label: 'Hits Taken', description: "Total hits taken count", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: 'Hits Taken/min', label: 'Hits Taken/min', description: "Hits taken per minute", format: (v: number) => v.toFixed(1) },
] as const;

export const liveTankedSkillColumns = [
  { key: 'totalDmg', header: 'Tanked', label: 'Tanked', description: "Total damage tanked by this ability", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: 'DTPS', label: 'DTPS', description: "Damage tanked per second (DTPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: 'Tanked%', label: 'Tanked%', description: "Ability tanked share percentage", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: 'Crit Taken%', label: 'Crit Taken%', description: "Rate at which this ability crits the player", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: 'Crit Tanked%', label: 'Crit Tanked%', description: "Percentage of this ability's tanked damage from crits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: 'Lucky Taken%', label: 'Lucky Taken%', description: "Rate at which this ability lucky hits the player", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: 'Lucky Tanked%', label: 'Lucky Tanked%', description: "Percentage of this ability's tanked damage from lucky hits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: 'Hits Taken', label: 'Hits Taken', description: "Total hits taken from this ability", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: 'Hits Taken/min', label: 'Hits Taken/min', description: "Hits taken per minute from this ability", format: (v: number) => v.toFixed(1) },
] as const;

export const historyTankedPlayerColumns = [
  { key: 'damageTaken', header: 'Tanked', label: 'Tanked', description: "Total damage tanked by the player", format: (v: number) => v.toLocaleString() },
  { key: 'tankedPS', header: 'TPS', label: 'TPS', description: "Damage tanked per second (TPS)", format: (v: number) => v.toFixed(1) },
  { key: 'tankedPct', header: 'Tanked%', label: 'Tanked%', description: "Player tanked share percentage", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critTakenRate', header: 'Crit Taken%', label: 'Crit Taken%', description: "Rate at which the player is crit", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: 'Crit Tanked%', label: 'Crit Tanked%', description: "Percentage of tanked damage from crits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: 'Lucky Taken%', label: 'Lucky Taken%', description: "Rate at which the player is lucky hit", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: 'Lucky Tanked%', label: 'Lucky Tanked%', description: "Percentage of tanked damage from lucky hits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hitsTaken', header: 'Hits Taken', label: 'Hits Taken', description: "Total hits taken count", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: 'Hits Taken/min', label: 'Hits Taken/min', description: "Hits taken per minute", format: (v: number) => v.toFixed(1) },
] as const;

export const historyTankedSkillColumns = [
  { key: 'totalDmg', header: 'Tanked', label: 'Tanked', description: "Total damage tanked by this ability", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: 'DTPS', label: 'DTPS', description: "Damage tanked per second (DTPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: 'Tanked%', label: 'Tanked%', description: "Ability tanked share percentage", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: 'Crit Taken%', label: 'Crit Taken%', description: "Rate at which this ability crits the player", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: 'Crit Tanked%', label: 'Crit Tanked%', description: "Percentage of this ability's tanked damage from crits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: 'Lucky Taken%', label: 'Lucky Taken%', description: "Rate at which this ability lucky hits the player", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: 'Lucky Tanked%', label: 'Lucky Tanked%', description: "Percentage of this ability's tanked damage from lucky hits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: 'Hits Taken', label: 'Hits Taken', description: "Total hits taken from this ability", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: 'Hits Taken/min', label: 'Hits Taken/min', description: "Hits taken per minute from this ability", format: (v: number) => v.toFixed(1) },
] as const;

export const historyHealSkillColumns = [
  { key: 'totalDmg', header: 'Healing', label: 'Healing', description: "Total healing dealt by the skill", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: 'HPS', label: 'HPS', description: "Healing per second for the skill (HPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: 'Heal%', label: 'Heal%', description: "Skill healing share percentage", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: 'Crit%', label: 'Crit%', description: "Skill crit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: 'Crit Heal%', label: 'Crit Heal%', description: "Percentage of skill healing from crits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: 'Lucky%', label: 'Lucky%', description: "Skill lucky hit rate", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: 'Lucky Heal%', label: 'Lucky Heal%', description: "Percentage of skill healing from lucky hits", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: 'Casts', label: 'Casts', description: "Total heal cast count for skill", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: 'Casts/min', label: 'Casts/min', description: "Skill heal casts per minute", format: (v: number) => v.toFixed(1) },
] as const;

// Aliases for live views: reuse history DPS/Heal skill definitions where appropriate
export const liveDpsPlayerColumns = historyDpsPlayerColumns;
export const liveDpsSkillColumns = historyDpsSkillColumns;
export const liveHealSkillColumns = historyHealSkillColumns;
