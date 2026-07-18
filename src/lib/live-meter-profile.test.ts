import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tick } from "svelte";
import {
  SETTINGS,
  createDefaultLiveMeterProfileData,
  deepCloneSettings,
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
let originalPlayerRowHeight: number;

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
  first.tableCustomization.playerRowHeight = 31;
  const second = {
    ...createDefaultLiveMeterProfileData(),
    id: "live-b",
    name: "B",
  };
  second.general.eventUpdateRateMs = 200;
  second.tableCustomization.playerRowHeight = 42;

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
    items: [
      {
        id: "loadout-a",
        name: "A",
        skillProfileId,
        monsterProfileId,
        liveProfileId: first.id,
        starterPlaceholder: false,
      },
    ],
  };
  applyActiveLiveProfileToMirror();
}

beforeEach(() => {
  originalMonitoring = deepCloneSettings(SETTINGS.monitoring.state);
  originalEventUpdateRateMs = SETTINGS.live.general.state.eventUpdateRateMs;
  originalPlayerRowHeight =
    SETTINGS.live.tableCustomization.state.playerRowHeight;
  configureTwoLiveProfiles();
});

afterEach(() => {
  stopLiveProfilePersistence();
  SETTINGS.live.general.state.eventUpdateRateMs = originalEventUpdateRateMs;
  SETTINGS.live.tableCustomization.state.playerRowHeight =
    originalPlayerRowHeight;
  replaceMonitoringState(originalMonitoring);
});

describe("live meter profile persistence", () => {
  it("writes nested mirror edits into the active profile", () => {
    startLiveProfilePersistence();

    SETTINGS.live.general.state.eventUpdateRateMs = 733;
    SETTINGS.live.tableCustomization.state.playerRowHeight = 55;
    persistLiveProfileData(extractLiveProfileData());

    const [first, second] = SETTINGS.monitoring.state.liveMeter.profiles;
    expect(first!.general.eventUpdateRateMs).toBe(733);
    expect(first!.tableCustomization.playerRowHeight).toBe(55);
    expect(second!.general.eventUpdateRateMs).toBe(200);
    expect(second!.tableCustomization.playerRowHeight).toBe(42);
  });

  it("restores persisted mirror edits after restart initialization", () => {
    startLiveProfilePersistence();
    SETTINGS.live.general.state.eventUpdateRateMs = 844;
    SETTINGS.live.tableCustomization.state.playerRowHeight = 63;
    persistLiveProfileData(extractLiveProfileData());

    const persisted = deepCloneSettings(SETTINGS.monitoring.state);
    stopLiveProfilePersistence();
    SETTINGS.live.general.state.eventUpdateRateMs = 200;
    SETTINGS.live.tableCustomization.state.playerRowHeight = 20;
    replaceMonitoringState(persisted);
    applyActiveLiveProfileToMirror();

    expect(SETTINGS.live.general.state.eventUpdateRateMs).toBe(844);
    expect(SETTINGS.live.tableCustomization.state.playerRowHeight).toBe(63);
  });

  it("flushes edits before an immediate profile switch", async () => {
    startLiveProfilePersistence();
    await tick();

    SETTINGS.live.general.state.eventUpdateRateMs = 955;
    switchLiveProfile("live-b");

    expect(
      SETTINGS.monitoring.state.liveMeter.profiles.find(
        (profile) => profile.id === "live-a",
      )!.general.eventUpdateRateMs,
    ).toBe(955);
    expect(SETTINGS.live.general.state.eventUpdateRateMs).toBe(200);
    await tick();
    expect(
      SETTINGS.monitoring.state.liveMeter.profiles.find(
        (profile) => profile.id === "live-b",
      )!.general.eventUpdateRateMs,
    ).toBe(200);
  });
});
