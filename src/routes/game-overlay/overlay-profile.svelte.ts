import {
  SETTINGS,
  ensureBuffAliases,
  ensureOverlayTextStyle,
  type OverlayTextStyle,
  type ShieldDetailStyle,
  type TextBuffPanelStyle,
} from "$lib/settings-store";
import { buildConfiguredBuffPlan } from "$lib/buff-monitor-plan";
import { ensureResourceSections } from "$lib/resource-sections";
import { ensureBuffIconOverrides } from "$lib/buff-icons";
import {
  activeProfile as sharedActiveProfile,
  clampedProfileIndex,
  updateActiveProfile,
} from "$lib/skill-monitor-profile.svelte.js";
import {
  ensureBuffCoverageStyle,
  ensureFactorSlotLabels,
  ensurePanelAttrs,
} from "$lib/skill-monitor-normalize";
import {
  expandBuffSelection,
  normalizeBuffCategoryKeys,
  type BuffCategoryKey,
} from "$lib/config/buff-name-table";
import {
  resolveUserCounterRulesToPresets,
  type CounterRulePreset,
} from "$lib/skill-mappings";
import { DEFAULT_OVERLAY_VISIBILITY } from "./overlay-constants";
import {
  ensureOverlayVisibility,
  ensureShieldDetailStyle,
  ensureTextBuffPanelStyle,
} from "./overlay-utils";

const _activeProfileIndex = $derived.by(() => {
  return clampedProfileIndex();
});

const _activeProfile = $derived.by(() => {
  return sharedActiveProfile();
});
const _configuredBuffPlan = $derived.by(() =>
  buildConfiguredBuffPlan(_activeProfile),
);

const _selectedClassKey = $derived.by(
  () => _activeProfile?.selectedClass ?? "wind_knight",
);
const _buffAliases = $derived.by(() =>
  ensureBuffAliases(SETTINGS.skillMonitor.state.buffAliases),
);
const _buffIconOverrides = $derived.by(() =>
  ensureBuffIconOverrides(SETTINGS.skillMonitor.state.buffIconOverrides),
);
const _monitoredSkillIds = $derived.by(
  () => _activeProfile?.monitoredSkillIds ?? [],
);
const _monitoredSkillDurationIds = $derived.by(
  () => _activeProfile?.monitoredSkillDurationIds ?? [],
);
const _monitoredBuffIds = $derived.by(
  () => _activeProfile?.monitoredBuffIds ?? [],
);
const _monitoredBuffCategories = $derived.by<BuffCategoryKey[]>(() =>
  normalizeBuffCategoryKeys(_activeProfile?.monitoredBuffCategories),
);
const _expandedMonitoredBuffIds = $derived.by(() =>
  expandBuffSelection(_monitoredBuffIds, _monitoredBuffCategories),
);
const _buffPriorityIds = $derived.by(() => {
  if (!_activeProfile) return [];
  return Array.from(
    new Set([
      ...(_activeProfile.buffPriorityIds ?? []),
      ..._configuredBuffPlan.buffGroups.flatMap(
        (group) => group.priorityBuffIds ?? [],
      ),
    ]),
  );
});
const _buffDisplayMode = $derived.by(
  () => _activeProfile?.buffDisplayMode ?? "individual",
);
const _textBuffMaxVisible = $derived.by(() =>
  Math.max(1, Math.min(20, _activeProfile?.textBuffMaxVisible ?? 10)),
);
const _overlayVisibility = $derived.by(() =>
  _activeProfile
    ? ensureOverlayVisibility(_activeProfile)
    : DEFAULT_OVERLAY_VISIBILITY,
);
const _textBuffPanelStyle = $derived.by<TextBuffPanelStyle>(() =>
  ensureTextBuffPanelStyle(_activeProfile),
);
const _shieldDetailStyle = $derived.by<ShieldDetailStyle>(() =>
  ensureShieldDetailStyle(_activeProfile),
);
const _buffCoverageEntries = $derived.by(
  () => _configuredBuffPlan.coverageEntries,
);
const _buffCoverageStyle = $derived.by(() =>
  ensureBuffCoverageStyle(_activeProfile),
);
const _overlayTextStyle = $derived.by<OverlayTextStyle>(() =>
  ensureOverlayTextStyle(_activeProfile?.overlayTextStyle),
);
const _monitoredPanelAttrs = $derived.by(() =>
  ensurePanelAttrs(_activeProfile),
);
const _enabledPanelAttrs = $derived.by(() =>
  _monitoredPanelAttrs.filter((item) => item.enabled),
);
const _customPanelGroups = $derived.by(
  () => _configuredBuffPlan.customPanelGroups,
);
const _resourceSections = $derived.by(() =>
  ensureResourceSections(_activeProfile),
);
const _resolvedUserCounterRules = $derived.by<CounterRulePreset[]>(() =>
  resolveUserCounterRulesToPresets(_activeProfile?.userCounterRules),
);
const _factorSlotLabels = $derived.by<Record<string, string>>(() =>
  ensureFactorSlotLabels(_activeProfile?.factorSlotLabels),
);

export function activeProfileIndex() {
  return _activeProfileIndex;
}

export function activeProfile() {
  return _activeProfile;
}

export function configuredBuffPlan() {
  return _configuredBuffPlan;
}

export function selectedClassKey() {
  return _selectedClassKey;
}

export function buffAliases() {
  return _buffAliases;
}

export function buffIconOverrides() {
  return _buffIconOverrides;
}

export function monitoredSkillIds() {
  return _monitoredSkillIds;
}

export function monitoredSkillDurationIds() {
  return _monitoredSkillDurationIds;
}

export function monitoredBuffIds() {
  return _monitoredBuffIds;
}

export function monitoredBuffCategories() {
  return _monitoredBuffCategories;
}

export function expandedMonitoredBuffIds() {
  return _expandedMonitoredBuffIds;
}

export function buffPriorityIds() {
  return _buffPriorityIds;
}

export function buffDisplayMode() {
  return _buffDisplayMode;
}

export function textBuffMaxVisible() {
  return _textBuffMaxVisible;
}

export function overlayVisibility() {
  return _overlayVisibility;
}

export function textBuffPanelStyle() {
  return _textBuffPanelStyle;
}

export function shieldDetailStyle() {
  return _shieldDetailStyle;
}

export function buffCoverageEntries() {
  return _buffCoverageEntries;
}

export function buffCoverageStyle() {
  return _buffCoverageStyle;
}

export function overlayTextStyle() {
  return _overlayTextStyle;
}

export function monitoredPanelAttrs() {
  return _monitoredPanelAttrs;
}

export function enabledPanelAttrs() {
  return _enabledPanelAttrs;
}

export function customPanelGroups() {
  return _customPanelGroups;
}

export function resourceSections() {
  return _resourceSections;
}

export function resolvedUserCounterRules() {
  return _resolvedUserCounterRules;
}

export function factorSlotLabels() {
  return _factorSlotLabels;
}

export { updateActiveProfile };
