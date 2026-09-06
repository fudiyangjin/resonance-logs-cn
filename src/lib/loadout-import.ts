import * as v from "valibot";
import {
  createDefaultCustomPanelGroup,
  createDefaultLiveMeterProfileData,
  createDefaultMonsterMonitorProfile,
  createDefaultOverlayTextStyle,
  createDefaultSkillMonitorProfile,
  deepCloneSettings,
  MAX_BUFF_COVERAGE_ENTRIES,
  omitProfileId,
  normalizeHistorySettings,
  type LiveMeterProfile,
  type MonsterMonitorProfile,
  type SkillMonitorProfile,
} from "./settings-store";
import { normalizeDpsColumnLabels } from "./column-labels";
import { ensureShieldDetailStyle } from "./skill-monitor-normalize";

export type LoadoutExport = {
  kind: "resonance-logs-loadout";
  version: 1;
  name: string;
  /** Talent branch this loadout is bound to; absent/`null` means unbound. */
  linkedTalentStageCfgId?: number | null;
  skillProfile: Omit<SkillMonitorProfile, "id">;
  monsterProfile: Omit<MonsterMonitorProfile, "id">;
  liveProfile: Omit<LiveMeterProfile, "id">;
};

export type LoadoutParseResult =
  | { success: true; output: LoadoutExport }
  | { success: false; issues: string[] };

const finiteNumberSchema = v.pipe(v.number(), v.finite());
const positiveI32Schema = v.pipe(
  finiteNumberSchema,
  v.check(
    (value) =>
      Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647,
    "buff id must be a positive 32-bit integer",
  ),
);
const numericKeySchema = v.pipe(v.string(), v.regex(/^\d+$/));
const numberArraySchema = v.array(finiteNumberSchema);
const stringArraySchema = v.array(v.string());
const stringRecordSchema = v.record(v.string(), v.string());
const numericStringRecordSchema = v.record(numericKeySchema, v.string());
const numberRecordSchema = v.record(numericKeySchema, finiteNumberSchema);

function defaultClone<T>(value: T): () => T {
  return () => deepCloneSettings(value);
}

const pointSchema = v.object({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
});

// Kept optional with defaults (rather than required) because these three
// keys were added after many users' profiles were first created — old
// stores (and exports taken from them) predate this style and don't have
// them. Rejecting those as invalid would make legacy exports permanently
// un-importable, including re-importing a user's own older export.
const overlayTextStyleDefaults = createDefaultOverlayTextStyle();
const overlayTextStyleEntries = {
  textShadowEnabled: v.optional(
    v.boolean(),
    overlayTextStyleDefaults.textShadowEnabled,
  ),
  backgroundEnabled: v.optional(
    v.boolean(),
    overlayTextStyleDefaults.backgroundEnabled,
  ),
  backgroundOpacity: v.optional(
    finiteNumberSchema,
    overlayTextStyleDefaults.backgroundOpacity,
  ),
};

const overlayTextStyleSchema = v.object(overlayTextStyleEntries);

const customPanelStyleSchema = v.object({
  gap: finiteNumberSchema,
  columnGap: finiteNumberSchema,
  fontSize: finiteNumberSchema,
  nameColor: v.string(),
  valueColor: v.string(),
  progressColor: v.string(),
  progressOpacity: finiteNumberSchema,
  ...overlayTextStyleEntries,
});

const teammatePanelStyleSchema = v.object({
  gap: finiteNumberSchema,
  columnGap: finiteNumberSchema,
  fontSize: finiteNumberSchema,
  nameColor: v.string(),
  valueColor: v.string(),
  progressColor: v.string(),
  progressOpacity: finiteNumberSchema,
  ...overlayTextStyleEntries,
  rowHeight: finiteNumberSchema,
  nameColumnWidth: finiteNumberSchema,
  buffColumnWidth: finiteNumberSchema,
});

const textBuffPanelStyleSchema = v.object({
  displayMode: v.picklist(["modern", "classic"]),
  gap: finiteNumberSchema,
  columnGap: finiteNumberSchema,
  fontSize: finiteNumberSchema,
  nameColor: v.string(),
  valueColor: v.string(),
  progressColor: v.string(),
  progressOpacity: finiteNumberSchema,
  ...overlayTextStyleEntries,
});

const shieldDetailStyleSchema = v.object({
  fontSize: finiteNumberSchema,
  barWidth: finiteNumberSchema,
  gap: finiteNumberSchema,
  showHpBar: v.boolean(),
  showTotalShieldBar: v.boolean(),
  showShieldEntries: v.boolean(),
  hpColor: v.string(),
  shieldColor: v.string(),
  healShieldColor: v.string(),
  ...overlayTextStyleEntries,
});

const voicePhraseBindingSchema = v.variant("source", [
  v.object({ source: v.literal("auto") }),
  v.object({ source: v.literal("custom"), text: v.string() }),
  v.object({ source: v.literal("phrase"), phraseId: v.string() }),
]);

const voiceEventSchema = v.object({
  enabled: v.boolean(),
  phrase: voicePhraseBindingSchema,
  priority: v.optional(finiteNumberSchema),
});

const voiceExpiringEventSchema = v.object({
  enabled: v.boolean(),
  phrase: voicePhraseBindingSchema,
  priority: v.optional(finiteNumberSchema),
  secondsBefore: finiteNumberSchema,
});

const buffVoiceConfigSchema = v.object({
  gained: v.optional(voiceEventSchema),
  expiring: v.optional(voiceExpiringEventSchema),
  lost: v.optional(voiceEventSchema),
});

const counterSlotVoiceConfigSchema = v.object({
  threshold: v.optional(voiceEventSchema),
  expiring: v.optional(voiceExpiringEventSchema),
});

const dbmVoiceConfigSchema = v.object({
  onCast: v.optional(voiceEventSchema),
  expiring: v.optional(voiceExpiringEventSchema),
});

const buffVoiceConfigMapSchema = v.record(
  numericKeySchema,
  buffVoiceConfigSchema,
);
const counterVoiceConfigMapSchema = v.record(
  numericKeySchema,
  counterSlotVoiceConfigSchema,
);
const presetCounterVoiceConfigMapSchema = v.record(
  numericKeySchema,
  counterVoiceConfigMapSchema,
);
const dbmVoiceConfigMapSchema = v.record(
  numericKeySchema,
  dbmVoiceConfigSchema,
);

const buffAlertRuleSchema = v.object({
  thresholdSeconds: finiteNumberSchema,
  highlightColor: v.string(),
  flash: v.boolean(),
  flashIntervalMs: v.optional(finiteNumberSchema),
  applyToProgress: v.optional(v.boolean()),
});
const buffAlertMapSchema = v.record(numericKeySchema, buffAlertRuleSchema);

const panelAttrSchema = v.object({
  attrId: finiteNumberSchema,
  label: v.string(),
  color: v.string(),
  enabled: v.boolean(),
  format: v.picklist(["percent", "integer"]),
});

const buffGroupSchema = v.object({
  id: v.string(),
  name: v.string(),
  buffIds: numberArraySchema,
  priorityBuffIds: numberArraySchema,
  monitorAll: v.boolean(),
  position: pointSchema,
  iconSize: finiteNumberSchema,
  columns: finiteNumberSchema,
  rows: finiteNumberSchema,
  gap: finiteNumberSchema,
  showName: v.boolean(),
  showTime: v.boolean(),
  showLayer: v.boolean(),
});

const inlineBuffEntrySchema = v.object({
  id: v.string(),
  sourceType: v.picklist(["buff", "counter"]),
  sourceId: finiteNumberSchema,
  counterSlotId: v.optional(finiteNumberSchema),
  hideWhenZero: v.optional(v.boolean()),
  label: v.string(),
  format: v.picklist(["active", "stacks_timer", "timer"]),
});

const buffCoverageEntrySchema = v.object({
  id: v.string(),
  buffId: positiveI32Schema,
  label: v.string(),
  showInLive: v.optional(v.boolean(), true),
});

const buffCoverageStyleSchema = v.object({
  fontSize: finiteNumberSchema,
  gap: finiteNumberSchema,
  nameColor: v.string(),
  valueColor: v.string(),
  progressColor: v.optional(v.string(), "#34d399"),
  progressOpacity: v.optional(finiteNumberSchema, 0.4),
  showName: v.boolean(),
  showRemaining: v.boolean(),
  showCount: v.boolean(),
  showStateDot: v.boolean(),
  showProgress: v.optional(v.boolean(), true),
  textShadowEnabled: v.boolean(),
  backgroundEnabled: v.boolean(),
  backgroundOpacity: finiteNumberSchema,
});

const customPanelGroupSchema = v.object({
  id: v.string(),
  name: v.string(),
  kind: v.picklist(["manual", "seasonCultivateFactor"]),
  entries: v.array(inlineBuffEntrySchema),
  hideZeroCounters: v.optional(v.boolean(), false),
  position: pointSchema,
  scale: finiteNumberSchema,
  style: customPanelStyleSchema,
});

const resourceSectionLayoutSchema = v.object({
  position: pointSchema,
  scale: finiteNumberSchema,
  visible: v.boolean(),
});

const userCounterRuleSchema = v.object({
  ruleId: finiteNumberSchema,
  name: v.string(),
  sourceRefs: stringArraySchema,
  slotRefs: stringArraySchema,
  voice: v.optional(counterVoiceConfigMapSchema),
});

const panelAreaRowSchema = v.object({
  type: v.literal("attr"),
  attrId: finiteNumberSchema,
});

const categorySchema = v.picklist(["food", "alchemy"]);
const categoryPointRecordSchema = v.record(categorySchema, pointSchema);
const categoryNumberRecordSchema = v.record(categorySchema, finiteNumberSchema);

const overlayPositionsSchema = v.object({
  skillCdGroup: pointSchema,
  resourceGroup: pointSchema,
  textBuffPanel: pointSchema,
  specialBuffGroup: pointSchema,
  panelAttrGroup: pointSchema,
  customPanelGroup: pointSchema,
  shieldDetailGroup: pointSchema,
  buffCoverageGroup: v.optional(pointSchema, { x: 360, y: 550 }),
  iconBuffPositions: v.record(numericKeySchema, pointSchema),
  skillDurationPositions: v.record(numericKeySchema, pointSchema),
  categoryIconPositions: v.optional(categoryPointRecordSchema, {}),
});

const overlaySizesSchema = v.object({
  skillCdGroupScale: finiteNumberSchema,
  resourceGroupScale: finiteNumberSchema,
  textBuffPanelScale: finiteNumberSchema,
  panelAttrGroupScale: finiteNumberSchema,
  customPanelGroupScale: finiteNumberSchema,
  shieldDetailGroupScale: finiteNumberSchema,
  buffCoverageGroupScale: v.optional(finiteNumberSchema, 1),
  panelAttrGap: finiteNumberSchema,
  panelAttrFontSize: finiteNumberSchema,
  panelAttrColumnGap: finiteNumberSchema,
  // Also predates some old exports — same reasoning as
  // `overlayTextStyleEntries` above.
  panelAttrTextStyle: v.optional(
    overlayTextStyleSchema,
    defaultClone(overlayTextStyleDefaults),
  ),
  iconBuffSizes: numberRecordSchema,
  skillDurationSizes: numberRecordSchema,
  categoryIconSizes: v.optional(categoryNumberRecordSchema, {}),
});

const overlayVisibilitySchema = v.object({
  showSkillCdGroup: v.boolean(),
  showSkillDurationGroup: v.boolean(),
  showResourceGroup: v.boolean(),
  showPanelAttrGroup: v.boolean(),
  showCustomPanelGroup: v.boolean(),
  showShieldDetailGroup: v.boolean(),
  showBuffCoverageGroup: v.optional(v.boolean(), false),
});

const defaultSkill = omitProfileId(createDefaultSkillMonitorProfile());
const defaultMonster = omitProfileId(createDefaultMonsterMonitorProfile());

const monsterOverlayPositionsSchema = v.object({
  monsterBuffPanel: pointSchema,
  teammateBuffPanel: pointSchema,
  hatePanel: pointSchema,
  fantasyPanel: pointSchema,
  bossDbmPanel: pointSchema,
  stunPanel: pointSchema,
  hpPanel: v.optional(
    pointSchema,
    defaultClone(defaultMonster.overlayPositions.hpPanel),
  ),
});

const monsterOverlaySizesSchema = v.object({
  monsterBuffPanelScale: finiteNumberSchema,
  teammateBuffPanelScale: finiteNumberSchema,
  hatePanelScale: finiteNumberSchema,
  fantasyPanelScale: finiteNumberSchema,
  bossDbmPanelScale: finiteNumberSchema,
  stunPanelScale: finiteNumberSchema,
  hpPanelScale: v.optional(
    finiteNumberSchema,
    defaultMonster.overlaySizes.hpPanelScale,
  ),
});

const monsterOverlayVisibilitySchema = v.object({
  showMonsterBuffPanel: v.boolean(),
  showTeammateBuffPanel: v.boolean(),
  showHatePanel: v.boolean(),
  showFantasyPanel: v.boolean(),
  showBossDbmPanel: v.boolean(),
  showStunPanel: v.boolean(),
  showHpPanel: v.optional(v.boolean(), false),
});

const skillProfileSchema = v.object({
  name: v.string(),
  enabled: v.optional(v.boolean(), false),
  autoHideInDailyScenes: v.optional(v.boolean(), false),
  selectedClass: v.string(),
  monitoredSkillIds: numberArraySchema,
  monitoredSkillDurationIds: numberArraySchema,
  monitoredBuffIds: numberArraySchema,
  monitoredBuffCategories: v.optional(
    v.array(categorySchema),
    defaultClone(defaultSkill.monitoredBuffCategories ?? []),
  ),
  monitoredPanelAttrs: v.array(panelAttrSchema),
  buffPriorityIds: numberArraySchema,
  buffAlerts: v.optional(
    buffAlertMapSchema,
    defaultClone(defaultSkill.buffAlerts ?? {}),
  ),
  buffVoiceConfigs: v.optional(
    buffVoiceConfigMapSchema,
    defaultClone(defaultSkill.buffVoiceConfigs ?? {}),
  ),
  presetCounterVoiceConfigs: v.optional(
    presetCounterVoiceConfigMapSchema,
    defaultClone(defaultSkill.presetCounterVoiceConfigs ?? {}),
  ),
  buffDisplayMode: v.picklist(["individual", "grouped"]),
  buffGroups: v.array(buffGroupSchema),
  individualMonitorAllGroup: v.optional(
    v.nullable(buffGroupSchema),
    defaultSkill.individualMonitorAllGroup ?? null,
  ),
  userCounterRules: v.optional(
    v.array(userCounterRuleSchema),
    defaultClone(defaultSkill.userCounterRules ?? []),
  ),
  customPanelGroups: v.optional(
    v.array(customPanelGroupSchema),
    defaultClone(defaultSkill.customPanelGroups ?? []),
  ),
  resourceSectionLayouts: v.optional(
    v.record(v.string(), resourceSectionLayoutSchema),
    defaultClone(defaultSkill.resourceSectionLayouts ?? {}),
  ),
  factorSlotLabels: v.optional(
    stringRecordSchema,
    defaultClone(defaultSkill.factorSlotLabels ?? {}),
  ),
  inlineBuffEntries: v.optional(
    v.array(inlineBuffEntrySchema),
    defaultClone(defaultSkill.inlineBuffEntries ?? []),
  ),
  panelAreaRowOrder: v.optional(
    v.array(panelAreaRowSchema),
    defaultClone(defaultSkill.panelAreaRowOrder ?? []),
  ),
  buffCoverageEntries: v.optional(
    v.pipe(
      v.array(buffCoverageEntrySchema),
      v.check(
        (entries) => entries.length <= MAX_BUFF_COVERAGE_ENTRIES,
        `buff coverage supports at most ${MAX_BUFF_COVERAGE_ENTRIES} entries`,
      ),
    ),
    defaultClone(defaultSkill.buffCoverageEntries ?? []),
  ),
  buffCoverageStyle: v.optional(
    buffCoverageStyleSchema,
    defaultClone(defaultSkill.buffCoverageStyle!),
  ),
  customPanelStyle: v.optional(
    customPanelStyleSchema,
    defaultClone(createDefaultCustomPanelGroup().style),
  ),
  textBuffPanelStyle: v.optional(
    textBuffPanelStyleSchema,
    defaultClone(defaultSkill.textBuffPanelStyle!),
  ),
  shieldDetailStyle: v.optional(
    shieldDetailStyleSchema,
    defaultClone(ensureShieldDetailStyle({ ...defaultSkill, id: "schema" })),
  ),
  overlayTextStyle: v.optional(
    overlayTextStyleSchema,
    defaultClone(defaultSkill.overlayTextStyle!),
  ),
  textBuffMaxVisible: finiteNumberSchema,
  overlayPositions: overlayPositionsSchema,
  overlaySizes: overlaySizesSchema,
  overlayVisibility: overlayVisibilitySchema,
});

const teammateColumnSchema = v.pipe(
  v.string(),
  v.regex(/^(?:buff:\d+|category:(?:food|alchemy))$/),
);

const monsterProfileSchema = v.object({
  name: v.string(),
  enabled: v.optional(v.boolean(), false),
  autoHideInDailyScenes: v.optional(v.boolean(), false),
  hateListEnabled: v.boolean(),
  hateListMaxDisplay: finiteNumberSchema,
  stunListEnabled: v.boolean(),
  hpListEnabled: v.optional(v.boolean(), false),
  monitoredBuffIds: numberArraySchema,
  selfAppliedBuffIds: numberArraySchema,
  selfAppliedMonitorAll: v.boolean(),
  teammateBuffIds: numberArraySchema,
  teammateBuffCategories: v.optional(
    v.array(categorySchema),
    defaultClone(defaultMonster.teammateBuffCategories ?? []),
  ),
  teammateBuffColumnOrder: v.optional(
    v.array(teammateColumnSchema),
    defaultClone(defaultMonster.teammateBuffColumnOrder ?? []),
  ),
  fantasyWhitelistMonsterIds: numberArraySchema,
  fantasyMonsterAliases: numericStringRecordSchema,
  dbmAliases: numericStringRecordSchema,
  dbmVoiceConfigs: v.optional(
    dbmVoiceConfigMapSchema,
    defaultClone(defaultMonster.dbmVoiceConfigs ?? {}),
  ),
  monsterBuffVoiceConfigs: v.optional(
    buffVoiceConfigMapSchema,
    defaultClone(defaultMonster.monsterBuffVoiceConfigs ?? {}),
  ),
  fantasyShowAll: v.boolean(),
  buffPriorityIds: numberArraySchema,
  buffAlerts: buffAlertMapSchema,
  overlayPositions: monsterOverlayPositionsSchema,
  overlaySizes: monsterOverlaySizesSchema,
  overlayVisibility: monsterOverlayVisibilitySchema,
  panelStyle: customPanelStyleSchema,
  teammatePanelStyle: teammatePanelStyleSchema,
  hatePanelStyle: customPanelStyleSchema,
  fantasyPanelStyle: customPanelStyleSchema,
  bossDbmPanelStyle: customPanelStyleSchema,
  stunPanelStyle: customPanelStyleSchema,
  hpPanelStyle: v.optional(
    customPanelStyleSchema,
    defaultClone(defaultMonster.hpPanelStyle),
  ),
});

const liveGeneralEntries = {
  showYourName: v.optional(
    v.union([v.string(), v.boolean()]),
    "Show Your Name",
  ),
  showOthersName: v.optional(
    v.union([v.string(), v.boolean()]),
    "Show Others' Name",
  ),
  showYourAbilityScore: v.optional(v.boolean(), true),
  showOthersAbilityScore: v.optional(v.boolean(), true),
  showYourSeasonStrength: v.optional(v.boolean(), false),
  showOthersSeasonStrength: v.optional(v.boolean(), false),
  showFantasyCastIcons: v.optional(v.boolean(), false),
  relativeToTopDPSPlayer: v.optional(v.boolean(), true),
  relativeToTopDPSSkill: v.optional(v.boolean(), true),
  relativeToTopHealPlayer: v.optional(v.boolean(), true),
  relativeToTopHealSkill: v.optional(v.boolean(), true),
  relativeToTopTankedPlayer: v.optional(v.boolean(), true),
  relativeToTopTankedSkill: v.optional(v.boolean(), true),
  shortenAbilityScore: v.optional(v.boolean(), true),
  shortenDps: v.optional(v.boolean(), true),
  shortenTps: v.optional(v.boolean(), true),
  abbreviationStyle: v.optional(v.picklist(["western", "cn"]), "western"),
  abbreviatedDecimalPlaces: v.optional(finiteNumberSchema, 1),
  eventUpdateRateMs: v.optional(finiteNumberSchema, 200),
  trainingWindowMs: v.optional(finiteNumberSchema, 183000),
  trainingLockPolicy: v.optional(
    v.picklist(["eliteDummies", "firstMonster"]),
    "eliteDummies",
  ),
};

const liveGeneralSchema = v.object(liveGeneralEntries);

const liveStatsSchema = v.record(v.string(), v.boolean());

const liveColumnOrderEntrySchema = v.object({
  order: v.array(v.string()),
});

const liveSortingEntrySchema = v.object({
  sortKey: v.string(),
  sortDesc: v.boolean(),
});

const challengeWatchSchema = v.object({
  forbiddenDamageIds: numberArraySchema,
});

const customThemeColorsSchema = v.object({
  backgroundMain: v.string(),
  backgroundLive: v.string(),
  foreground: v.string(),
  surface: v.string(),
  surfaceForeground: v.string(),
  primary: v.string(),
  primaryForeground: v.string(),
  secondary: v.string(),
  secondaryForeground: v.string(),
  muted: v.string(),
  mutedForeground: v.string(),
  accent: v.string(),
  accentForeground: v.string(),
  destructive: v.string(),
  destructiveForeground: v.string(),
  border: v.string(),
  input: v.string(),
  tooltipBg: v.string(),
  tooltipBorder: v.string(),
  tooltipFg: v.string(),
  tableTextColor: v.string(),
  tableAbbreviatedColor: v.string(),
});

const liveAppearanceSchema = v.object({
  themeColors: customThemeColorsSchema,
  classColors: stringRecordSchema,
  useClassSpecColors: v.boolean(),
  classSpecColors: stringRecordSchema,
});

const defaultLive = createDefaultLiveMeterProfileData();

const historyGeneralSchema = v.object({
  ...liveGeneralEntries,
  timelineLaneH: v.optional(
    finiteNumberSchema,
    defaultLive.history.general.timelineLaneH,
  ),
  timelineCurveH: v.optional(
    finiteNumberSchema,
    defaultLive.history.general.timelineCurveH,
  ),
  instantDpsWindowSec: v.optional(
    finiteNumberSchema,
    defaultLive.history.general.instantDpsWindowSec,
  ),
});

const historySettingsSchema = v.pipe(
  v.object({
    general: v.optional(
      historyGeneralSchema,
      defaultClone(defaultLive.history.general),
    ),
    dpsPlayers: v.optional(
      liveStatsSchema,
      defaultClone(defaultLive.history.dpsPlayers),
    ),
    dpsSkillBreakdown: v.optional(
      liveStatsSchema,
      defaultClone(defaultLive.history.dpsSkillBreakdown),
    ),
    healPlayers: v.optional(
      liveStatsSchema,
      defaultClone(defaultLive.history.healPlayers),
    ),
    healSkillBreakdown: v.optional(
      liveStatsSchema,
      defaultClone(defaultLive.history.healSkillBreakdown),
    ),
    tankedPlayers: v.optional(
      liveStatsSchema,
      defaultClone(defaultLive.history.tankedPlayers),
    ),
    tankedSkillBreakdown: v.optional(
      liveStatsSchema,
      defaultClone(defaultLive.history.tankedSkillBreakdown),
    ),
  }),
  v.transform((value) => normalizeHistorySettings(value)),
);

const tableColumnLabelsSchema = v.object({
  first: v.optional(v.string(), ""),
  columns: v.optional(stringRecordSchema, {}),
});

const columnLabelGroupSchema = v.object({
  players: v.optional(tableColumnLabelsSchema, {
    first: "",
    columns: {},
  }),
  skills: v.optional(tableColumnLabelsSchema, {
    first: "",
    columns: {},
  }),
});

const dpsColumnLabelsSchema = v.pipe(
  v.object({
    live: v.optional(
      columnLabelGroupSchema,
      defaultClone(defaultLive.columnLabels.live),
    ),
    history: v.optional(
      columnLabelGroupSchema,
      defaultClone(defaultLive.columnLabels.history),
    ),
  }),
  v.transform((value) => normalizeDpsColumnLabels(value)),
);

const liveProfileSchema = v.object({
  name: v.string(),
  general: v.optional(liveGeneralSchema, defaultClone(defaultLive.general)),
  history: v.optional(historySettingsSchema, defaultClone(defaultLive.history)),
  columnLabels: v.optional(
    dpsColumnLabelsSchema,
    defaultClone(defaultLive.columnLabels),
  ),
  dpsPlayers: v.optional(liveStatsSchema, defaultClone(defaultLive.dpsPlayers)),
  dpsSkillBreakdown: v.optional(
    liveStatsSchema,
    defaultClone(defaultLive.dpsSkillBreakdown),
  ),
  healPlayers: v.optional(
    liveStatsSchema,
    defaultClone(defaultLive.healPlayers),
  ),
  healSkillBreakdown: v.optional(
    liveStatsSchema,
    defaultClone(defaultLive.healSkillBreakdown),
  ),
  tankedPlayers: v.optional(
    liveStatsSchema,
    defaultClone(defaultLive.tankedPlayers),
  ),
  tankedSkillBreakdown: v.optional(
    liveStatsSchema,
    defaultClone(defaultLive.tankedSkillBreakdown),
  ),
  deathReplay: v.optional(
    liveStatsSchema,
    defaultClone(defaultLive.deathReplay),
  ),
  tableCustomization: v.optional(
    v.record(v.string(), v.any()),
    defaultClone(defaultLive.tableCustomization),
  ),
  headerCustomization: v.optional(
    v.record(v.string(), v.any()),
    defaultClone(defaultLive.headerCustomization),
  ),
  columnOrder: v.optional(
    v.object({
      dpsPlayers: v.optional(
        liveColumnOrderEntrySchema,
        defaultClone(defaultLive.columnOrder.dpsPlayers),
      ),
      dpsSkills: v.optional(
        liveColumnOrderEntrySchema,
        defaultClone(defaultLive.columnOrder.dpsSkills),
      ),
      healPlayers: v.optional(
        liveColumnOrderEntrySchema,
        defaultClone(defaultLive.columnOrder.healPlayers),
      ),
      healSkills: v.optional(
        liveColumnOrderEntrySchema,
        defaultClone(defaultLive.columnOrder.healSkills),
      ),
      tankedPlayers: v.optional(
        liveColumnOrderEntrySchema,
        defaultClone(defaultLive.columnOrder.tankedPlayers),
      ),
      tankedSkills: v.optional(
        liveColumnOrderEntrySchema,
        defaultClone(defaultLive.columnOrder.tankedSkills),
      ),
      deathReplay: v.optional(
        liveColumnOrderEntrySchema,
        defaultClone(defaultLive.columnOrder.deathReplay),
      ),
    }),
    defaultClone(defaultLive.columnOrder),
  ),
  sorting: v.optional(
    v.object({
      dpsPlayers: v.optional(
        liveSortingEntrySchema,
        defaultClone(defaultLive.sorting.dpsPlayers),
      ),
      dpsSkills: v.optional(
        liveSortingEntrySchema,
        defaultClone(defaultLive.sorting.dpsSkills),
      ),
      healPlayers: v.optional(
        liveSortingEntrySchema,
        defaultClone(defaultLive.sorting.healPlayers),
      ),
      healSkills: v.optional(
        liveSortingEntrySchema,
        defaultClone(defaultLive.sorting.healSkills),
      ),
      tankedPlayers: v.optional(
        liveSortingEntrySchema,
        defaultClone(defaultLive.sorting.tankedPlayers),
      ),
      tankedSkills: v.optional(
        liveSortingEntrySchema,
        defaultClone(defaultLive.sorting.tankedSkills),
      ),
    }),
    defaultClone(defaultLive.sorting),
  ),
  challengeWatch: v.optional(
    challengeWatchSchema,
    defaultClone(defaultLive.challengeWatch),
  ),
  appearance: v.optional(
    liveAppearanceSchema,
    defaultClone(defaultLive.appearance),
  ),
});

const loadoutExportSchema = v.object({
  kind: v.literal("resonance-logs-loadout"),
  version: v.literal(1),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  // Optional with a `null` default: exports predate the spec-binding field,
  // and an unbound loadout is the natural reading of a missing key.
  linkedTalentStageCfgId: v.optional(v.nullable(finiteNumberSchema), null),
  skillProfile: skillProfileSchema,
  monsterProfile: monsterProfileSchema,
  liveProfile: v.optional(
    liveProfileSchema,
    () =>
      deepCloneSettings({
        ...createDefaultLiveMeterProfileData(),
        name: "",
      }) as Omit<LiveMeterProfile, "id">,
  ),
});

export function parseLoadoutExport(data: unknown): LoadoutParseResult {
  const result = v.safeParse(loadoutExportSchema, data);
  if (!result.success) {
    return {
      success: false,
      // Prefix with the dot path (e.g. "skillProfile.overlaySizes...") so
      // failures are actually debuggable instead of a bare "Invalid type".
      issues: result.issues.map((issue) => {
        const path = v.getDotPath(issue);
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }
  return { success: true, output: result.output as unknown as LoadoutExport };
}
