import {
  AVAILABLE_PANEL_ATTRS,
  SETTINGS,
  ensureBuffAliases,
  type CustomPanelStyle,
  type InlineBuffEntry,
  type PanelAttrConfig,
  type TextBuffPanelStyle,
} from "$lib/settings-store";
import {
  expandBuffSelection,
  normalizeBuffCategoryKeys,
  type BuffCategoryKey,
} from "$lib/config/buff-name-table";
import {
  resolveUserCounterRulesToPresets,
  type CounterRulePreset,
} from "$lib/skill-mappings";
import { ensureCustomPanelGroups } from "$lib/custom-panel-utils";
import { DEFAULT_OVERLAY_VISIBILITY } from "./overlay-constants";
import {
  ensureBuffGroups,
  ensureCustomPanelStyle,
  ensureOverlayVisibility,
  ensureTextBuffPanelStyle,
} from "./overlay-utils";

const _activeProfileIndex = $derived.by(() => {
  const profiles = SETTINGS.skillMonitor.state.profiles;
  if (profiles.length === 0) return 0;
  return Math.min(
    Math.max(SETTINGS.skillMonitor.state.activeProfileIndex, 0),
    profiles.length - 1,
  );
});

const _activeProfile = $derived.by(() => {
  const profiles = SETTINGS.skillMonitor.state.profiles;
  return profiles[_activeProfileIndex] ?? null;
});

const _selectedClassKey = $derived.by(
  () => _activeProfile?.selectedClass ?? "wind_knight",
);
const _buffAliases = $derived.by(() =>
  ensureBuffAliases(SETTINGS.skillMonitor.state.buffAliases),
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
      ...ensureBuffGroups(_activeProfile).flatMap(
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
const _customPanelStyle = $derived.by<CustomPanelStyle>(() =>
  ensureCustomPanelStyle(_activeProfile),
);
const _textBuffPanelStyle = $derived.by<TextBuffPanelStyle>(() =>
  ensureTextBuffPanelStyle(_activeProfile),
);
const _monitoredPanelAttrs = $derived.by(() => {
  const current = _activeProfile?.monitoredPanelAttrs ?? [];
  const currentMap = new Map(current.map((item) => [item.attrId, item]));
  return AVAILABLE_PANEL_ATTRS.map((item) => {
    const existing = currentMap.get(item.attrId);
    return {
      attrId: item.attrId,
      label: existing?.label ?? item.label,
      color: existing?.color ?? item.color,
      enabled: existing?.enabled ?? item.enabled,
      format: existing?.format ?? item.format,
    } satisfies PanelAttrConfig;
  });
});
const _enabledPanelAttrs = $derived.by(() =>
  _monitoredPanelAttrs.filter((item) => item.enabled),
);
const _customPanelGroups = $derived.by(() => {
  if (!_activeProfile) return [];
  return ensureCustomPanelGroups(_activeProfile);
});
const _inlineBuffEntries = $derived.by<InlineBuffEntry[]>(() => {
  return _customPanelGroups.flatMap((group) => group.entries);
});
const _inlineBuffIds = $derived.by(
  () =>
    new Set(
      _inlineBuffEntries
        .filter((entry) => entry.sourceType === "buff")
        .map((entry) => entry.sourceId),
    ),
);
const _resolvedUserCounterRules = $derived.by<CounterRulePreset[]>(() =>
  resolveUserCounterRulesToPresets(_activeProfile?.userCounterRules),
);

export function activeProfileIndex() {
  return _activeProfileIndex;
}

export function activeProfile() {
  return _activeProfile;
}

export function selectedClassKey() {
  return _selectedClassKey;
}

export function buffAliases() {
  return _buffAliases;
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

export function customPanelStyle() {
  return _customPanelStyle;
}

export function textBuffPanelStyle() {
  return _textBuffPanelStyle;
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

export function inlineBuffEntries() {
  return _inlineBuffEntries;
}

export function inlineBuffIds() {
  return _inlineBuffIds;
}

export function resolvedUserCounterRules() {
  return _resolvedUserCounterRules;
}

export function updateActiveProfile(
  updater: (
    profile: (typeof SETTINGS.skillMonitor.state.profiles)[number],
  ) => (typeof SETTINGS.skillMonitor.state.profiles)[number],
) {
  const state = SETTINGS.skillMonitor.state;
  const profiles = state.profiles;
  if (profiles.length === 0) return;
  const index = Math.min(
    Math.max(state.activeProfileIndex, 0),
    profiles.length - 1,
  );
  state.profiles = profiles.map((profile, i) =>
    i === index ? updater(profile) : profile,
  );
}
