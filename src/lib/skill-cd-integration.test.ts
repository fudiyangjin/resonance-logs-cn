import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SETTINGS,
  createDefaultMonitoringSettingsState,
  createDefaultSkillMonitorProfile,
  type SkillMonitorProfile,
} from "./settings-store";
import { changeSkillCdSelection, type SkillCdAction } from "./skill-cd-layout";
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
  skill.skillCdLayout = {
    rows: 3,
    columns: 4,
    positions: {
      1420: { row: 2, column: 3 },
      1421: { row: 0, column: 1 },
    },
  };
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
      skillCdLayout: result.skillCdLayout,
    };
  });
}

describe("skill CD profile integration", () => {
  beforeEach(setup);

  it("persists mixed duty skills and subscribes them through the existing runtime", () => {
    edit({ kind: "toggle", skillId: 3612 });
    edit({ kind: "toggle", skillId: 3028 });
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
    expect(activeProfile()!.skillCdLayout!.positions[3612]).toEqual({
      row: 0,
      column: 0,
    });
    // The SSR test environment does not recompute loadouts' module-level
    // $derived value used by the production writer; edit the original here.
    switchLoadout("layout-test");
    edit({ kind: "remove", skillId: 3612 });
    expect(buildMonitorRuntimeSnapshot().skill.monitoredSkillIds).toEqual([
      1420, 1421, 3028,
    ]);
    expect(activeProfile()!.skillCdLayout!.positions[3612]).toBeUndefined();
  });

  it("keeps valid layout coordinates through save, load, export and import", () => {
    const expected = activeProfile()!.skillCdLayout;
    const reloaded = reconcileMonitoringState(
      JSON.parse(JSON.stringify(SETTINGS.monitoring.state)),
    );
    expect(reloaded.skillMonitor.profiles[0]!.skillCdLayout).toEqual(expected);
    const exported = exportLoadout("layout-test")!;
    const parsed = parseLoadoutExport(JSON.parse(JSON.stringify(exported)));
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.issues.join("\n"));
    expect(parsed.output.skillProfile.skillCdLayout).toEqual(expected);
    const id = importLoadout(parsed.output);
    switchLoadout(id);
    expect(activeProfile()!.skillCdLayout).toEqual(expected);
    expect(activeProfile()!.monitoredSkillIds).toEqual([1420, 1421]);
    switchLoadout("layout-test");
    expect(activeProfile()!.skillCdLayout).toEqual(expected);
  });

  it("copies layout without sharing nested coordinates", () => {
    const source = activeProfile()!;
    const id = duplicateLoadout("layout-test")!;
    switchLoadout(id);
    expect(activeProfile()!.skillCdLayout).toEqual(source.skillCdLayout);
    const copy = activeProfile()!;
    const compacted = changeSkillCdSelection(copy, { kind: "compact" });
    if (!compacted.ok) throw new Error(compacted.reason);
    copy.skillCdLayout = compacted.skillCdLayout;
    expect(activeProfile()!.skillCdLayout).not.toEqual(source.skillCdLayout);
    switchLoadout("layout-test");
    expect(activeProfile()!.skillCdLayout!.positions[1420]).toEqual({
      row: 2,
      column: 3,
    });
  });

  it("backfills legacy layouts while preserving the group position and scale", () => {
    const profile = createDefaultSkillMonitorProfile();
    delete profile.skillCdLayout;
    profile.monitoredSkillIds = [1421, 1420];
    profile.overlayPositions.skillCdGroup = { x: 123, y: 234 };
    profile.overlaySizes.skillCdGroupScale = 1.7;
    const normalized = normalizeSkillProfile(profile);
    expect(normalized.skillCdLayout).toEqual({
      rows: 2,
      columns: 5,
      positions: {
        1421: { row: 0, column: 0 },
        1420: { row: 0, column: 1 },
      },
    });
    expect(normalized.overlayPositions.skillCdGroup).toEqual({
      x: 123,
      y: 234,
    });
    expect(normalized.overlaySizes.skillCdGroupScale).toBe(1.7);
    expect(normalizeSkillProfile(normalized)).toEqual(normalized);
    const exported = exportLoadout("layout-test")!;
    delete exported.skillProfile.skillCdLayout;
    const parsed = parseLoadoutExport(exported);
    expect(
      parsed.success &&
        parsed.output.skillProfile.skillCdLayout!.positions[1420],
    ).toEqual({ row: 0, column: 0 });
  });

  it("keeps fresh and legacy untouched profiles recognizable", () => {
    const profile = createDefaultSkillMonitorProfile();
    expect(isDefaultSkillMonitorProfile(normalizeSkillProfile(profile))).toBe(
      true,
    );
    delete profile.skillCdLayout;
    expect(isDefaultSkillMonitorProfile(profile)).toBe(true);
    expect(isDefaultSkillMonitorProfile(normalizeSkillProfile(profile))).toBe(
      true,
    );
  });

  it("keeps backend snapshots identical when moving, swapping, resizing or compacting", () => {
    const before = buildMonitorRuntimeSnapshot();
    expect(before.skill.monitoredSkillIds).toEqual([1420, 1421]);
    edit({
      kind: "move",
      skillId: 1420,
      from: { row: 2, column: 3 },
      to: { row: 1, column: 2 },
      targetSkillId: null,
      rows: 3,
      columns: 4,
    });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
    edit({
      kind: "move",
      skillId: 1420,
      from: { row: 1, column: 2 },
      to: { row: 0, column: 1 },
      targetSkillId: 1421,
      rows: 3,
      columns: 4,
    });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
    edit({ kind: "resize", rows: 2, columns: 3 });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
    edit({ kind: "compact" });
    expect(buildMonitorRuntimeSnapshot()).toEqual(before);
  });

  it("removes HUD membership without dropping independent skill voice bindings", () => {
    const voice: SkillMonitorProfile["skillVoiceConfigs"] = {
      "1420": {
        ready: { enabled: true, phrase: { source: "auto" } },
      },
    };
    updateActiveProfile((profile) => ({
      ...profile,
      skillVoiceConfigs: voice,
    }));
    edit({ kind: "remove", skillId: 1420 });
    expect(activeProfile()!.skillVoiceConfigs).toEqual(voice);
    expect(activeProfile()!.skillCdLayout!.positions[1420]).toBeUndefined();
    expect(buildMonitorRuntimeSnapshot().skill.monitoredSkillIds).toEqual([
      1421,
    ]);
  });

  it.each([
    { rows: 0 },
    { rows: 11 },
    { columns: 2.5 },
    { positions: { 1420: { row: -1, column: 0 } } },
    { positions: { 1420: { row: 0, column: 10 } } },
    { positions: { 1420: { row: 0 } } },
    { positions: { invalid: { row: 0, column: 0 } } },
  ])("rejects malformed imported layouts: %j", (invalid) => {
    const data = exportLoadout("layout-test")!;
    Object.assign(data.skillProfile.skillCdLayout!, invalid);
    const parsed = parseLoadoutExport(data);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.issues.join("\n")).toContain("skillCdLayout");
  });
});
