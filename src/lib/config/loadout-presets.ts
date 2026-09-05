/**
 * @file Curated built-in loadout presets. Preset payloads use the same
 * versioned schema as user exports so they cannot silently drift from the
 * import/export contract.
 */
import type { AppLocale } from "$lib/i18n/locales";
import { parseLoadoutExport, type LoadoutExport } from "$lib/loadout-import";
import radiantShieldSource from "./loadout-presets/radiant-shield.json";
import recoverySource from "./loadout-presets/recovery.json";
import blockSource from "./loadout-presets/block.json";
import earthfortSource from "./loadout-presets/earthfort.json";
import smiteSource from "./loadout-presets/smite.json";
import concertoSource from "./loadout-presets/concerto.json";

export type LoadoutPreset = {
  id: string;
  name: string;
  subtitle: string;
  iconPath: string;
  palette: readonly [string, string, string];
  data: LoadoutExport;
};

type PresetLabel = Pick<LoadoutPreset, "name" | "subtitle">;

type PresetDefinition = {
  id: string;
  labels: Record<AppLocale, PresetLabel>;
  iconPath: string;
  palette: readonly [string, string, string];
  /** Talent branch this preset's loadout auto-binds to on creation. */
  talentStageCfgId: number;
  source: unknown;
};

const PRESET_DEFINITIONS: PresetDefinition[] = [
  {
    id: "radiant-shield",
    labels: {
      "zh-CN": { name: "光盾", subtitle: "神盾骑士 · 光盾专精" },
      "en-US": { name: "Radiant Shield", subtitle: "Shield Knight · Radiant Shield" },
      "ja-JP": { name: "光盾", subtitle: "神盾騎士 · 光盾特化" },
    },
    iconPath: "/images/class_specs/Shield.png",
    palette: ["#fde68a", "#67e8f9", "#4ade80"],
    talentStageCfgId: 123,
    source: radiantShieldSource,
  },
  {
    id: "recovery",
    labels: {
      "zh-CN": { name: "防盾", subtitle: "神盾骑士 · 防盾专精" },
      "en-US": { name: "Recovery", subtitle: "Shield Knight · Recovery" },
      "ja-JP": { name: "リカバリー", subtitle: "シールドナイト · リカバリー特化" },
    },
    iconPath: "/images/class_specs/Recovery.png",
    palette: ["#93c5fd", "#60a5fa", "#fde68a"],
    talentStageCfgId: 122,
    source: recoverySource,
  },
  {
    id: "block",
    labels: {
      "zh-CN": { name: "格挡", subtitle: "巨刃守护者 · 格挡专精" },
      "en-US": { name: "Block", subtitle: "Heavy Guardian · Block" },
      "ja-JP": { name: "ブロック", subtitle: "ヘビーガーディアン · ブロック特化" },
    },
    iconPath: "/images/class_specs/Block.png",
    palette: ["#fed7aa", "#fb923c", "#a3a3a3"],
    talentStageCfgId: 114,
    source: blockSource,
  },
  {
    id: "earthfort",
    labels: {
      "zh-CN": { name: "岩盾", subtitle: "巨刃守护者 · 岩盾专精" },
      "en-US": { name: "Earthfort", subtitle: "Heavy Guardian · Earthfort" },
      "ja-JP": { name: "アースフォート", subtitle: "ヘビーガーディアン · アースフォート特化" },
    },
    iconPath: "/images/class_specs/Earthfort.png",
    palette: ["#e6c25a", "#d97706", "#4ade80"],
    talentStageCfgId: 113,
    source: earthfortSource,
  },
  {
    id: "smite",
    labels: {
      "zh-CN": { name: "惩击", subtitle: "森语者 · 惩击专精" },
      "en-US": { name: "Smite", subtitle: "Verdant Oracle · Smite" },
      "ja-JP": { name: "スマイト", subtitle: "ヴァーダントオラクル · スマイト特化" },
    },
    iconPath: "/images/class_specs/Smite.png",
    palette: ["#d9f99d", "#a3e635", "#fde68a"],
    talentStageCfgId: 110,
    source: smiteSource,
  },
  {
    id: "concerto",
    labels: {
      "zh-CN": { name: "协奏", subtitle: "灵魂乐手 · 协奏专精" },
      "en-US": { name: "Concerto", subtitle: "Beat Performer · Concerto" },
      "ja-JP": { name: "コンチェルト", subtitle: "ビートパフォーマー · コンチェルト特化" },
    },
    iconPath: "/images/class_specs/Concerto.png",
    palette: ["#fecdd3", "#fb7185", "#fbbf24"],
    talentStageCfgId: 120,
    source: concertoSource,
  },
];

const PARSED_PRESETS = PRESET_DEFINITIONS.map((definition) => {
  const parsed = parseLoadoutExport(definition.source);
  if (!parsed.success) {
    throw new Error(
      `Invalid built-in loadout preset "${definition.id}": ${parsed.issues.join(", ")}`,
    );
  }
  // Selecting a preset grants its spec binding automatically; the JSON
  // sources stay schema-clean and the linkage lives next to the labels.
  return {
    definition,
    data: {
      ...parsed.output,
      linkedTalentStageCfgId: definition.talentStageCfgId,
    },
  };
});

export function buildLoadoutPresets(locale: AppLocale): LoadoutPreset[] {
  return PARSED_PRESETS.map(({ definition, data }) => ({
    id: definition.id,
    ...definition.labels[locale],
    iconPath: definition.iconPath,
    palette: definition.palette,
    data,
  }));
}
