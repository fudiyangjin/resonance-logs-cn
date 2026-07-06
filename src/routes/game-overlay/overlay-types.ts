import type {
  OverlayPositions,
  PanelAttrConfig,
} from "$lib/settings-store";
import type { BuffCategoryKey } from "$lib/config/buff-name-table";

export type OverlayScaleKey =
  | "skillCdGroupScale"
  | "resourceGroupScale"
  | "textBuffPanelScale"
  | "panelAttrGroupScale"
  | "customPanelGroupScale"
  | "shieldDetailGroupScale";

export type SkillDisplay = {
  isActive: boolean;
  percent: number;
  text: string;
  chargesText?: string;
  usable: boolean;
  chargesAvailable?: number;
  maxCharges?: number;
};

export type BuffAlertState = {
  highlightColor: string;
  flash: boolean;
  flashIntervalMs: number;
  applyToProgress: boolean;
};

export type IconBuffDisplay = {
  baseId: number;
  name: string;
  spriteFile: string;
  text: string;
  layer: number;
  layoutKey?: string;
  categoryKey?: BuffCategoryKey;
  isPlaceholder?: boolean;
  specialImages?: string[];
  specialDisplayStyle?: "woodCounter";
  alert?: BuffAlertState | undefined;
};

export type SkillDurationState = {
  skillId: number;
  startedAtMs: number;
  durationMs: number;
  beginTime: number;
};

export type SkillDurationDisplay = {
  skillId: number;
  name: string;
  imagePath?: string;
  text: string;
  isPlaceholder?: boolean;
};

export type TextBuffRowDisplay = {
  key: string;
  label: string;
  valueText: string;
  metaText?: string | undefined;
  progressPercent: number;
  showProgress: boolean;
  isPlaceholder?: boolean | undefined;
  alert?: BuffAlertState | undefined;
};

export type TextBuffDisplay = TextBuffRowDisplay;

export type PanelAreaDisplayRow = {
  key: string;
  attr: PanelAttrConfig;
};

export type DragTarget =
  | {
      kind: "group";
      key: keyof Omit<
        OverlayPositions,
        "iconBuffPositions" | "skillDurationPositions" | "categoryIconPositions"
      >;
    }
  | { kind: "customPanelGroup"; groupId: string }
  | { kind: "iconBuff"; baseId: number }
  | { kind: "skillDuration"; skillId: number }
  | { kind: "categoryIcon"; categoryKey: BuffCategoryKey }
  | { kind: "buffGroup"; groupId: string }
  | { kind: "individualAllGroup" };

export type DragState = {
  target: DragTarget;
  startX: number;
  startY: number;
  startPos: { x: number; y: number };
};

export type ResizeTarget =
  | {
      kind: "group";
      key: OverlayScaleKey;
    }
  | { kind: "customPanelGroup"; groupId: string }
  | { kind: "iconBuff"; baseId: number }
  | { kind: "skillDuration"; skillId: number }
  | { kind: "categoryIcon"; categoryKey: BuffCategoryKey }
  | { kind: "buffGroup"; groupId: string }
  | { kind: "individualAllGroup" };

export type ResizeState = {
  target: ResizeTarget;
  startX: number;
  startY: number;
  startValue: number;
};

export type CustomPanelDisplayRow = TextBuffRowDisplay;
