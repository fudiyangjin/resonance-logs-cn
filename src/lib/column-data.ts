/**
 * Column data shared across history and live views.
 * This file replaces the previous `history-columns.ts` name to better
 * reflect its purpose as generic column metadata.
 */

export const historyDpsPlayerColumns = [
  { key: 'totalDmg', header: '伤害', label: '伤害', description: "显示玩家造成的总伤害", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: '秒伤', label: '秒伤', description: "显示玩家每秒造成的伤害 (DPS)", format: (v: number) => v.toFixed(1) },
  { key: 'tdps', header: '真秒伤', label: '真秒伤', description: "显示玩家的真实 DPS（仅计算活跃时间）", format: (v: number) => v.toFixed(1) },
  { key: 'bossDmg', header: '首领伤害', label: '首领伤害', description: "显示玩家对首领造成的伤害", format: (v: number) => v.toLocaleString() },
  { key: 'bossDps', header: '首领秒伤', label: '首领秒伤', description: "显示玩家对首领的秒伤 (Boss DPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: '占比%', label: '占比%', description: "显示玩家伤害占比", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: '暴击%', label: '暴击%', description: "显示玩家的暴击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: '暴击伤%', label: '暴击伤%', description: "显示玩家造成的暴击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: '幸运%', label: '幸运%', description: "显示玩家的幸运一击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: '幸运伤%', label: '幸运伤%', description: "显示玩家造成的幸运一击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: '命中数', label: '命中数', description: "显示玩家的总命中次数", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: '分均命中', label: '分均命中', description: "显示玩家每分钟的命中次数", format: (v: number) => v.toFixed(1) },
] as const;

export const historyDpsSkillColumns = [
  { key: 'totalDmg', header: '伤害', label: '伤害', description: "显示技能造成的总伤害", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: '秒伤', label: '秒伤', description: "显示技能的每秒伤害 (DPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: '占比%', label: '占比%', description: "显示技能伤害占比", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: '暴击%', label: '暴击%', description: "显示技能的暴击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: '暴击伤%', label: '暴击伤%', description: "显示技能造成的暴击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: '幸运%', label: '幸运%', description: "显示技能的幸运一击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: '幸运伤%', label: '幸运伤%', description: "显示技能造成的幸运一击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: '命中数', label: '命中数', description: "显示技能的总命中次数", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: '分均命中', label: '分均命中', description: "显示技能每分钟的命中次数", format: (v: number) => v.toFixed(1) },
] as const;

export const historyHealPlayerColumns = [
  { key: 'healDealt', header: '治疗', label: '治疗', description: "显示玩家造成的总治疗量", format: (v: number) => v.toLocaleString() },
  { key: 'hps', header: '秒疗', label: '秒疗', description: "显示玩家每秒造成的治疗量 (HPS)", format: (v: number) => v.toFixed(1) },
  { key: 'healPct', header: '占比%', label: '占比%', description: "显示玩家治疗占比", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critHealRate', header: '暴击%', label: '暴击%', description: "显示玩家的治疗暴击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: '暴击疗%', label: '暴击疗%', description: "显示玩家造成的暴击治疗比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: '幸运%', label: '幸运%', description: "显示玩家的治疗幸运一击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: '幸运疗%', label: '幸运疗%', description: "显示玩家造成的幸运一击治疗比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hitsHeal', header: '次数', label: '次数', description: "显示玩家的总治疗次数", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: '分均次数', label: '分均次数', description: "显示玩家每分钟的治疗次数", format: (v: number) => v.toFixed(1) },
] as const;

// Live meter heal player columns with correct headers
export const liveHealPlayerColumns = [
  { key: 'totalDmg', header: '治疗', label: '治疗', description: "显示玩家造成的总治疗量", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: '秒疗', label: '秒疗', description: "显示玩家每秒造成的治疗量 (HPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: '占比%', label: '占比%', description: "显示玩家治疗占比", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: '暴击%', label: '暴击%', description: "显示玩家的暴击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: '暴击疗%', label: '暴击疗%', description: "显示玩家造成的暴击治疗比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: '幸运%', label: '幸运%', description: "显示玩家的幸运一击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: '幸运疗%', label: '幸运疗%', description: "显示玩家造成的幸运一击治疗比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: '次数', label: '次数', description: "显示玩家的总治疗次数", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: '分均次数', label: '分均次数', description: "显示玩家每分钟的治疗次数", format: (v: number) => v.toFixed(1) },
] as const;

// Live meter tanked player columns with correct headers
export const liveTankedPlayerColumns = [
  { key: 'totalDmg', header: '承伤', label: '承伤', description: "显示玩家承受的总伤害", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: '秒承伤', label: '秒承伤', description: "显示玩家每秒承受的伤害 (TPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: '占比%', label: '占比%', description: "显示玩家承伤占比", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: '被暴击%', label: '被暴击%', description: "显示玩家被暴击的几率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: '暴击承伤%', label: '暴击承伤%', description: "显示玩家承受的暴击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: '被幸运%', label: '被幸运%', description: "显示玩家被幸运一击的几率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: '幸运承伤%', label: '幸运承伤%', description: "显示玩家承受的幸运一击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: '受击数', label: '受击数', description: "显示玩家的总受击次数", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: '分均受击', label: '分均受击', description: "显示玩家每分钟的受击次数", format: (v: number) => v.toFixed(1) },
] as const;

export const liveTankedSkillColumns = [
  { key: 'totalDmg', header: '承伤', label: '承伤', description: "显示技能造成的总承伤", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: '秒承伤', label: '秒承伤', description: "显示技能每秒造成的承伤 (DTPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: '占比%', label: '占比%', description: "显示技能承伤占比", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: '被暴击%', label: '被暴击%', description: "显示该技能被暴击的几率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: '暴击承伤%', label: '暴击承伤%', description: "显示该技能承受的暴击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: '被幸运%', label: '被幸运%', description: "显示该技能被幸运一击的几率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: '幸运承伤%', label: '幸运承伤%', description: "显示该技能承受的幸运一击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: '受击数', label: '受击数', description: "显示该技能造成的总受击次数", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: '分均受击', label: '分均受击', description: "显示该技能每分钟造成的受击次数", format: (v: number) => v.toFixed(1) },
] as const;

export const historyTankedPlayerColumns = [
  { key: 'damageTaken', header: '承伤', label: '承伤', description: "显示玩家承受的总伤害", format: (v: number) => v.toLocaleString() },
  { key: 'tankedPS', header: '秒承伤', label: '秒承伤', description: "显示玩家每秒承受的伤害 (TPS)", format: (v: number) => v.toFixed(1) },
  { key: 'tankedPct', header: '占比%', label: '占比%', description: "显示玩家承伤占比", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critTakenRate', header: '被暴击%', label: '被暴击%', description: "显示玩家被暴击的几率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: '暴击承伤%', label: '暴击承伤%', description: "显示玩家承受的暴击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: '被幸运%', label: '被幸运%', description: "显示玩家被幸运一击的几率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: '幸运承伤%', label: '幸运承伤%', description: "显示玩家承受的幸运一击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hitsTaken', header: '受击数', label: '受击数', description: "显示玩家的总受击次数", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: '分均受击', label: '分均受击', description: "显示玩家每分钟的受击次数", format: (v: number) => v.toFixed(1) },
] as const;

export const historyTankedSkillColumns = [
  { key: 'totalDmg', header: '承伤', label: '承伤', description: "显示技能造成的总承伤", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: '秒承伤', label: '秒承伤', description: "显示技能每秒造成的承伤 (DTPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: '占比%', label: '占比%', description: "显示技能承伤占比", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: '被暴击%', label: '被暴击%', description: "显示该技能被暴击的几率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: '暴击承伤%', label: '暴击承伤%', description: "显示该技能承受的暴击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: '被幸运%', label: '被幸运%', description: "显示该技能被幸运一击的几率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: '幸运承伤%', label: '幸运承伤%', description: "显示该技能承受的幸运一击伤害比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: '受击数', label: '受击数', description: "显示该技能造成的总受击次数", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: '分均受击', label: '分均受击', description: "显示该技能每分钟造成的受击次数", format: (v: number) => v.toFixed(1) },
] as const;

export const historyHealSkillColumns = [
  { key: 'totalDmg', header: '治疗', label: '治疗', description: "显示技能造成的总治疗量", format: (v: number) => v.toLocaleString() },
  { key: 'dps', header: '秒疗', label: '秒疗', description: "显示技能每秒造成的治疗量 (HPS)", format: (v: number) => v.toFixed(1) },
  { key: 'dmgPct', header: '占比%', label: '占比%', description: "显示技能治疗占比", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critRate', header: '暴击%', label: '暴击%', description: "显示技能的暴击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'critDmgRate', header: '暴击疗%', label: '暴击疗%', description: "显示技能造成的暴击治疗比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyRate', header: '幸运%', label: '幸运%', description: "显示技能的幸运一击率", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'luckyDmgRate', header: '幸运疗%', label: '幸运疗%', description: "显示技能造成的幸运一击治疗比例", format: (v: number) => v.toFixed(1) + '%' },
  { key: 'hits', header: '次数', label: '次数', description: "显示技能的总治疗次数", format: (v: number) => v.toLocaleString() },
  { key: 'hitsPerMinute', header: '分均次数', label: '分均次数', description: "显示技能每分钟的治疗次数", format: (v: number) => v.toFixed(1) },
] as const;

// Aliases for live views: reuse history DPS/Heal skill definitions where appropriate
export const liveDpsPlayerColumns = historyDpsPlayerColumns;
export const liveDpsSkillColumns = historyDpsSkillColumns;
export const liveHealSkillColumns = historyHealSkillColumns;
