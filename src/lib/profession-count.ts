/**
 * Main-HUD profession counter (`profession_buff_icon_group`, 184×184), after
 * `profession_buff_show_helper.lua`. A buff carrying a
 * `BuffEffectEnergyDisplay` logic effect names a `FightResIconTable` row; its
 * `UIShowType` picks one of five widgets stacked on the same node.
 *
 * Geometry follows the reference `profession_count.js`: Unity coordinates
 * around the node centre (x right, y up), sizes in prefab pixels.
 */
import type { ProfessionCountState } from "$lib/bindings";
import fightResIconsRaw from "$lib/config/fight_res_icons.json";

export type FightResIcon = {
  name: string;
  showType: number;
  subType: number | null;
  /** `UIType[2]`; `null` when the row has no cap (empty `UIType`). */
  max: number | null;
  digits: string | null;
  color: string | null;
};

/** `UIShowType`: Normal 1, Special 2, SpecialNum 3, FlowerLayer 4, Rating 5. */
export const SHOW_NORMAL = 1;
export const SHOW_SPECIAL = 2;
export const SHOW_SPECIAL_NUM = 3;
export const SHOW_FLOWER_LAYER = 4;
export const SHOW_RATING = 5;

export const PROFESSION_COUNT_SIZE = 184;

const FIGHT_RES_ICONS = fightResIconsRaw as Record<string, FightResIcon>;

export function getFightResIcon(effectId: number): FightResIcon | undefined {
  return FIGHT_RES_ICONS[String(effectId)];
}

const IMG = "/images/fight_res/count/";

export type CountLayer = {
  src: string;
  w: number;
  h: number;
  x: number;
  y: number;
  /** Tint through the image's alpha (`SetColorByHex`). */
  color?: string;
  alpha?: number;
};

type LayerRow = [
  file: string,
  w: number,
  h: number,
  x: number,
  y: number,
  color?: string | null,
  alpha?: number,
];

function layer([file, w, h, x, y, color, alpha]: LayerRow): CountLayer {
  return {
    src: `${IMG}${file}`,
    w,
    h,
    x,
    y,
    ...(color ? { color } : {}),
    ...(alpha !== undefined ? { alpha } : {}),
  };
}

/** `img_num_006` … `img_num_000`, tinted with `StyleColor`. */
const RINGS: LayerRow[] = [
  ["ring_000.png", 56, 69, 0, 0],
  ["ring_001.png", 60, 61, 0, 0],
  ["ring_002.png", 83, 83, 0, 0],
  ["ring_003.png", 104, 104, 0, 0],
  ["ring_004.png", 90, 90, 0, 0],
  ["ring_005.png", 93, 92, 0, 0],
  ["ring_006.png", 180, 177, 0, 0],
];

/** `img_num_0`: white at 0.502 alpha, not in the tint list. */
const RING_PLATE: LayerRow = ["ring_plate.png", 160, 160, 0, 0, null, 0.502];

const LIGHTNING: LayerRow[] = [
  RING_PLATE,
  ["icon_6.png", 98, 97, 0, 0, "rgb(186,162,218)"],
  ["thunder01_4.png", 89, 87, 0, 0],
  ["ring_001.png", 60, 61, 0, 0],
  ["ring_002.png", 82, 82, 0, 0, "rgb(188,163,222)"],
  ["ring_000.png", 61, 80, 0, 0, "rgb(188,163,221)"],
  ["icon_4.png", 9, 12, 0, -39, "rgb(182,156,218)"],
  ["thunder01_6.png", 14, 25, 0, 41.4, "rgb(183,156,218)"],
  ["icon_4.png", 8, 7, 8.2, 45, "rgb(183,156,218)"],
];

const WIND_50: LayerRow[] = [
  ["ring_plate.png", 160, 160, 3.2, -5.4, null, 0.502],
  ["icon_7.png", 120, 122, 3.2, -5.4],
  ["icon_5.png", 92, 92, 3.2, -5.4],
  ["icon_6.png", 98, 97, 3.2, -7.1, "rgb(74,242,221)"],
  ["icon_9.png", 68, 59, 1.7, -3.5],
  ["icon_11.png", 52, 100, 7.8, 5.6],
  ["icon_4.png", 9, 12, 3.9, -52.4, "rgb(77,240,221)"],
];

const WIND_100: LayerRow[] = [
  ["ring_plate.png", 160, 160, 3.2, -5.4, null, 0.502],
  ["icon_7.png", 120, 122, 3.2, -5.4],
  ["icon_5.png", 92, 92, 3.2, -5.4],
  ["icon_6.png", 98, 97, 3.2, -7.1, "rgb(74,242,221)"],
  ["icon_2.png", 28, 28, 3.2, -9.6],
  ["icon_9.png", 68, 59, 1.7, -3.5],
  ["icon_8.png", 52, 100, 7.8, 5.6],
  ["icon_4.png", 9, 12, 3.9, -52.4, "rgb(74,242,221)"],
];

/** Flower layer images share one 84×68 rect and overlap via transparency. */
const FLOWER_RECT = { w: 84, h: 68, x: 3.2, y: -5.4 };

function digitLayers(prefix: string, value: number): CountLayer[] {
  const digit = (n: number, x: number): CountLayer =>
    layer([`${prefix}_${String(n).padStart(2, "0")}.png`, 24, 48, x, 0]);
  // `setNum`: two digits put `img_num_1` at the handheld (-12, 0) position.
  if (value > 9) {
    return [digit(Math.floor(value / 10) % 10, -12), digit(value % 10, 12)];
  }
  return [digit(value, 0)];
}

function flowerLayers(
  state: ProfessionCountState,
  icons: (effectId: number) => FightResIcon | undefined,
): CountLayer[] {
  const subTypes = new Set<number>();
  let showBackground = false;
  for (const effectId of state.activeEffectIds) {
    const row = icons(effectId);
    if (row?.showType !== SHOW_FLOWER_LAYER) continue;
    showBackground = true;
    if (row.subType !== null) subTypes.add(row.subType);
  }
  const result: CountLayer[] = [];
  if (showBackground) {
    result.push({ src: `${IMG}flower_bg.png`, ...FLOWER_RECT });
  }
  for (const index of [1, 2, 3]) {
    if (subTypes.has(index)) {
      result.push({ src: `${IMG}flower_${index}.png`, ...FLOWER_RECT });
    }
  }
  return result;
}

/**
 * Layers to draw, bottom first, or `null` when the whole group is hidden.
 * `RefreshProfessionBuffTips` shows the row of the latest
 * `SetProfessionBuff`; a zero layer hides everything except the flower
 * layer, which stays while any tracked buff still has layers.
 */
export function professionCountLayers(
  state: ProfessionCountState | null | undefined,
  icons: (effectId: number) => FightResIcon | undefined = getFightResIcon,
): CountLayer[] | null {
  if (!state) return null;
  const row = icons(state.effectId);
  if (!row) return null;

  if (row.showType === SHOW_FLOWER_LAYER) {
    if (!state.anyLayer) return null;
    return flowerLayers(state, icons);
  }
  if (state.layer <= 0) return null;
  const value = row.max === null ? state.layer : Math.min(state.layer, row.max);

  switch (row.showType) {
    case SHOW_NORMAL: {
      const color = row.color ?? "#ffffff";
      return [
        ...(row.digits ? digitLayers(row.digits, value) : []),
        layer(RING_PLATE),
        ...RINGS.map(([file, w, h, x, y]) => layer([file, w, h, x, y, color])),
      ];
    }
    case SHOW_SPECIAL_NUM:
      return [
        ...(row.digits ? digitLayers(row.digits, value) : []),
        ...LIGHTNING.map(layer),
      ];
    case SHOW_SPECIAL:
      return (value === 1 ? WIND_50 : WIND_100).map(layer);
    case SHOW_RATING: {
      const frame =
        value === row.max
          ? "main_axe_frame_s.png"
          : "main_axe_frame_normal.png";
      return [
        layer([frame, 174, 174, 0, 0]),
        layer([`main_axe_gray_${value}.png`, 70, 158, 0, 0]),
        layer([`main_axe_${value}.png`, 70, 158, 0, 0]),
      ];
    }
    default:
      return null;
  }
}
