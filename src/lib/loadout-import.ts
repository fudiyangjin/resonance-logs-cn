import * as v from "valibot";
import {
  createDefaultCustomPanelGroup,
  createDefaultLiveMeterProfileData,
  createDefaultMonsterMonitorProfile,
  createDefaultSkillMonitorProfile,
  deepCloneSettings,
  omitProfileId,
  type LiveMeterProfile,
  type MonsterMonitorProfile,
  type SkillMonitorProfile,
} from "./settings-store";
import { ensureShieldDetailStyle } from "./skill-monitor-normalize";

export type LoadoutExport = {
  kind: "resonance-logs-loadout";
  version: 1;
  name: string;
  skillProfile: Omit<SkillMonitorProfile, "id">;
  monsterProfile: Omit<MonsterMonitorProfile, "id">;
  liveProfile: Omit<LiveMeterProfile, "id">;
};

export type LoadoutParseResult =
  | { success: true; output: LoadoutExport }
  | { success: false; issues: string[] };

const finiteNumberSchema = v.pipe(v.number(), v.finite());
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

const overlayTextStyleEntries = {
  textShadowEnabled: v.boolean(),
  backgroundEnabled: v.boolean(),
  backgroundOpacity: finiteNumberSchema,
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
});

const voiceExpiringEventSchema = v.object({
  enabled: v.boolean(),
  phrase: voicePhraseBindingSchema,
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
  panelAttrGap: finiteNumberSchema,
  panelAttrFontSize: finiteNumberSchema,
  panelAttrColumnGap: finiteNumberSchema,
  panelAttrTextStyle: overlayTextStyleSchema,
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
});

const monsterOverlayPositionsSchema = v.object({
  monsterBuffPanel: pointSchema,
  teammateBuffPanel: pointSchema,
  hatePanel: pointSchema,
  fantasyPanel: pointSchema,
  bossDbmPanel: pointSchema,
  stunPanel: pointSchema,
});

const monsterOverlaySizesSchema = v.object({
  monsterBuffPanelScale: finiteNumberSchema,
  teammateBuffPanelScale: finiteNumberSchema,
  hatePanelScale: finiteNumberSchema,
  fantasyPanelScale: finiteNumberSchema,
  bossDbmPanelScale: finiteNumberSchema,
  stunPanelScale: finiteNumberSchema,
});

const monsterOverlayVisibilitySchema = v.object({
  showMonsterBuffPanel: v.boolean(),
  showTeammateBuffPanel: v.boolean(),
  showHatePanel: v.boolean(),
  showFantasyPanel: v.boolean(),
  showBossDbmPanel: v.boolean(),
  showStunPanel: v.boolean(),
});

const defaultSkill = omitProfileId(createDefaultSkillMonitorProfile());
const defaultMonster = omitProfileId(createDefaultMonsterMonitorProfile());

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
});

const liveGeneralSchema = v.object({
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
});

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

const liveProfileSchema = v.object({
  name: v.string(),
  general: v.optional(liveGeneralSchema, defaultClone(defaultLive.general)),
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
      issues: result.issues.map((issue) => issue.message),
    };
  }
  return { success: true, output: result.output as unknown as LoadoutExport };
}
