import { describe, expect, it } from "vitest";
import { shouldShowHudWindow } from "./hud-domain";

describe("shouldShowHudWindow", () => {
  it("keeps the physical HUD visible while any logical domain is visible", () => {
    expect(
      shouldShowHudWindow(
        { game: false, monster: true, minimap: false, damage: false },
        false,
      ),
    ).toBe(true);
  });

  it("keeps the shared canvas visible for unified editing", () => {
    expect(
      shouldShowHudWindow(
        { game: false, monster: false, minimap: false, damage: false },
        true,
      ),
    ).toBe(true);
  });

  it("hides only when editing and every domain are inactive", () => {
    expect(
      shouldShowHudWindow(
        { game: false, monster: false, minimap: false, damage: false },
        false,
      ),
    ).toBe(false);
  });
});
