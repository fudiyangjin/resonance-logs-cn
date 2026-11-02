import { describe, expect, it } from "vitest";
import type { ProfessionCountState } from "$lib/bindings";
import { professionCountLayers } from "./profession-count";

function state(
  effectId: number,
  layer: number,
  extra: Partial<ProfessionCountState> = {},
): ProfessionCountState {
  return {
    buffBaseId: 1,
    effectId,
    layer,
    anyLayer: layer > 0,
    activeEffectIds: layer > 0 ? [effectId] : [],
    ...extra,
  };
}

const files = (layers: ReturnType<typeof professionCountLayers>) =>
  (layers ?? []).map((layer) => layer.src.split("/").at(-1));

describe("professionCountLayers", () => {
  it("hides without state, an unknown row or zero layers", () => {
    expect(professionCountLayers(null)).toBeNull();
    expect(professionCountLayers(state(9999, 3))).toBeNull();
    expect(professionCountLayers(state(11, 0))).toBeNull();
  });

  it("draws a single digit centred with the tinted rings", () => {
    const layers = professionCountLayers(state(11, 7))!;
    expect(layers[0]).toMatchObject({
      src: expect.stringContaining("thunder_07.png"),
      x: 0,
    });
    expect(files(layers)).toContain("ring_plate.png");
    const rings = layers.filter((layer) => /ring_00\d/.test(layer.src));
    expect(rings).toHaveLength(7);
    expect(rings.every((ring) => ring.color === "#D6B4FF")).toBe(true);
  });

  it("splits two digits at -12 and +12", () => {
    const [tens, ones] = professionCountLayers(state(71, 23))!;
    expect(tens).toMatchObject({
      src: expect.stringContaining("fire_02.png"),
      x: -12,
    });
    expect(ones).toMatchObject({
      src: expect.stringContaining("fire_03.png"),
      x: 12,
    });
  });

  it("caps at the table limit and leaves uncapped rows alone", () => {
    expect(files(professionCountLayers(state(21, 9))).slice(0, 1)).toEqual([
      "wind_05.png",
    ]);
    expect(files(professionCountLayers(state(1, 12))).slice(0, 2)).toEqual([
      "ice_01.png",
      "ice_02.png",
    ]);
  });

  it("uses the lightning stack for the special thunder row", () => {
    const layers = files(professionCountLayers(state(12, 3)));
    expect(layers[0]).toBe("thunder_03.png");
    expect(layers).toContain("thunder01_4.png");
  });

  it("switches the special wind stack between one and two layers", () => {
    expect(files(professionCountLayers(state(22, 1)))).toContain("icon_11.png");
    expect(files(professionCountLayers(state(22, 2)))).toContain("icon_8.png");
  });

  it("shows the flowers whose buffs still have layers", () => {
    const layers = professionCountLayers(
      state(42, 0, { anyLayer: true, activeEffectIds: [45, 43] }),
    );
    expect(files(layers)).toEqual(["flower_bg.png", "flower_2.png"]);
    expect(
      professionCountLayers(
        state(42, 0, { anyLayer: false, activeEffectIds: [] }),
      ),
    ).toBeNull();
  });

  it("switches the rank frame at the cap", () => {
    expect(files(professionCountLayers(state(81, 3)))).toEqual([
      "main_axe_frame_normal.png",
      "main_axe_gray_3.png",
      "main_axe_3.png",
    ]);
    expect(files(professionCountLayers(state(81, 6)))[0]).toBe(
      "main_axe_frame_s.png",
    );
  });
});
