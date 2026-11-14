import { describe, expect, it, vi } from "vitest";

// Pure configuration tests must never start the desktop persistence backend.
vi.mock("@tauri-store/svelte", () => ({
  RuneStore: class {
    state: unknown;
    constructor(_name: string, state: unknown) {
      this.state = state;
    }
  },
}));
import {
  createDefaultSkillMonitorProfile,
  type Loadout,
} from "./settings-store";
import { buildConfiguredBuffPlan } from "./buff-monitor-plan";
import {
  axeBallView,
  getFightResTemplate,
  resolveResourceBar,
} from "./resource-bar";
import {
  changeSkillProfileClass,
  matchesSkillProfileEdit,
  prepareSkillProfileEdit,
  skillProfileClassImpact,
  uniqueSkillProfileCopyName,
  type SkillProfileEditContext,
} from "./skill-profile-class";

function fixture() {
  const profile = createDefaultSkillMonitorProfile("healer", "verdant_oracle");
  profile.id = "healer";
  profile.enabled = true;
  profile.overlayVisibility.showResourceGroup = true;
  profile.monitoredSkillIds = [1501, 1502];
  profile.skillVoiceConfigs = {
    "1501": { ready: { enabled: true, phrase: { source: "auto" } } },
  };
  profile.skillCdRegions = [
    {
      id: "skills",
      name: "my grid",
      rows: 3,
      columns: 4,
      position: { x: 400, y: 500 },
      scale: 1.2,
      gap: 6,
      positions: { 1501: { row: 1, column: 2 }, 1502: { row: 2, column: 3 } },
    },
  ];
  profile.monitoredBuffIds = [2202716];
  profile.resourceSectionLayouts = {
    "bar:15001:15007": {
      position: { x: 100, y: 200 },
      scale: 1.1,
      visible: false,
    },
  };
  const loadout = (id: string): Loadout => ({
    id,
    name: id,
    skillProfileId: profile.id,
    monsterProfileId: "monster",
    liveProfileId: "live",
    damageProfileId: "damage",
    starterPlaceholder: false,
    linkedTalentStageCfgId: null,
  });
  const loadouts = [loadout("heavy"), loadout("healer")];
  const context: SkillProfileEditContext = {
    loadoutId: "heavy",
    profileId: profile.id,
    classKey: profile.selectedClass,
  };
  return { profile, profiles: [profile], loadouts, context };
}

describe("profile class changes", () => {
  it("counts the actual shared profile and both kinds of settings at risk", () => {
    const { profile, loadouts } = fixture();
    expect(skillProfileClassImpact(profile, loadouts)).toEqual({
      skillCount: 2,
      voiceCount: 1,
      consumers: loadouts,
    });
    profile.monitoredSkillIds = [];
    expect(skillProfileClassImpact(profile, loadouts).voiceCount).toBe(1);
  });

  it("keeps the original object when choosing the same class", () => {
    const { profile, profiles, loadouts, context } = fixture();
    expect(changeSkillProfileClass(profile, profile.selectedClass)).toBe(
      profile,
    );
    expect(
      prepareSkillProfileEdit(
        profiles,
        loadouts,
        "heavy",
        context,
        context.classKey,
      ),
    ).toBeNull();
  });

  it("clears skills and voices while preserving grid geometry and unrelated settings", () => {
    const { profile } = fixture();
    const next = changeSkillProfileClass(profile, "flame_berserker");
    expect(next.monitoredSkillIds).toEqual([]);
    expect(next.skillVoiceConfigs).toEqual({});
    expect(next.skillCdRegions).toEqual([
      { ...profile.skillCdRegions![0], positions: {} },
    ]);
    expect(next.monitoredBuffIds).toEqual(profile.monitoredBuffIds);
    expect(next.resourceSectionLayouts).toEqual(profile.resourceSectionLayouts);
    expect(next.customPanelGroups).toEqual(profile.customPanelGroups);
    expect(profile.monitoredSkillIds).toEqual([1501, 1502]);
    expect(profile.selectedClass).toBe("verdant_oracle");
  });

  it("preparing or abandoning an edit does not mutate either source collection", () => {
    const { profile, profiles, loadouts, context } = fixture();
    const before = JSON.stringify({ profiles, loadouts });
    skillProfileClassImpact(profile, loadouts);
    prepareSkillProfileEdit(
      profiles,
      loadouts,
      "heavy",
      context,
      "flame_berserker",
    );
    expect(JSON.stringify({ profiles, loadouts })).toBe(before);
  });

  it("rejects confirmation after switching loadout, profile, or original class", () => {
    const { profile, profiles, loadouts, context } = fixture();
    expect(
      prepareSkillProfileEdit(
        profiles,
        loadouts,
        "healer",
        context,
        "flame_berserker",
      ),
    ).toBeNull();
    const other = { ...profile, id: "other" };
    expect(
      prepareSkillProfileEdit(
        [...profiles, other],
        [{ ...loadouts[0]!, skillProfileId: "other" }],
        "heavy",
        context,
        "flame_berserker",
      ),
    ).toBeNull();
    expect(
      matchesSkillProfileEdit(context, loadouts[0], {
        ...profile,
        selectedClass: "stormblade",
      }),
    ).toBe(false);
    expect(
      prepareSkillProfileEdit(
        [{ ...profile, selectedClass: "stormblade" }],
        loadouts,
        "heavy",
        context,
        "flame_berserker",
      ),
    ).toBeNull();
  });

  it("copies the shared healer configuration only for the current loadout", () => {
    const { profile, profiles, loadouts, context } = fixture();
    const next = prepareSkillProfileEdit(
      profiles,
      loadouts,
      "heavy",
      context,
      "flame_berserker",
      {
        id: "copy",
        name: "healer (copy)",
      },
    )!;
    expect(next.loadouts.map((item) => item.skillProfileId)).toEqual([
      "copy",
      "healer",
    ]);
    expect(next.profiles[0]).toBe(profile);
    const copy = next.profiles[1]!;
    expect(copy.selectedClass).toBe("flame_berserker");
    expect(copy.monitoredSkillIds).toEqual([]);
    copy.monitoredBuffIds.push(999);
    copy.resourceSectionLayouts!["bar:15001:15007"]!.position.x = 999;
    expect(profile.monitoredBuffIds).toEqual([2202716]);
    expect(profile.resourceSectionLayouts!["bar:15001:15007"]!.position.x).toBe(
      100,
    );
    expect(loadouts[0]!.skillProfileId).toBe("healer");
  });

  it("plain copy preserves skill and voice configuration; copy names are unique", () => {
    const { profile, profiles, loadouts, context } = fixture();
    const next = prepareSkillProfileEdit(
      profiles,
      loadouts,
      "heavy",
      context,
      context.classKey,
      {
        id: "copy",
        name: "healer (copy)",
      },
    )!;
    expect(next.profiles[1]!.skillVoiceConfigs).toEqual(
      profile.skillVoiceConfigs,
    );
    expect(next.profiles[1]!.monitoredSkillIds).toEqual(
      profile.monitoredSkillIds,
    );
    expect(
      uniqueSkillProfileCopyName("healer (copy)", [
        ...next.profiles,
        { ...profile, name: "healer (copy) (2)" },
      ]),
    ).toBe("healer (copy) (3)");
  });

  it("explicitly changing a shared profile preserves all loadout links", () => {
    const { profiles, loadouts, context } = fixture();
    const next = prepareSkillProfileEdit(
      profiles,
      loadouts,
      "heavy",
      context,
      "flame_berserker",
    )!;
    expect(next.loadouts).toEqual(loadouts);
    expect(next.profiles).toHaveLength(1);
    expect(next.profiles[0]!.selectedClass).toBe("flame_berserker");
  });

  it("publishes flame unlock buffs and resolves the supplied post-entry capture", () => {
    const { profile } = fixture();
    const next = changeSkillProfileClass(profile, "flame_berserker");
    const plan = buildConfiguredBuffPlan(next);
    expect(plan.publishedIds).toEqual(
      expect.arrayContaining([2208030, 2208430]),
    );
    // 1794632460173/aoi_attrs.log:5244, after the layout snapshot at line 5029.
    const values = new Map([
      [13011, 5924],
      [13017, 15000],
      [13001, 5],
      [13007, 5],
      [13021, 620656],
      [13027, 984218],
    ]);
    const buffs = new Map(
      [2208030, 2208430].map((baseId) => [
        baseId,
        {
          baseId,
          layer: 1,
          createTimeMs: 0,
          durationMs: -1,
          sourceRemodelLevel: null,
        },
      ]),
    );
    const template = getFightResTemplate(next.selectedClass)!;
    const bar = resolveResourceBar(template, values, buffs);
    expect(
      bar.resources.map(({ now, max, open, received }) => ({
        now,
        max,
        open,
        received,
      })),
    ).toEqual([
      { now: 59, max: 150, open: true, received: true },
      { now: 5, max: 5, open: true, received: true },
      { now: 620656, max: 984218, open: true, received: true },
    ]);
    expect(
      axeBallView(bar.resources[2]!.now, bar.resources[2]!.max).percent,
    ).toBe(63);
    expect(
      resolveResourceBar(template, new Map(), buffs).resources.every(
        (resource) => !resource.received,
      ),
    ).toBe(true);
  });
});
