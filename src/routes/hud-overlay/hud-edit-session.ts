/**
 * @file The layout an edit session started from, so "undo changes" can put
 * every panel and the HUD window back while edit mode stays open.
 *
 * Drag, resize and the reset buttons write settings immediately; this module
 * only remembers what those writes may touch and puts it back by entity id.
 * Whole `overlaySizes` objects are restored because "reset size" also resets
 * the panel-attr gap/font/text style kept there, so a change made to those (or
 * to a buff group's icon size) from the settings page mid-session reverts too.
 */
import type { getCurrentWindow } from "@tauri-apps/api/window";
import {
  SETTINGS,
  deepCloneSettings,
  type BuffGroup,
  type CustomPanelGroup,
  type MinimapConfig,
  type MonsterMonitorProfileData,
  type OverlayPositions,
  type OverlaySizes,
  type ResourceSectionLayout,
  type SkillMonitorProfile,
} from "$lib/settings-store";
import {
  normalizeSkillCdRegions,
  type SkillCdRegion,
} from "$lib/skill-cd-layout";
import {
  ensureBuffGroups,
  ensureCustomPanelGroups,
  ensureIndividualMonitorAllGroup,
  ensureOverlayPositions,
  ensureOverlaySizes,
} from "../game-overlay/overlay-utils";

type HudWindow = ReturnType<typeof getCurrentWindow>;

export type SkillProfileLayout = {
  overlayPositions: OverlayPositions;
  overlaySizes: OverlaySizes;
  resourceSectionLayouts: Record<
    string,
    Partial<Pick<ResourceSectionLayout, "position" | "scale">>
  >;
  buffGroups: Record<string, Pick<BuffGroup, "position" | "iconSize">>;
  skillCdRegions: Record<string, Pick<SkillCdRegion, "position" | "scale">>;
  customPanelGroups: Record<
    string,
    Pick<CustomPanelGroup, "position" | "scale">
  >;
  individualMonitorAllGroup: Pick<BuffGroup, "position" | "iconSize"> | null;
};

export type MonsterLayout = Pick<
  MonsterMonitorProfileData,
  "overlayPositions" | "overlaySizes"
>;

export type MinimapLayout = Pick<MinimapConfig, "mapPanel" | "infoPanel">;

type WindowGeometry = {
  target: HudWindow;
  position: Awaited<ReturnType<HudWindow["outerPosition"]>>;
  size: Awaited<ReturnType<HudWindow["innerSize"]>>;
};

type HudEditSession = {
  // Every profile, not just the active one: a loadout switch (manual or by
  // spec) can change which profile is being edited mid-session.
  skillProfiles: Map<string, SkillProfileLayout>;
  monsterProfiles: Map<string, MonsterLayout>;
  minimap: MinimapLayout;
  window: WindowGeometry | null;
};

let session: HudEditSession | null = null;

export function pickSkillProfileLayout(
  profile: SkillMonitorProfile,
): SkillProfileLayout {
  const individual = ensureIndividualMonitorAllGroup(profile);
  return deepCloneSettings({
    overlayPositions: ensureOverlayPositions(profile),
    overlaySizes: ensureOverlaySizes(profile),
    resourceSectionLayouts: Object.fromEntries(
      Object.entries(profile.resourceSectionLayouts ?? {}).map(
        ([key, layout]) => [
          key,
          { position: layout.position, scale: layout.scale },
        ],
      ),
    ),
    buffGroups: Object.fromEntries(
      ensureBuffGroups(profile).map((group) => [
        group.id,
        { position: group.position, iconSize: group.iconSize },
      ]),
    ),
    skillCdRegions: Object.fromEntries(
      normalizeSkillCdRegions(profile).map((region) => [
        region.id,
        { position: region.position, scale: region.scale },
      ]),
    ),
    customPanelGroups: Object.fromEntries(
      ensureCustomPanelGroups(profile).map((group) => [
        group.id,
        { position: group.position, scale: group.scale },
      ]),
    ),
    individualMonitorAllGroup: individual
      ? { position: individual.position, iconSize: individual.iconSize }
      : null,
  });
}

/**
 * Puts `saved` back onto `profile`. Groups created during the session keep
 * their layout and deleted ones are skipped; everything that is not layout is
 * left alone. Returns `profile` itself when its layout already matches.
 */
export function restoreSkillProfileLayout(
  profile: SkillMonitorProfile,
  saved: SkillProfileLayout,
): SkillMonitorProfile {
  if (sameLayout(pickSkillProfileLayout(profile), saved)) return profile;
  const layout = deepCloneSettings(saved);
  const individual = ensureIndividualMonitorAllGroup(profile);
  return {
    ...profile,
    overlayPositions: layout.overlayPositions,
    overlaySizes: layout.overlaySizes,
    resourceSectionLayouts: restoreResourceSectionLayouts(
      profile.resourceSectionLayouts,
      layout.resourceSectionLayouts,
    ),
    buffGroups: ensureBuffGroups(profile).map((group) => ({
      ...group,
      ...layout.buffGroups[group.id],
    })),
    skillCdRegions: normalizeSkillCdRegions(profile).map((region) => ({
      ...region,
      ...layout.skillCdRegions[region.id],
    })),
    customPanelGroups: ensureCustomPanelGroups(profile).map((group) => ({
      ...group,
      ...layout.customPanelGroups[group.id],
    })),
    // Legacy inline entries now live in the groups above, as in
    // `updateCustomPanelGroups`.
    inlineBuffEntries: [],
    ...(individual && layout.individualMonitorAllGroup
      ? {
          individualMonitorAllGroup: {
            ...individual,
            ...layout.individualMonitorAllGroup,
          },
        }
      : {}),
  };
}

/** Position/scale come back from `saved` (or are dropped so defaults apply); `visible` stays as it is now. */
function restoreResourceSectionLayouts(
  current: Record<string, ResourceSectionLayout> | undefined,
  saved: SkillProfileLayout["resourceSectionLayouts"],
): Record<string, ResourceSectionLayout> {
  const result: Record<string, ResourceSectionLayout> = {};
  const keys = new Set([...Object.keys(current ?? {}), ...Object.keys(saved)]);
  for (const key of keys) {
    const next: Partial<ResourceSectionLayout> = { ...current?.[key] };
    delete next.position;
    delete next.scale;
    result[key] = { ...next, ...saved[key] } as ResourceSectionLayout;
  }
  return result;
}

export function pickMonsterLayout(data: MonsterLayout): MonsterLayout {
  return deepCloneSettings({
    overlayPositions: data.overlayPositions,
    overlaySizes: data.overlaySizes,
  });
}

export function pickMinimapLayout(config: MinimapLayout): MinimapLayout {
  return deepCloneSettings({
    mapPanel: config.mapPanel,
    infoPanel: config.infoPanel,
  });
}

/** A fresh copy of `saved` to write back, or null when `current` already matches it. */
export function layoutChange<T>(current: T, saved: T): T | null {
  return sameLayout(current, saved) ? null : deepCloneSettings(saved);
}

function sameLayout(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Call before click-through lifts, so no gesture can land ahead of the snapshot. */
export async function beginHudEditSession(
  currentWindow: HudWindow | null,
): Promise<void> {
  const monster = SETTINGS.monsterMonitor.state;
  const skillProfiles = new Map(
    SETTINGS.skillMonitor.state.profiles.map((profile) => [
      profile.id,
      pickSkillProfileLayout(profile),
    ]),
  );
  // The mirrored profile's slot is stale until the next switch flushes it,
  // so its layout is read from the mirror fields instead.
  const monsterProfiles = new Map([
    ...monster.profiles.map(
      (profile) => [profile.id, pickMonsterLayout(profile)] as const,
    ),
    [monster.mirroredProfileId, pickMonsterLayout(monster)] as const,
  ]);
  const minimap = pickMinimapLayout(SETTINGS.minimap.state);
  const geometry = currentWindow
    ? await readWindowGeometry(currentWindow)
    : null;
  session = { skillProfiles, monsterProfiles, minimap, window: geometry };
}

export function endHudEditSession(): void {
  session = null;
}

/** Restores the session's starting layout; the session stays open, so it can be undone back to the same point again. */
export async function revertHudEditSession(): Promise<void> {
  const current = session;
  if (!current) return;
  restoreSkillProfiles(current.skillProfiles);
  restoreMonsterProfiles(current.monsterProfiles);
  const minimap = layoutChange(
    pickMinimapLayout(SETTINGS.minimap.state),
    current.minimap,
  );
  if (minimap) Object.assign(SETTINGS.minimap.state, minimap);
  if (current.window) await restoreWindowGeometry(current.window);
}

function restoreSkillProfiles(saved: Map<string, SkillProfileLayout>): void {
  const state = SETTINGS.skillMonitor.state;
  let changed = false;
  const profiles = state.profiles.map((profile) => {
    const layout = saved.get(profile.id);
    const next = layout ? restoreSkillProfileLayout(profile, layout) : profile;
    if (next !== profile) changed = true;
    return next;
  });
  if (changed) state.profiles = profiles;
}

function restoreMonsterProfiles(saved: Map<string, MonsterLayout>): void {
  const state = SETTINGS.monsterMonitor.state;
  const mirrored = saved.get(state.mirroredProfileId);
  const mirrorChange = mirrored
    ? layoutChange(pickMonsterLayout(state), mirrored)
    : null;
  if (mirrorChange) Object.assign(state, mirrorChange);

  let changed = false;
  const profiles = state.profiles.map((profile) => {
    const layout = saved.get(profile.id);
    if (!layout || profile.id === state.mirroredProfileId) return profile;
    const change = layoutChange(pickMonsterLayout(profile), layout);
    if (!change) return profile;
    changed = true;
    return { ...profile, ...change };
  });
  if (changed) state.profiles = profiles;
}

async function readWindowGeometry(
  target: HudWindow,
): Promise<WindowGeometry | null> {
  try {
    const [position, size] = await Promise.all([
      target.outerPosition(),
      target.innerSize(),
    ]);
    return { target, position, size };
  } catch (error) {
    console.error("[hud-overlay] failed to read window geometry", error);
    return null;
  }
}

async function restoreWindowGeometry(geometry: WindowGeometry): Promise<void> {
  try {
    await Promise.all([
      geometry.target.setPosition(geometry.position),
      geometry.target.setSize(geometry.size),
    ]);
  } catch (error) {
    console.error("[hud-overlay] failed to restore window geometry", error);
  }
}
