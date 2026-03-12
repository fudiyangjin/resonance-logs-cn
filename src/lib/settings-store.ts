/**
 * @file This file contains the settings store for the application.
 * It uses `@tauri-store/svelte` to create persistent stores for user settings.
 */
import { RuneStore } from '@tauri-store/svelte';
import type { BuffCategoryKey } from "./config/buff-name-table";

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

export const AVAILABLE_PANEL_ATTRS: PanelAttrConfig[] = [
  { attrId: 11720, label: "Attack Speed", color: "#6ee7ff", enabled: false, format: "percent" },
  { attrId: 11710, label: "Crit Rate", color: "#ff7a7a", enabled: false, format: "percent" },
  { attrId: 11930, label: "Haste", color: "#facc15", enabled: false, format: "percent" },
  { attrId: 11780, label: "Lucky", color: "#a78bfa", enabled: false, format: "percent" },
  { attrId: 11940, label: "Mastery", color: "#60a5fa", enabled: false, format: "percent" },
  { attrId: 11950, label: "Versatility", color: "#34d399", enabled: false, format: "percent" },
  { attrId: 11760, label: "Cooldown Reduction", color: "#f97316", enabled: false, format: "percent" },
  { attrId: 11960, label: "Cooldown Acceleration", color: "#38bdf8", enabled: false, format: "percent" },
  { attrId: 11010, label: "Strength", color: "#f87171", enabled: false, format: "integer" },
  { attrId: 11020, label: "Intelligence", color: "#818cf8", enabled: false, format: "integer" },
  { attrId: 11030, label: "Agility", color: "#4ade80", enabled: false, format: "integer" },
  { attrId: 11330, label: "Physical Attack", color: "#fb923c", enabled: false, format: "integer" },
  { attrId: 11340, label: "Magic Attack", color: "#c084fc", enabled: false, format: "integer" },
  { attrId: 11730, label: "Cast Speed", color: "#22d3ee", enabled: false, format: "percent" },
  { attrId: 12510, label: "Crit Damage", color: "#f472b6", enabled: false, format: "percent" },
  { attrId: 12530, label: "Lucky Damage Multiplier", color: "#d8b4fe", enabled: false, format: "percent" },
  { attrId: 12540, label: "Block Damage Reduction", color: "#86efac", enabled: false, format: "percent" },
  { attrId: 11970, label: "Block", color: "#fbbf24", enabled: false, format: "percent" },
];

export type OverlayPositions = {
  skillCdGroup: Point;
  resourceGroup: Point;
  textBuffPanel: Point;
  specialBuffGroup: Point;
  panelAttrGroup: Point;
  customPanelGroup: Point;
  iconBuffPositions: Record<number, Point>;
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
  categoryIconSizes?: Partial<Record<BuffCategoryKey, number>>;
};

export type OverlayVisibility = {
  showSkillCdGroup: boolean;
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
  monitoredBuffIds: number[];
  monitoredBuffCategories?: BuffCategoryKey[];
  monitoredPanelAttrs: PanelAttrConfig[];
  buffPriorityIds: number[];
  buffDisplayMode: BuffDisplayMode;
  buffGroups: BuffGroup[];
  individualMonitorAllGroup?: BuffGroup | null;
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
    categoryIconSizes: {},
  };
}

function createDefaultOverlayVisibility(): OverlayVisibility {
  return {
    showSkillCdGroup: true,
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
  };
}

export function createDefaultBuffGroup(
  name = "New Group",
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

export function createDefaultSkillMonitorProfile(
  name = "Default Profile",
  classKey = "wind_knight",
): SkillMonitorProfile {
  return {
    name,
    selectedClass: classKey,
    monitoredSkillIds: [],
    monitoredBuffIds: [],
    monitoredBuffCategories: [],
    monitoredPanelAttrs: AVAILABLE_PANEL_ATTRS.map((item) => ({ ...item })),
    buffPriorityIds: [],
    buffDisplayMode: "individual",
    buffGroups: [],
    individualMonitorAllGroup: null,
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
  xs: 10,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
};

// Live table customization defaults
export const DEFAULT_LIVE_TABLE_SETTINGS = {
  playerRowHeight: 28,
  playerFontSize: 13,
  playerIconSize: 20,
  showTableHeader: true,
  tableHeaderHeight: 24,
  tableHeaderFontSize: 11,
  tableHeaderTextColor: "#a1a1aa",
  abbreviatedFontSize: 10,
  skillRowHeight: 24,
  skillFontSize: 12,
  skillIconSize: 18,
  skillShowHeader: true,
  skillHeaderHeight: 22,
  skillHeaderFontSize: 10,
  skillHeaderTextColor: "#a1a1aa",
  skillAbbreviatedFontSize: 9,
  skillRowGlowMode: 'gradient-underline' as 'gradient-underline' | 'gradient' | 'solid',
  skillRowGlowOpacity: 0.15,
  skillRowBorderRadius: 0,
  rowGlowMode: 'gradient-underline' as 'gradient-underline' | 'gradient' | 'solid',
  rowGlowOpacity: 0.15,
  rowGlowBorderHeight: 2,
  rowGlowSpread: 8,
  rowBorderRadius: 0,
};

export const FONT_SIZE_LABELS: Record<string, string> = {
  xs: 'XS',
  sm: 'Small',
  base: 'Normal',
  lg: 'Large',
  xl: 'XL',
};

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

export const CUSTOM_THEME_COLOR_LABELS: Record<string, { label: string; description: string; category: string }> = {
  backgroundMain: { label: 'Background (Main)', description: 'Main window background color', category: 'Base' },
  backgroundLive: { label: 'Background (Live)', description: 'Live meter window background color', category: 'Base' },
  foreground: { label: 'Foreground', description: 'Primary text color', category: 'Base' },
  surface: { label: 'Surface', description: 'Background color for cards, popovers, and panels', category: 'Surfaces' },
  surfaceForeground: { label: 'Surface Text', description: 'Text color on surfaces', category: 'Surfaces' },
  primary: { label: 'Primary', description: 'Primary accent color', category: 'Accents' },
  primaryForeground: { label: 'Primary Text', description: 'Text color on primary elements', category: 'Accents' },
  secondary: { label: 'Secondary', description: 'Secondary accent color', category: 'Accents' },
  secondaryForeground: { label: 'Secondary Text', description: 'Text color on secondary elements', category: 'Accents' },
  muted: { label: 'Muted', description: 'Muted/subdued background color', category: 'Utility' },
  mutedForeground: { label: 'Muted Text', description: 'Subdued text color', category: 'Utility' },
  accent: { label: 'Accent', description: 'Highlight accent color', category: 'Accents' },
  accentForeground: { label: 'Accent Text', description: 'Text color on accent elements', category: 'Accents' },
  destructive: { label: 'Destructive', description: 'Error/danger color', category: 'Utility' },
  destructiveForeground: { label: 'Destructive Text', description: 'Text color on destructive elements', category: 'Utility' },
  border: { label: 'Border', description: 'Border color', category: 'Utility' },
  input: { label: 'Input', description: 'Input field background color', category: 'Utility' },
  tableTextColor: { label: 'Table Text', description: 'Text color in the live meter table', category: 'Tables' },
  tableAbbreviatedColor: { label: 'Suffix Color', description: 'Color of K, M, % suffixes in tables', category: 'Tables' },
  tooltipBg: { label: 'Tooltip Background', description: 'Tooltip background color', category: 'Tooltip' },
  tooltipBorder: { label: 'Tooltip Border', description: 'Tooltip border color', category: 'Tooltip' },
  tooltipFg: { label: 'Tooltip Text', description: 'Tooltip text color', category: 'Tooltip' },
};

const DEFAULT_SETTINGS = {
  accessibility: {
    blur: false,
    clickthrough: false,
    classColors: { ...DEFAULT_CLASS_COLORS },
    useClassSpecColors: false,
    classSpecColors: { ...DEFAULT_CLASS_SPEC_COLORS },
    fontSizes: { ...DEFAULT_FONT_SIZES },
    customThemeColors: { ...DEFAULT_CUSTOM_THEME_COLORS },
    backgroundImage: '' as string,
    backgroundImageEnabled: false,
    backgroundImageMode: 'cover' as 'cover' | 'contain',
    backgroundImageContainColor: 'rgba(0, 0, 0, 1)',
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

const RUNE_STORE_OPTIONS = { autoStart: true, saveOnChange: true };
export const SETTINGS = {
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
  live: {
    general: new RuneStore('liveGeneral', DEFAULT_SETTINGS.live.general, RUNE_STORE_OPTIONS),
    dps: {
      players: new RuneStore('liveDpsPlayers', DEFAULT_SETTINGS.live.dpsPlayers, RUNE_STORE_OPTIONS),
      skillBreakdown: new RuneStore('liveDpsSkillBreakdown', DEFAULT_SETTINGS.live.dpsSkillBreakdown, RUNE_STORE_OPTIONS),
    },
    heal: {
      players: new RuneStore('liveHealPlayers', DEFAULT_SETTINGS.live.healPlayers, RUNE_STORE_OPTIONS),
      skillBreakdown: new RuneStore('liveHealSkillBreakdown', DEFAULT_SETTINGS.live.healSkillBreakdown, RUNE_STORE_OPTIONS),
    },
    tanked: {
      players: new RuneStore('liveTankedPlayers', DEFAULT_SETTINGS.live.tankedPlayers, RUNE_STORE_OPTIONS),
      skills: new RuneStore('liveTankedSkills', DEFAULT_SETTINGS.live.tankedSkillBreakdown, RUNE_STORE_OPTIONS),
    },
    tableCustomization: new RuneStore('liveTableCustomization', DEFAULT_SETTINGS.live.tableCustomization, RUNE_STORE_OPTIONS),
    headerCustomization: new RuneStore('liveHeaderCustomization', DEFAULT_SETTINGS.live.headerCustomization, RUNE_STORE_OPTIONS),
    columnOrder: {
      dpsPlayers: new RuneStore('liveDpsPlayersColumnOrder', { order: DEFAULT_DPS_PLAYER_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      dpsSkills: new RuneStore('liveDpsSkillsColumnOrder', { order: DEFAULT_DPS_SKILL_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      healPlayers: new RuneStore('liveHealPlayersColumnOrder', { order: DEFAULT_HEAL_PLAYER_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      healSkills: new RuneStore('liveHealSkillsColumnOrder', { order: DEFAULT_HEAL_SKILL_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      tankedPlayers: new RuneStore('liveTankedPlayersColumnOrder', { order: DEFAULT_TANKED_PLAYER_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
      tankedSkills: new RuneStore('liveTankedSkillsColumnOrder', { order: DEFAULT_TANKED_SKILL_COLUMN_ORDER }, RUNE_STORE_OPTIONS),
    },
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
    general: new RuneStore('historyGeneral', DEFAULT_SETTINGS.history.general, RUNE_STORE_OPTIONS),
    dps: {
      players: new RuneStore('historyDpsPlayers', DEFAULT_SETTINGS.history.dpsPlayers, RUNE_STORE_OPTIONS),
      skillBreakdown: new RuneStore('historyDpsSkillBreakdown', DEFAULT_SETTINGS.history.dpsSkillBreakdown, RUNE_STORE_OPTIONS),
    },
    heal: {
      players: new RuneStore('historyHealPlayers', DEFAULT_SETTINGS.history.healPlayers, RUNE_STORE_OPTIONS),
      skillBreakdown: new RuneStore('historyHealSkillBreakdown', DEFAULT_SETTINGS.history.healSkillBreakdown, RUNE_STORE_OPTIONS),
    },
    tanked: {
      players: new RuneStore('historyTankedPlayers', DEFAULT_SETTINGS.history.tankedPlayers, RUNE_STORE_OPTIONS),
      skillBreakdown: new RuneStore('historyTankedSkillBreakdown', DEFAULT_SETTINGS.history.tankedSkillBreakdown, RUNE_STORE_OPTIONS),
    },
  },
  appVersion: new RuneStore('appVersion', { value: '' }, RUNE_STORE_OPTIONS),
  packetCapture: new RuneStore('packetCapture', { method: "WinDivert", npcapDevice: "" }, RUNE_STORE_OPTIONS),
};

export const settings = {
  state: {
    accessibility: SETTINGS.accessibility.state,
    shortcuts: SETTINGS.shortcuts.state,
    moduleSync: SETTINGS.moduleSync.state,
    skillMonitor: SETTINGS.skillMonitor.state,
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
