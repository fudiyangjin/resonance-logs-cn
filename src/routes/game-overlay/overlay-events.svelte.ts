import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { findAnySkillByBaseId } from "$lib/skill-mappings";
import {
  ensureBuffUptimeActiveIndicators,
  ensureBuffUptimeAliases,
  ensureBuffUptimeColors,
  ensureBuffUptimeMinStacks,
  ensureBuffUptimeMinStacksEnabled,
  ensureBuffUptimeTextStyle,
  ensureBuffUptimeTrackingModes,
  type BuffUptimeTrackingMode,
} from "$lib/settings-store";
import {
  onBossBuffUpdate,
  onBuffCounterUpdate,
  onBuffUpdate,
  onEntityNames,
  onFightResUpdate,
  onLiveData,
  onPanelAttrUpdate,
  onResetEncounter,
  onShieldDetailUpdate,
  onSkillCdUpdate,
  type BuffUpdateState,
  type CounterUpdateState,
} from "$lib/api";
import {
  getAvailableBuffDefinitions,
  type BuffDefinition,
} from "$lib/config/buff-name-table";
import {
  ensureBuffGroups,
  ensureCustomPanelGroups,
  ensureCustomPanelStyle,
  ensureIndividualMonitorAllGroup,
  ensureOverlayPositions,
  ensureOverlaySizes,
  ensureOverlayVisibility,
  ensureShieldDetailStyle,
  ensureTextBuffPanelStyle,
  isBuffActive,
} from "./overlay-utils";
import {
  activeProfile,
  buffUptimeMinStacks,
  buffUptimeMinStacksEnabled,
  buffUptimeTrackingModes,
  monitoredSkillDurationIds,
  monitoredUptimeBuffIds,
  selectedClassKey,
  updateActiveProfile,
} from "./overlay-profile.svelte.js";
import { overlayRuntime } from "./overlay-runtime.svelte.js";
import {
  onGlobalPointerMove,
  onGlobalPointerUp,
  setEditMode,
  setOverlayWindow,
} from "./overlay-layout.svelte.js";
import { initOverlayClock } from "./overlay-clock.svelte.js";

type TrackedUptimeRow = {
  key: string;
  baseId: number;
  trackingMode: BuffUptimeTrackingMode;
  hostUid: number;
  sourceUid: number;
  sourceConfigId: number | null;
  isActive: boolean;
};

function buildLatestBuffMap(buffs: BuffUpdateState[]) {
  const next = new Map<number, BuffUpdateState>();
  for (const buff of buffs) {
    const existing = next.get(buff.baseId);
    if (!existing || buff.createTimeMs >= existing.createTimeMs) {
      next.set(buff.baseId, buff);
    }
  }
  return next;
}

function buildTrackedUptimeRows(localPlayerUid: number, now: number) {
  const trackedIds = monitoredUptimeBuffIds();
  const trackingModes = buffUptimeTrackingModes();
  const minStacksEnabled = buffUptimeMinStacksEnabled();
  const minStacks = buffUptimeMinStacks();
  const allBuffs: BuffUpdateState[] = [
    ...overlayRuntime.localBuffs,
    ...Array.from(overlayRuntime.bossBuffLists.values()).flat(),
  ];
  const next = new Map<string, TrackedUptimeRow>();

  for (const baseId of trackedIds) {
    const trackingMode = trackingModes[String(baseId)] ?? "self";
    const minStack = minStacksEnabled[String(baseId)]
      ? Math.max(1, minStacks[String(baseId)] ?? 1)
      : 1;
    const matches = allBuffs.filter((buff) => buff.baseId === baseId && buff.layer >= minStack);

    if (trackingMode === "self") {
      const ownMatches = overlayRuntime.localBuffs.filter((buff) => buff.baseId === baseId && buff.layer >= minStack);
      if (ownMatches.length === 0) continue;
      next.set(`uptime:${baseId}:self`, {
        key: `uptime:${baseId}:self`,
        baseId,
        trackingMode,
        hostUid: ownMatches[0]?.hostUid ?? 0,
        sourceUid: ownMatches[0]?.sourceUid ?? localPlayerUid,
        sourceConfigId: ownMatches[0]?.sourceConfigId ?? null,
        isActive: ownMatches.some((buff) => isBuffActive(buff, now)),
      });
      continue;
    }

    const grouped = new Map<string, BuffUpdateState[]>();
    for (const buff of matches) {
      const sourceUid = buff.sourceUid ?? 0;
      const hostUid = buff.hostUid ?? 0;
      const sourceConfigId = buff.sourceConfigId ?? null;
      const sourceKey = sourceUid > 0
        ? `uid:${sourceUid}`
        : sourceConfigId !== null
          ? `cfg:${sourceConfigId}`
          : `unknown:${hostUid}`;
      const rowKey = `uptime:${baseId}:global:${sourceKey}:host:${hostUid}`;
      const current = grouped.get(rowKey) ?? [];
      current.push(buff);
      grouped.set(rowKey, current);
    }

    for (const [key, buffs] of grouped) {
      const first = buffs[0];
      if (!first) continue;
      next.set(key, {
        key,
        baseId,
        trackingMode,
        hostUid: first.hostUid ?? 0,
        sourceUid: first.sourceUid ?? 0,
        sourceConfigId: first.sourceConfigId ?? null,
        isActive: buffs.some((buff) => isBuffActive(buff, now)),
      });
    }
  }

  return next;
}

export function initOverlay() {
  if (overlayRuntime.cleanup) return overlayRuntime.cleanup;
  if (typeof window === "undefined") {
    return () => {};
  }

  overlayRuntime.isMounted = true;
  overlayRuntime.isInitialized = true;
  setOverlayWindow(getCurrentWindow());

  document.documentElement.style.setProperty(
    "background",
    "transparent",
    "important",
  );
  document.body.style.setProperty("background", "transparent", "important");

  ensureActiveProfileDefaults();
  void setEditMode(false);
  loadAvailableBuffs();

  const unlistenEditToggle = listen<{ visibleBeforeEdit?: boolean }>("overlay-edit-toggle", (event) => {
    const nextEditing = !overlayRuntime.isEditing;
    if (nextEditing) {
      overlayRuntime.restoreVisibilityAfterEditing = !(event.payload?.visibleBeforeEdit ?? true);
    }
    void setEditMode(nextEditing);
  });
  const unlistenBuff = onBuffUpdate((event) => {
    overlayRuntime.localBuffs = event.payload.buffs;
    overlayRuntime.buffMap = buildLatestBuffMap(event.payload.buffs);
  });
  const unlistenBossBuff = onBossBuffUpdate((event) => {
    const next = new Map<number, BuffUpdateState[]>();
    for (const [uid, buffs] of Object.entries(event.payload.bossBuffs)) {
      next.set(Number(uid), buffs);
    }
    overlayRuntime.bossBuffLists = next;
  });
  const unlistenNames = onEntityNames((event) => {
    const next = new Map(overlayRuntime.nameCache);
    for (const [uid, name] of Object.entries(event.payload.names)) {
      next.set(Number(uid), name);
    }
    overlayRuntime.nameCache = next;
  });
  const unlistenCounter = onBuffCounterUpdate((event) => {
    const next = new Map<number, CounterUpdateState>();
    for (const counter of event.payload.counters) {
      next.set(counter.ruleId, counter);
    }
    overlayRuntime.counterMap = next;
  });
  const unlistenCd = onSkillCdUpdate((event) => {
    const next = new Map(overlayRuntime.cdMap);
    const nextDurationMap = new Map(overlayRuntime.skillDurationMap);
    const classKey = selectedClassKey();
    const durationSkillIds = new Set(monitoredSkillDurationIds());
    for (const cd of event.payload.skillCds) {
      const baseId = Math.floor(cd.skillLevelId / 100);
      next.set(baseId, cd);
      if (!durationSkillIds.has(baseId)) continue;
      const skill = findAnySkillByBaseId(classKey, baseId);
      const effectDurationMs = skill?.effectDurationMs;
      if (!effectDurationMs || cd.beginTime <= 0) continue;
      const currentDuration = nextDurationMap.get(baseId);
      if (currentDuration?.beginTime === cd.beginTime) continue;
      nextDurationMap.set(baseId, {
        skillId: baseId,
        startedAtMs: cd.receivedAt || Date.now(),
        durationMs: effectDurationMs,
        beginTime: cd.beginTime,
      });
    }
    for (const skillId of nextDurationMap.keys()) {
      if (!durationSkillIds.has(skillId)) {
        nextDurationMap.delete(skillId);
      }
    }
    overlayRuntime.cdMap = next;
    overlayRuntime.skillDurationMap = nextDurationMap;
  });
  const unlistenRes = onFightResUpdate((event) => {
    const next = new Map<number, number>();
    for (const entry of event.payload.fightRes.entries) {
      next.set(entry.id, entry.value);
    }
    overlayRuntime.fightResMap = next;
  });
  const unlistenPanelAttr = onPanelAttrUpdate((event) => {
    const next = new Map(overlayRuntime.panelAttrMap);
    for (const attr of event.payload.attrs) {
      next.set(attr.attrId, attr.value);
    }
    overlayRuntime.panelAttrMap = next;
  });
  const unlistenShieldDetail = onShieldDetailUpdate((event) => {
    overlayRuntime.shieldDetailHp = {
      current: event.payload.currentHp,
      max: event.payload.maxHp,
    };
    overlayRuntime.shieldDetailEntries = event.payload.entries;
  });

  const unlistenLiveData = onLiveData((event) => {
    const data = event.payload;
    overlayRuntime.liveData = data;

    const shouldReset =
      overlayRuntime.uptimeFightStartTimestampMs !== data.fightStartTimestampMs
      || data.elapsedMs < overlayRuntime.uptimeLastElapsedMs
      || data.activeCombatTimeMs < overlayRuntime.uptimeLastActiveCombatTimeMs
      || data.elapsedMs === 0;

    const prevElapsedMs = shouldReset ? 0 : overlayRuntime.uptimeLastElapsedMs;
    const prevActiveCombatMs = shouldReset ? 0 : overlayRuntime.uptimeLastActiveCombatTimeMs;

    if (shouldReset) {
      overlayRuntime.uptimeTotals = new Map();
      overlayRuntime.activeUptimeRowKeys = new Set();
      overlayRuntime.uptimeFightStartTimestampMs = data.fightStartTimestampMs;
      if (data.elapsedMs === 0) {
        overlayRuntime.uptimeLastElapsedMs = 0;
        overlayRuntime.uptimeLastActiveCombatTimeMs = 0;
        return;
      }
    }

    const deltaElapsedMs = Math.max(0, data.elapsedMs - prevElapsedMs);
    const deltaActiveCombatMs = Math.max(0, data.activeCombatTimeMs - prevActiveCombatMs);
    const now = Date.now();
    const trackedRows = buildTrackedUptimeRows(data.localPlayerUid, now);
    overlayRuntime.activeUptimeRowKeys = new Set(
      Array.from(trackedRows.entries())
        .filter(([, row]) => row.isActive)
        .map(([key]) => key),
    );

    const nextTotals = new Map(overlayRuntime.uptimeTotals);
    for (const [key, row] of trackedRows) {
      const current = nextTotals.get(key) ?? {
        baseId: row.baseId,
        trackingMode: row.trackingMode,
        hostUid: row.hostUid,
        sourceUid: row.sourceUid,
        sourceConfigId: row.sourceConfigId,
        encounterActiveMs: 0,
        trueActiveMs: 0,
      };

      current.baseId = row.baseId;
      current.trackingMode = row.trackingMode;
      current.hostUid = row.hostUid;
      current.sourceUid = row.sourceUid;
      current.sourceConfigId = row.sourceConfigId;

      if (row.isActive) {
        current.encounterActiveMs += deltaElapsedMs;
        current.trueActiveMs += deltaActiveCombatMs;
      }

      nextTotals.set(key, current);
    }
    overlayRuntime.uptimeTotals = nextTotals;

    overlayRuntime.uptimeFightStartTimestampMs = data.fightStartTimestampMs;
    overlayRuntime.uptimeLastElapsedMs = data.elapsedMs;
    overlayRuntime.uptimeLastActiveCombatTimeMs = data.activeCombatTimeMs;
  });

  const unlistenResetEncounter = onResetEncounter(() => {
    overlayRuntime.liveData = null;
    overlayRuntime.shieldDetailHp = { current: 0, max: 0 };
    overlayRuntime.shieldDetailEntries = [];
    overlayRuntime.uptimeTotals = new Map();
    overlayRuntime.activeUptimeRowKeys = new Set();
    overlayRuntime.uptimeFightStartTimestampMs = 0;
    overlayRuntime.uptimeLastElapsedMs = 0;
    overlayRuntime.uptimeLastActiveCombatTimeMs = 0;
  });

  window.addEventListener("pointermove", onGlobalPointerMove);
  window.addEventListener("pointerup", onGlobalPointerUp);
  const cleanupClock = initOverlayClock();

  overlayRuntime.cleanup = () => {
    overlayRuntime.isMounted = false;
    overlayRuntime.isInitialized = false;
    overlayRuntime.dragState = null;
    overlayRuntime.resizeState = null;
    overlayRuntime.activeUptimeRowKeys = new Set();
    overlayRuntime.nameCache = new Map();
    overlayRuntime.localBuffs = [];
    overlayRuntime.bossBuffLists = new Map();
    unlistenEditToggle.then((fn) => fn());
    unlistenBuff.then((fn) => fn());
    unlistenBossBuff.then((fn) => fn());
    unlistenNames.then((fn) => fn());
    unlistenCounter.then((fn) => fn());
    unlistenCd.then((fn) => fn());
    unlistenRes.then((fn) => fn());
    unlistenPanelAttr.then((fn) => fn());
    unlistenShieldDetail.then((fn) => fn());
    unlistenLiveData.then((fn) => fn());
    unlistenResetEncounter.then((fn) => fn());
    window.removeEventListener("pointermove", onGlobalPointerMove);
    window.removeEventListener("pointerup", onGlobalPointerUp);
    cleanupClock();
    setOverlayWindow(null);
    overlayRuntime.cleanup = null;
  };

  return overlayRuntime.cleanup;
}

function loadAvailableBuffs() {
  const next = new Map<number, BuffDefinition>();
  for (const buff of getAvailableBuffDefinitions()) {
    next.set(buff.baseId, buff);
  }
  overlayRuntime.buffDefinitions = next;
}

function ensureActiveProfileDefaults() {
  const profile = activeProfile();
  if (
    profile &&
    (!profile.overlayPositions ||
      profile.overlayPositions.skillDurationPositions === undefined ||
      !profile.overlaySizes ||
      profile.overlaySizes.skillDurationSizes === undefined ||
      !profile.overlayVisibility ||
      profile.overlayVisibility.showSkillDurationGroup === undefined ||
      profile.overlayVisibility.showBuffUptimeGroup === undefined ||
      profile.overlayVisibility.showShieldDetailGroup === undefined ||
      !profile.buffDisplayMode ||
      !profile.buffGroups ||
      !profile.customPanelGroups ||
      !profile.customPanelStyle ||
      !profile.textBuffPanelStyle ||
      !profile.textBuffMaxVisible ||
      profile.monitoredSkillDurationIds === undefined ||
      profile.monitoredUptimeBuffIds === undefined ||
      profile.buffUptimeColors === undefined ||
      profile.buffUptimeAliases === undefined ||
      profile.buffUptimeTrackingModes === undefined ||
      profile.buffUptimeActiveIndicators === undefined ||
      profile.buffUptimeMinStacksEnabled === undefined ||
      profile.buffUptimeMinStacks === undefined ||
      profile.buffUptimeTextStyle === undefined ||
      profile.shieldDetailStyle === undefined ||
      profile.showTrueUptime === undefined)
  ) {
    updateActiveProfile((profile) => ({
      ...profile,
      monitoredSkillDurationIds: profile.monitoredSkillDurationIds ?? [],
      monitoredUptimeBuffIds: profile.monitoredUptimeBuffIds ?? [],
      buffUptimeColors: ensureBuffUptimeColors(profile.buffUptimeColors),
      buffUptimeAliases: ensureBuffUptimeAliases(profile.buffUptimeAliases),
      buffUptimeTrackingModes: ensureBuffUptimeTrackingModes(profile.buffUptimeTrackingModes),
      buffUptimeActiveIndicators: ensureBuffUptimeActiveIndicators(profile.buffUptimeActiveIndicators),
      buffUptimeMinStacksEnabled: ensureBuffUptimeMinStacksEnabled(profile.buffUptimeMinStacksEnabled),
      buffUptimeMinStacks: ensureBuffUptimeMinStacks(profile.buffUptimeMinStacks),
      buffUptimeTextStyle: ensureBuffUptimeTextStyle(profile.buffUptimeTextStyle),
      shieldDetailStyle: ensureShieldDetailStyle(profile),
      showTrueUptime: profile.showTrueUptime ?? true,
      overlayPositions: ensureOverlayPositions(profile),
      overlaySizes: ensureOverlaySizes(profile),
      overlayVisibility: ensureOverlayVisibility(profile),
      buffDisplayMode: profile.buffDisplayMode ?? "individual",
      buffGroups: ensureBuffGroups(profile),
      individualMonitorAllGroup: ensureIndividualMonitorAllGroup(profile),
      customPanelGroups: ensureCustomPanelGroups(profile),
      inlineBuffEntries: [],
      customPanelStyle: ensureCustomPanelStyle(profile),
      textBuffPanelStyle: ensureTextBuffPanelStyle(profile),
      textBuffMaxVisible: Math.max(
        1,
        Math.min(20, profile.textBuffMaxVisible ?? 10),
      ),
    }));
  }
}
