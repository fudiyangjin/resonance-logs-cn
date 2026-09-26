import { describe, expect, it } from "vitest";
import { isSupportedMinimapScene } from "./config/daily-scene-blacklist";
import { registeredMinimapSceneIds } from "../routes/minimap-overlay/scene-registry";
import {
  domainRequiresSupportedScene,
  resolveSceneVisibility,
  type SceneVisibilityInput,
} from "./hud-scene-visibility";

// 9 is in DAILY_SCENE_IDS; 6615 is a registered minimap scene; 6613 is neither.
const DAILY_SCENE = 9;
const SUPPORTED_SCENE = 6615;
const PLAIN_SCENE = 6613;

function input(overrides: Partial<SceneVisibilityInput> = {}) {
  return {
    enabled: true,
    autoHideInDailyScenes: false,
    sceneId: PLAIN_SCENE,
    requiresSupportedScene: false,
    ...overrides,
  } satisfies SceneVisibilityInput;
}

describe("resolveSceneVisibility", () => {
  it("hides a disabled domain regardless of scene", () => {
    expect(resolveSceneVisibility(input({ enabled: false }))).toBe(false);
    expect(
      resolveSceneVisibility(
        input({ enabled: false, sceneId: SUPPORTED_SCENE }),
      ),
    ).toBe(false);
  });

  it("shows an enabled domain when no scene rule applies", () => {
    expect(resolveSceneVisibility(input())).toBe(true);
    expect(resolveSceneVisibility(input({ sceneId: null }))).toBe(true);
  });

  it("only hides in daily scenes when auto-hide is on", () => {
    expect(resolveSceneVisibility(input({ sceneId: DAILY_SCENE }))).toBe(true);
    expect(
      resolveSceneVisibility(
        input({ sceneId: DAILY_SCENE, autoHideInDailyScenes: true }),
      ),
    ).toBe(false);
  });

  it("keeps auto-hide inert outside daily scenes", () => {
    expect(
      resolveSceneVisibility(
        input({ sceneId: PLAIN_SCENE, autoHideInDailyScenes: true }),
      ),
    ).toBe(true);
  });

  it("treats every registered minimap scene as supported", () => {
    for (const sceneId of registeredMinimapSceneIds()) {
      expect(isSupportedMinimapScene(sceneId)).toBe(true);
    }
  });

  it("requires a registered scene when the domain has per-scene content", () => {
    expect(
      resolveSceneVisibility(
        input({ requiresSupportedScene: true, sceneId: SUPPORTED_SCENE }),
      ),
    ).toBe(true);
    expect(
      resolveSceneVisibility(
        input({ requiresSupportedScene: true, sceneId: PLAIN_SCENE }),
      ),
    ).toBe(false);
    expect(
      resolveSceneVisibility(
        input({ requiresSupportedScene: true, sceneId: null }),
      ),
    ).toBe(false);
  });

  it("applies the scene whitelist independently of auto-hide", () => {
    // The whitelist used to be gated behind autoHideInDailyScenes, which let an
    // unsupported scene render an empty panel. It is now unconditional.
    expect(
      resolveSceneVisibility(
        input({
          requiresSupportedScene: true,
          autoHideInDailyScenes: false,
          sceneId: PLAIN_SCENE,
        }),
      ),
    ).toBe(false);
  });
});

describe("domainRequiresSupportedScene", () => {
  it("marks only minimap as scene-scoped", () => {
    expect(domainRequiresSupportedScene("minimap")).toBe(true);
    expect(domainRequiresSupportedScene("game")).toBe(false);
    expect(domainRequiresSupportedScene("monster")).toBe(false);
  });
});
