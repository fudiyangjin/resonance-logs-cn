import { describe, expect, it, vi } from "vitest";
import type { HudFrame, MinimapSnapshot } from "$lib/bindings";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => null }));
vi.mock("./minimap-voice.svelte.js", () => ({
  handleMinimapVoiceCues: vi.fn(),
  resetMinimapVoiceCues: vi.fn(),
}));

const { handleHudMinimapFrame } = await import("./minimap-frame");
const { minimapRuntime, minimapSnapshot } = await import(
  "./minimap-runtime.svelte.js"
);

function frame(snapshot: MinimapSnapshot | null): HudFrame {
  return {
    active: true,
    epoch: 1,
    status: null,
    buffs: null,
    monster: null,
    fantasy: null,
    team: null,
    snapshot: { revision: 1, snapshot },
    skillCasts: [],
    skillCastCursor: 0,
    castsReset: false,
  };
}

describe("handleHudMinimapFrame", () => {
  it("clears the minimap when the scene leaves the supported set", () => {
    handleHudMinimapFrame(
      frame({
        sceneId: 13032,
        localPlayerUuid: "local",
        entities: [],
        buffs: [],
        markers: [],
      }),
      { epochChanged: false },
    );
    expect(minimapSnapshot()?.sceneId).toBe(13032);

    handleHudMinimapFrame(frame(null), { epochChanged: false });
    expect(minimapSnapshot()).toBeNull();
    expect(minimapRuntime.lastSceneId).toBeNull();
  });
});
