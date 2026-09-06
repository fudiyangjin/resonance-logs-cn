import { describe, expect, it } from "vitest";
import {
  RESOURCE_SECTION_STACK_OFFSET,
  ensureResourceSections,
  isFlowerSectionVisible,
  resetResourceSectionLayouts,
  updateResourceSectionLayout,
} from "./resource-sections";
import type { SkillMonitorProfile } from "./settings-store";

function profile(
  overrides: Partial<SkillMonitorProfile> = {},
): SkillMonitorProfile {
  return {
    selectedClass: "verdant_oracle",
    overlayPositions: { resourceGroup: { x: 100, y: 200 } },
    overlaySizes: { resourceGroupScale: 1.2 },
    overlayVisibility: { showResourceGroup: true },
    ...overrides,
  } as unknown as SkillMonitorProfile;
}

describe("ensureResourceSections", () => {
  it("derives one section per class resource in config order", () => {
    const sections = ensureResourceSections(profile());
    expect(sections.map((section) => section.definition.type)).toEqual([
      "bar",
      "charges",
      "flowerRotation",
    ]);
    expect(sections.at(-1)?.key).toBe("flowerRotation:2202716");
  });

  it("stacks defaults below the legacy resource group position", () => {
    const sections = ensureResourceSections(profile());
    expect(sections[0]?.layout).toEqual({
      position: { x: 100, y: 200 },
      scale: 1.2,
      visible: true,
    });
    expect(sections[2]?.layout.position).toEqual({
      x: 100,
      y: 200 + 2 * RESOURCE_SECTION_STACK_OFFSET,
    });
  });

  it("prefers stored layouts and ignores unknown keys", () => {
    const sections = ensureResourceSections(
      profile({
        resourceSectionLayouts: {
          "flowerRotation:2202716": {
            position: { x: 5, y: 6 },
            scale: 9,
            visible: false,
          },
          "bar:1:2": { position: { x: 1, y: 1 }, scale: 1, visible: true },
        },
      }),
    );
    expect(sections).toHaveLength(3);
    expect(sections[2]?.layout).toEqual({
      position: { x: 5, y: 6 },
      scale: 2.5,
      visible: false,
    });
  });

  it("follows the class count", () => {
    expect(
      ensureResourceSections(profile({ selectedClass: "wind_knight" })),
    ).toHaveLength(2);
    expect(ensureResourceSections(profile({ selectedClass: "nope" }))).toEqual(
      [],
    );
  });
});

describe("updateResourceSectionLayout", () => {
  it("materialises the current layout before patching", () => {
    const next = updateResourceSectionLayout(
      profile(),
      "flowerRotation:2202716",
      { visible: false },
    );
    expect(next.resourceSectionLayouts?.["flowerRotation:2202716"]).toEqual({
      position: { x: 100, y: 200 + 2 * RESOURCE_SECTION_STACK_OFFSET },
      scale: 1.2,
      visible: false,
    });
  });

  it("ignores keys that do not belong to the class", () => {
    const base = profile();
    expect(updateResourceSectionLayout(base, "bar:1:2", { scale: 2 })).toBe(
      base,
    );
  });
});

describe("resetResourceSectionLayouts", () => {
  it("drops only the requested fields", () => {
    const result = resetResourceSectionLayouts(
      { a: { position: { x: 1, y: 2 }, scale: 2, visible: false } },
      ["position"],
    );
    expect(result).toEqual({ a: { scale: 2, visible: false } });
  });
});

describe("isFlowerSectionVisible", () => {
  it("requires the master toggle and the section toggle", () => {
    expect(isFlowerSectionVisible(profile())).toBe(true);
    expect(
      isFlowerSectionVisible(
        profile({ overlayVisibility: { showResourceGroup: false } } as never),
      ),
    ).toBe(false);
    expect(
      isFlowerSectionVisible(
        profile({
          resourceSectionLayouts: {
            "flowerRotation:2202716": {
              position: { x: 0, y: 0 },
              scale: 1,
              visible: false,
            },
          },
        }),
      ),
    ).toBe(false);
    expect(
      isFlowerSectionVisible(profile({ selectedClass: "wind_knight" })),
    ).toBe(false);
  });
});
