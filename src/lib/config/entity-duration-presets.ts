import presetsJson from "$lib/config/entity_duration_presets.json";
import {
  createEntityDurationEntry,
  ensureEntityDurationScope,
} from "$lib/entity-duration-entries";
import { getLocaleFallbackChain, type AppLocale } from "$lib/i18n/locales";
import type {
  EntityDurationEntry,
  EntityDurationScope,
} from "$lib/settings-store";

type RawPreset = {
  key: string;
  monsterId: number;
  durationMs?: number;
  scope?: string;
  imagePath?: string;
  label: Partial<Record<AppLocale, string>>;
};

export type EntityDurationPreset = {
  key: string;
  monsterId: number;
  label: string;
  durationMs?: number;
  scope: EntityDurationScope;
  imagePath?: string;
};

const RAW_PRESETS = presetsJson as RawPreset[];

function resolveLabel(raw: RawPreset, locale: AppLocale): string {
  for (const candidate of getLocaleFallbackChain(locale)) {
    const label = raw.label[candidate]?.trim();
    if (label) return label;
  }
  return raw.key;
}

function toPreset(raw: RawPreset, locale: AppLocale): EntityDurationPreset {
  return {
    key: raw.key,
    monsterId: raw.monsterId,
    label: resolveLabel(raw, locale),
    scope: ensureEntityDurationScope(raw.scope),
    ...(raw.durationMs !== undefined ? { durationMs: raw.durationMs } : {}),
    ...(raw.imagePath ? { imagePath: raw.imagePath } : {}),
  };
}

/**
 * Callers pass the UI locale explicitly (this module stays free of the
 * i18n runtime so pure migrations/tests can import it).
 */
export function getEntityDurationPresets(
  locale: AppLocale,
): EntityDurationPreset[] {
  return RAW_PRESETS.map((raw) => toPreset(raw, locale));
}

export function findEntityDurationPreset(
  key: string,
  locale: AppLocale,
): EntityDurationPreset | undefined {
  const raw = RAW_PRESETS.find((preset) => preset.key === key);
  return raw ? toPreset(raw, locale) : undefined;
}

export function createEntryFromEntityDurationPreset(
  preset: EntityDurationPreset,
): EntityDurationEntry {
  return createEntityDurationEntry({
    monsterId: preset.monsterId,
    label: preset.label,
    scope: preset.scope,
    presetKey: preset.key,
    ...(preset.durationMs !== undefined
      ? { durationMs: preset.durationMs }
      : {}),
  });
}
