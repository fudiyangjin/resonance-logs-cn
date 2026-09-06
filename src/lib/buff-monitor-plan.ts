import { ensureCustomPanelGroups } from "$lib/custom-panel-utils";
import { expandBuffSelection } from "$lib/config/buff-name-table";
import { isFlowerSectionVisible } from "$lib/resource-sections";
import {
  ensureBuffCoverageEntries,
  ensureBuffGroups,
  ensureIndividualMonitorAllGroup,
} from "$lib/skill-monitor-normalize";
import {
  getDefaultMonitoredBuffIds,
  getResourceOwnedBuffIds,
  getSeasonCultivateFactorConfiguredEffectBuffIds,
  getSeasonNodeBuffIds,
  getSeasonNodeTrackedBuffIds,
} from "$lib/skill-mappings";
import type {
  BuffCoverageEntry,
  BuffGroup,
  CustomPanelGroup,
  InlineBuffEntry,
  SkillMonitorProfile,
} from "$lib/settings-store";

const EMPTY_IDS: ReadonlySet<number> = new Set<number>();
const FACTOR_DISPLAY_CANDIDATE_IDS: ReadonlySet<number> = new Set([
  ...getSeasonCultivateFactorConfiguredEffectBuffIds(),
  ...getSeasonNodeBuffIds(),
]);
const FACTOR_PUBLISHED_IDS: ReadonlySet<number> = new Set([
  ...FACTOR_DISPLAY_CANDIDATE_IDS,
  ...getSeasonNodeTrackedBuffIds(),
]);

export type ConfiguredBuffPlan = {
  enabled: boolean;
  monitorAll: boolean;
  normalDisplayIds: ReadonlySet<number>;
  customBuffIds: ReadonlySet<number>;
  /** History timeline whitelist; recorded regardless of live display. */
  coverageBuffIds: ReadonlySet<number>;
  liveCoverageBuffIds: ReadonlySet<number>;
  /** Rendered live by another area; the ordinary monitor area yields to these. */
  liveOwnedBuffIds: ReadonlySet<number>;
  factorDisplayCandidateIds: ReadonlySet<number>;
  factorPublishedIds: ReadonlySet<number>;
  linkedBuffIds: ReadonlySet<number>;
  hasFactorPanel: boolean;
  coverageEntries: readonly BuffCoverageEntry[];
  customPanelGroups: readonly CustomPanelGroup[];
  manualEntries: readonly InlineBuffEntry[];
  buffGroups: readonly BuffGroup[];
  individualMonitorAllGroup: BuffGroup | null;
};

export function buildConfiguredBuffPlan(
  profile: SkillMonitorProfile | null | undefined,
): ConfiguredBuffPlan {
  if (!profile) {
    return {
      enabled: false,
      monitorAll: false,
      normalDisplayIds: EMPTY_IDS,
      customBuffIds: EMPTY_IDS,
      coverageBuffIds: EMPTY_IDS,
      liveCoverageBuffIds: EMPTY_IDS,
      liveOwnedBuffIds: EMPTY_IDS,
      factorDisplayCandidateIds: EMPTY_IDS,
      factorPublishedIds: EMPTY_IDS,
      linkedBuffIds: EMPTY_IDS,
      hasFactorPanel: false,
      coverageEntries: [],
      customPanelGroups: [],
      manualEntries: [],
      buffGroups: [],
      individualMonitorAllGroup: null,
    };
  }

  const buffGroups = ensureBuffGroups(profile);
  const individualMonitorAllGroup = ensureIndividualMonitorAllGroup(profile);
  const customPanelGroups = ensureCustomPanelGroups(profile);
  const manualEntries = customPanelGroups
    .filter((group) => group.kind === "manual")
    .flatMap((group) => group.entries);
  const coverageEntries = ensureBuffCoverageEntries(profile);
  const hasFactorPanel = customPanelGroups.some(
    (group) => group.kind === "seasonCultivateFactor",
  );
  const normalDisplayIds =
    profile.buffDisplayMode === "grouped"
      ? validIdSet(
          buffGroups
            .filter((group) => !group.monitorAll)
            .flatMap((group) => group.buffIds),
        )
      : validIdSet(
          expandBuffSelection(
            profile.monitoredBuffIds ?? [],
            profile.monitoredBuffCategories,
          ),
        );
  const customBuffIds = validIdSet(
    manualEntries
      .filter((entry) => entry.sourceType === "buff")
      .map((entry) => entry.sourceId),
  );
  const coverageBuffIds = validIdSet(
    coverageEntries.map((entry) => entry.buffId),
  );
  const liveCoverageBuffIds = validIdSet(
    coverageEntries
      .filter((entry) => entry.showInLive)
      .map((entry) => entry.buffId),
  );
  // The flower rotation section renders these itself; only claim them while
  // that section is actually shown so hiding it restores the ordinary buff
  // behaviour.
  const resourceOwnedBuffIds = isFlowerSectionVisible(profile)
    ? validIdSet(getResourceOwnedBuffIds(profile.selectedClass))
    : EMPTY_IDS;
  const liveOwnedBuffIds = new Set<number>([
    ...customBuffIds,
    ...liveCoverageBuffIds,
    ...resourceOwnedBuffIds,
  ]);
  const monitorAll =
    (profile.buffDisplayMode === "grouped" &&
      buffGroups.some((group) => group.monitorAll)) ||
    (profile.buffDisplayMode === "individual" &&
      individualMonitorAllGroup !== null);

  return {
    enabled: profile.enabled,
    monitorAll,
    normalDisplayIds,
    customBuffIds,
    coverageBuffIds,
    liveCoverageBuffIds,
    liveOwnedBuffIds,
    factorDisplayCandidateIds: hasFactorPanel
      ? FACTOR_DISPLAY_CANDIDATE_IDS
      : EMPTY_IDS,
    factorPublishedIds: hasFactorPanel ? FACTOR_PUBLISHED_IDS : EMPTY_IDS,
    linkedBuffIds: validIdSet(
      getDefaultMonitoredBuffIds(profile.selectedClass),
    ),
    hasFactorPanel,
    coverageEntries,
    customPanelGroups,
    manualEntries,
    buffGroups,
    individualMonitorAllGroup,
  };
}

export function buildPublishedBuffIds(plan: ConfiguredBuffPlan): number[] {
  if (!plan.enabled || plan.monitorAll) return [];

  const result = new Set<number>(plan.normalDisplayIds);
  addIds(result, plan.liveOwnedBuffIds);
  addIds(result, plan.factorPublishedIds);
  addIds(result, plan.linkedBuffIds);
  return sortedIds(result);
}

export function buildBuffTimelineIds(plan: ConfiguredBuffPlan): number[] {
  return plan.enabled ? sortedIds(plan.coverageBuffIds) : [];
}

function validIdSet(values: Iterable<number>): ReadonlySet<number> {
  const result = new Set<number>();
  for (const value of values) {
    if (Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647) {
      result.add(value);
    }
  }
  return result;
}

function addIds(target: Set<number>, values: Iterable<number>): void {
  for (const value of values) target.add(value);
}

function sortedIds(values: Iterable<number>): number[] {
  return Array.from(values).sort((left, right) => left - right);
}
