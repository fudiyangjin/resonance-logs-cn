import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SETTINGS,
  createDefaultMonitoringSettingsState,
  createDefaultSkillMonitorProfile,
  type SkillMonitorProfile,
} from "./settings-store";
import {
  DEFAULT_SKILL_CD_GAP,
  DEFAULT_SKILL_CD_REGION_ID,
  MAX_SKILL_CD_REGIONS,
  SKILL_CD_GAP_MAX,
  changeSkillCdSelection,
  createDefaultSkillCdRegion,
  setSkillCdRegionLayout,
  type SkillCdAction,
  type SkillCdGridAction,
  type SkillCdRegion,
} from "./skill-cd-layout";
import { normalizeSkillProfile } from "./skill-monitor-normalize";
import { isDefaultSkillMonitorProfile } from "./starter-loadout";
import { parseLoadoutExport } from "./loadout-import";
import {
  duplicateLoadout,
  exportLoadout,
  importLoadout,
  switchLoadout,
} from "./loadouts.svelte.js";
import {
  activeProfile,
  updateActiveProfile,
} from "./skill-monitor-profile.svelte.js";
import { buildMonitorRuntimeSnapshot } from "./runtime-monitor-sync";
import { reconcileMonitoringState } from "./settings-migrations";

const R1 = DEFAULT_SKILL_CD_REGION_ID;

// Vitest runs Svelte modules in SSR mode, where module-level $derived values
// are evaluated once. Supply the live profile at this boundary while keeping
// the production profile writer, persistence and runtime snapshot builders.
vi.mock("./skill-monitor-profile.svelte.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./skill-monitor-profile.svelte.js")>();
  return {
    ...actual,
    activeProfile: () => {
      const loadout = SETTINGS.loadouts.state.items.find(
        (item) => item.id === SETTINGS.loadouts.state.activeId,
      );
      return (
        SETTINGS.skillMonitor.state.profiles.find(
          (profile) => profile.id === loadout?.skillProfileId,
        ) ?? null
      );
    },
  };
});

function setup() {
  const state = createDefaultMonitoringSettingsState();
  const skill = state.skillMonitor.profiles[0]!;
  skill.enabled = true;
  skill.monitoredSkillIds = [1420, 1421];
  skill.skillCdRegions = [
    {
      ...createDefaultSkillCdRegion(),
      rows: 3,
      columns: 4,
      positions: {
        1420: { row: 2, column: 3 },
        1421: { row: 0, column: 1 },
      },
    },
  ];
  state.loadouts = {
    ...state.loadouts,
    activeId: "layout-test",
    firstRunPromptDismissed: true,
    items: [
      {
        id: "layout-test",
        name: "Layout test",
        skillProfileId: skill.id,
        monsterProfileId: state.monsterMonitor.profiles[0]!.id,
        liveProfileId: state.liveMeter.profiles[0]!.id,
        starterPlaceholder: false,
        linkedTalentStageCfgId: null,
      },
    ],
  };
  Object.assign(SETTINGS.monitoring.state, state);
}

function edit(action: SkillCdAction) {
  updateActiveProfile((profile) => {
    const result = changeSkillCdSelection(profile, action);
    if (!result.ok) throw new Error(result.reason);
    return {
      ...profile,
      monitoredSkillIds: result.monitoredSkillIds,
      skillCdRegions: result.skillCdRegions,
    };
  });
}

/** A grid edit of region 1, as the settings tab sends it. */
function editGrid(action: SkillCdGridAction, regionId = R1) {
  edit({ ...action, regionId });
}

function regions() {
  return activeProfile()!.skillCdRegions!;
}

/** Region 1 keeps 1420; region "fantasy" (moved, scaled, gapless) holds 1421. */
function splitIntoTwoRegions() {
  edit({ kind: "addRegion", id: "fantasy" });
  edit({ kind: "renameRegion", regionId: "fantasy", name: "幻想" });
  editGrid({ kind: "toggle", skillId: 1421 }, "fantasy");
  editGrid({ kind: "gap", gap: 0 }, "fantasy");
  updateActiveProfile((profile) => ({
    ...profile,
    skillCdRegions: setSkillCdRegionLayout(profile, "fantasy", {
      position: { x: 320, y: 180 },
      scale: 1.3,
    }),
  }));
}

describe("skill CD profile integration", () => {
  beforeEach(setup);

  it("persists mixed duty skills and subscribes them through the existing runtime", () => {
    editGrid({ kind: "toggle", skillId: 3612 });
    editGrid({ kind: "toggle", skillId: 3028 });
    expect(buildMonitorRuntimeSnapshot().skill.monitoredSkillIds).toEqual([
      1420, 1421, 3028, 3612,
    ]);
    const parsed = parseLoadoutExport(
      JSON.parse(JSON.stringify(exportLoadout("layout-test"))),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.issues.join("\n"));
    switchLoadout(importLoadout(parsed.output));
    expect(activeProfile()!.monitoredSkillIds).toEqual([
      1420, 1421, 3612, 3028,
    ]);
    expect(regions()[0]!.positions[3612]).toEqual({ row: 0, column: 0 });
    // The SSR test environment does not recompute loadouts' module-level
    // $derived value used by the production writer; edit the original here.
    switchLoadout("layout-test");
    editGrid({ kind: "remove", skillId: 3612 });
    expect(buildMonitorRuntimeSnapshot().skill.monitoredSkillIds).toEqual([
      1420, 1421, 3028,
    ]);
    expect(regions()[0]!.positions[3612]).toBeUndefined();
  });

  it("keeps every region through save, load, export and import", () => {
    splitIntoTwoRegions();
    const expected = regions();
    expect(expected.map((region) => region.id)).toEqual([R1, "fantasy"]);
    expect(expected[1]).toMatchObject({
      name: "幻想",
      position: { x: 320, y: 180 },
      scale: 1.3,
      gap: 0,
      positions: { 1421: { row: 0, column: 0 } },
    });
    const reloaded = reconcileMonitoringState(
      JSON.parse(JSON.stringify(SETTINGS.monitoring.state)),
    );
    expect(reloaded.skillMonitor.profiles[0]!.skillCdRegions).toEqual(expected);
    const exported = exportLoadout("layout-test")!;
    const parsed = parseLoadoutExport(JSON.parse(JSON.stringify(exported)));
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.issues.join("\n"));
    expect(parsed.output.skillProfile.skillCdRegions).toEqual(expected);
    expect(parsed.output.skillProfile).not.toHaveProperty("skillCdLayout");
    const id = importLoadout(parsed.output);
    switchLoadout(id);
    expect(regions()).toEqual(expected);
    expect(activeProfile()!.monitoredSkillIds).toEqual([1420, 1421]);
    switchLoadout("layout-test");
    expect(regions()).toEqual(expected);
  });

  it("converts and drops a legacy layout identically across repeated reconciles", () => {
    const profile = SETTINGS.monitoring.state.skillMonitor.profiles[0]!;
    delete profile.skillCdRegions;
    profile.skillCdLayout = {
      rows: 3,
      columns: 4,
      positions: { 1420: { row: 2, column: 3 } },
    };
    const once = reconcileMonitoringState(
      JSON.parse(JSON.stringify(SETTINGS.monitoring.state)),
    );
    const twice = reconcileMonitoringState(JSON.parse(JSON.stringify(once)));
    const [converted] = once.skillMonitor.profiles;
    expect(converted).not.toHaveProperty("skillCdLayout");
    expect(converted!.skillCdRegions).toEqual([
      {
        ...createDefaultSkillCdRegion(),
        rows: 3,
        columns: 4,
        positions: {
          1420: { row: 2, column: 3 },
          1421: { row: 0, column: 0 },
        },
      },
    ]);
    expect(twice.skillMonitor.profiles).toEqual(once.skillMonitor.profiles);
  });

  it("copies regions without sharing nested coordinates", () => {
    const source = activeProfile()!;
    const id = duplicateLoadout("layout-test")!;
    switchLoadout(id);
    expect(regions()).toEqual(source.skillCdRegions);
    const copy = activeProfile()!;
    const compacted = changeSkillCdSelection(copy, {
      kind: "compact",
      regionId: R1,
    });
    if (!compacted.ok) throw new Error(compacted.reason);
    copy.skillCdRegions = compacted.skillCdRegions;
    expect(regions()).not.toEqual(source.skillCdRegions);
    switchLoadout("layout-test");
    expect(regions()[0]!.positions[1420]).toEqual({ row: 2, column: 3 });
  });

  it("backfills legacy layouts while preserving the group position and scale", () => {
    const profile = createDefaultSkillMonitorProfile();
    delete profile.skillCdRegions;
    profile.monitoredSkillIds = [1421, 1420];
    profile.overlayPositions.skillCdGroup = { x: 123, y: 234 };
    profile.overlaySizes.skillCdGroupScale = 1.7;
    const normalized = normalizeSkillProfile(profile);
    expect(normalized.skillCdRegions).toEqual([
      {
        ...createDefaultSkillCdRegion(),
        positions: {
          1421: { row: 0, column: 0 },
          1420: { row: 0, column: 1 },
        },
        position: { x: 123, y: 234 },
        scale: 1.7,
      },
    ]);
    expect(normalizeSkillProfile(normalized)).toEqual(normalized);

    const exported = exportLoadout("layout-test")!;
    delete exported.skillProfile.skillCdRegions;
    exported.skillProfile.skillCdLayout = {
      rows: 3,
      columns: 4,
      positions: { 1420: { row: 1, column: 1 } },
    };
    const parsed = parseLoadoutExport(exported);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.issues.join("\n"));
    expect(parsed.output.skillProfile).not.toHaveProperty("skillCdLayout");
    expect(parsed.output.skillProfile.skillCdRegions![0]!.positions).toEqual({
      1420: { row: 1, column: 1 },
      1421: { row: 0, column: 0 },
    });
  });

  it("keeps fresh and legacy untouched profiles recognizable", () => {
    const profile = createDefaultSkillMonitorProfile();
    expect(isDefaultSkillMonitorProfile(normalizeSkillProfile(profile))).toBe(
      true,
    );
    delete profile.skillCdRegions;
    expect(isDefaultSkillMonitorProfile(profile)).toBe(true);
    profile.skillCdLayout = { rows: 2, columns: 5, positions: {} };
    expect(isDefaultSkillMonitorProfile(normalizeSkillProfile(profile))).toBe(
      true,
    );
  });

  it("does not treat a moved region as an untouched starter", () => {
    const profile = createDefaultSkillMonitorProfile();
    profile.skillCdRegions = setSkillCdRegionLayout(profile, R1, {
      position: { x: 999, y: 40 },
    });
    expect(isDefaultSkillMonitorProfile(normalizeSkillProfile(profile))).toBe(
      false,
    );
  });

  it("keeps backend snapshots identical for layout-only and cross-region edits", () => {
    const before = buildMonitorRuntimeSnapshot();
    expect(before.skill.monitoredSkillIds).toEqual([1420, 1421]);
    editGrid({
      kind: "move",
      skillId: 1420,
      from: { row: 2, column: 3 },
      to: { row: 1, column: 2 },
      targetSkillId: null,
      rows: 3,
      columns: 4,
    });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
    editGrid({
      kind: "move",
      skillId: 1420,
      from: { row: 1, column: 2 },
      to: { row: 0, column: 1 },
      targetSkillId: 1421,
      rows: 3,
      columns: 4,
    });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
    editGrid({ kind: "resize", rows: 2, columns: 3 });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
    editGrid({ kind: "compact" });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
    splitIntoTwoRegions();
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
    editGrid({ kind: "toggle", skillId: 1421 });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
    edit({ kind: "removeRegion", regionId: "fantasy" });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
  });

  it("removes HUD membership without dropping independent skill voice bindings", () => {
    const voice: SkillMonitorProfile["skillVoiceConfigs"] = {
      "1420": {
        ready: { enabled: true, phrase: { source: "auto" } },
      },
      "1421": {
        cast: { enabled: true, phrase: { source: "auto" } },
      },
    };
    updateActiveProfile((profile) => ({
      ...profile,
      skillVoiceConfigs: voice,
    }));
    editGrid({ kind: "remove", skillId: 1420 });
    expect(regions()[0]!.positions[1420]).toBeUndefined();
    splitIntoTwoRegions();
    edit({ kind: "removeRegion", regionId: "fantasy" });
    expect(activeProfile()!.skillVoiceConfigs).toEqual(voice);
    expect(regions().map((region) => region.id)).toEqual([R1]);
    expect(buildMonitorRuntimeSnapshot().skill.monitoredSkillIds).toEqual([]);
  });

  it.each([
    { rows: 0 },
    { rows: 11 },
    { columns: 2.5 },
    { positions: { 1420: { row: -1, column: 0 } } },
    { positions: { 1420: { row: 0, column: 10 } } },
    { positions: { 1420: { row: 0 } } },
    { positions: { invalid: { row: 0, column: 0 } } },
    { id: " " },
    { scale: Number.NaN },
    { gap: "4" },
    { position: { x: 0 } },
  ])("rejects malformed imported regions: %j", (invalid) => {
    const data = exportLoadout("layout-test")!;
    Object.assign(data.skillProfile.skillCdRegions![0]!, invalid);
    const parsed = parseLoadoutExport(data);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.issues.join("\n")).toContain("skillCdRegions");
  });

  it.each([
    [undefined, DEFAULT_SKILL_CD_GAP],
    [99, SKILL_CD_GAP_MAX],
  ])("normalizes an imported icon gap of %s to %i", (gap, expected) => {
    const data = exportLoadout("layout-test")!;
    const region: Partial<SkillCdRegion> =
      data.skillProfile.skillCdRegions![0]!;
    if (gap === undefined) delete region.gap;
    else region.gap = gap;
    const parsed = parseLoadoutExport(data);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.issues.join("\n"));
    expect(parsed.output.skillProfile.skillCdRegions![0]!.gap).toBe(expected);
  });

  it.each([
    ["no regions", 0],
    ["too many regions", MAX_SKILL_CD_REGIONS + 1],
  ])("rejects imported region lists with %s", (_label, count) => {
    const data = exportLoadout("layout-test")!;
    data.skillProfile.skillCdRegions = Array.from({ length: count }, (_, i) =>
      createDefaultSkillCdRegion(`r${i}`),
    );
    expect(parseLoadoutExport(data).success).toBe(false);
  });
});
