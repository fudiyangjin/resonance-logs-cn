/**
 * @file Monitoring schema v8: move the skill damage display out of the
 * monster-monitor profiles (where PR #44 kept it as `skillDamageDisplay`)
 * into loadout-linked skill damage profiles, and its uploaded fonts into the
 * font library. Loadout files exported by PR #44 builds carry the same
 * monster-embedded settings and are lifted the same way on import.
 */
import type { Loadout, MonitoringSettingsState } from "./settings-store";
import {
  createSkillDamageProfile,
  createDefaultDamageNumberStyle,
  isValidSkillDamageFontDataUrl,
  normalizeSkillDamageGroup,
  skillDamageFontId,
  type SkillDamageFont,
  type SkillDamageGroup,
  type SkillDamageProfile,
  type SkillDamageProfileData,
} from "./skill-damage-settings";

/** A PR #44 group, or its flat pre-group settings. */
type LegacyDamageGroup = {
  id?: unknown;
  entries?: unknown;
  position?: { x?: unknown; y?: unknown };
  scale?: unknown;
  showSkillName?: unknown;
  nameDisplayMode?: unknown;
  fontUrl?: unknown;
  fontFamily?: unknown;
  fontColor?: unknown;
  numberStyle?: unknown;
};

type LegacyDamageDisplay = LegacyDamageGroup & {
  enabled?: unknown;
  groups?: unknown;
  x?: unknown;
  y?: unknown;
};

/** The fields PR #44 added to monster profile data (mirror and slots). */
type LegacyMonsterDamageFields = {
  name?: unknown;
  autoHideInDailyScenes?: unknown;
  skillDamageDisplay?: LegacyDamageDisplay;
  overlayPositions?: { skillDamagePanel?: { x?: unknown; y?: unknown } };
  overlaySizes?: { skillDamagePanelScale?: unknown };
  overlayVisibility?: { showSkillDamagePanel?: unknown };
};

const LEGACY_DEFAULT_POSITION = { x: 500, y: 300 };
const LEGACY_GROUP_STAGGER_Y = 120;

/**
 * Mutates `state`: every monster profile with damage groups becomes a damage
 * profile, loadouts follow their monster profile to it (or get a fresh
 * default one each), and the legacy fields are removed. Returns the fonts to
 * add to the font library.
 */
export function extractSkillDamageFromMonster(
  state: MonitoringSettingsState,
): SkillDamageFont[] {
  const monster = state.monsterMonitor;
  const mirror = monster as unknown as LegacyMonsterDamageFields;
  const slots = monster.profiles as unknown as (LegacyMonsterDamageFields & {
    id: string;
  })[];
  const fonts = new Map<string, SkillDamageFont>();
  const profiles: SkillDamageProfile[] = [];
  const damageIdByMonsterId = new Map<string, string>();

  for (const slot of slots) {
    // The mirror is the live copy of the mirrored slot.
    const source = slot.id === monster.mirroredProfileId ? mirror : slot;
    const data = legacyDamageProfileData(source, fonts);
    if (!data) continue;
    const profile = createSkillDamageProfile(
      typeof slot.name === "string" ? slot.name : "",
      data,
    );
    profiles.push(profile);
    damageIdByMonsterId.set(slot.id, profile.id);
  }

  state.loadouts.items = state.loadouts.items.map((item): Loadout => {
    const linked = damageIdByMonsterId.get(item.monsterProfileId);
    if (linked) return { ...item, damageProfileId: linked };
    const profile = createSkillDamageProfile("");
    profiles.push(profile);
    return { ...item, damageProfileId: profile.id };
  });
  state.skillDamage = { profiles };

  for (const data of [mirror, ...slots]) removeLegacyFields(data);
  return [...fonts.values()];
}

/**
 * Lifts the damage settings of a PR #44 loadout export out of its
 * `monsterProfile` into `damageProfile`/`damageFonts`. Any other input,
 * including an export that already has a damage profile, is returned as is.
 */
export function liftLegacyExportDamageProfile(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  if (record["damageProfile"] !== undefined) return data;
  const monster = record["monsterProfile"];
  if (!monster || typeof monster !== "object") return data;
  const fonts = new Map<string, SkillDamageFont>();
  const damageProfile = legacyDamageProfileData(
    monster as LegacyMonsterDamageFields,
    fonts,
  );
  if (!damageProfile) return data;
  return { ...record, damageProfile, damageFonts: [...fonts.values()] };
}

/** One monster profile's damage settings, or null when it watched nothing. */
function legacyDamageProfileData(
  source: LegacyMonsterDamageFields,
  fonts: Map<string, SkillDamageFont>,
): SkillDamageProfileData | null {
  const groups = legacyGroups(source, fonts);
  if (groups.length === 0) return null;
  return {
    name: typeof source.name === "string" ? source.name : "",
    // PR #44 showed the panel only while its region toggle was on as well.
    enabled:
      source.skillDamageDisplay?.enabled === true &&
      source.overlayVisibility?.showSkillDamagePanel !== false,
    autoHideInDailyScenes: source.autoHideInDailyScenes === true,
    groups,
  };
}

function legacyGroups(
  source: LegacyMonsterDamageFields,
  fonts: Map<string, SkillDamageFont>,
): SkillDamageGroup[] {
  const display = source.skillDamageDisplay;
  if (!display || typeof display !== "object") return [];
  const stored: LegacyDamageGroup[] = Array.isArray(display.groups)
    ? (display.groups as LegacyDamageGroup[])
    : // The flat pre-group format becomes one group, if it watched anything.
      Array.isArray(display.entries) && display.entries.length > 0
      ? [{ ...display, id: undefined }]
      : [];
  const base = source.overlayPositions?.skillDamagePanel ?? {
    x: display.x ?? LEGACY_DEFAULT_POSITION.x,
    y: display.y ?? LEGACY_DEFAULT_POSITION.y,
  };
  const baseScale = source.overlaySizes?.skillDamagePanelScale;

  return stored.map((group, index) => {
    let fontId: string | null = null;
    if (isValidSkillDamageFontDataUrl(group.fontUrl) && group.fontUrl) {
      fontId = skillDamageFontId(group.fontUrl);
      if (!fonts.has(fontId)) {
        const name =
          typeof group.fontFamily === "string" && group.fontFamily
            ? group.fontFamily
            : fontId;
        fonts.set(fontId, { id: fontId, name, dataUrl: group.fontUrl });
      }
    }
    const position = group.position ?? {
      x: base.x,
      y: Number(base.y) + index * LEGACY_GROUP_STAGGER_Y,
    };
    return normalizeSkillDamageGroup(
      {
        ...group,
        labelMode:
          group.showSkillName === false
            ? "none"
            : group.nameDisplayMode === "icon"
              ? "icon"
              : "text",
        fontId,
        fontFamily: fontId ? "" : group.fontFamily,
        numberStyle:
          group.numberStyle ??
          createDefaultDamageNumberStyle(
            typeof group.fontColor === "string" ? group.fontColor : undefined,
          ),
        layout: {
          x: position.x,
          y: position.y,
          scale: group.scale ?? baseScale ?? 1,
        },
      },
      index,
    );
  });
}

function removeLegacyFields(data: LegacyMonsterDamageFields): void {
  delete data.skillDamageDisplay;
  delete data.overlayPositions?.skillDamagePanel;
  delete data.overlaySizes?.skillDamagePanelScale;
  delete data.overlayVisibility?.showSkillDamagePanel;
}
