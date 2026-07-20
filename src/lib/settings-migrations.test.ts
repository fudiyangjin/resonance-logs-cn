import { describe, expect, it, vi } from "vitest";
import {
  SETTINGS,
  createDefaultLoadoutsState,
  createDefaultLiveMeterProfileData,
  createDefaultMonitoringSettingsState,
  createDefaultMonsterMonitorProfile,
  createDefaultSkillMonitorProfile,
  startAccessibilityStore,
} from "./settings-store";
import {
  CURRENT_MONITORING_SCHEMA_VERSION,
  canAttemptMonitoringRecovery,
  isMonitoringRecoveryAuthority,
  migrateLegacyMonitoringState,
  migrateMonitoringStateIncrementally,
  reconcileMonitoringState,
} from "./settings-migrations";

function defaultLiveProfileData() {
  return createDefaultLiveMeterProfileData();
}

describe("monitoring recovery coordination", () => {
  it("joins concurrent accessibility store starts", async () => {
    const startPromise = Promise.resolve();
    const start = vi
      .spyOn(SETTINGS.accessibility, "start")
      .mockReturnValue(startPromise);

    try {
      const first = startAccessibilityStore();
      const second = startAccessibilityStore();

      expect(first).toBe(startPromise);
      expect(second).toBe(first);
      expect(start).toHaveBeenCalledOnce();
      await first;
    } finally {
      start.mockRestore();
    }
  });

  it("allows only the main window to coordinate recovery", () => {
    expect(isMonitoringRecoveryAuthority("main")).toBe(true);
    expect(isMonitoringRecoveryAuthority("skill-monitor-overlay")).toBe(false);
    expect(isMonitoringRecoveryAuthority("monster-monitor-overlay")).toBe(
      false,
    );
  });

  it("allows at most one automatic recovery attempt per session", () => {
    expect(canAttemptMonitoringRecovery(null)).toBe(true);
    expect(canAttemptMonitoringRecovery("0")).toBe(true);
    expect(canAttemptMonitoringRecovery("1")).toBe(false);
  });
});

describe("monitoring settings reconciliation", () => {
  it("repairs invalid ids and loadout references", () => {
    const state = createDefaultMonitoringSettingsState();
    const duplicate = createDefaultSkillMonitorProfile("Duplicate");
    duplicate.id = state.skillMonitor.profiles[0]!.id;
    state.skillMonitor.profiles.push(duplicate);
    state.loadouts.items = [
      {
        id: "loadout",
        name: "Broken",
        skillProfileId: "missing",
        monsterProfileId: "missing",
        liveProfileId: "missing",
        starterPlaceholder: false,
      },
    ];
    state.loadouts.activeId = "missing";

    const repaired = reconcileMonitoringState(state);
    expect(
      new Set(repaired.skillMonitor.profiles.map((item) => item.id)).size,
    ).toBe(2);
    expect(repaired.loadouts.activeId).toBe("loadout");
    expect(repaired.loadouts.items[0]!.skillProfileId).toBe(
      repaired.skillMonitor.profiles[0]!.id,
    );
    expect(repaired.loadouts.items[0]!.monsterProfileId).toBe(
      repaired.monsterMonitor.profiles[0]!.id,
    );
  });

  it("normalizes buff icon overrides during reconciliation", () => {
    const state = createDefaultMonitoringSettingsState();
    state.skillMonitor.buffIconOverrides = {
      "997110": "997110_1a2b3c4d.png",
      "997111": "../escape.png",
      bad: "997111_1a2b3c4d.png",
    };

    const repaired = reconcileMonitoringState(state);
    expect(repaired.skillMonitor.buffIconOverrides).toEqual({
      "997110": "997110_1a2b3c4d.png",
    });
  });

  it("defaults missing buff icon overrides for legacy states", () => {
    const state = createDefaultMonitoringSettingsState();
    delete (state.skillMonitor as Partial<typeof state.skillMonitor>)
      .buffIconOverrides;

    const repaired = reconcileMonitoringState(state);
    expect(repaired.skillMonitor.buffIconOverrides).toEqual({});
  });

  it("defaults fantasy cast icons off and preserves an explicit opt-in", () => {
    expect(createDefaultLiveMeterProfileData().general.showFantasyCastIcons).toBe(
      false,
    );

    const state = createDefaultMonitoringSettingsState();
    const legacy = state.liveMeter.profiles[0]!;
    delete (legacy.general as Partial<typeof legacy.general>)
      .showFantasyCastIcons;

    const enabled = {
      ...createDefaultLiveMeterProfileData(),
      id: "live-enabled",
      name: "Enabled",
    };
    enabled.general.showFantasyCastIcons = true;

    const invalid = {
      ...createDefaultLiveMeterProfileData(),
      id: "live-invalid",
      name: "Invalid",
    };
    (invalid.general as unknown as Record<string, unknown>)[
      "showFantasyCastIcons"
    ] = "true";
    state.liveMeter.profiles = [legacy, enabled, invalid];

    const repaired = reconcileMonitoringState(state);
    expect(
      repaired.liveMeter.profiles.map(
        (profile) => profile.general.showFantasyCastIcons,
      ),
    ).toEqual([false, true, false]);
  });

  it("materializes the active loadout monster profile into the mirror", () => {
    const state = createDefaultMonitoringSettingsState();
    const first = state.monsterMonitor.profiles[0]!;
    const second = createDefaultMonsterMonitorProfile("Second");
    second.hateListEnabled = true;
    state.monsterMonitor.profiles.push(second);
    state.loadouts.items = [
      {
        id: "loadout",
        name: "Second",
        skillProfileId: state.skillMonitor.profiles[0]!.id,
        monsterProfileId: second.id,
        liveProfileId: state.liveMeter.profiles[0]!.id,
        starterPlaceholder: false,
      },
    ];
    state.loadouts.activeId = "loadout";
    state.monsterMonitor.mirroredProfileId = first.id;

    const repaired = reconcileMonitoringState(state);
    expect(repaired.monsterMonitor.mirroredProfileId).toBe(second.id);
    expect(repaired.monsterMonitor.hateListEnabled).toBe(true);
  });
});

describe("legacy monitoring migration", () => {
  it("creates one loadout per legacy skill profile and preserves active index", () => {
    const base = createDefaultMonitoringSettingsState();
    const second = createDefaultSkillMonitorProfile("Second");
    base.skillMonitor.profiles.push(second);

    const migrated = migrateLegacyMonitoringState(
      {
        skillMonitor: { ...base.skillMonitor, activeProfileIndex: 1 },
        monsterMonitor: base.monsterMonitor,
        loadouts: { ...createDefaultLoadoutsState(), schemaVersion: 0 },
      },
      defaultLiveProfileData(),
    );

    expect(migrated.schemaVersion).toBe(CURRENT_MONITORING_SCHEMA_VERSION);
    expect(migrated.loadouts.items).toHaveLength(2);
    expect(migrated.loadouts.activeId).toBe(migrated.loadouts.items[1]!.id);
    expect(migrated.loadouts.firstRunPromptDismissed).toBe(true);
  });

  it("keeps the first-run prompt for untouched fresh defaults", () => {
    const base = createDefaultMonitoringSettingsState();
    const migrated = migrateLegacyMonitoringState(
      {
        skillMonitor: { ...base.skillMonitor, activeProfileIndex: 0 },
        monsterMonitor: base.monsterMonitor,
        loadouts: { ...createDefaultLoadoutsState(), schemaVersion: 0 },
      },
      defaultLiveProfileData(),
    );

    expect(migrated.loadouts.firstRunPromptDismissed).toBe(false);
    expect(migrated.loadouts.items[0]!.starterPlaceholder).toBe(true);
  });

  it.each([
    [
      "duration skill",
      (base: ReturnType<typeof createDefaultMonitoringSettingsState>) => {
        base.skillMonitor.profiles[0]!.monitoredSkillDurationIds = [101];
      },
    ],
    [
      "custom panel",
      (base: ReturnType<typeof createDefaultMonitoringSettingsState>) => {
        base.skillMonitor.profiles[0]!.customPanelGroups = [
          {
            id: "panel",
            name: "Panel",
            kind: "manual",
            entries: [],
            position: { x: 0, y: 0 },
            scale: 1,
            style: {
              gap: 6,
              columnGap: 12,
              fontSize: 14,
              nameColor: "#fff",
              valueColor: "#fff",
              progressColor: "#fff",
              progressOpacity: 0.4,
              textShadowEnabled: true,
              backgroundEnabled: false,
              backgroundOpacity: 0.76,
            },
          },
        ];
      },
    ],
    [
      "skill voice",
      (base: ReturnType<typeof createDefaultMonitoringSettingsState>) => {
        base.skillMonitor.profiles[0]!.buffVoiceConfigs = {
          "101": { gained: { enabled: true, phrase: { source: "auto" } } },
        };
      },
    ],
    [
      "skill layout",
      (base: ReturnType<typeof createDefaultMonitoringSettingsState>) => {
        base.skillMonitor.profiles[0]!.overlayPositions.skillCdGroup.x = 999;
      },
    ],
    [
      "monster config",
      (base: ReturnType<typeof createDefaultMonitoringSettingsState>) => {
        base.monsterMonitor.hateListEnabled = true;
      },
    ],
  ])("does not mark configured legacy %s as a starter", (_name, mutate) => {
    const base = createDefaultMonitoringSettingsState();
    mutate(base);
    const migrated = migrateLegacyMonitoringState(
      {
        skillMonitor: { ...base.skillMonitor, activeProfileIndex: 0 },
        monsterMonitor: base.monsterMonitor,
        loadouts: { ...createDefaultLoadoutsState(), schemaVersion: 0 },
      },
      defaultLiveProfileData(),
    );

    expect(migrated.loadouts.firstRunPromptDismissed).toBe(true);
    expect(migrated.loadouts.items[0]!.starterPlaceholder).toBe(false);
  });

  it("preserves existing unreferenced profiles during intermediate migration", () => {
    const base = createDefaultMonitoringSettingsState();
    const orphanSkill = createDefaultSkillMonitorProfile("Orphan");
    const orphanMonster = createDefaultMonsterMonitorProfile("Orphan");
    base.skillMonitor.profiles.push(orphanSkill);
    base.monsterMonitor.profiles.push(orphanMonster);
    const firstSkill = base.skillMonitor.profiles[0]!;
    const firstMonster = base.monsterMonitor.profiles[0]!;
    base.loadouts.items = [
      {
        id: "loadout",
        name: "Only",
        skillProfileId: firstSkill.id,
        monsterProfileId: firstMonster.id,
        liveProfileId: base.liveMeter.profiles[0]!.id,
        starterPlaceholder: false,
      },
    ];
    base.loadouts.activeId = "loadout";

    const migrated = migrateLegacyMonitoringState(
      {
        skillMonitor: base.skillMonitor,
        monsterMonitor: base.monsterMonitor,
        loadouts: { ...base.loadouts, schemaVersion: 1 },
      },
      defaultLiveProfileData(),
    );

    expect(
      migrated.skillMonitor.profiles.some((item) => item.id === orphanSkill.id),
    ).toBe(true);
    expect(
      migrated.monsterMonitor.profiles.some(
        (item) => item.id === orphanMonster.id,
      ),
    ).toBe(true);
  });

  it("preserves all monster profiles when loadouts have not been created yet", () => {
    const base = createDefaultMonitoringSettingsState();
    const configured = createDefaultMonsterMonitorProfile("Configured");
    configured.dbmAliases = { "101": "Mechanic" };
    base.monsterMonitor.profiles.push(configured);

    const migrated = migrateLegacyMonitoringState(
      {
        skillMonitor: { ...base.skillMonitor, activeProfileIndex: 0 },
        monsterMonitor: base.monsterMonitor,
        loadouts: { ...createDefaultLoadoutsState(), schemaVersion: 0 },
      },
      defaultLiveProfileData(),
    );

    expect(migrated.monsterMonitor.profiles).toHaveLength(2);
    expect(
      migrated.monsterMonitor.profiles.find(
        (profile) => profile.id === configured.id,
      )?.dbmAliases,
    ).toEqual({ "101": "Mechanic" });
    expect(migrated.loadouts.items[0]!.starterPlaceholder).toBe(false);
  });

  it.each([
    [true, true],
    [false, false],
  ])(
    "preserves schema zero global skill flags (%s, %s)",
    (enabled, autoHideInDailyScenes) => {
      const base = createDefaultMonitoringSettingsState();
      const second = createDefaultSkillMonitorProfile("Second");
      base.skillMonitor.profiles.push(second);
      for (const profile of base.skillMonitor.profiles) {
        delete (profile as Partial<typeof profile>).enabled;
        delete (profile as Partial<typeof profile>).autoHideInDailyScenes;
      }

      const migrated = migrateLegacyMonitoringState(
        {
          skillMonitor: {
            ...base.skillMonitor,
            enabled,
            autoHideInDailyScenes,
            activeProfileIndex: 0,
          },
          monsterMonitor: base.monsterMonitor,
          loadouts: { ...createDefaultLoadoutsState(), schemaVersion: 0 },
        },
        defaultLiveProfileData(),
      );

      expect(
        migrated.skillMonitor.profiles.every(
          (profile) => profile.enabled === enabled,
        ),
      ).toBe(true);
      expect(
        migrated.skillMonitor.profiles.every(
          (profile) => profile.autoHideInDailyScenes === autoHideInDailyScenes,
        ),
      ).toBe(true);
    },
  );

  it("seeds schema zero live profiles from the legacy live stores", () => {
    const base = createDefaultMonitoringSettingsState();
    const liveProfileData = defaultLiveProfileData();
    liveProfileData.general.eventUpdateRateMs = 733;
    liveProfileData.tableCustomization.playerRowHeight = 47;
    liveProfileData.headerCustomization.windowPadding = 21;
    liveProfileData.columnOrder.dpsPlayers.order = ["dps", "name"];
    liveProfileData.sorting.dpsPlayers = {
      sortKey: "name",
      sortDesc: false,
    };

    const migrated = migrateLegacyMonitoringState(
      {
        skillMonitor: { ...base.skillMonitor, activeProfileIndex: 0 },
        monsterMonitor: base.monsterMonitor,
        loadouts: { ...createDefaultLoadoutsState(), schemaVersion: 0 },
      },
      liveProfileData,
    );

    const profile = migrated.liveMeter.profiles[0]!;
    expect(profile.general.eventUpdateRateMs).toBe(733);
    expect(profile.tableCustomization.playerRowHeight).toBe(47);
    expect(profile.headerCustomization.windowPadding).toBe(21);
    expect(profile.columnOrder.dpsPlayers.order).toEqual(["dps", "name"]);
    expect(profile.sorting.dpsPlayers).toEqual({
      sortKey: "name",
      sortDesc: false,
    });
    expect(migrated.loadouts.items[0]!.liveProfileId).toBe(profile.id);
  });
});

describe("incremental monitoring migration", () => {
  it("uses the legacy live stores and preserves schema one resources", () => {
    const state = createDefaultMonitoringSettingsState();
    state.schemaVersion = 1;
    const orphanSkill = createDefaultSkillMonitorProfile("Orphan skill");
    const orphanMonster = createDefaultMonsterMonitorProfile("Orphan monster");
    state.skillMonitor.profiles.push(orphanSkill);
    state.monsterMonitor.profiles.push(orphanMonster);
    const originalLoadoutId = "existing-loadout";
    state.loadouts.items = [
      {
        id: originalLoadoutId,
        name: "Existing",
        skillProfileId: state.skillMonitor.profiles[0]!.id,
        monsterProfileId: state.monsterMonitor.profiles[0]!.id,
        liveProfileId: state.liveMeter.profiles[0]!.id,
        starterPlaceholder: false,
      },
    ];
    state.loadouts.activeId = originalLoadoutId;
    state.liveMeter.profiles[0]!.general.eventUpdateRateMs = 111;

    const liveProfileData = defaultLiveProfileData();
    liveProfileData.general.eventUpdateRateMs = 922;
    liveProfileData.tableCustomization.skillRowHeight = 38;

    const migrated = migrateMonitoringStateIncrementally(
      state,
      liveProfileData,
    );

    expect(migrated.schemaVersion).toBe(CURRENT_MONITORING_SCHEMA_VERSION);
    expect(migrated.loadouts.activeId).toBe(originalLoadoutId);
    expect(migrated.loadouts.items[0]!.id).toBe(originalLoadoutId);
    expect(
      migrated.skillMonitor.profiles.some(
        (profile) => profile.id === orphanSkill.id,
      ),
    ).toBe(true);
    expect(
      migrated.monsterMonitor.profiles.some(
        (profile) => profile.id === orphanMonster.id,
      ),
    ).toBe(true);
    expect(migrated.liveMeter.profiles[0]!.general.eventUpdateRateMs).toBe(922);
    expect(
      migrated.liveMeter.profiles[0]!.tableCustomization.skillRowHeight,
    ).toBe(38);
    expect(migrated.loadouts.items[0]!.liveProfileId).toBe(
      migrated.liveMeter.profiles[0]!.id,
    );
  });

  it("backfills challengeWatch/appearance onto every schema-two live profile without touching other resources", () => {
    const state = createDefaultMonitoringSettingsState();
    state.schemaVersion = 2;
    // Simulate live profiles persisted before schema 3 introduced these
    // fields — they simply wouldn't be present on disk yet.
    const firstProfile = { ...state.liveMeter.profiles[0]! } as Partial<
      (typeof state.liveMeter.profiles)[0]
    >;
    delete firstProfile.challengeWatch;
    delete firstProfile.appearance;
    const secondProfile = {
      ...createDefaultLiveMeterProfileData(),
      id: "live-b",
      name: "B",
    } as Partial<(typeof state.liveMeter.profiles)[0]>;
    delete secondProfile.challengeWatch;
    delete secondProfile.appearance;
    state.liveMeter.profiles = [
      firstProfile,
      secondProfile,
    ] as typeof state.liveMeter.profiles;

    const liveProfileData = defaultLiveProfileData();
    liveProfileData.challengeWatch = { forbiddenDamageIds: [42] };
    liveProfileData.appearance = {
      ...liveProfileData.appearance,
      themeColors: {
        ...liveProfileData.appearance.themeColors,
        primary: "#123456",
      },
      classColors: {
        ...liveProfileData.appearance.classColors,
        Warrior: "#abcdef",
      },
      useClassSpecColors: true,
      classSpecColors: {
        ...liveProfileData.appearance.classSpecColors,
        Iaido: "#fedcba",
      },
    };

    const migrated = migrateMonitoringStateIncrementally(
      state,
      liveProfileData,
    );

    expect(migrated.schemaVersion).toBe(CURRENT_MONITORING_SCHEMA_VERSION);
    expect(migrated.liveMeter.profiles).toHaveLength(2);
    for (const profile of migrated.liveMeter.profiles) {
      expect(profile.challengeWatch.forbiddenDamageIds).toEqual([42]);
      expect(profile.appearance.themeColors.primary).toBe("#123456");
      expect(profile.appearance.classColors["Warrior"]).toBe("#abcdef");
      expect(profile.appearance.useClassSpecColors).toBe(true);
      expect(profile.appearance.classSpecColors["Iaido"]).toBe("#fedcba");
    }
  });
});
