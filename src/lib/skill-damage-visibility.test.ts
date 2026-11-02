import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SETTINGS,
  createDefaultMonsterMonitorProfile,
  defaultSkillDamageDisplay,
} from "./settings-store";
import {
  readHudDomainRules,
  readHudDomainVisibilityRules,
  isHudDomainEnabled,
} from "./hud-domain-rules.svelte";

describe("independent skill damage visibility", () => {
  let previous: typeof SETTINGS.monsterMonitor.state;
  beforeEach(() => {
    previous = JSON.parse(JSON.stringify(SETTINGS.monsterMonitor.state));
    Object.assign(
      SETTINGS.monsterMonitor.state,
      createDefaultMonsterMonitorProfile(),
    );
  });
  afterEach(() => Object.assign(SETTINGS.monsterMonitor.state, previous));
  it("shows damage without enabling monster monitor controls", () => {
    SETTINGS.monsterMonitor.state.enabled = false;
    SETTINGS.monsterMonitor.state.skillDamageDisplay = {
      ...defaultSkillDamageDisplay(),
      enabled: true,
    };
    expect(readHudDomainVisibilityRules("monster").enabled).toBe(true);
    expect(readHudDomainRules("monster").enabled).toBe(false);
    expect(isHudDomainEnabled("monster")).toBe(false);
    SETTINGS.monsterMonitor.state.overlayVisibility.showSkillDamagePanel = false;
    expect(readHudDomainVisibilityRules("monster").enabled).toBe(false);
  });
  it("keeps monster visibility when damage is disabled", () => {
    SETTINGS.monsterMonitor.state.enabled = true;
    SETTINGS.monsterMonitor.state.skillDamageDisplay = {
      ...defaultSkillDamageDisplay(),
      enabled: false,
    };
    expect(readHudDomainVisibilityRules("monster").enabled).toBe(true);
    SETTINGS.monsterMonitor.state.enabled = false;
    expect(readHudDomainVisibilityRules("monster").enabled).toBe(false);
  });
});
