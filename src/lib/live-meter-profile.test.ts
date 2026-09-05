import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tick } from "svelte";
import {
  SETTINGS,
  createDefaultLiveMeterProfileData,
  deepCloneSettings,
  type LiveMeterProfileData,
  type MonitoringSettingsState,
} from "./settings-store";
import {
  applyActiveLiveProfileToMirror,
  extractLiveProfileData,
  persistLiveProfileData,
  startLiveProfilePersistence,
  stopLiveProfilePersistence,
  switchLiveProfile,
} from "./live-meter-profile.svelte";

let originalMonitoring: MonitoringSettingsState;
let originalEventUpdateRateMs: number;
let originalShowFantasyCastIcons: boolean;
let originalPlayerRowHeight: number;
let originalForbiddenDamageIds: number[];
let originalClassColors: Record<string, string>;
let originalUseClassSpecColors: boolean;
let originalClassSpecColors: Record<string, string>;
let originalHistory: LiveMeterProfileData["history"];
let originalColumnLabels: LiveMeterProfileData["columnLabels"];

function replaceMonitoringState(state: MonitoringSettingsState): void {
  const target = SETTINGS.monitoring.state;
  target.schemaVersion = state.schemaVersion;
  target.skillMonitor = deepCloneSettings(state.skillMonitor);
  target.monsterMonitor = deepCloneSettings(state.monsterMonitor);
  target.loadouts = deepCloneSettings(state.loadouts);
  target.liveMeter = deepCloneSettings(state.liveMeter);
}

function configureTwoLiveProfiles(): void {
  const first = {
    ...createDefaultLiveMeterProfileData(),
    id: "live-a",
    name: "A",
  };
  first.general.eventUpdateRateMs = 100;
  first.history.general.timelineLaneH = 51;
  first.columnLabels.live.players.first = "A Players";
  first.tableCustomization.playerRowHeight = 31;
  first.challengeWatch = { forbiddenDamageIds: [111] };
  first.appearance = {
    ...first.appearance,
    classColors: { ...first.appearance.classColors, Warrior: "#111111" },
    useClassSpecColors: false,
    classSpecColors: { ...first.appearance.classSpecColors, Iaido: "#111111" },
  };
  const second = {
    ...createDefaultLiveMeterProfileData(),
    id: "live-b",
    name: "B",
  };
  second.general.eventUpdateRateMs = 200;
  second.general.showFantasyCastIcons = true;
  second.history.general.timelineLaneH = 62;
  second.columnLabels.live.players.first = "B Players";
  second.tableCustomization.playerRowHeight = 42;
  second.challengeWatch = { forbiddenDamageIds: [222] };
  second.appearance = {
    ...second.appearance,
    classColors: { ...second.appearance.classColors, Warrior: "#222222" },
    useClassSpecColors: true,
    classSpecColors: { ...second.appearance.classSpecColors, Iaido: "#222222" },
  };

  const skillProfileId = SETTINGS.monitoring.state.skillMonitor.profiles[0]!.id;
  const monsterProfileId =
    SETTINGS.monitoring.state.monsterMonitor.profiles[0]!.id;
  SETTINGS.monitoring.state.liveMeter = {
    mirroredProfileId: first.id,
    profiles: [first, second],
  };
  SETTINGS.monitoring.state.loadouts = {
    activeId: "loadout-a",
    firstRunPromptDismissed: true,
    autoSwitchBySpec: true,
    items: [
      {
        id: "loadout-a",
        name: "A",
        skillProfileId,
        monsterProfileId,
        liveProfileId: first.id,
        starterPlaceholder: false,
        linkedTalentStageCfgId: null,
      },
    ],
  };
  applyActiveLiveProfileToMirror();
}

beforeEach(() => {
  originalMonitoring = deepCloneSettings(SETTINGS.monitoring.state);
  originalEventUpdateRateMs = SETTINGS.live.general.state.eventUpdateRateMs;
  originalShowFantasyCastIcons =
    SETTINGS.live.general.state.showFantasyCastIcons;
  originalPlayerRowHeight =
    SETTINGS.live.tableCustomization.state.playerRowHeight;
  originalForbiddenDamageIds = [
    ...SETTINGS.challengeWatch.state.forbiddenDamageIds,
  ];
  originalClassColors = { ...SETTINGS.live.appearance.state.classColors };
  originalUseClassSpecColors =
    SETTINGS.live.appearance.state.useClassSpecColors;
  originalClassSpecColors = {
    ...SETTINGS.live.appearance.state.classSpecColors,
  };
  originalHistory = deepCloneSettings({
    general: SETTINGS.history.general.state,
    dpsPlayers: SETTINGS.history.dps.players.state,
    dpsSkillBreakdown: SETTINGS.history.dps.skillBreakdown.state,
    healPlayers: SETTINGS.history.heal.players.state,
    healSkillBreakdown: SETTINGS.history.heal.skillBreakdown.state,
    tankedPlayers: SETTINGS.history.tanked.players.state,
    tankedSkillBreakdown: SETTINGS.history.tanked.skillBreakdown.state,
  });
  originalColumnLabels = deepCloneSettings(SETTINGS.live.columnLabels.state);
  configureTwoLiveProfiles();
});

afterEach(() => {
  stopLiveProfilePersistence();
  SETTINGS.live.general.state.eventUpdateRateMs = originalEventUpdateRateMs;
  SETTINGS.live.general.state.showFantasyCastIcons =
    originalShowFantasyCastIcons;
  SETTINGS.live.tableCustomization.state.playerRowHeight =
    originalPlayerRowHeight;
  SETTINGS.challengeWatch.state.forbiddenDamageIds = originalForbiddenDamageIds;
  SETTINGS.live.appearance.state.classColors = originalClassColors;
  SETTINGS.live.appearance.state.useClassSpecColors =
    originalUseClassSpecColors;
  SETTINGS.live.appearance.state.classSpecColors = originalClassSpecColors;
  Object.assign(SETTINGS.history.general.state, originalHistory.general);
  Object.assign(SETTINGS.history.dps.players.state, originalHistory.dpsPlayers);
  Object.assign(
    SETTINGS.history.dps.skillBreakdown.state,
    originalHistory.dpsSkillBreakdown,
  );
  Object.assign(
    SETTINGS.history.heal.players.state,
    originalHistory.healPlayers,
  );
  Object.assign(
    SETTINGS.history.heal.skillBreakdown.state,
    originalHistory.healSkillBreakdown,
  );
  Object.assign(
    SETTINGS.history.tanked.players.state,
    originalHistory.tankedPlayers,
  );
  Object.assign(
    SETTINGS.history.tanked.skillBreakdown.state,
    originalHistory.tankedSkillBreakdown,
  );
  Object.assign(SETTINGS.live.columnLabels.state, originalColumnLabels);
  replaceMonitoringState(originalMonitoring);
});

describe("live meter profile persistence", () => {
  it("writes nested mirror edits into the active profile", () => {
    startLiveProfilePersistence();

    SETTINGS.live.general.state.eventUpdateRateMs = 733;
    SETTINGS.history.general.state.timelineLaneH = 73;
    SETTINGS.live.columnLabels.state.live.players.first = "Party";
    SETTINGS.live.tableCustomization.state.playerRowHeight = 55;
    SETTINGS.challengeWatch.state.forbiddenDamageIds = [999];
    SETTINGS.live.appearance.state.classColors = {
      ...SETTINGS.live.appearance.state.classColors,
      Warrior: "#999999",
    };
    persistLiveProfileData(extractLiveProfileData());

    const [first, second] = SETTINGS.monitoring.state.liveMeter.profiles;
    expect(first!.general.eventUpdateRateMs).toBe(733);
    expect(first!.history.general.timelineLaneH).toBe(73);
    expect(first!.columnLabels.live.players.first).toBe("Party");
    expect(first!.tableCustomization.playerRowHeight).toBe(55);
    expect(first!.challengeWatch.forbiddenDamageIds).toEqual([999]);
    expect(first!.appearance.classColors["Warrior"]).toBe("#999999");
    expect(second!.general.eventUpdateRateMs).toBe(200);
    expect(second!.history.general.timelineLaneH).toBe(62);
    expect(second!.columnLabels.live.players.first).toBe("B Players");
    expect(second!.tableCustomization.playerRowHeight).toBe(42);
    expect(second!.challengeWatch.forbiddenDamageIds).toEqual([222]);
    expect(second!.appearance.classColors["Warrior"]).toBe("#222222");
  });

  it("restores persisted mirror edits after restart initialization", () => {
    startLiveProfilePersistence();
    SETTINGS.live.general.state.eventUpdateRateMs = 844;
    SETTINGS.live.tableCustomization.state.playerRowHeight = 63;
    SETTINGS.challengeWatch.state.forbiddenDamageIds = [888];
    SETTINGS.live.appearance.state.classColors = {
      ...SETTINGS.live.appearance.state.classColors,
      Warrior: "#888888",
    };
    persistLiveProfileData(extractLiveProfileData());

    const persisted = deepCloneSettings(SETTINGS.monitoring.state);
    stopLiveProfilePersistence();
    SETTINGS.live.general.state.eventUpdateRateMs = 200;
    SETTINGS.live.tableCustomization.state.playerRowHeight = 20;
    SETTINGS.challengeWatch.state.forbiddenDamageIds = [];
    SETTINGS.live.appearance.state.classColors = {
      ...SETTINGS.live.appearance.state.classColors,
      Warrior: "#000000",
    };
    replaceMonitoringState(persisted);
    applyActiveLiveProfileToMirror();

    expect(SETTINGS.live.general.state.eventUpdateRateMs).toBe(844);
    expect(SETTINGS.live.tableCustomization.state.playerRowHeight).toBe(63);
    expect(SETTINGS.challengeWatch.state.forbiddenDamageIds).toEqual([888]);
    expect(SETTINGS.live.appearance.state.classColors["Warrior"]).toBe(
      "#888888",
    );
  });

  it("flushes edits before an immediate profile switch", async () => {
    startLiveProfilePersistence();
    await tick();

    SETTINGS.live.general.state.eventUpdateRateMs = 955;
    SETTINGS.history.general.state.timelineLaneH = 95;
    SETTINGS.live.columnLabels.state.live.players.first = "Switched A";
    SETTINGS.challengeWatch.state.forbiddenDamageIds = [777];
    switchLiveProfile("live-b");

    const flushedFirst = SETTINGS.monitoring.state.liveMeter.profiles.find(
      (profile) => profile.id === "live-a",
    )!;
    expect(flushedFirst.general.eventUpdateRateMs).toBe(955);
    expect(flushedFirst.history.general.timelineLaneH).toBe(95);
    expect(flushedFirst.columnLabels.live.players.first).toBe("Switched A");
    expect(flushedFirst.challengeWatch.forbiddenDamageIds).toEqual([777]);
    expect(SETTINGS.live.general.state.eventUpdateRateMs).toBe(200);
    expect(SETTINGS.history.general.state.timelineLaneH).toBe(62);
    expect(SETTINGS.live.columnLabels.state.live.players.first).toBe(
      "B Players",
    );
    expect(SETTINGS.challengeWatch.state.forbiddenDamageIds).toEqual([222]);
    await tick();
    expect(
      SETTINGS.monitoring.state.liveMeter.profiles.find(
        (profile) => profile.id === "live-b",
      )!.general.eventUpdateRateMs,
    ).toBe(200);
  });

  it("restores class/spec color mode when switching profiles", () => {
    expect(SETTINGS.live.appearance.state.useClassSpecColors).toBe(false);
    expect(SETTINGS.live.appearance.state.classSpecColors["Iaido"]).toBe(
      "#111111",
    );

    switchLiveProfile("live-b");

    expect(SETTINGS.live.appearance.state.useClassSpecColors).toBe(true);
    expect(SETTINGS.live.appearance.state.classSpecColors["Iaido"]).toBe(
      "#222222",
    );
    expect(
      SETTINGS.monitoring.state.liveMeter.profiles.find(
        (profile) => profile.id === "live-a",
      )!.appearance.useClassSpecColors,
    ).toBe(false);
  });

  it("keeps fantasy icon visibility isolated between live profiles", () => {
    expect(SETTINGS.live.general.state.showFantasyCastIcons).toBe(false);

    switchLiveProfile("live-b");
    expect(SETTINGS.live.general.state.showFantasyCastIcons).toBe(true);

    switchLiveProfile("live-a");
    expect(SETTINGS.live.general.state.showFantasyCastIcons).toBe(false);
  });
});
