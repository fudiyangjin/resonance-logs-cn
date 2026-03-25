/**
 * @file This file contains the settings store for the application.
 * It uses `@tauri-store/svelte` to create persistent stores for user settings.
 */
import { RuneStore } from '@tauri-store/svelte';
import type { BuffCategoryKey } from "./config/buff-name-table";
import { bootstrapLiteral, bootstrapMessage, tl } from "./i18n/index.svelte";
import type { AppLanguage } from "./i18n/types";

export const DEFAULT_STATS = {
  totalDmg: true,
  dps: true,
  tdps: false,
  bossDmg: true,
  bossDps: true,
  dmgPct: true,
  critRate: true,
  critDmgRate: true,
  luckyRate: false,
  luckyDmgRate: false,
  hits: false,
  hitsPerMinute: false,
};

export const DEFAULT_HISTORY_STATS = {
  totalDmg: true,
  dps: true,
  tdps: false,
  bossDmg: true,
  bossDps: true,
  dmgPct: true,
  critRate: false,
  critDmgRate: false,
  luckyRate: false,
  luckyDmgRate: false,
  hits: false,
  hitsPerMinute: false,
};

export const DEFAULT_HISTORY_TANKED_STATS = {
  damageTaken: true,
  tankedPS: true,
  tankedPct: true,
  critTakenRate: false,
  critDmgRate: false,
  luckyRate: false,
  luckyDmgRate: false,
  hitsTaken: false,
  hitsPerMinute: false,
};

export const DEFAULT_HISTORY_HEAL_STATS = {
  healDealt: true,
  hps: true,
  healPct: true,
  critHealRate: false,
  critDmgRate: false,
  luckyRate: false,
  luckyDmgRate: false,
  hitsHeal: false,
  hitsPerMinute: false,
};

// Default column order for live tables (keys from column-data.ts)
export const DEFAULT_DPS_PLAYER_COLUMN_ORDER = ['totalDmg', 'dps', 'tdps', 'bossDmg', 'bossDps', 'dmgPct', 'critRate', 'critDmgRate', 'luckyRate', 'luckyDmgRate', 'hits', 'hitsPerMinute'];
export const DEFAULT_DPS_SKILL_COLUMN_ORDER = ['totalDmg', 'dps', 'dmgPct', 'critRate', 'critDmgRate', 'luckyRate', 'luckyDmgRate', 'hits', 'hitsPerMinute'];
export const DEFAULT_HEAL_PLAYER_COLUMN_ORDER = ['totalDmg', 'dps', 'dmgPct', 'critRate', 'critDmgRate', 'luckyRate', 'luckyDmgRate', 'hits', 'hitsPerMinute'];
export const DEFAULT_HEAL_SKILL_COLUMN_ORDER = ['totalDmg', 'dps', 'dmgPct', 'critRate', 'critDmgRate', 'luckyRate', 'luckyDmgRate', 'hits', 'hitsPerMinute'];
export const DEFAULT_TANKED_PLAYER_COLUMN_ORDER = ['totalDmg', 'dps', 'dmgPct', 'critRate', 'critDmgRate', 'luckyRate', 'luckyDmgRate', 'hits', 'hitsPerMinute'];
export const DEFAULT_TANKED_SKILL_COLUMN_ORDER = ['totalDmg', 'dps', 'dmgPct', 'critRate', 'critDmgRate', 'luckyRate', 'luckyDmgRate', 'hits', 'hitsPerMinute'];

// Default sort settings for live tables
export const DEFAULT_LIVE_SORT_SETTINGS = {
  dpsPlayers: { sortKey: 'totalDmg', sortDesc: true },
  dpsSkills: { sortKey: 'totalDmg', sortDesc: true },
  healPlayers: { sortKey: 'totalDmg', sortDesc: true },
  healSkills: { sortKey: 'totalDmg', sortDesc: true },
  tankedPlayers: { sortKey: 'totalDmg', sortDesc: true },
  tankedSkills: { sortKey: 'totalDmg', sortDesc: true },
};

export type ShortcutSettingId = keyof typeof DEFAULT_SETTINGS.shortcuts;

export type Point = {
  x: number;
  y: number;
};

export type PanelAttrConfig = {
  attrId: number;
  label: string;
  color: string;
  enabled: boolean;
  format: "percent" | "integer";
};

function createPanelAttr(
  attrId: number,
  labelKey: string,
  color: string,
  enabled: boolean,
  format: PanelAttrConfig["format"],
): PanelAttrConfig {
  return {
    attrId,
    get label() {
      return tl(labelKey);
    },
    color,
    enabled,
    format,
  };
}

export const AVAILABLE_PANEL_ATTRS: PanelAttrConfig[] = [
  createPanelAttr(11720, "Attack Speed", "#6ee7ff", false, "percent"),
  createPanelAttr(11710, "Crit Rate", "#ff7a7a", false, "percent"),
  createPanelAttr(11930, "Haste", "#facc15", false, "percent"),
  createPanelAttr(11780, "Luck", "#a78bfa", false, "percent"),
  createPanelAttr(11940, "Mastery", "#60a5fa", false, "percent"),
  createPanelAttr(11950, "Versatility", "#34d399", false, "percent"),
  createPanelAttr(11760, "Cooldown Reduction", "#f97316", false, "percent"),
  createPanelAttr(11960, "Cooldown Acceleration", "#38bdf8", false, "percent"),
  createPanelAttr(11010, "Strength", "#f87171", false, "integer"),
  createPanelAttr(11020, "Intelligence", "#818cf8", false, "integer"),
  createPanelAttr(11030, "Agility", "#4ade80", false, "integer"),
  createPanelAttr(11330, "Physical Attack", "#fb923c", false, "integer"),
  createPanelAttr(11340, "Magic Attack", "#c084fc", false, "integer"),
  createPanelAttr(11730, "Cast Speed", "#22d3ee", false, "percent"),
  createPanelAttr(12510, "Crit Damage", "#f472b6", false, "percent"),
  createPanelAttr(12530, "Lucky Damage Multiplier", "#d8b4fe", false, "percent"),
  createPanelAttr(12540, "Block Damage Reduction", "#86efac", false, "percent"),
  createPanelAttr(11970, "Block", "#fbbf24", false, "percent"),
];

export type OverlayPositions = {
  skillCdGroup: Point;
  resourceGroup: Point;
  textBuffPanel: Point;
  specialBuffGroup: Point;
  panelAttrGroup: Point;
  customPanelGroup: Point;
  iconBuffPositions: Record<number, Point>;
  skillDurationPositions: Record<number, Point>;
  categoryIconPositions?: Partial<Record<BuffCategoryKey, Point>>;
};

export type OverlaySizes = {
  skillCdGroupScale: number;
  resourceGroupScale: number;
  textBuffPanelScale: number;
  panelAttrGroupScale: number;
  customPanelGroupScale: number;
  panelAttrGap: number;
  panelAttrFontSize: number;
  panelAttrColumnGap: number;
  iconBuffSizes: Record<number, number>;
  skillDurationSizes: Record<number, number>;
  categoryIconSizes?: Partial<Record<BuffCategoryKey, number>>;
};

export type OverlayVisibility = {
  showSkillCdGroup: boolean;
  showSkillDurationGroup: boolean;
  showResourceGroup: boolean;
  showPanelAttrGroup: boolean;
  showCustomPanelGroup: boolean;
};

export type CustomPanelStyle = {
  gap: number;
  columnGap: number;
  fontSize: number;
  nameColor: string;
  valueColor: string;
  progressColor: string;
  progressOpacity: number;
};

export type MonsterOverlayPositions = {
  monsterBuffPanel: Point;
  hatePanel: Point;
};

export type MonsterOverlaySizes = {
  monsterBuffPanelScale: number;
  hatePanelScale: number;
};

export type MonsterMonitorConfig = {
  enabled: boolean;
  hateListEnabled: boolean;
  hateListMaxDisplay: number;
  monitoredBuffIds: number[];
  selfAppliedBuffIds: number[];
  buffAliases: BuffAliasMap;
  overlayPositions: MonsterOverlayPositions;
  overlaySizes: MonsterOverlaySizes;
  panelStyle: CustomPanelStyle;
  hatePanelStyle: CustomPanelStyle;
};

export type TextBuffPanelDisplayMode = "modern" | "classic";

export type TextBuffPanelStyle = {
  displayMode: TextBuffPanelDisplayMode;
  gap: number;
  columnGap: number;
  fontSize: number;
  nameColor: string;
  valueColor: string;
  progressColor: string;
  progressOpacity: number;
};

export type BuffDisplayMode = "individual" | "grouped";

export type BuffAliasMap = Record<string, string>;

export type InlineBuffFormat = "active" | "stacks_timer" | "timer";

export type InlineBuffEntry = {
  id: string;
  sourceType: "buff" | "counter";
  sourceId: number;
  label: string;
  format: InlineBuffFormat;
};

export type PanelAreaRowRef = { type: "attr"; attrId: number };

export type CustomPanelGroup = {
  id: string;
  name: string;
  entries: InlineBuffEntry[];
  position: Point;
  scale: number;
};

export type BuffGroup = {
  id: string;
  name: string;
  buffIds: number[];
  priorityBuffIds: number[];
  monitorAll: boolean;
  position: Point;
  iconSize: number;
  columns: number;
  rows: number;
  gap: number;
  showName: boolean;
  showTime: boolean;
  showLayer: boolean;
};

export type SkillMonitorProfile = {
  name: string;
  selectedClass: string;
  monitoredSkillIds: number[];
  monitoredSkillDurationIds: number[];
  monitoredBuffIds: number[];
  monitoredBuffCategories?: BuffCategoryKey[];
  monitoredPanelAttrs: PanelAttrConfig[];
  buffPriorityIds: number[];
  buffDisplayMode: BuffDisplayMode;
  buffGroups: BuffGroup[];
  individualMonitorAllGroup?: BuffGroup | null;
  customPanelGroups?: CustomPanelGroup[];
  inlineBuffEntries?: InlineBuffEntry[];
  panelAreaRowOrder?: PanelAreaRowRef[];
  customPanelStyle?: CustomPanelStyle;
  textBuffPanelStyle?: TextBuffPanelStyle;
  textBuffMaxVisible: number;
  overlayPositions: OverlayPositions;
  overlaySizes: OverlaySizes;
  overlayVisibility: OverlayVisibility;
};

export function ensureBuffAliases(
  buffAliases: BuffAliasMap | null | undefined,
): BuffAliasMap {
  const next: BuffAliasMap = {};
  for (const [baseId, alias] of Object.entries(buffAliases ?? {})) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    next[baseId] = trimmed;
  }
  return next;
}

function createDefaultOverlayPositions(): OverlayPositions {
  return {
    skillCdGroup: { x: 40, y: 40 },
    resourceGroup: { x: 40, y: 170 },
    textBuffPanel: { x: 360, y: 40 },
    specialBuffGroup: { x: 360, y: 220 },
    panelAttrGroup: { x: 700, y: 40 },
    customPanelGroup: { x: 700, y: 280 },
    iconBuffPositions: {},
    skillDurationPositions: {},
    categoryIconPositions: {},
  };
}

function createDefaultOverlaySizes(): OverlaySizes {
  return {
    skillCdGroupScale: 1,
    resourceGroupScale: 1,
    textBuffPanelScale: 1,
    panelAttrGroupScale: 1,
    customPanelGroupScale: 1,
    panelAttrGap: 4,
    panelAttrFontSize: 14,
    panelAttrColumnGap: 12,
    iconBuffSizes: {},
    skillDurationSizes: {},
    categoryIconSizes: {},
  };
}

function createDefaultOverlayVisibility(): OverlayVisibility {
  return {
    showSkillCdGroup: true,
    showSkillDurationGroup: true,
    showResourceGroup: true,
    showPanelAttrGroup: true,
    showCustomPanelGroup: true,
  };
}

function createDefaultCustomPanelStyle(): CustomPanelStyle {
  return {
    gap: 6,
    columnGap: 12,
    fontSize: 14,
    nameColor: "#ffffff",
    valueColor: "#ffffff",
    progressColor: "#ffffff",
    progressOpacity: 0.4,
  };
}

function createDefaultMonsterOverlayPositions(): MonsterOverlayPositions {
  return {
    monsterBuffPanel: { x: 40, y: 40 },
    hatePanel: { x: 40, y: 300 },
  };
}

function createDefaultMonsterOverlaySizes(): MonsterOverlaySizes {
  return {
    monsterBuffPanelScale: 1,
    hatePanelScale: 1,
  };
}

function createDefaultTextBuffPanelStyle(): TextBuffPanelStyle {
  return {
    displayMode: "modern",
    gap: 6,
    columnGap: 8,
    fontSize: 12,
    nameColor: "#ffffff",
    valueColor: "#ffffff",
    progressColor: "#ffffff",
    progressOpacity: 0.4,
  };
}

export function createDefaultBuffGroup(
  name = bootstrapLiteral("New Group"),
  index = 1,
): BuffGroup {
  return {
    id: `group_${Date.now()}_${index}`,
    name,
    buffIds: [],
    priorityBuffIds: [],
    monitorAll: false,
    position: { x: 40 + (index - 1) * 40, y: 310 + (index - 1) * 40 },
    iconSize: 44,
    columns: 6,
    rows: 3,
    gap: 6,
    showName: true,
    showTime: true,
    showLayer: true,
  };
}

export function createDefaultCustomPanelGroup(
  name = bootstrapMessage("Monitor Area {{index}}", { index: 1 }),
  index = 1,
): CustomPanelGroup {
  return {
    id: `custom_panel_group_${Date.now()}_${index}`,
    name,
    entries: [],
    position: { x: 700 + (index - 1) * 40, y: 280 + (index - 1) * 40 },
    scale: 1,
  };
}

export function createDefaultSkillMonitorProfile(
  name = bootstrapLiteral("Default Profile"),
  classKey = "wind_knight",
): SkillMonitorProfile {
  return {
    name,
    selectedClass: classKey,
    monitoredSkillIds: [],
    monitoredSkillDurationIds: [],
    monitoredBuffIds: [],
    monitoredBuffCategories: [],
    monitoredPanelAttrs: AVAILABLE_PANEL_ATTRS.map((item) => ({ ...item })),
    buffPriorityIds: [],
    buffDisplayMode: "individual",
    buffGroups: [],
    individualMonitorAllGroup: null,
    customPanelGroups: [],
    inlineBuffEntries: [],
    panelAreaRowOrder: [],
    customPanelStyle: createDefaultCustomPanelStyle(),
    textBuffPanelStyle: createDefaultTextBuffPanelStyle(),
    textBuffMaxVisible: 10,
    overlayPositions: createDefaultOverlayPositions(),
    overlaySizes: createDefaultOverlaySizes(),
    overlayVisibility: createDefaultOverlayVisibility(),
  };
}

export function createDefaultMonsterMonitorConfig(): MonsterMonitorConfig {
  return {
    enabled: false,
    hateListEnabled: false,
    hateListMaxDisplay: 5,
    monitoredBuffIds: [],
    selfAppliedBuffIds: [],
    buffAliases: {},
    overlayPositions: createDefaultMonsterOverlayPositions(),
    overlaySizes: createDefaultMonsterOverlaySizes(),
    panelStyle: createDefaultCustomPanelStyle(),
    hatePanelStyle: createDefaultCustomPanelStyle(),
  };
}

const DEFAULT_GENERAL_SETTINGS = {
  showYourName: "Show Your Name",
  showOthersName: "Show Others' Name",
  showYourAbilityScore: true,
  showOthersAbilityScore: true,
  showYourSeasonStrength: false,
  showOthersSeasonStrength: false,
  relativeToTopDPSPlayer: true,
  relativeToTopDPSSkill: true,
  relativeToTopHealPlayer: true,
  relativeToTopHealSkill: true,
  relativeToTopTankedPlayer: true,
  relativeToTopTankedSkill: true,
  shortenAbilityScore: true,
  shortenDps: true,
  shortenTps: true,
  eventUpdateRateMs: 200,
};

export const DEFAULT_CLASS_COLORS: Record<string, string> = {
  "Stormblade": "#674598",
  "Frost Mage": "#4de3d1",
  "Flame Berserker": "#e64a19",
  "Wind Knight": "#0099c6",
  "Verdant Oracle": "#66aa00",
  "Heavy Guardian": "#b38915",
  "Marksman": "#ffee00",
  "Shield Knight": "#7b9aa2",
  "Beat Performer": "#ee2e48",
};

export const CLASS_SPEC_MAP: Record<string, string> = {
  "Iaido": "Stormblade", "Moonstrike": "Stormblade",
  "Icicle": "Frost Mage", "Frostbeam": "Frost Mage",
  "Voidflame": "Flame Berserker", "Blazecrimson": "Flame Berserker",
  "Vanguard": "Wind Knight", "Skyward": "Wind Knight",
  "Smite": "Verdant Oracle", "Lifebind": "Verdant Oracle",
  "Earthfort": "Heavy Guardian", "Block": "Heavy Guardian",
  "Wildpack": "Marksman", "Falconry": "Marksman",
  "Recovery": "Shield Knight", "Shield": "Shield Knight",
  "Dissonance": "Beat Performer", "Concerto": "Beat Performer",
};

export const CLASS_SPEC_NAMES = Object.keys(CLASS_SPEC_MAP);

export const DEFAULT_CLASS_SPEC_COLORS: Record<string, string> = {
  // Stormblade
  "Iaido": "#9b6cf0", "Moonstrike": "#4a2f80",
  // Frost Mage
  "Icicle": "#8ff7ee", "Frostbeam": "#2fbfb3",
  // Flame Berserker
  "Voidflame": "#ff6d3a", "Blazecrimson": "#c41e00",
  // Wind Knight
  "Vanguard": "#4ddff6", "Skyward": "#006b8f",
  // Verdant Oracle
  "Smite": "#b9f36e", "Lifebind": "#3b6d00",
  // Heavy Guardian
  "Earthfort": "#e6c25a", "Block": "#7b5b08",
  // Marksman
  "Wildpack": "#fff9a6", "Falconry": "#cab400",
  // Shield Knight
  "Recovery": "#b6d1d6", "Shield": "#4f6b70",
  // Beat Performer
  "Dissonance": "#ff7b94", "Concerto": "#9f1322",
};

export const DEFAULT_FONT_SIZES = {
  xs: 10,    // Extra small - labels, hints (default 0.625rem = 10px)
  sm: 12,    // Small - secondary text (default 0.75rem = 12px)
  base: 14,  // Base - default text (default 0.875rem = 14px)
  lg: 16,    // Large - emphasis (default 1rem = 16px)
  xl: 20,    // Extra large - titles (default 1.25rem = 20px)
};

// Live table customization defaults
export const DEFAULT_LIVE_TABLE_SETTINGS = {
  // Player row settings
  playerRowHeight: 28,
  playerFontSize: 13,
  playerIconSize: 20,

  // Table header settings
  showTableHeader: true,
  tableHeaderHeight: 24,
  tableHeaderFontSize: 11,
  tableHeaderTextColor: "#a1a1aa",

  // Abbreviated numbers (K, M, %)
  abbreviatedFontSize: 10,

  // Skill row settings (separate from player rows)
  skillRowHeight: 24,
  skillFontSize: 12,
  skillIconSize: 18,

  skillShowHeader: true,
  skillHeaderHeight: 22,
  skillHeaderFontSize: 10,
  skillHeaderTextColor: "#a1a1aa",
  skillAbbreviatedFontSize: 9,

  // Skill-specific row glow / highlight customization (separate from player rows)
  skillRowGlowMode: 'gradient-underline' as 'gradient-underline' | 'gradient' | 'solid',
  skillRowGlowOpacity: 0.15,
  skillRowBorderRadius: 0,
  // Row glow / highlight customization
  // modes: 'gradient-underline' (gradient + neon underline), 'gradient' (gradient only), 'solid' (solid color fill)
  rowGlowMode: 'gradient-underline' as 'gradient-underline' | 'gradient' | 'solid',
  // opacity applied to the fill (0-1)
  rowGlowOpacity: 0.15,
  // border height in pixels for the neon underline effect
  rowGlowBorderHeight: 2,
  // box-shadow spread/blur for the neon border
  rowGlowSpread: 8,
  // Note: glow always uses the detected class/spec color.
  // Row border customization
  rowBorderRadius: 0,
};

// (Header preset constants removed - header defaults inlined into DEFAULT_SETTINGS)

export const FONT_SIZE_LABELS: Record<string, string> = {
  get xs() { return tl("XS"); },
  get sm() { return tl("Small"); },
  get base() { return tl("Base"); },
  get lg() { return tl("Large"); },
  get xl() { return tl("XL"); },
};

// Default custom theme colors (based on dark theme)
export type CustomThemeColors = {
  backgroundMain: string;
  backgroundLive: string;
  foreground: string;
  surface: string;
  surfaceForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipFg: string;
  tableTextColor: string;
  tableAbbreviatedColor: string;
};

export const DEFAULT_CUSTOM_THEME_COLORS: CustomThemeColors = {
  backgroundMain: 'rgba(33, 33, 33, 1)',
  backgroundLive: 'rgba(33, 33, 33, 1)',
  foreground: 'rgba(226, 226, 226, 1)',
  surface: 'rgba(41, 41, 41, 1)',
  surfaceForeground: 'rgba(226, 226, 226, 1)',
  primary: 'rgba(166, 166, 166, 1)',
  primaryForeground: 'rgba(33, 33, 33, 1)',
  secondary: 'rgba(64, 64, 64, 1)',
  secondaryForeground: 'rgba(226, 226, 226, 1)',
  muted: 'rgba(56, 56, 56, 1)',
  mutedForeground: 'rgba(138, 138, 138, 1)',
  accent: 'rgba(82, 82, 82, 1)',
  accentForeground: 'rgba(226, 226, 226, 1)',
  destructive: 'rgba(220, 80, 80, 1)',
  destructiveForeground: 'rgba(255, 255, 255, 1)',
  border: 'rgba(74, 74, 74, 1)',
  input: 'rgba(64, 64, 64, 1)',
  tooltipBg: 'rgba(33, 33, 33, 0.92)',
  tooltipBorder: 'rgba(74, 74, 74, 0.55)',
  tooltipFg: 'rgba(226, 226, 226, 1)',
  tableTextColor: '#ffffff',
  tableAbbreviatedColor: '#71717a',
};

// Labels for custom theme color variables
function createThemeLabel(labelKey: string, descriptionKey: string, categoryKey: string) {
  return {
    get label() {
      return tl(labelKey);
    },
    get description() {
      return tl(descriptionKey);
    },
    get category() {
      return tl(categoryKey);
    },
  };
}

export const CUSTOM_THEME_COLOR_LABELS: Record<string, { label: string; description: string; category: string }> = {
  backgroundMain: createThemeLabel('Background (Main Window)', 'Main window background color', 'Base'),
  backgroundLive: createThemeLabel('Background (Live Window)', 'Live meter window background color', 'Base'),
  foreground: createThemeLabel('Foreground', 'Primary text color', 'Base'),
  surface: createThemeLabel('Surface', 'Background color for cards, dialogs, and panels', 'Surfaces'),
  surfaceForeground: createThemeLabel('Surface Text', 'Text color on surfaces', 'Surfaces'),
  primary: createThemeLabel('Primary', 'Primary accent color', 'Accents'),
  primaryForeground: createThemeLabel('Primary Text', 'Text color on primary elements', 'Accents'),
  secondary: createThemeLabel('Secondary', 'Secondary accent color', 'Accents'),
  secondaryForeground: createThemeLabel('Secondary Text', 'Text color on secondary elements', 'Accents'),
  muted: createThemeLabel('Muted', 'Muted / subdued background color', 'Utility'),
  mutedForeground: createThemeLabel('Subtle Text', 'Subtle text color', 'Utility'),
  accent: createThemeLabel('Accent', 'Highlight accent color', 'Accents'),
  accentForeground: createThemeLabel('Accent Text', 'Text color on accent elements', 'Accents'),
  destructive: createThemeLabel('Destructive', 'Error / danger color', 'Utility'),
  destructiveForeground: createThemeLabel('Destructive Text', 'Text color on destructive elements', 'Utility'),
  border: createThemeLabel('Border', 'Border color', 'Utility'),
  input: createThemeLabel('Input', 'Input background color', 'Utility'),
  tableTextColor: createThemeLabel('Table Text', 'Text color in live tables', 'Tables'),
  tableAbbreviatedColor: createThemeLabel('Suffix Color', 'Color of K, M, and % suffixes in tables', 'Tables'),
  tooltipBg: createThemeLabel('Tooltip Background', 'Tooltip background color', 'Tooltip'),
  tooltipBorder: createThemeLabel('Tooltip Border', 'Tooltip border color', 'Tooltip'),
  tooltipFg: createThemeLabel('Tooltip Text', 'Tooltip text color', 'Tooltip'),
};

const DEFAULT_SETTINGS = {
  app: {
    language: "system" as AppLanguage,
  },
  accessibility: {
    blur: false,
    clickthrough: false,
    classColors: { ...DEFAULT_CLASS_COLORS },
    useClassSpecColors: false,
    classSpecColors: { ...DEFAULT_CLASS_SPEC_COLORS },
    fontSizes: { ...DEFAULT_FONT_SIZES },
    customThemeColors: { ...DEFAULT_CUSTOM_THEME_COLORS },
    // Background image settings
    backgroundImage: '' as string,
    backgroundImageEnabled: false,
    backgroundImageMode: 'cover' as 'cover' | 'contain',
    backgroundImageContainColor: 'rgba(0, 0, 0, 1)',
    // Custom font settings
    customFontSansEnabled: false,
    customFontSansUrl: '' as string,
    customFontSansName: '' as string,
    customFontMonoEnabled: false,
    customFontMonoUrl: '' as string,
    customFontMonoName: '' as string,
  },
  shortcuts: {
    showLiveMeter: "",
    hideLiveMeter: "",
    toggleLiveMeter: "",
    toggleOverlayWindow: "",
    enableClickthrough: "",
    disableClickthrough: "",
    toggleClickthrough: "",
    resetEncounter: "",
      togglePauseEncounter: "",
    hardReset: "",
    toggleBossHp: "",
    toggleOverlayEdit: "",
  },
  moduleSync: {
    enabled: false,
    apiKey: "",
    baseUrl: "https://your-api-server.com/api/v1",
    autoSyncIntervalMinutes: 0,
    autoUpload: true,
    marketUpload: true,
  },
  skillMonitor: {
    enabled: false,
    activeProfileIndex: 0,
    buffAliases: {} as BuffAliasMap,
    profiles: [createDefaultSkillMonitorProfile()] as SkillMonitorProfile[],
  },
  monsterMonitor: createDefaultMonsterMonitorConfig(),
  trainingDummy: {
    defaultMonsterId: 122 as 115 | 122,
    showHeaderControl: true,
  },
  live: {
    general: { ...DEFAULT_GENERAL_SETTINGS },
    dpsPlayers: { ...DEFAULT_STATS },
    dpsSkillBreakdown: { ...DEFAULT_STATS },
    healPlayers: { ...DEFAULT_STATS },
    healSkillBreakdown: { ...DEFAULT_STATS },
    tankedPlayers: { ...DEFAULT_STATS },
    tankedSkillBreakdown: { ...DEFAULT_STATS },
    tableCustomization: { ...DEFAULT_LIVE_TABLE_SETTINGS },
    headerCustomization: {
      windowPadding: 12,
      headerPadding: 8,
      showTimer: true,
      showActiveTimer: false,
      showSceneName: true,
      showResetButton: true,
      showPauseButton: true,
      showBossOnlyButton: true,
      showSettingsButton: true,
      showMinimizeButton: true,
      showTotalDamage: true,
      showTotalDps: true,
      showBossHealth: true,
      showNavigationTabs: true,
      timerLabelFontSize: 12,
      timerFontSize: 18,
      activeTimerFontSize: 18,
      sceneNameFontSize: 14,
      resetButtonSize: 20,
      resetButtonPadding: 8,
      pauseButtonSize: 20,
      pauseButtonPadding: 8,
      bossOnlyButtonSize: 20,
      bossOnlyButtonPadding: 8,
      settingsButtonSize: 20,
      settingsButtonPadding: 8,
      minimizeButtonSize: 20,
      minimizeButtonPadding: 8,
      totalDamageLabelFontSize: 14,
      totalDamageValueFontSize: 18,
      totalDpsLabelFontSize: 14,
      totalDpsValueFontSize: 18,
      bossHealthLabelFontSize: 14,
      bossHealthNameFontSize: 14,
      bossHealthValueFontSize: 14,
      bossHealthPercentFontSize: 14,
      navTabFontSize: 11,
      navTabPaddingX: 14,
      navTabPaddingY: 6,
    },
  },
  history: {
    general: { ...DEFAULT_GENERAL_SETTINGS },
    dpsPlayers: { ...DEFAULT_HISTORY_STATS },
    dpsSkillBreakdown: { ...DEFAULT_HISTORY_STATS },
    healPlayers: { ...DEFAULT_HISTORY_HEAL_STATS },
    healSkillBreakdown: { ...DEFAULT_HISTORY_STATS },
    tankedPlayers: { ...DEFAULT_HISTORY_TANKED_STATS },
    tankedSkillBreakdown: { ...DEFAULT_HISTORY_STATS },
  },
};

// We need flattened settings for every update to be able to auto-detect new changes
const RUNE_STORE_OPTIONS = { autoStart: true, saveOnChange: true };
export const SETTINGS = {
  app: new RuneStore(
    'app',
    DEFAULT_SETTINGS.app,
    RUNE_STORE_OPTIONS
  ),
  accessibility: new RuneStore(
    'accessibility',
    DEFAULT_SETTINGS.accessibility,
    RUNE_STORE_OPTIONS
  ),
  shortcuts: new RuneStore(
    'shortcuts',
    DEFAULT_SETTINGS.shortcuts,
    RUNE_STORE_OPTIONS
  ),
  moduleSync: new RuneStore(
    'moduleSync',
    DEFAULT_SETTINGS.moduleSync,
    RUNE_STORE_OPTIONS
  ),
  skillMonitor: new RuneStore(
    'skillMonitor',
    DEFAULT_SETTINGS.skillMonitor,
    RUNE_STORE_OPTIONS
  ),
  monsterMonitor: new RuneStore(
    'monsterMonitor',
    DEFAULT_SETTINGS.monsterMonitor,
    RUNE_STORE_OPTIONS
  ),
  trainingDummy: new RuneStore(
    'trainingDummy',
    DEFAULT_SETTINGS.trainingDummy,
    RUNE_STORE_OPTIONS
  ),
  live: {
    general: new RuneStore(
      'liveGeneral',
      DEFAULT_SETTINGS.live.general,
      RUNE_STORE_OPTIONS
    ),
    dps: {
      players: new RuneStore(
        'liveDpsPlayers',
        DEFAULT_SETTINGS.live.dpsPlayers,
        RUNE_STORE_OPTIONS
      ),
      skillBreakdown: new RuneStore(
        'liveDpsSkillBreakdown',
        DEFAULT_SETTINGS.live.dpsSkillBreakdown,
        RUNE_STORE_OPTIONS
      ),
    },
    heal: {
      players: new RuneStore(
        'liveHealPlayers',
        DEFAULT_SETTINGS.live.healPlayers,
        RUNE_STORE_OPTIONS
      ),
      skillBreakdown: new RuneStore(
        'liveHealSkillBreakdown',
        DEFAULT_SETTINGS.live.healSkillBreakdown,
        RUNE_STORE_OPTIONS
      ),
    },
    tanked: {
      players: new RuneStore(
        'liveTankedPlayers',
        DEFAULT_SETTINGS.live.tankedPlayers,
        RUNE_STORE_OPTIONS
      ),
      skills: new RuneStore(
        'liveTankedSkills',
        DEFAULT_SETTINGS.live.tankedSkillBreakdown,
        RUNE_STORE_OPTIONS
      ),
    },
    tableCustomization: new RuneStore(
      'liveTableCustomization',
      DEFAULT_SETTINGS.live.tableCustomization,
      RUNE_STORE_OPTIONS
    ),
    headerCustomization: new RuneStore(
      'liveHeaderCustomization',
      DEFAULT_SETTINGS.live.headerCustomization,
      RUNE_STORE_OPTIONS
    ),
    // Column order settings
    columnOrder: {
      dpsPlayers: new RuneStore('liveDpsPlayersColumnOrder', { order: DEFAULT_DPS_PLAYER_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      dpsSkills: new RuneStore('liveDpsSkillsColumnOrder', { order: DEFAULT_DPS_SKILL_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      healPlayers: new RuneStore('liveHealPlayersColumnOrder', { order: DEFAULT_HEAL_PLAYER_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      healSkills: new RuneStore('liveHealSkillsColumnOrder', { order: DEFAULT_HEAL_SKILL_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      tankedPlayers: new RuneStore('liveTankedPlayersColumnOrder', { order: DEFAULT_TANKED_PLAYER_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      tankedSkills: new RuneStore('liveTankedSkillsColumnOrder', { order: DEFAULT_TANKED_SKILL_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
    },
    // Sort settings
    sorting: {
      dpsPlayers: new RuneStore('liveDpsPlayersSorting', DEFAULT_LIVE_SORT_SETTINGS.dpsPlayers, RUNE_STORE_OPTIONS),
      dpsSkills: new RuneStore('liveDpsSkillsSorting', DEFAULT_LIVE_SORT_SETTINGS.dpsSkills, RUNE_STORE_OPTIONS),
      healPlayers: new RuneStore('liveHealPlayersSorting', DEFAULT_LIVE_SORT_SETTINGS.healPlayers, RUNE_STORE_OPTIONS),
      healSkills: new RuneStore('liveHealSkillsSorting', DEFAULT_LIVE_SORT_SETTINGS.healSkills, RUNE_STORE_OPTIONS),
      tankedPlayers: new RuneStore('liveTankedPlayersSorting', DEFAULT_LIVE_SORT_SETTINGS.tankedPlayers, RUNE_STORE_OPTIONS),
      tankedSkills: new RuneStore('liveTankedSkillsSorting', DEFAULT_LIVE_SORT_SETTINGS.tankedSkills, RUNE_STORE_OPTIONS),
    },
  },
  history: {
    general: new RuneStore(
      'historyGeneral',
      DEFAULT_SETTINGS.history.general,
      RUNE_STORE_OPTIONS
    ),
    dps: {
      players: new RuneStore(
        'historyDpsPlayers',
        DEFAULT_SETTINGS.history.dpsPlayers,
        RUNE_STORE_OPTIONS
      ),
      skillBreakdown: new RuneStore(
        'historyDpsSkillBreakdown',
        DEFAULT_SETTINGS.history.dpsSkillBreakdown,
        RUNE_STORE_OPTIONS
      ),
    },
    heal: {
      players: new RuneStore(
        'historyHealPlayers',
        DEFAULT_SETTINGS.history.healPlayers,
        RUNE_STORE_OPTIONS
      ),
      skillBreakdown: new RuneStore(
        'historyHealSkillBreakdown',
        DEFAULT_SETTINGS.history.healSkillBreakdown,
        RUNE_STORE_OPTIONS
      ),
    },
    tanked: {
      players: new RuneStore(
        'historyTankedPlayers',
        DEFAULT_SETTINGS.history.tankedPlayers,
        RUNE_STORE_OPTIONS
      ),
      skillBreakdown: new RuneStore(
        'historyTankedSkillBreakdown',
        DEFAULT_SETTINGS.history.tankedSkillBreakdown,
        RUNE_STORE_OPTIONS
      ),
    },
  },
  // persisted app metadata (tracks which app version the user last saw)
  appVersion: new RuneStore('appVersion', { value: '' }, RUNE_STORE_OPTIONS),
  packetCapture: new RuneStore(
    'packetCapture',
    { method: "WinDivert", npcapDevice: "" },
    RUNE_STORE_OPTIONS
  ),
};

// Create flattened settings object for backwards compatibility
export const settings = {
  state: {
    app: SETTINGS.app.state,
    accessibility: SETTINGS.accessibility.state,
    shortcuts: SETTINGS.shortcuts.state,
    moduleSync: SETTINGS.moduleSync.state,
    skillMonitor: SETTINGS.skillMonitor.state,
    monsterMonitor: SETTINGS.monsterMonitor.state,
    trainingDummy: SETTINGS.trainingDummy.state,
    live: {
      general: SETTINGS.live.general.state,
      dps: {
        players: SETTINGS.live.dps.players.state,
        skillBreakdown: SETTINGS.live.dps.skillBreakdown.state,
      },
      heal: {
        players: SETTINGS.live.heal.players.state,
        skillBreakdown: SETTINGS.live.heal.skillBreakdown.state,
      },
      tanked: {
        players: SETTINGS.live.tanked.players.state,
        skills: SETTINGS.live.tanked.skills.state,
      },
      tableCustomization: SETTINGS.live.tableCustomization.state,
      headerCustomization: SETTINGS.live.headerCustomization.state,
      columnOrder: {
        dpsPlayers: SETTINGS.live.columnOrder.dpsPlayers.state,
        dpsSkills: SETTINGS.live.columnOrder.dpsSkills.state,
        healPlayers: SETTINGS.live.columnOrder.healPlayers.state,
        healSkills: SETTINGS.live.columnOrder.healSkills.state,
        tankedPlayers: SETTINGS.live.columnOrder.tankedPlayers.state,
        tankedSkills: SETTINGS.live.columnOrder.tankedSkills.state,
      },
      sorting: {
        dpsPlayers: SETTINGS.live.sorting.dpsPlayers.state,
        dpsSkills: SETTINGS.live.sorting.dpsSkills.state,
        healPlayers: SETTINGS.live.sorting.healPlayers.state,
        healSkills: SETTINGS.live.sorting.healSkills.state,
        tankedPlayers: SETTINGS.live.sorting.tankedPlayers.state,
        tankedSkills: SETTINGS.live.sorting.tankedSkills.state,
      },
    },
    appVersion: SETTINGS.appVersion.state,
    history: {
      general: SETTINGS.history.general.state,
      dps: {
        players: SETTINGS.history.dps.players.state,
        skillBreakdown: SETTINGS.history.dps.skillBreakdown.state,
      },
      heal: {
        players: SETTINGS.history.heal.players.state,
        skillBreakdown: SETTINGS.history.heal.skillBreakdown.state,
      },
      tanked: {
        players: SETTINGS.history.tanked.players.state,
        skillBreakdown: SETTINGS.history.tanked.skillBreakdown.state,
      },
    },
  },
};

// Accessibility helpers

// Theme selection removed — app uses only the `custom` theme controlled by customThemeColors
