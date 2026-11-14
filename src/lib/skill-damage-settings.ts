/**
 * @file Skill damage HUD settings: types, defaults and load-time
 * normalization. A leaf module (no settings-store import) so the store can
 * build its defaults from it.
 *
 * Profiles live in `monitoring.skillDamage` and follow the active loadout
 * (`Loadout.damageProfileId`). Uploaded fonts live once in the separate
 * `skillDamageFonts` store and groups reference them by id, so editing a
 * group never rewrites font data.
 */
import type { SkillDamageRuntimeSnapshot } from "./bindings";

export type SkillDamagePaint = {
  mode: "solid" | "gradient";
  color: string;
  endColor: string;
  angle: number;
};

export type SkillDamageNumberStyle = {
  italic: boolean;
  fill: SkillDamagePaint;
  innerGlow: boolean;
  innerGlowSize: number;
  innerGlowColor: SkillDamagePaint;
  outline: boolean;
  outlineWidth: number;
  outlineColor: SkillDamagePaint;
  outerGlow: boolean;
  outerGlowSize: number;
  outerGlowColor: SkillDamagePaint;
  shadow: boolean;
  shadowSize: number;
  shadowColor: SkillDamagePaint;
};

export type SkillDamageFormat = "integer" | "grouped" | "cn" | "western";
export const SKILL_DAMAGE_ANIMATIONS = ["pop", "shrink", "floatUp"] as const;
export type SkillDamageAnimation = (typeof SKILL_DAMAGE_ANIMATIONS)[number];
export type SkillDamageScrollDirection = "up" | "down";
export type SkillDamageLabelMode = "none" | "text" | "icon";
/** `merge` shows hits as rows; `continuous` keeps one running total per window. */
export type SkillDamageDisplayMode = "merge" | "continuous";
/**
 * What opens and settles a continuous window: `rolling` stays open while
 * group hits keep arriving, `skills` runs from a start skill's hit to an end
 * skill's hit or a timeout, `cast` follows a preset skill's cast.
 */
export type SkillDamageWindowMode = "rolling" | "skills" | "cast";

/**
 * Casts a `cast` window can follow, by the cast's base skill id (the id of
 * its lifecycle events, not of the damage it deals).
 */
export const SKILL_DAMAGE_CAST_PRESETS = { ray: 1241, infusion: 1520 } as const;
export type SkillDamageCastPreset = keyof typeof SKILL_DAMAGE_CAST_PRESETS;

export type SkillDamageEntry = { skillId: number; alias: string };

/** Top-left position and scale of a group's panel on the HUD. */
export type SkillDamageLayout = { x: number; y: number; scale: number };

export type SkillDamageGroup = {
  id: string;
  name: string;
  enabled: boolean;
  entries: SkillDamageEntry[];
  /** Every own damage hit counts as this group's, as if all skills were listed. */
  allSelfDamage: boolean;
  displayMode: SkillDamageDisplayMode;
  /** Sum every watched hit of one batch into a single row named after the group. */
  mergeSimultaneous: boolean;
  /** Sum one skill's hits within a batch; otherwise show every hit separately. */
  mergeHits: boolean;
  maxVisible: number;
  /** How long a row stays; in continuous mode, how long the settled total stays. */
  durationMs: number;
  format: SkillDamageFormat;
  animation: SkillDamageAnimation;
  scrollDirection: SkillDamageScrollDirection;
  labelMode: SkillDamageLabelMode;
  iconPath: string;
  iconBackground: SkillDamagePaint;
  iconBackgroundOpacity: number;
  labelSpacing: number;
  /** Uploaded font (`skillDamageFonts`), or null for `fontFamily`. */
  fontId: string | null;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  numberStyle: SkillDamageNumberStyle;
  layout: SkillDamageLayout;

  // Continuous mode.
  continuousWindowMode: SkillDamageWindowMode;
  /** `rolling`: the window settles this long after the last group hit. */
  continuousWindowMs: number;
  /** `skills`: hits of these open the window; empty means any group skill. */
  continuousStartSkillIds: number[];
  /** `skills`: a hit of these settles the window; empty leaves the timeout. */
  continuousEndSkillIds: number[];
  /** `skills`: the window settles this long after the last opening hit. */
  continuousTimeoutMs: number;
  continuousCastPreset: SkillDamageCastPreset;
  /** `cast`: damage still counts for this long after the cast ended. */
  continuousCastCloseDelayMs: number;
  /**
   * Count other own damage inside an open window too. Unlike
   * `allSelfDamage`, such hits neither open nor extend the window.
   */
  continuousAllDamage: boolean;
  continuousAnimation: SkillDamageAnimation;
  continuousFinalAnimation: SkillDamageAnimation;
  showComboCount: boolean;
  comboFormat: "hit" | "multiplier";
  comboPosition: "top" | "bottom" | "left" | "right";
  comboSpacing: number;
};

export type SkillDamageProfile = {
  id: string;
  name: string;
  enabled: boolean;
  autoHideInDailyScenes: boolean;
  groups: SkillDamageGroup[];
};

export type SkillDamageProfileData = Omit<SkillDamageProfile, "id">;

export type SkillDamageState = { profiles: SkillDamageProfile[] };

export type SkillDamageFont = { id: string; name: string; dataUrl: string };

export type SkillDamageFontsState = { fonts: SkillDamageFont[] };

export const SKILL_DAMAGE_DURATION_MS = {
  min: 100,
  max: 60_000,
  default: 2_500,
};
export const SKILL_DAMAGE_WINDOW_TIMEOUT_MS = {
  min: 100,
  max: 3_600_000,
  default: 15_000,
};
export const SKILL_DAMAGE_CAST_CLOSE_DELAY_MS = {
  min: 0,
  max: 1_000,
  default: 0,
};
/** Most skills one window trigger list holds. */
export const SKILL_DAMAGE_WINDOW_SKILLS_MAX = 512;
export const SKILL_DAMAGE_MAX_VISIBLE = 8;
export const SKILL_DAMAGE_SCALE = { min: 0.5, max: 2.5 };
export const SKILL_DAMAGE_FONT_SIZE = { min: 8, max: 120, default: 24 };
export const SKILL_DAMAGE_FONT_WEIGHTS = [400, 500, 600, 700, 800, 900];
export const SKILL_DAMAGE_EFFECT_SIZE_MAX = 100;
export const SKILL_DAMAGE_LABEL_SPACING_MAX = 200;
/** Base64 font data URLs only; ~24 MB of font data at most. */
export const SKILL_DAMAGE_FONT_DATA_URL = /^data:[\w./+-]*;base64,/;
export const SKILL_DAMAGE_FONT_MAX_LENGTH = 32 * 1024 * 1024;

const DEFAULT_POSITION = { x: 500, y: 300 };
/** Vertical offset between new groups, so they do not stack on one spot. */
const GROUP_STAGGER_Y = 120;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function damagePaint(color: string): SkillDamagePaint {
  return { mode: "solid", color, endColor: color, angle: 90 };
}

export function createDefaultDamageNumberStyle(
  color = "#ffd86b",
): SkillDamageNumberStyle {
  return {
    italic: false,
    fill: damagePaint(color),
    innerGlow: false,
    innerGlowSize: 3,
    innerGlowColor: damagePaint("#ffffff"),
    outline: false,
    outlineWidth: 1,
    outlineColor: damagePaint("#000000"),
    outerGlow: false,
    outerGlowSize: 6,
    outerGlowColor: damagePaint("#ffbb33"),
    shadow: true,
    shadowSize: 3,
    shadowColor: damagePaint("#000000"),
  };
}

export function generateSkillDamageId(prefix: "damage" | "group"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Default panel layout of a profile's n-th group, staggered so groups do not overlap. */
export function defaultSkillDamageLayout(index = 0): SkillDamageLayout {
  return {
    ...DEFAULT_POSITION,
    y: DEFAULT_POSITION.y + index * GROUP_STAGGER_Y,
    scale: 1,
  };
}

/** `index` staggers the default position of a profile's n-th group. */
export function createSkillDamageGroup(
  name: string,
  index = 0,
): SkillDamageGroup {
  return {
    id: generateSkillDamageId("group"),
    name,
    enabled: true,
    entries: [],
    allSelfDamage: false,
    displayMode: "merge",
    mergeSimultaneous: false,
    mergeHits: false,
    maxVisible: SKILL_DAMAGE_MAX_VISIBLE,
    durationMs: SKILL_DAMAGE_DURATION_MS.default,
    format: "grouped",
    animation: "pop",
    scrollDirection: "up",
    labelMode: "text",
    iconPath: "",
    iconBackground: damagePaint("#1e232c"),
    iconBackgroundOpacity: 0.9,
    labelSpacing: 12,
    fontId: null,
    fontFamily: "",
    fontSize: SKILL_DAMAGE_FONT_SIZE.default,
    fontWeight: 700,
    numberStyle: createDefaultDamageNumberStyle(),
    layout: defaultSkillDamageLayout(index),
    continuousWindowMode: "rolling",
    continuousWindowMs: 1_500,
    continuousStartSkillIds: [],
    continuousEndSkillIds: [],
    continuousTimeoutMs: SKILL_DAMAGE_WINDOW_TIMEOUT_MS.default,
    continuousCastPreset: "ray",
    continuousCastCloseDelayMs: SKILL_DAMAGE_CAST_CLOSE_DELAY_MS.default,
    continuousAllDamage: false,
    continuousAnimation: "shrink",
    continuousFinalAnimation: "pop",
    showComboCount: false,
    comboFormat: "hit",
    comboPosition: "bottom",
    comboSpacing: 4,
  };
}

export function createDefaultSkillDamageProfileData(): SkillDamageProfileData {
  return {
    name: "",
    enabled: false,
    autoHideInDailyScenes: false,
    groups: [createSkillDamageGroup("")],
  };
}

export function createSkillDamageProfile(
  name: string,
  source?: SkillDamageProfileData,
): SkillDamageProfile {
  const data = source
    ? (JSON.parse(JSON.stringify(source)) as SkillDamageProfileData)
    : createDefaultSkillDamageProfileData();
  return { ...data, id: generateSkillDamageId("damage"), name };
}

export function createDefaultSkillDamageState(): SkillDamageState {
  return { profiles: [createSkillDamageProfile("")] };
}

export function clampSkillDamageDuration(value: unknown): number {
  return clampNumber(
    value,
    SKILL_DAMAGE_DURATION_MS.default,
    SKILL_DAMAGE_DURATION_MS.min,
    SKILL_DAMAGE_DURATION_MS.max,
  );
}

export function clampSkillDamageScale(value: unknown): number {
  return clampNumber(value, 1, SKILL_DAMAGE_SCALE.min, SKILL_DAMAGE_SCALE.max);
}

/** Base skill id of the cast a `cast` window follows. */
export function skillDamageCastPresetSkillId(group: SkillDamageGroup): number {
  return SKILL_DAMAGE_CAST_PRESETS[group.continuousCastPreset];
}

/**
 * What the backend has to collect for this profile: the damage ids its
 * groups list or trigger on, the casts its cast windows follow, and whether
 * some group needs every own hit.
 */
export function skillDamageRuntimeSnapshot(
  profile: SkillDamageProfile | null | undefined,
): SkillDamageRuntimeSnapshot {
  const skillKeys = new Set<number>();
  const castIds = new Set<number>();
  let monitorAll = false;
  for (const group of profile?.enabled ? profile.groups : []) {
    if (!group.enabled) continue;
    for (const entry of group.entries) skillKeys.add(entry.skillId);
    monitorAll ||= group.allSelfDamage;
    if (group.displayMode !== "continuous") continue;
    if (group.continuousWindowMode === "skills") {
      for (const id of group.continuousStartSkillIds) skillKeys.add(id);
      for (const id of group.continuousEndSkillIds) skillKeys.add(id);
    } else if (group.continuousWindowMode === "cast") {
      castIds.add(skillDamageCastPresetSkillId(group));
    }
    monitorAll ||= group.continuousAllDamage && windowCanOpen(group);
  }
  const sorted = (ids: Set<number>) => [...ids].sort((a, b) => a - b);
  return {
    watchedSkillKeys: sorted(skillKeys),
    watchedCastIds: sorted(castIds),
    monitorAll,
  };
}

/**
 * Whether anything can open the group's window. A window nothing opens
 * counts no damage, so it is no reason to collect every hit.
 */
function windowCanOpen(group: SkillDamageGroup): boolean {
  switch (group.continuousWindowMode) {
    case "cast":
      return true;
    case "skills":
      return (
        group.continuousStartSkillIds.length > 0 || group.entries.length > 0
      );
    case "rolling":
      return group.entries.length > 0;
  }
}

export function referencedSkillDamageFontIds(
  profiles: readonly SkillDamageProfile[],
): Set<string> {
  const ids = new Set<string>();
  for (const profile of profiles) {
    for (const group of profile.groups) {
      if (group.fontId) ids.add(group.fontId);
    }
  }
  return ids;
}

/** Content id (FNV-1a 64) so the same font file is stored once. */
export function skillDamageFontId(dataUrl: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < dataUrl.length; index += 1) {
    hash ^= BigInt(dataUrl.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `font_${hash.toString(16).padStart(16, "0")}`;
}

/** `existing` plus the fonts of `added` it does not hold yet (by id). */
export function mergeSkillDamageFonts(
  existing: readonly SkillDamageFont[],
  added: readonly SkillDamageFont[],
): SkillDamageFont[] {
  const known = new Set(existing.map((font) => font.id));
  const fresh = added.filter((font) => {
    if (known.has(font.id)) return false;
    known.add(font.id);
    return true;
  });
  return [...existing, ...fresh];
}

export function isValidSkillDamageFontDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= SKILL_DAMAGE_FONT_MAX_LENGTH &&
    SKILL_DAMAGE_FONT_DATA_URL.test(value)
  );
}

export function normalizeSkillDamageState(input: unknown): SkillDamageState {
  const stored = loose<SkillDamageState>(input).profiles;
  const seen = new Set<string>();
  const profiles = (Array.isArray(stored) ? stored : [])
    .filter(isRecord)
    .map((profile) => normalizeSkillDamageProfile(profile))
    .filter((profile) => {
      if (seen.has(profile.id)) return false;
      seen.add(profile.id);
      return true;
    });
  return {
    profiles: profiles.length > 0 ? profiles : [createSkillDamageProfile("")],
  };
}

export function normalizeSkillDamageProfile(
  input: unknown,
): SkillDamageProfile {
  const source = loose<SkillDamageProfile>(input);
  const seen = new Set<string>();
  const groups = (Array.isArray(source.groups) ? source.groups : [])
    .filter(isRecord)
    .map((group, index) => normalizeSkillDamageGroup(group, index))
    .filter((group) => {
      if (seen.has(group.id)) return false;
      seen.add(group.id);
      return true;
    });
  return {
    id: nonEmptyString(source.id) ?? generateSkillDamageId("damage"),
    name: typeof source.name === "string" ? source.name : "",
    enabled: source.enabled === true,
    autoHideInDailyScenes: source.autoHideInDailyScenes === true,
    groups,
  };
}

export function normalizeSkillDamageGroup(
  input: unknown,
  index = 0,
): SkillDamageGroup {
  const source = loose<SkillDamageGroup>(input);
  const defaults = createSkillDamageGroup("", index);
  const layout = loose<SkillDamageLayout>(source.layout);
  const seenSkills = new Set<number>();
  const entries = (Array.isArray(source.entries) ? source.entries : [])
    .filter(isRecord)
    .flatMap((value): SkillDamageEntry[] => {
      const entry = loose<SkillDamageEntry>(value);
      const skillId = entry.skillId;
      if (
        typeof skillId !== "number" ||
        !Number.isSafeInteger(skillId) ||
        skillId <= 0 ||
        seenSkills.has(skillId)
      ) {
        return [];
      }
      seenSkills.add(skillId);
      return [
        { skillId, alias: typeof entry.alias === "string" ? entry.alias : "" },
      ];
    });
  return {
    id: nonEmptyString(source.id) ?? defaults.id,
    name: typeof source.name === "string" ? source.name : "",
    enabled: source.enabled !== false,
    entries,
    allSelfDamage: source.allSelfDamage === true,
    displayMode: oneOf(
      source.displayMode,
      ["merge", "continuous"],
      defaults.displayMode,
    ),
    mergeSimultaneous: source.mergeSimultaneous === true,
    mergeHits: source.mergeHits === true,
    maxVisible: Math.round(
      clampNumber(
        source.maxVisible,
        defaults.maxVisible,
        1,
        SKILL_DAMAGE_MAX_VISIBLE,
      ),
    ),
    durationMs: Math.round(clampSkillDamageDuration(source.durationMs)),
    format: oneOf(
      source.format,
      ["integer", "grouped", "cn", "western"],
      defaults.format,
    ),
    animation: oneOf(
      source.animation,
      SKILL_DAMAGE_ANIMATIONS,
      defaults.animation,
    ),
    scrollDirection: oneOf(
      source.scrollDirection,
      ["up", "down"],
      defaults.scrollDirection,
    ),
    labelMode: oneOf(
      source.labelMode,
      ["none", "text", "icon"],
      defaults.labelMode,
    ),
    iconPath: typeof source.iconPath === "string" ? source.iconPath : "",
    iconBackground: normalizePaint(
      source.iconBackground,
      defaults.iconBackground,
    ),
    iconBackgroundOpacity: clampNumber(
      source.iconBackgroundOpacity,
      defaults.iconBackgroundOpacity,
      0,
      1,
    ),
    labelSpacing: clampNumber(
      source.labelSpacing,
      defaults.labelSpacing,
      0,
      SKILL_DAMAGE_LABEL_SPACING_MAX,
    ),
    fontId: nonEmptyString(source.fontId) ?? null,
    fontFamily: typeof source.fontFamily === "string" ? source.fontFamily : "",
    fontSize: clampNumber(
      source.fontSize,
      defaults.fontSize,
      SKILL_DAMAGE_FONT_SIZE.min,
      SKILL_DAMAGE_FONT_SIZE.max,
    ),
    fontWeight: SKILL_DAMAGE_FONT_WEIGHTS.includes(source.fontWeight as number)
      ? (source.fontWeight as number)
      : defaults.fontWeight,
    numberStyle: normalizeNumberStyle(source.numberStyle, defaults.numberStyle),
    layout: {
      x: finiteOr(layout.x, defaults.layout.x),
      y: finiteOr(layout.y, defaults.layout.y),
      scale: clampSkillDamageScale(layout.scale),
    },
    continuousWindowMode: oneOf(
      source.continuousWindowMode,
      ["rolling", "skills", "cast"],
      defaults.continuousWindowMode,
    ),
    continuousWindowMs: Math.round(
      clampSkillDamageDuration(
        source.continuousWindowMs ?? defaults.continuousWindowMs,
      ),
    ),
    continuousStartSkillIds: normalizeWindowSkillIds(
      source.continuousStartSkillIds,
    ),
    continuousEndSkillIds: normalizeWindowSkillIds(
      source.continuousEndSkillIds,
    ),
    continuousTimeoutMs: Math.round(
      clampRange(source.continuousTimeoutMs, SKILL_DAMAGE_WINDOW_TIMEOUT_MS),
    ),
    continuousCastPreset: oneOf(
      source.continuousCastPreset,
      Object.keys(SKILL_DAMAGE_CAST_PRESETS) as SkillDamageCastPreset[],
      defaults.continuousCastPreset,
    ),
    continuousCastCloseDelayMs: Math.round(
      clampRange(
        source.continuousCastCloseDelayMs,
        SKILL_DAMAGE_CAST_CLOSE_DELAY_MS,
      ),
    ),
    continuousAllDamage: source.continuousAllDamage === true,
    continuousAnimation: oneOf(
      source.continuousAnimation,
      SKILL_DAMAGE_ANIMATIONS,
      defaults.continuousAnimation,
    ),
    continuousFinalAnimation: oneOf(
      source.continuousFinalAnimation,
      SKILL_DAMAGE_ANIMATIONS,
      defaults.continuousFinalAnimation,
    ),
    showComboCount: source.showComboCount === true,
    comboFormat: oneOf(
      source.comboFormat,
      ["hit", "multiplier"],
      defaults.comboFormat,
    ),
    comboPosition: oneOf(
      source.comboPosition,
      ["top", "bottom", "left", "right"],
      defaults.comboPosition,
    ),
    comboSpacing: clampNumber(
      source.comboSpacing,
      defaults.comboSpacing,
      0,
      SKILL_DAMAGE_LABEL_SPACING_MAX,
    ),
  };
}

function normalizeNumberStyle(
  input: unknown,
  defaults: SkillDamageNumberStyle,
): SkillDamageNumberStyle {
  const source = loose<SkillDamageNumberStyle>(input);
  const size = (key: keyof SkillDamageNumberStyle) =>
    clampNumber(
      source[key],
      defaults[key] as number,
      0,
      SKILL_DAMAGE_EFFECT_SIZE_MAX,
    );
  const flag = (key: keyof SkillDamageNumberStyle) =>
    typeof source[key] === "boolean"
      ? (source[key] as boolean)
      : (defaults[key] as boolean);
  return {
    italic: flag("italic"),
    fill: normalizePaint(source.fill, defaults.fill),
    innerGlow: flag("innerGlow"),
    innerGlowSize: size("innerGlowSize"),
    innerGlowColor: normalizePaint(
      source.innerGlowColor,
      defaults.innerGlowColor,
    ),
    outline: flag("outline"),
    outlineWidth: size("outlineWidth"),
    outlineColor: normalizePaint(source.outlineColor, defaults.outlineColor),
    outerGlow: flag("outerGlow"),
    outerGlowSize: size("outerGlowSize"),
    outerGlowColor: normalizePaint(
      source.outerGlowColor,
      defaults.outerGlowColor,
    ),
    shadow: flag("shadow"),
    shadowSize: size("shadowSize"),
    shadowColor: normalizePaint(source.shadowColor, defaults.shadowColor),
  };
}

export function normalizePaint(
  input: unknown,
  fallback: SkillDamagePaint,
): SkillDamagePaint {
  const source = loose<SkillDamagePaint>(input);
  const color = hexColor(source.color) ?? fallback.color;
  return {
    mode: oneOf(source.mode, ["solid", "gradient"], fallback.mode),
    color,
    endColor: hexColor(source.endColor) ?? color,
    angle: clampNumber(source.angle, fallback.angle, 0, 360),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stored data of unknown shape, typed by the fields it may carry. */
type Loose<T> = { [K in keyof T]?: unknown };

function loose<T>(value: unknown): Loose<T> {
  return (isRecord(value) ? value : {}) as Loose<T>;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function hexColor(value: unknown): string | undefined {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : undefined;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, finiteOr(value, fallback)));
}

function oneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function clampRange(
  value: unknown,
  range: { min: number; max: number; default: number },
): number {
  return clampNumber(value, range.default, range.min, range.max);
}

function normalizeWindowSkillIds(value: unknown): number[] {
  const ids = (Array.isArray(value) ? value : []).filter(
    (id): id is number =>
      typeof id === "number" && Number.isSafeInteger(id) && id > 0,
  );
  return [...new Set(ids)].slice(0, SKILL_DAMAGE_WINDOW_SKILLS_MAX);
}
