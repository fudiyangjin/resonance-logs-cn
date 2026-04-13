import type {
  BuffUpdateState,
  CounterUpdateState,
  SkillCdState,
} from "$lib/api";
export {
  ensureCustomPanelEntries,
  ensureCustomPanelGroups,
  ensureInlineBuffEntries,
} from "$lib/custom-panel-utils";
export {
  DEFAULT_OVERLAY_SIZES,
  ensureBuffGroup,
  ensureBuffGroups,
  ensureCustomPanelStyle,
  ensureIndividualMonitorAllGroup,
  ensureOverlaySizes,
  ensurePanelAreaRowOrder,
  ensurePanelAttrs,
  ensureTextBuffPanelStyle,
} from "$lib/skill-monitor-normalize";
import { ensurePanelAreaRowOrder } from "$lib/skill-monitor-normalize";
import type {
  InlineBuffEntry,
  OverlayPositions,
  OverlayVisibility,
  PanelAttrConfig,
  SkillMonitorProfile,
} from "$lib/settings-store";
import {
  findAnySkillByBaseId,
  type CounterRulePreset,
} from "$lib/skill-mappings";
import {
  DEFAULT_OVERLAY_POSITIONS,
  DEFAULT_OVERLAY_VISIBILITY,
  DEFAULT_RESOURCE_VALUES_BY_CLASS,
  RESOURCE_SCALES_BY_CLASS,
} from "./overlay-constants";
import type {
  CustomPanelDisplayRow,
  PanelAreaDisplayRow,
  SkillDisplay,
  TextBuffDisplay,
} from "./overlay-types";

export function ensureOverlayPositions(
  profile: SkillMonitorProfile,
): OverlayPositions {
  const current = profile.overlayPositions;
  return {
    skillCdGroup:
      current?.skillCdGroup ?? DEFAULT_OVERLAY_POSITIONS.skillCdGroup,
    resourceGroup:
      current?.resourceGroup ?? DEFAULT_OVERLAY_POSITIONS.resourceGroup,
    textBuffPanel:
      current?.textBuffPanel ?? DEFAULT_OVERLAY_POSITIONS.textBuffPanel,
    specialBuffGroup:
      current?.specialBuffGroup ?? DEFAULT_OVERLAY_POSITIONS.specialBuffGroup,
    panelAttrGroup:
      current?.panelAttrGroup ?? DEFAULT_OVERLAY_POSITIONS.panelAttrGroup,
    customPanelGroup:
      current?.customPanelGroup ?? DEFAULT_OVERLAY_POSITIONS.customPanelGroup,
    iconBuffPositions: current?.iconBuffPositions ?? {},
    standaloneIconPositions: current?.standaloneIconPositions ?? {},
    skillDurationPositions: current?.skillDurationPositions ?? {},
    categoryIconPositions: current?.categoryIconPositions ?? {},
  };
}

export function ensureOverlayVisibility(
  profile: SkillMonitorProfile,
): OverlayVisibility {
  const current = profile.overlayVisibility;
  return {
    showSkillCdGroup:
      current?.showSkillCdGroup ??
      DEFAULT_OVERLAY_VISIBILITY.showSkillCdGroup,
    showSkillDurationGroup:
      current?.showSkillDurationGroup ??
      DEFAULT_OVERLAY_VISIBILITY.showSkillDurationGroup,
    showResourceGroup:
      current?.showResourceGroup ??
      DEFAULT_OVERLAY_VISIBILITY.showResourceGroup,
    showPanelAttrGroup:
      current?.showPanelAttrGroup ??
      DEFAULT_OVERLAY_VISIBILITY.showPanelAttrGroup,
    showCustomPanelGroup:
      current?.showCustomPanelGroup ??
      DEFAULT_OVERLAY_VISIBILITY.showCustomPanelGroup,
  };
}

export function formatAttrValue(
  value: number,
  format: PanelAttrConfig["format"],
): string {
  if (format === "integer") {
    return value.toLocaleString();
  }
  return `${(value / 100).toFixed(2)}%`;
}

export function getBuffRemainingMs(
  buff: BuffUpdateState | undefined,
  now: number,
): number {
  if (!buff) return 0;
  if (buff.durationMs <= 0) return Number.POSITIVE_INFINITY;
  const end = buff.createTimeMs + buff.durationMs;
  return Math.max(0, end - now);
}

export function isBuffActive(
  buff: BuffUpdateState | undefined,
  now: number,
): boolean {
  if (!buff) return false;
  if (buff.durationMs <= 0) return true;
  return buff.createTimeMs + buff.durationMs > now;
}

export function formatTimerText(remainingMs: number): string {
  if (!Number.isFinite(remainingMs)) return "∞";
  if (remainingMs <= 0) return "--";
  if (remainingMs <= 60_000) {
    return `${formatTenthsDown(remainingMs / 1000)}s`;
  }
  if (remainingMs <= 3_600_000) {
    return `${formatTenthsDown(remainingMs / 60_000)}m`;
  }
  return `${formatTenthsDown(remainingMs / 3_600_000)}h`;
}

export function getBuffRemainPercent(
  buff: BuffUpdateState | undefined,
  now: number,
): number {
  if (!buff || buff.durationMs <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, (getBuffRemainingMs(buff, now) / buff.durationMs) * 100),
  );
}

export function buildBuffTextRow(
  key: string,
  label: string,
  buff: BuffUpdateState,
  now: number,
  isPlaceholder = false,
): TextBuffDisplay | null {
  const active = isBuffActive(buff, now);
  if (!active && !isPlaceholder) return null;

  if (buff.durationMs <= 0 && buff.layer <= 1 && !isPlaceholder) {
    return null;
  }

  const remainingMs = getBuffRemainingMs(buff, now);
  const layer = Math.max(1, buff.layer);

  return {
    key,
    label,
    valueText: isPlaceholder ? "--" : formatTimerText(remainingMs),
    metaText: layer > 1 ? `x${layer}` : undefined,
    progressPercent: isPlaceholder ? 0 : getBuffRemainPercent(buff, now),
    showProgress: !isPlaceholder && buff.durationMs > 0,
    ...(isPlaceholder ? { isPlaceholder: true } : {}),
  };
}

export function getCustomPanelDisplayRow(
  entry: InlineBuffEntry,
  now: number,
  buffMap: Map<number, BuffUpdateState>,
  counterMap: Map<number, CounterUpdateState>,
  counterRuleMap: Map<number, CounterRulePreset>,
  resolveBuffName: (baseId: number) => string,
): CustomPanelDisplayRow | null {
  if (entry.sourceType === "buff") {
    const buff = buffMap.get(entry.sourceId);
    if (!buff) return null;
    return buildBuffTextRow(
      `inline_buff_${entry.id}`,
      resolveBuffName(entry.sourceId),
      buff,
      now,
    );
  }

  const counter = counterMap.get(entry.sourceId);
  const rule = counterRuleMap.get(entry.sourceId);
  const selectedSlotId = entry.counterSlotId
    ?? counter?.slots[0]?.slotId
    ?? rule?.effectSlots[0]?.slotId;
  const selectedSlot = counter?.slots.find((slot) => slot.slotId === selectedSlotId)
    ?? counter?.slots[0];
  const slotConfig = rule?.effectSlots.find((slot) => slot.slotId === selectedSlotId)
    ?? rule?.effectSlots[0];
  const linkedBuff = buffMap.get(slotConfig?.resetBuffId ?? -1);
  if (!counter || !selectedSlot) {
    return {
      key: `counter_${entry.id}`,
      label: entry.label,
      valueText: "--",
      progressPercent: 0,
      showProgress: false,
    };
  }
  if (selectedSlot.isCounting) {
    return {
      key: `inline_counter_${entry.id}`,
      label: entry.label,
      valueText: `${Math.max(0, selectedSlot.currentCount)}`,
      metaText: undefined,
      progressPercent: 0,
      showProgress: false,
    };
  }
  const fixedFreezeUntilMs = selectedSlot.freezeUntilMs;
  if (fixedFreezeUntilMs !== null && fixedFreezeUntilMs !== undefined) {
    const fixedRemainingMs = Math.max(0, fixedFreezeUntilMs - now);
    const freezeDurationMs = selectedSlot.freezeDurationMs ?? 0;
    const progressPercent =
      freezeDurationMs > 0
        ? Math.max(0, Math.min(100, (fixedRemainingMs / freezeDurationMs) * 100))
        : 0;
    return {
      key: `inline_counter_${entry.id}`,
      label: entry.label,
      valueText: fixedRemainingMs > 0 ? formatTimerText(fixedRemainingMs) : "--",
      metaText: "冷却中",
      progressPercent,
      showProgress: freezeDurationMs > 0 && fixedRemainingMs > 0,
    };
  }
  const active = selectedSlot.resetBuffActive ?? isBuffActive(linkedBuff, now);
  const remainingMs = getBuffRemainingMs(linkedBuff, now);
  return {
    key: `inline_counter_${entry.id}`,
    label: entry.label,
    valueText: active ? formatTimerText(remainingMs) : "--",
    metaText: active ? "冷却中" : "冷却中",
    progressPercent: getBuffRemainPercent(linkedBuff, now),
    showProgress: active && Boolean(linkedBuff && linkedBuff.durationMs > 0),
  };
}

export function buildPanelAreaRows(
  activeProfile: SkillMonitorProfile | null,
  enabledPanelAttrs: PanelAttrConfig[],
): PanelAreaDisplayRow[] {
  if (!activeProfile) return [];
  const rows = ensurePanelAreaRowOrder(activeProfile, enabledPanelAttrs);
  const result: PanelAreaDisplayRow[] = [];
  for (const row of rows) {
    const attr = enabledPanelAttrs.find((item) => item.attrId === row.attrId);
    if (attr) {
      result.push({ key: `attr_${attr.attrId}`, attr });
    }
  }
  for (const attr of enabledPanelAttrs) {
    if (!result.some((row) => row.attr.attrId === attr.attrId)) {
      result.push({ key: `attr_${attr.attrId}`, attr });
    }
  }
  return result;
}

export function computeDisplay(
  selectedClassKey: string,
  skillId: number,
  cd: SkillCdState,
  now: number,
): SkillDisplay | null {
  const skill = findAnySkillByBaseId(selectedClassKey, skillId);
  const cdAccelerateRate = Math.max(0, cd.cdAccelerateRate ?? 0);
  const elapsed = Math.max(0, now - cd.receivedAt);
  const baseDuration = cd.duration > 0 ? Math.max(1, cd.duration) : 1;
  const reducedDuration = cd.duration > 0 ? Math.max(0, cd.calculatedDuration) : 0;
  const validCdScale = cd.duration > 0 ? reducedDuration / baseDuration : 1;
  const scaledValidCdTime = cd.validCdTime * validCdScale;
  const progressed = scaledValidCdTime + elapsed * (1 + cdAccelerateRate);

  if (cd.duration === -1 && cd.skillCdType === 1) {
    if (!skill?.maxValidCdTime) return null;
    const chargePercent = Math.max(
      0,
      Math.min(1, cd.validCdTime / skill.maxValidCdTime),
    );
    return {
      isActive: chargePercent < 1,
      percent: 1 - chargePercent,
      text: `${Math.round(chargePercent * 100)}%`,
    };
  }

  if (cd.skillCdType === 1 && cd.duration > 0) {
    const maxCharges = Math.max(1, skill?.maxCharges ?? 1);
    if (maxCharges > 1) {
      const chargeDuration = Math.max(1, cd.calculatedDuration);
      const maxVct = maxCharges * chargeDuration;
      const currentVct = Math.min(maxVct, progressed);
      const chargesAvailable = Math.min(
        maxCharges,
        Math.floor(currentVct / chargeDuration),
      );
      const chargesOnCd = Math.max(0, maxCharges - chargesAvailable);
      if (chargesOnCd <= 0) {
        return {
          isActive: false,
          percent: 0,
          text: "",
          chargesText: `${maxCharges}/${maxCharges}`,
        };
      }
      const timeToNextCharge = Math.max(
        0,
        chargeDuration - (currentVct % chargeDuration),
      );
      return {
        isActive: chargesOnCd > 0,
        percent: Math.min(1, timeToNextCharge / chargeDuration),
        text: formatTenthsDown(timeToNextCharge / 1000),
        chargesText: `${chargesAvailable}/${maxCharges}`,
      };
    }
  }

  const remaining =
    reducedDuration > 0 ? Math.max(0, reducedDuration - progressed) : 0;
  const duration = reducedDuration > 0 ? reducedDuration : 1;
  return {
    isActive: remaining > 0,
    percent: remaining > 0 ? Math.min(1, remaining / duration) : 0,
    text: remaining > 0 ? formatTenthsDown(remaining / 1000) : "",
  };
}

export function getResourceValue(
  fightResValues: number[],
  selectedClassKey: string,
  index: number,
): number {
  const resolved = index < 0 ? fightResValues.length + index : index;
  const raw = fightResValues[resolved];
  if (raw === undefined) {
    return DEFAULT_RESOURCE_VALUES_BY_CLASS[selectedClassKey]?.[index] ?? 0;
  }
  const scale = RESOURCE_SCALES_BY_CLASS[selectedClassKey]?.[index] ?? 1;
  return Math.floor(raw / scale);
}

export function getResourcePreciseValue(
  fightResValues: number[],
  selectedClassKey: string,
  index: number,
): number {
  const resolved = index < 0 ? fightResValues.length + index : index;
  const raw = fightResValues[resolved];
  if (raw === undefined) {
    return DEFAULT_RESOURCE_VALUES_BY_CLASS[selectedClassKey]?.[index] ?? 0;
  }
  const scale = RESOURCE_SCALES_BY_CLASS[selectedClassKey]?.[index] ?? 1;
  return raw / scale;
}

function formatTenthsDown(value: number): string {
  return (Math.floor(Math.max(0, value) * 10) / 10).toFixed(1);
}
