/**
 * Prefab geometry of each class's weapon resource bar (`main_*_tpl`), in the
 * prefab's own pixels with the root node's top-left as origin. The numbers come
 * from the reference pages in `StarResonanceTool-main/分析/资源栏` (measured from
 * the RectTransforms); the logic that drives them lives in `resource-bar.ts`.
 */
import type { TemplateResource } from "./resource-bar";

export type Rect = { x: number; y: number; w: number; h: number };

/** Dark frame plus the coloured bar a buff timer reveals from the left. */
export type BarFrame = { rect: Rect; off: string; on: string };

export type DotRowLayout = {
  /** Top-left of the `dot` node in root coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Right edges of `battle_res_bean_1..6`; each bean is 26×26. */
  anchors: readonly number[];
  on: string;
  off: string;
};

export type AxeBallLayout = {
  rect: Rect;
  background: string;
  light: string;
  adorn: string;
};

export type GuitarLayout = {
  /** `line_root`: lightning groove with the dark plate covering `1 - progress`. */
  track: Rect;
  lightning: string;
  plate: string;
  midLine: string;
};

export type SiderLineLayout = {
  /** Section size; children are placed relative to its top-left. */
  w: number;
  h: number;
  bar: Rect;
  icon: Rect & { image: string };
  num: Rect;
};

export type ResourceBarLayout = {
  root: { w: number; h: number };
  frame: BarFrame;
  /** Beast-contract frames that replace `frame` (marksman wolf / hawk). */
  beastFrames?: { wolf: BarFrame; hawk: BarFrame };
  /** Energy groove (`img_*_bar`). Absent when the class has no plain Line bar. */
  inner?: Rect & { background?: string };
  progress: Rect;
  dots: DotRowLayout;
  /** Frost mage's right-end crystal, shown while a BarEffect buff is on. */
  gem?: Rect & { image: string };
  axeBall?: AxeBallLayout;
  guitar?: GuitarLayout;
  siderLine?: SiderLineLayout;
  /**
   * Resources drawn although the template does not list them. Stormblade's
   * template has empty `ResIDs`, so the game hides its text and marks; the
   * user asked to keep showing them in the game's style.
   */
  supplementResources?: readonly TemplateResource[];
};

const IMG = "/images/fight_res/";

function img(name: string): string {
  return `${IMG}${name}.png`;
}

function frame(prefix: string, rect: Rect, suffix = "bar_"): BarFrame {
  return {
    rect,
    off: img(`main_${prefix}_${suffix}off`),
    on: img(`main_${prefix}_${suffix}on`),
  };
}

const PROGRESS: Rect = { x: 0, y: -10, w: 178, h: 30 };
const DOT_ROW = { x: -4, y: 44, w: 232, h: 26 };
const ANCHORS_18 = [26, 44, 62, 80, 98, 116] as const;
const ANCHORS_20 = [26, 46, 66, 86, 106, 126] as const;
const ANCHORS_17 = [26, 43, 60, 77, 94, 111] as const;

function dots(
  bean: string,
  anchors: readonly number[],
  x = DOT_ROW.x,
): DotRowLayout {
  return {
    ...DOT_ROW,
    x,
    anchors,
    on: img(`main_${bean}_on`),
    off: img(`main_${bean}_off`),
  };
}

export const RESOURCE_BAR_LAYOUTS: Record<string, ResourceBarLayout> = {
  stormblade: {
    root: { w: 240, h: 70 },
    frame: frame("thunder", { x: -2, y: 10, w: 238, h: 36 }),
    inner: { x: 34, y: 24, w: 178, h: 8 },
    progress: PROGRESS,
    dots: dots("thunder", ANCHORS_18),
    supplementResources: [
      { id: 12051, name: "刀意", ui: "line", openBuff: 0 },
      { id: 12041, name: "雷之印", ui: "dot", openBuff: 0 },
    ],
  },
  frost_mage: {
    root: { w: 240, h: 70 },
    frame: frame("snow", { x: -5, y: 4, w: 238, h: 52 }),
    inner: { x: 26, y: 26, w: 160, h: 8 },
    progress: PROGRESS,
    dots: dots("snow", ANCHORS_20),
    gem: { x: 197, y: 17, w: 26, h: 26, image: img("main_snow_circle_on") },
  },
  flame_berserker: {
    root: { w: 240, h: 70 },
    frame: frame("axe", { x: -3.4, y: -5.5, w: 226, h: 46 }),
    inner: { x: 25.5, y: 23.8, w: 162, h: 8 },
    progress: { x: -2.5, y: -11.2, w: 160, h: 30 },
    dots: dots("axe", ANCHORS_18),
    axeBall: {
      rect: { x: 255, y: -5, w: 66, h: 66 },
      background: img("main_axe_frame_1"),
      light: img("main_axe_frame_2"),
      adorn: img("main_axe_adorn"),
    },
  },
  wind_knight: {
    root: { w: 250, h: 70 },
    frame: frame("lance", { x: 0, y: 8, w: 250, h: 42 }),
    inner: { x: 21, y: 25, w: 178, h: 8 },
    progress: PROGRESS,
    dots: dots("lance", ANCHORS_18, 1),
  },
  verdant_oracle: {
    root: { w: 246, h: 70 },
    frame: frame("milk", { x: 0, y: 6, w: 246, h: 46 }, ""),
    inner: { x: 34, y: 27, w: 178, h: 8 },
    progress: PROGRESS,
    dots: dots("flor", ANCHORS_17, -1),
  },
  heavy_guardian: {
    root: { w: 240, h: 70 },
    frame: frame("rock", { x: 2, y: 15, w: 236, h: 36 }),
    inner: { x: 35, y: 30, w: 158, h: 8 },
    progress: PROGRESS,
    dots: dots("rock", ANCHORS_18),
  },
  marksman: {
    root: { w: 240, h: 70 },
    frame: frame("shooter", { x: -2, y: 18, w: 226, h: 20 }, "nor_"),
    beastFrames: {
      wolf: frame("shooter", { x: 1, y: -10, w: 238, h: 52 }, "wolf_"),
      hawk: frame("shooter", { x: 1, y: -10, w: 238, h: 52 }, "hawk_"),
    },
    inner: {
      x: 13,
      y: 25,
      w: 196,
      h: 6,
      background: "rgba(46, 46, 46, 0.969)",
    },
    progress: PROGRESS,
    dots: dots("arrow", ANCHORS_20),
  },
  shield_knight: {
    root: { w: 240, h: 70 },
    frame: frame("sword", { x: 0, y: 0, w: 240, h: 58 }, ""),
    inner: { x: 16, y: 25, w: 178, h: 8 },
    progress: PROGRESS,
    dots: dots("holy", ANCHORS_17),
    // Prefab offsets (-273,-266) bar, (-283.4,-220) icon, (-333,-164.4) text,
    // rebased onto the text's left edge and the bar's top edge.
    siderLine: {
      w: 160,
      h: 131.6,
      bar: { x: 60, y: 0, w: 40, h: 108 },
      icon: { x: 49.6, y: 46, w: 16, h: 16, image: img("main_holy_on") },
      num: { x: 0, y: 101.6, w: 160, h: 30 },
    },
  },
  beat_performer: {
    root: { w: 240, h: 70 },
    frame: frame("guitar", { x: 0, y: 0, w: 240, h: 48 }),
    progress: { x: 0, y: -17.5, w: 178, h: 30 },
    dots: dots("guitar", [26, 42, 58, 74, 90, 106]),
    guitar: {
      track: { x: 14, y: 15, w: 198, h: 20 },
      lightning: img("fx_t_guitar_icon_001_bar"),
      plate: img("main_guitar_plate"),
      midLine: img("com_base_0px"),
    },
  },
};

export function getResourceBarLayout(
  classKey: string,
): ResourceBarLayout | undefined {
  return RESOURCE_BAR_LAYOUTS[classKey];
}

/** Bounding box of the bar part (everything except the dot row). */
export function barPartBounds(layout: ResourceBarLayout): Rect {
  const rects: Rect[] = [layout.frame.rect, layout.progress];
  if (layout.beastFrames) {
    rects.push(layout.beastFrames.wolf.rect, layout.beastFrames.hawk.rect);
  }
  if (layout.inner) rects.push(layout.inner);
  if (layout.gem) rects.push(layout.gem);
  if (layout.axeBall) rects.push(layout.axeBall.rect);
  if (layout.guitar) rects.push(layout.guitar.track);
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
