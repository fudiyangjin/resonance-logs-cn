import type {
  Point,
  ResourceSectionLayout,
  SkillMonitorProfile,
} from "$lib/settings-store";
import { t } from "$lib/i18n/index.svelte";
import { getFightResTemplate, RES_MAX_ID_OFFSET } from "$lib/resource-bar";
import { getResourceBarLayout } from "$lib/resource-bar-layouts";
import {
  findFlowerRotationResources,
  getResourceSectionKey,
  type FlowerRotationResourceDefinition,
} from "$lib/skill-mappings";

export const DEFAULT_RESOURCE_SECTION_POSITION: Point = { x: 40, y: 170 };
export const DEFAULT_RESOURCE_SECTION_SCALE = 1;
/** Vertical spacing between stacked sections when no layout is stored yet. */
export const RESOURCE_SECTION_STACK_OFFSET = 64;

/** Main-HUD profession counter; class independent, data driven. */
export const PROFESSION_COUNT_SECTION_KEY = "professionCount";

/**
 * What a section draws. The weapon bar's two halves and the shield knight's
 * side bar come from the class's fight resource template; the flower rotation
 * is hand configured in `class_resources.json`.
 */
export type ResourceSectionContent =
  | { type: "bar" }
  | { type: "dots" }
  | { type: "siderLine" }
  | { type: "flowerRotation"; definition: FlowerRotationResourceDefinition }
  | { type: "professionCount" };

export type ResourceSection = {
  key: string;
  label: string;
  content: ResourceSectionContent;
  layout: ResourceSectionLayout;
};

type SectionEntry = Omit<ResourceSection, "layout">;

function resourceKey(type: string, resourceId: number): string {
  return `${type}:${resourceId}:${resourceId + RES_MAX_ID_OFFSET}`;
}

/**
 * Sections of `classKey` in display order. Bar and dot keys keep the
 * `bar:<id>:<id+6>` / `charges:<id>:<id+6>` form of the earlier
 * hand-written config, so stored layouts carry over.
 */
function sectionEntries(classKey: string): SectionEntry[] {
  const template = getFightResTemplate(classKey);
  const layout = getResourceBarLayout(classKey);
  if (!template || !layout) return [];
  const result: SectionEntry[] = [];
  const main = template.resources.find(
    (resource) => resource.ui === "line" || resource.ui === "guitar",
  );
  result.push({
    key: main
      ? resourceKey("bar", main.id)
      : `bar:template:${template.templateId}`,
    label: t("gameOverlay.resource.section.bar"),
    content: { type: "bar" },
  });
  const dot = template.resources.find((resource) => resource.ui === "dot");
  if (dot) {
    result.push({
      key: resourceKey("charges", dot.id),
      label: t("gameOverlay.resource.section.dots"),
      content: { type: "dots" },
    });
  }
  const sider = template.resources.find(
    (resource) => resource.ui === "siderLine",
  );
  if (sider && layout.siderLine) {
    result.push({
      key: resourceKey("siderLine", sider.id),
      label: t("gameOverlay.resource.section.siderLine"),
      content: { type: "siderLine" },
    });
  }
  for (const definition of findFlowerRotationResources(classKey)) {
    result.push({
      key: getResourceSectionKey(definition),
      label: definition.label,
      content: { type: "flowerRotation", definition },
    });
  }
  result.push({
    key: PROFESSION_COUNT_SECTION_KEY,
    label: t("gameOverlay.resource.section.professionCount"),
    content: { type: "professionCount" },
  });
  return result;
}

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
 * One section per class resource part, in `sectionEntries` order. Stored
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

  return sectionEntries(classKey).map((entry, index) => {
    const override = stored[entry.key];
    return {
      ...entry,
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
    (section) => section.content.type === "flowerRotation",
  );
  return (
    flowerSections.length > 0 &&
    flowerSections.every((section) => section.layout.visible)
  );
}
