import type {
  Point,
  ResourceSectionLayout,
  SkillMonitorProfile,
} from "$lib/settings-store";
import {
  findResourcesByClass,
  getResourceSectionKey,
  type ResourceDefinition,
} from "$lib/skill-mappings";

export const DEFAULT_RESOURCE_SECTION_POSITION: Point = { x: 40, y: 170 };
export const DEFAULT_RESOURCE_SECTION_SCALE = 1;
/** Vertical spacing between stacked sections when no layout is stored yet. */
export const RESOURCE_SECTION_STACK_OFFSET = 64;

export type ResourceSection = {
  key: string;
  definition: ResourceDefinition;
  layout: ResourceSectionLayout;
};

type ProfileLayoutSource = Pick<
  SkillMonitorProfile,
  "selectedClass" | "resourceSectionLayouts"
> & {
  overlayPositions?: Partial<
    Pick<SkillMonitorProfile["overlayPositions"], "resourceGroup">
  >;
  overlaySizes?: Partial<
    Pick<SkillMonitorProfile["overlaySizes"], "resourceGroupScale">
  >;
};

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RESOURCE_SECTION_SCALE;
  return Math.max(0.5, Math.min(2.5, value));
}

function isPoint(value: unknown): value is Point {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isFinite((value as Point).x) &&
    Number.isFinite((value as Point).y)
  );
}

/**
 * One section per class resource entry, in class-config order. Stored
 * layouts override the legacy single-panel position/scale defaults; the
 * defaults stack sections vertically so an un-customised profile still reads
 * like the old combined panel.
 */
export function ensureResourceSections(
  profile: ProfileLayoutSource | null | undefined,
  classKey = profile?.selectedClass ?? "",
): ResourceSection[] {
  const basePosition =
    profile?.overlayPositions?.resourceGroup ??
    DEFAULT_RESOURCE_SECTION_POSITION;
  const baseScale = clampScale(
    profile?.overlaySizes?.resourceGroupScale ?? DEFAULT_RESOURCE_SECTION_SCALE,
  );
  const stored = profile?.resourceSectionLayouts ?? {};
  const definitions = findResourcesByClass(classKey);

  return definitions.map((definition, index) => {
    const key = getResourceSectionKey(definition);
    const override = stored[key];
    return {
      key,
      definition,
      layout: {
        position: isPoint(override?.position)
          ? override.position
          : {
              x: basePosition.x,
              y: basePosition.y + index * RESOURCE_SECTION_STACK_OFFSET,
            },
        scale:
          override?.scale !== undefined
            ? clampScale(override.scale)
            : baseScale,
        visible: override?.visible ?? true,
      },
    };
  });
}

export function updateResourceSectionLayout(
  profile: SkillMonitorProfile,
  key: string,
  patch: Partial<ResourceSectionLayout>,
): SkillMonitorProfile {
  const sections = ensureResourceSections(profile);
  const current =
    sections.find((section) => section.key === key)?.layout ??
    profile.resourceSectionLayouts?.[key];
  if (!current) return profile;
  return {
    ...profile,
    resourceSectionLayouts: {
      ...(profile.resourceSectionLayouts ?? {}),
      [key]: { ...current, ...patch },
    },
  };
}

/** Drops stored position/scale (keeps `visible`) so defaults apply again. */
export function resetResourceSectionLayouts(
  layouts: Record<string, ResourceSectionLayout> | undefined,
  fields: ("position" | "scale")[],
): Record<string, ResourceSectionLayout> {
  if (!layouts) return {};
  const result: Record<string, ResourceSectionLayout> = {};
  for (const [key, layout] of Object.entries(layouts)) {
    const next: Partial<ResourceSectionLayout> = { ...layout };
    for (const field of fields) delete next[field];
    result[key] = next as ResourceSectionLayout;
  }
  return result;
}

/**
 * True when the flower rotation section is actually rendered: master resource
 * toggle on and the section itself not hidden. Drives buff mutual exclusion.
 */
export function isFlowerSectionVisible(
  profile: ProfileLayoutSource & {
    overlayVisibility?: { showResourceGroup?: boolean };
  },
): boolean {
  if (profile.overlayVisibility?.showResourceGroup !== true) return false;
  const flowerSections = ensureResourceSections(profile).filter(
    (section) => section.definition.type === "flowerRotation",
  );
  return (
    flowerSections.length > 0 &&
    flowerSections.every((section) => section.layout.visible)
  );
}
