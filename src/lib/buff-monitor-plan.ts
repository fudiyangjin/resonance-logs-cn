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
} from "$lib/skill-mappings";
import type {
  BuffCoverageEntry,
  BuffGroup,
  CustomPanelGroup,
  InlineBuffEntry,
  SkillMonitorProfile,
} from "$lib/settings-store";

const EMPTY_IDS: ReadonlySet<number> = new Set<number>();
/** Every buff the factor / season-node panel can render. Resolved statically
 * so keeping them out of the monitor-all catch-all never depends on runtime
 * season or factor-slot data. */
const FACTOR_CANDIDATE_IDS: ReadonlySet<number> = new Set([
  ...getSeasonCultivateFactorConfiguredEffectBuffIds(),
  ...getSeasonNodeBuffIds(),
]);

/**
 * Buff routing for one skill-monitor profile.
 *
 * Publication and display are independent: `publishedIds` is the union of
 * every area's demand and never implies display. Each area renders only the
 * ids it declares; the monitor-all catch-all is the only place that
 * subtracts, and only what another rendered area already shows.
 */
export type ConfiguredBuffPlan = {
  enabled: boolean;
  monitorAll: boolean;
  /** Ids the ordinary icon/text area renders in the active display mode. */
  ordinaryIds: ReadonlySet<number>;
  /** Ids the monitor-all catch-all leaves out: the ordinary selection plus
   * everything declared by another area that is currently rendered. */
  catchAllExcludedIds: ReadonlySet<number>;
  /** Backend publication whitelist; empty while the profile is disabled. */
  publishedIds: readonly number[];
  /** History timeline whitelist; recorded regardless of live display. */
  timelineIds: readonly number[];
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
      ordinaryIds: EMPTY_IDS,
      catchAllExcludedIds: EMPTY_IDS,
      publishedIds: [],
      timelineIds: [],
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
  const ordinaryIds =
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
  const factorIds = hasFactorPanel ? FACTOR_CANDIDATE_IDS : EMPTY_IDS;
  const liveCoverageIds = validIdSet(
    coverageEntries
      .filter((entry) => entry.showInLive)
      .map((entry) => entry.buffId),
  );
  // The flower rotation section draws these itself; only while it is shown,
  // so hiding it restores the ordinary behaviour.
  const flowerIds = isFlowerSectionVisible(profile)
    ? validIdSet(getResourceOwnedBuffIds(profile.selectedClass))
    : EMPTY_IDS;
  // Same defaults as `ensureOverlayVisibility`.
  const showCustomPanels =
    profile.overlayVisibility?.showCustomPanelGroup ?? true;
  const showCoverage =
    profile.overlayVisibility?.showBuffCoverageGroup ?? false;

  const catchAllExcludedIds = new Set<number>(ordinaryIds);
  if (showCustomPanels) {
    addIds(catchAllExcludedIds, customBuffIds);
    addIds(catchAllExcludedIds, factorIds);
  }
  if (showCoverage) addIds(catchAllExcludedIds, liveCoverageIds);
  addIds(catchAllExcludedIds, flowerIds);

  const monitorAll =
    (profile.buffDisplayMode === "grouped" &&
      buffGroups.some((group) => group.monitorAll)) ||
    (profile.buffDisplayMode === "individual" &&
      individualMonitorAllGroup !== null);

  return {
    enabled: profile.enabled,
    monitorAll,
    ordinaryIds,
    catchAllExcludedIds,
    publishedIds: profile.enabled
      ? sortedIds(
          new Set([
            ...ordinaryIds,
            ...customBuffIds,
            ...factorIds,
            ...liveCoverageIds,
            ...flowerIds,
            ...validIdSet(getDefaultMonitoredBuffIds(profile.selectedClass)),
          ]),
        )
      : [],
    timelineIds: profile.enabled
      ? sortedIds(validIdSet(coverageEntries.map((entry) => entry.buffId)))
      : [],
    hasFactorPanel,
    coverageEntries,
    customPanelGroups,
    manualEntries,
    buffGroups,
    individualMonitorAllGroup,
  };
}

/** Whether the ordinary icon/text area shows `baseId`: always when selected
 * there explicitly; under monitor-all, any real buff that no other rendered
 * area already shows. */
export function isOrdinaryBuff(
  plan: ConfiguredBuffPlan,
  baseId: number,
): boolean {
  if (plan.ordinaryIds.has(baseId)) return true;
  return plan.monitorAll && baseId > 0 && !plan.catchAllExcludedIds.has(baseId);
}

/** Non-zero i32 ids; negative ids are reserved for composite buffs. */
function validIdSet(values: Iterable<number>): ReadonlySet<number> {
  const result = new Set<number>();
  for (const value of values) {
    if (
      Number.isSafeInteger(value) &&
      value !== 0 &&
      value >= -2_147_483_648 &&
      value <= 2_147_483_647
    ) {
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
