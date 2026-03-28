
/**
 * Column data shared across history and live views.
 * This file replaces the previous `history-columns.ts` name to better
 * reflect its purpose as generic column metadata.
 */

export type ColumnDefinition = {
  key: string;
  header: string;
  label: string;
  description: string;
  format: (v: number) => string;
  headerKey?: string;
  labelKey?: string;
  descriptionKey?: string;
};

const integer = (v: number) => v.toLocaleString();
const fixed1 = (v: number) => v.toFixed(1);
const percent1 = (v: number) => v.toFixed(1) + "%";

function makeColumn(
  section: string,
  key: string,
  header: string,
  label: string,
  description: string,
  format: (v: number) => string,
): ColumnDefinition {
  return {
    key,
    header,
    label,
    description,
    format,
    headerKey: `${section}.${key}.header`,
    labelKey: `${section}.${key}.label`,
    descriptionKey: `${section}.${key}.description`,
  };
}

export const historyDpsPlayerColumns = [
  makeColumn("dps.columns.historyPlayers", "totalDmg", "伤害", "伤害", "显示玩家造成的总伤害", integer),
  makeColumn("dps.columns.historyPlayers", "dps", "秒伤", "秒伤", "显示玩家每秒造成的伤害 (DPS)", fixed1),
  makeColumn("dps.columns.historyPlayers", "tdps", "真秒伤", "真秒伤", "显示玩家的真实 DPS（基于全局活跃战斗时间）", fixed1),
  makeColumn("dps.columns.historyPlayers", "bossDmg", "首领伤害", "首领伤害", "显示玩家对首领造成的伤害", integer),
  makeColumn("dps.columns.historyPlayers", "bossDps", "首领秒伤", "首领秒伤", "显示玩家对首领的秒伤 (Boss DPS)", fixed1),
  makeColumn("dps.columns.historyPlayers", "dmgPct", "占比%", "占比%", "显示玩家伤害占比", percent1),
  makeColumn("dps.columns.historyPlayers", "critRate", "暴击%", "暴击%", "显示玩家的暴击率", percent1),
  makeColumn("dps.columns.historyPlayers", "critDmgRate", "暴击伤%", "暴击伤%", "显示玩家造成的暴击伤害比例", percent1),
  makeColumn("dps.columns.historyPlayers", "luckyRate", "幸运%", "幸运%", "显示玩家的幸运一击率", percent1),
  makeColumn("dps.columns.historyPlayers", "luckyDmgRate", "幸运伤%", "幸运伤%", "显示玩家造成的幸运一击伤害比例", percent1),
  makeColumn("dps.columns.historyPlayers", "hits", "命中数", "命中数", "显示玩家的总命中次数", integer),
  makeColumn("dps.columns.historyPlayers", "hitsPerMinute", "分均命中", "分均命中", "显示玩家每分钟的命中次数", fixed1),
] as const satisfies readonly ColumnDefinition[];

export const historyDpsSkillColumns = [
  makeColumn("dps.columns.historySkills", "totalDmg", "伤害", "伤害", "显示技能造成的总伤害", integer),
  makeColumn("dps.columns.historySkills", "dps", "秒伤", "秒伤", "显示技能的每秒伤害 (DPS)", fixed1),
  makeColumn("dps.columns.historySkills", "dmgPct", "占比%", "占比%", "显示技能伤害占比", percent1),
  makeColumn("dps.columns.historySkills", "critRate", "暴击%", "暴击%", "显示技能的暴击率", percent1),
  makeColumn("dps.columns.historySkills", "critDmgRate", "暴击伤%", "暴击伤%", "显示技能造成的暴击伤害比例", percent1),
  makeColumn("dps.columns.historySkills", "luckyRate", "幸运%", "幸运%", "显示技能的幸运一击率", percent1),
  makeColumn("dps.columns.historySkills", "luckyDmgRate", "幸运伤%", "幸运伤%", "显示技能造成的幸运一击伤害比例", percent1),
  makeColumn("dps.columns.historySkills", "hits", "命中数", "命中数", "显示技能的总命中次数", integer),
  makeColumn("dps.columns.historySkills", "hitsPerMinute", "分均命中", "分均命中", "显示技能每分钟的命中次数", fixed1),
] as const satisfies readonly ColumnDefinition[];

export const historyHealPlayerColumns = [
  makeColumn("dps.columns.historyHealPlayers", "healDealt", "治疗", "治疗", "显示玩家造成的总治疗量", integer),
  makeColumn("dps.columns.historyHealPlayers", "hps", "秒疗", "秒疗", "显示玩家每秒造成的治疗量 (HPS)", fixed1),
  makeColumn("dps.columns.historyHealPlayers", "healPct", "占比%", "占比%", "显示玩家治疗占比", percent1),
  makeColumn("dps.columns.historyHealPlayers", "critHealRate", "暴击%", "暴击%", "显示玩家的治疗暴击率", percent1),
  makeColumn("dps.columns.historyHealPlayers", "critDmgRate", "暴击疗%", "暴击疗%", "显示玩家造成的暴击治疗比例", percent1),
  makeColumn("dps.columns.historyHealPlayers", "luckyRate", "幸运%", "幸运%", "显示玩家的治疗幸运一击率", percent1),
  makeColumn("dps.columns.historyHealPlayers", "luckyDmgRate", "幸运疗%", "幸运疗%", "显示玩家造成的幸运一击治疗比例", percent1),
  makeColumn("dps.columns.historyHealPlayers", "hitsHeal", "次数", "次数", "显示玩家的总治疗次数", integer),
  makeColumn("dps.columns.historyHealPlayers", "hitsPerMinute", "分均次数", "分均次数", "显示玩家每分钟的治疗次数", fixed1),
] as const satisfies readonly ColumnDefinition[];

export const liveHealPlayerColumns = [
  makeColumn("dps.columns.liveHealPlayers", "totalDmg", "治疗", "治疗", "显示玩家造成的总治疗量", integer),
  makeColumn("dps.columns.liveHealPlayers", "dps", "秒疗", "秒疗", "显示玩家每秒造成的治疗量 (HPS)", fixed1),
  makeColumn("dps.columns.liveHealPlayers", "dmgPct", "占比%", "占比%", "显示玩家治疗占比", percent1),
  makeColumn("dps.columns.liveHealPlayers", "critRate", "暴击%", "暴击%", "显示玩家的暴击率", percent1),
  makeColumn("dps.columns.liveHealPlayers", "critDmgRate", "暴击疗%", "暴击疗%", "显示玩家造成的暴击治疗比例", percent1),
  makeColumn("dps.columns.liveHealPlayers", "luckyRate", "幸运%", "幸运%", "显示玩家的幸运一击率", percent1),
  makeColumn("dps.columns.liveHealPlayers", "luckyDmgRate", "幸运疗%", "幸运疗%", "显示玩家造成的幸运一击治疗比例", percent1),
  makeColumn("dps.columns.liveHealPlayers", "hits", "次数", "次数", "显示玩家的总治疗次数", integer),
  makeColumn("dps.columns.liveHealPlayers", "hitsPerMinute", "分均次数", "分均次数", "显示玩家每分钟的治疗次数", fixed1),
] as const satisfies readonly ColumnDefinition[];

export const liveTankedPlayerColumns = [
  makeColumn("dps.columns.liveTankedPlayers", "totalDmg", "承伤", "承伤", "显示玩家承受的总伤害", integer),
  makeColumn("dps.columns.liveTankedPlayers", "dps", "秒承伤", "秒承伤", "显示玩家每秒承受的伤害 (TPS)", fixed1),
  makeColumn("dps.columns.liveTankedPlayers", "dmgPct", "占比%", "占比%", "显示玩家承伤占比", percent1),
  makeColumn("dps.columns.liveTankedPlayers", "critRate", "被暴击%", "被暴击%", "显示玩家被暴击的几率", percent1),
  makeColumn("dps.columns.liveTankedPlayers", "critDmgRate", "暴击承伤%", "暴击承伤%", "显示玩家承受的暴击伤害比例", percent1),
  makeColumn("dps.columns.liveTankedPlayers", "luckyRate", "被幸运%", "被幸运%", "显示玩家被幸运一击的几率", percent1),
  makeColumn("dps.columns.liveTankedPlayers", "luckyDmgRate", "幸运承伤%", "幸运承伤%", "显示玩家承受的幸运一击伤害比例", percent1),
  makeColumn("dps.columns.liveTankedPlayers", "hits", "受击数", "受击数", "显示玩家的总受击次数", integer),
  makeColumn("dps.columns.liveTankedPlayers", "hitsPerMinute", "分均受击", "分均受击", "显示玩家每分钟的受击次数", fixed1),
] as const satisfies readonly ColumnDefinition[];

export const liveTankedSkillColumns = [
  makeColumn("dps.columns.liveTankedSkills", "totalDmg", "承伤", "承伤", "显示技能造成的总承伤", integer),
  makeColumn("dps.columns.liveTankedSkills", "dps", "秒承伤", "秒承伤", "显示技能每秒造成的承伤 (DTPS)", fixed1),
  makeColumn("dps.columns.liveTankedSkills", "dmgPct", "占比%", "占比%", "显示技能承伤占比", percent1),
  makeColumn("dps.columns.liveTankedSkills", "critRate", "被暴击%", "被暴击%", "显示该技能被暴击的几率", percent1),
  makeColumn("dps.columns.liveTankedSkills", "critDmgRate", "暴击承伤%", "暴击承伤%", "显示该技能承受的暴击伤害比例", percent1),
  makeColumn("dps.columns.liveTankedSkills", "luckyRate", "被幸运%", "被幸运%", "显示该技能被幸运一击的几率", percent1),
  makeColumn("dps.columns.liveTankedSkills", "luckyDmgRate", "幸运承伤%", "幸运承伤%", "显示该技能承受的幸运一击伤害比例", percent1),
  makeColumn("dps.columns.liveTankedSkills", "hits", "受击数", "受击数", "显示该技能造成的总受击次数", integer),
  makeColumn("dps.columns.liveTankedSkills", "hitsPerMinute", "分均受击", "分均受击", "显示该技能每分钟造成的受击次数", fixed1),
] as const satisfies readonly ColumnDefinition[];

export const historyTankedPlayerColumns = [
  makeColumn("dps.columns.historyTankedPlayers", "damageTaken", "承伤", "承伤", "显示玩家承受的总伤害", integer),
  makeColumn("dps.columns.historyTankedPlayers", "tankedPS", "秒承伤", "秒承伤", "显示玩家每秒承受的伤害 (TPS)", fixed1),
  makeColumn("dps.columns.historyTankedPlayers", "tankedPct", "占比%", "占比%", "显示玩家承伤占比", percent1),
  makeColumn("dps.columns.historyTankedPlayers", "critTakenRate", "被暴击%", "被暴击%", "显示玩家被暴击的几率", percent1),
  makeColumn("dps.columns.historyTankedPlayers", "critDmgRate", "暴击承伤%", "暴击承伤%", "显示玩家承受的暴击伤害比例", percent1),
  makeColumn("dps.columns.historyTankedPlayers", "luckyRate", "被幸运%", "被幸运%", "显示玩家被幸运一击的几率", percent1),
  makeColumn("dps.columns.historyTankedPlayers", "luckyDmgRate", "幸运承伤%", "幸运承伤%", "显示玩家承受的幸运一击伤害比例", percent1),
  makeColumn("dps.columns.historyTankedPlayers", "hitsTaken", "受击数", "受击数", "显示玩家的总受击次数", integer),
  makeColumn("dps.columns.historyTankedPlayers", "hitsPerMinute", "分均受击", "分均受击", "显示玩家每分钟的受击次数", fixed1),
] as const satisfies readonly ColumnDefinition[];

export const historyTankedSkillColumns = [
  makeColumn("dps.columns.historyTankedSkills", "totalDmg", "承伤", "承伤", "显示技能造成的总承伤", integer),
  makeColumn("dps.columns.historyTankedSkills", "dps", "秒承伤", "秒承伤", "显示技能每秒造成的承伤 (DTPS)", fixed1),
  makeColumn("dps.columns.historyTankedSkills", "dmgPct", "占比%", "占比%", "显示技能承伤占比", percent1),
  makeColumn("dps.columns.historyTankedSkills", "critRate", "被暴击%", "被暴击%", "显示该技能被暴击的几率", percent1),
  makeColumn("dps.columns.historyTankedSkills", "critDmgRate", "暴击承伤%", "暴击承伤%", "显示该技能承受的暴击伤害比例", percent1),
  makeColumn("dps.columns.historyTankedSkills", "luckyRate", "被幸运%", "被幸运%", "显示该技能被幸运一击的几率", percent1),
  makeColumn("dps.columns.historyTankedSkills", "luckyDmgRate", "幸运承伤%", "幸运承伤%", "显示该技能承受的幸运一击伤害比例", percent1),
  makeColumn("dps.columns.historyTankedSkills", "hits", "受击数", "受击数", "显示该技能造成的总受击次数", integer),
  makeColumn("dps.columns.historyTankedSkills", "hitsPerMinute", "分均受击", "分均受击", "显示该技能每分钟造成的受击次数", fixed1),
] as const satisfies readonly ColumnDefinition[];

export const historyHealSkillColumns = [
  makeColumn("dps.columns.historyHealSkills", "totalDmg", "治疗", "治疗", "显示技能造成的总治疗量", integer),
  makeColumn("dps.columns.historyHealSkills", "dps", "秒疗", "秒疗", "显示技能每秒造成的治疗量 (HPS)", fixed1),
  makeColumn("dps.columns.historyHealSkills", "dmgPct", "占比%", "占比%", "显示技能治疗占比", percent1),
  makeColumn("dps.columns.historyHealSkills", "critRate", "暴击%", "暴击%", "显示技能的暴击率", percent1),
  makeColumn("dps.columns.historyHealSkills", "critDmgRate", "暴击疗%", "暴击疗%", "显示技能造成的暴击治疗比例", percent1),
  makeColumn("dps.columns.historyHealSkills", "luckyRate", "幸运%", "幸运%", "显示技能的幸运一击率", percent1),
  makeColumn("dps.columns.historyHealSkills", "luckyDmgRate", "幸运疗%", "幸运疗%", "显示技能造成的幸运一击治疗比例", percent1),
  makeColumn("dps.columns.historyHealSkills", "hits", "次数", "次数", "显示技能的总治疗次数", integer),
  makeColumn("dps.columns.historyHealSkills", "hitsPerMinute", "分均次数", "分均次数", "显示技能每分钟的治疗次数", fixed1),
] as const satisfies readonly ColumnDefinition[];

// Aliases for live views: reuse history DPS/Heal skill definitions where appropriate
export const liveDpsPlayerColumns = historyDpsPlayerColumns;
export const liveDpsSkillColumns = historyDpsSkillColumns;
export const liveHealSkillColumns = historyHealSkillColumns;
