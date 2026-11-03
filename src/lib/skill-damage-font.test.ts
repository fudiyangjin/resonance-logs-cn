import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSkillDamageFont } from "./skill-damage-font";

afterEach(() => vi.unstubAllGlobals());

describe("skill damage custom font", () => {
  it("loads a font once and registers it without changing global font styles", async () => {
    const add = vi.fn();
    const face = { family: "custom" };
    const load = vi.fn().mockResolvedValue(face);
    vi.stubGlobal(
      "FontFace",
      class {
        load = load;
      },
    );
    vi.stubGlobal("document", { fonts: { add } });
    const first = loadSkillDamageFont("data:font/woff2;base64,custom");
    const second = loadSkillDamageFont("data:font/woff2;base64,custom");
    expect(first).toBe(second);
    expect(await first).toMatch(/^skill-damage-/);
    expect(load).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(face);
  });
});
