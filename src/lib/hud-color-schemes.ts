/**
 * @file Curated HUD color schemes: name / value / progress colors (and the
 * progress opacity) for every HUD text panel. A scheme only ever touches
 * those color keys; sizes, gaps, background and shadow switches, alert
 * highlights and per-buff column overrides are the user's and stay put.
 *
 * A leaf module (type-only imports) so `settings-store` can build its
 * reference profiles from it. Callers pass already-normalized styles.
 */
import type { MessageKey } from "$lib/i18n/index.svelte";
import type {
  BuffCoverageStyle,
  CustomPanelGroup,
  CustomPanelStyle,
  MonsterMonitorConfig,
  TextBuffPanelStyle,
} from "./settings-store";

export type PanelColors = {
  nameColor: string;
  valueColor: string;
  progressColor: string;
  progressOpacity: number;
};

export const SKILL_HUD_PANELS = [
  "textBuff",
  "buffCoverage",
  "customGroup",
] as const;

export const MONSTER_HUD_PANELS = [
  "monsterBuff",
  "teammate",
  "teammateCd",
  "hate",
  "fantasy",
  "bossDbm",
  "stun",
  "hp",
  "entityDuration",
  "monsterSkill",
  "roster",
] as const;

export type SkillHudPanel = (typeof SKILL_HUD_PANELS)[number];
export type MonsterHudPanel = (typeof MONSTER_HUD_PANELS)[number];
export type HudPanelKey = SkillHudPanel | MonsterHudPanel;

/** Panels whose colors carry meaning (HP is red, stagger is blue, …): every
 * scheme keeps the vivid colors for them. */
export const SEMANTIC_HUD_PANELS: readonly HudPanelKey[] = [
  "hp",
  "roster",
  "stun",
  "bossDbm",
];

export const MONSTER_PANEL_STYLE_KEYS = {
  monsterBuff: "panelStyle",
  teammate: "teammatePanelStyle",
  teammateCd: "teammateCdPanelStyle",
  hate: "hatePanelStyle",
  fantasy: "fantasyPanelStyle",
  bossDbm: "bossDbmPanelStyle",
  stun: "stunPanelStyle",
  hp: "hpPanelStyle",
  entityDuration: "entityDurationPanelStyle",
  monsterSkill: "monsterSkillPanelStyle",
  roster: "rosterPanelStyle",
} as const satisfies Record<MonsterHudPanel, keyof MonsterMonitorConfig>;

export type MonsterPanelStyleKey =
  (typeof MONSTER_PANEL_STYLE_KEYS)[MonsterHudPanel];

export const HUD_COLOR_SCHEME_IDS = [
  "vivid",
  "ice",
  "amber",
  "jade",
  "violet",
  "muted",
] as const;

export type HudColorSchemeId = (typeof HUD_COLOR_SCHEME_IDS)[number];

export const DEFAULT_HUD_COLOR_SCHEME_ID: HudColorSchemeId = "vivid";

export type HudColorScheme = {
  id: HudColorSchemeId;
  nameKey: MessageKey;
  descriptionKey: MessageKey;
  panels: Record<HudPanelKey, PanelColors>;
  /** Custom panel group n uses entry `n % length`. */
  customGroups: readonly PanelColors[];
};

const VALUE = "#f8fafc";

function colors(
  nameColor: string,
  progressColor: string,
  progressOpacity = 0.4,
  valueColor = VALUE,
): PanelColors {
  return { nameColor, valueColor, progressColor, progressOpacity };
}

const VIVID_CUSTOM_GROUPS: readonly PanelColors[] = [
  colors("#bae6fd", "#38bdf8"),
  colors("#bbf7d0", "#22c55e"),
  colors("#fecdd3", "#fb7185"),
  colors("#fde68a", "#fbbf24"),
  colors("#ddd6fe", "#a78bfa"),
  colors("#a5f3fc", "#22d3ee"),
];

/** The colors the bundled loadout presets were designed with. */
const VIVID_PANELS: Record<HudPanelKey, PanelColors> = {
  textBuff: colors("#fde68a", "#67e8f9"),
  buffCoverage: colors("#e5e7eb", "#34d399", 0.4, "#6ee7b7"),
  customGroup: VIVID_CUSTOM_GROUPS[0]!,
  monsterBuff: colors("#a5f3fc", "#22d3ee"),
  teammate: colors("#bbf7d0", "#4ade80"),
  teammateCd: colors("#e2e8f0", "#94a3b8"),
  hate: colors("#fda4af", "#fb7185"),
  fantasy: colors("#ddd6fe", "#a78bfa"),
  bossDbm: colors("#fde68a", "#f59e0b", 0.38),
  stun: colors("#bfdbfe", "#60a5fa", 0.45),
  hp: colors("#fecaca", "#ef4444", 0.45),
  entityDuration: colors("#99f6e4", "#2dd4bf"),
  monsterSkill: colors("#fed7aa", "#fb923c"),
  roster: colors("#fecaca", "#ef4444", 0.45),
};

/** One hue for every panel except the semantic ones. */
function singleHuePanels(panel: PanelColors): Record<HudPanelKey, PanelColors> {
  const result = {} as Record<HudPanelKey, PanelColors>;
  for (const key of [...SKILL_HUD_PANELS, ...MONSTER_HUD_PANELS]) {
    result[key] = SEMANTIC_HUD_PANELS.includes(key) ? VIVID_PANELS[key] : panel;
  }
  return result;
}

function singleHueScheme(
  id: HudColorSchemeId,
  panel: PanelColors,
): HudColorScheme {
  return {
    id,
    nameKey: `hudScheme.scheme.${id}.name` as MessageKey,
    descriptionKey: `hudScheme.scheme.${id}.description` as MessageKey,
    panels: singleHuePanels(panel),
    customGroups: [panel],
  };
}

export const HUD_COLOR_SCHEMES: readonly HudColorScheme[] = [
  {
    id: "vivid",
    nameKey: "hudScheme.scheme.vivid.name",
    descriptionKey: "hudScheme.scheme.vivid.description",
    panels: VIVID_PANELS,
    customGroups: VIVID_CUSTOM_GROUPS,
  },
  singleHueScheme("ice", colors("#bae6fd", "#38bdf8")),
  singleHueScheme("amber", colors("#fde68a", "#fbbf24")),
  singleHueScheme("jade", colors("#a7f3d0", "#34d399")),
  singleHueScheme("violet", colors("#ddd6fe", "#a78bfa")),
  singleHueScheme("muted", colors("#cbd5e1", "#94a3b8", 0.35, "#f1f5f9")),
];

export function getHudColorScheme(id: string): HudColorScheme {
  return (
    HUD_COLOR_SCHEMES.find((scheme) => scheme.id === id) ??
    HUD_COLOR_SCHEMES[0]!
  );
}

/** Every scheme color once, plus plain white / black, for color pickers. */
export const HUD_SCHEME_SWATCHES: readonly string[] = (() => {
  const seen = new Set<string>();
  for (const scheme of HUD_COLOR_SCHEMES) {
    const all = [...Object.values(scheme.panels), ...scheme.customGroups];
    for (const panel of all) {
      seen.add(panel.nameColor);
      seen.add(panel.progressColor);
    }
  }
  return [...seen, "#ffffff", VALUE, "#000000"];
})();

export type PanelColorPatch = Partial<PanelColors>;

/** The color keys a scheme writes into one panel's style. */
export function schemePatch(
  scheme: HudColorScheme,
  panel: HudPanelKey,
  groupIndex = 0,
): PanelColorPatch {
  if (panel === "teammateCd") {
    return { nameColor: scheme.panels.teammateCd.nameColor };
  }
  if (panel === "fantasy") {
    // The fantasy panel draws no progress bar.
    const { nameColor, valueColor } = scheme.panels.fantasy;
    return { nameColor, valueColor };
  }
  if (panel === "customGroup") {
    const groups = scheme.customGroups;
    const index =
      ((groupIndex % groups.length) + groups.length) % groups.length;
    return { ...groups[index]! };
  }
  return { ...scheme.panels[panel] };
}

function sameColor(a: unknown, b: unknown): boolean {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    a.toLowerCase() === b.toLowerCase()
  );
}

/** True when `style` already holds every color of `patch`. */
export function matchesPatch(
  style: Partial<PanelColors> | null | undefined,
  patch: PanelColorPatch,
): boolean {
  if (!style) return false;
  return (Object.keys(patch) as (keyof PanelColors)[]).every((key) =>
    key === "progressOpacity"
      ? Math.abs(Number(style[key]) - Number(patch[key])) < 0.005
      : sameColor(style[key], patch[key]),
  );
}

export type SkillSchemeStyles = {
  textBuffPanelStyle: TextBuffPanelStyle;
  buffCoverageStyle: BuffCoverageStyle;
  customPanelGroups: CustomPanelGroup[];
  /** Fallback style of groups without their own; only patched if present. */
  customPanelStyle?: CustomPanelStyle | undefined;
};

export function applySchemeToSkillStyles(
  styles: SkillSchemeStyles,
  scheme: HudColorScheme,
): SkillSchemeStyles {
  const result: SkillSchemeStyles = {
    textBuffPanelStyle: {
      ...styles.textBuffPanelStyle,
      ...schemePatch(scheme, "textBuff"),
    },
    buffCoverageStyle: {
      ...styles.buffCoverageStyle,
      ...schemePatch(scheme, "buffCoverage"),
    },
    customPanelGroups: styles.customPanelGroups.map((group, index) => ({
      ...group,
      style: { ...group.style, ...schemePatch(scheme, "customGroup", index) },
    })),
  };
  if (styles.customPanelStyle) {
    result.customPanelStyle = {
      ...styles.customPanelStyle,
      ...schemePatch(scheme, "customGroup", 0),
    };
  }
  return result;
}

export type MonsterSchemeStyles = Pick<
  MonsterMonitorConfig,
  MonsterPanelStyleKey
>;

export function applySchemeToMonsterStyles(
  styles: MonsterSchemeStyles,
  scheme: HudColorScheme,
): MonsterSchemeStyles {
  const result = { ...styles };
  for (const panel of MONSTER_HUD_PANELS) {
    const key = MONSTER_PANEL_STYLE_KEYS[panel];
    // Each key holds its own style type; the patch only carries color keys
    // that style already has.
    (result as Record<string, unknown>)[key] = {
      ...styles[key],
      ...schemePatch(scheme, panel),
    };
  }
  return result;
}

/**
 * The scheme most of the profile's skill panels follow, for coloring a new
 * panel group; vivid when none matches. Schemes share some colors (vivid's
 * first group is ice's blue), so every panel votes instead of the first one.
 */
export function inferSkillSchemeId(styles: {
  textBuffPanelStyle?: Partial<PanelColors> | undefined;
  buffCoverageStyle?: Partial<PanelColors> | undefined;
  customPanelGroups?: readonly { style?: Partial<PanelColors> }[] | undefined;
}): HudColorSchemeId {
  let best: HudColorSchemeId = DEFAULT_HUD_COLOR_SCHEME_ID;
  let bestScore = 0;
  for (const scheme of HUD_COLOR_SCHEMES) {
    let score = 0;
    if (
      matchesPatch(styles.textBuffPanelStyle, schemePatch(scheme, "textBuff"))
    ) {
      score += 1;
    }
    if (
      matchesPatch(
        styles.buffCoverageStyle,
        schemePatch(scheme, "buffCoverage"),
      )
    ) {
      score += 1;
    }
    styles.customPanelGroups?.forEach((group, index) => {
      if (
        matchesPatch(group.style, schemePatch(scheme, "customGroup", index))
      ) {
        score += 1;
      }
    });
    if (score > bestScore) {
      best = scheme.id;
      bestScore = score;
    }
  }
  return best;
}

const WHITE = "#ffffff";

function isWhitePanel(style: Partial<PanelColors> | null | undefined): boolean {
  return (
    !!style &&
    sameColor(style.nameColor ?? WHITE, WHITE) &&
    sameColor(style.progressColor ?? WHITE, WHITE)
  );
}

/**
 * Panels still on the all-white built-in colors (white names on a white
 * bar). Panels without a bar (teammate CD, fantasy) are never listed: white
 * text alone reads fine. A custom panel group is listed once per group.
 */
export function listWhitePanels(
  skill: {
    textBuffPanelStyle?: Partial<PanelColors> | undefined;
    buffCoverageStyle?: Partial<PanelColors> | undefined;
    customPanelGroups?: readonly { style?: Partial<PanelColors> }[] | undefined;
  } | null,
  monster: Partial<Record<MonsterPanelStyleKey, Partial<PanelColors>>> | null,
): HudPanelKey[] {
  const result: HudPanelKey[] = [];
  if (skill) {
    // A profile without its own text-buff style renders the white default.
    if (!skill.textBuffPanelStyle || isWhitePanel(skill.textBuffPanelStyle)) {
      result.push("textBuff");
    }
    if (isWhitePanel(skill.buffCoverageStyle)) result.push("buffCoverage");
    for (const group of skill.customPanelGroups ?? []) {
      if (isWhitePanel(group.style)) result.push("customGroup");
    }
  }
  if (monster) {
    for (const panel of MONSTER_HUD_PANELS) {
      if (panel === "teammateCd" || panel === "fantasy") continue;
      if (isWhitePanel(monster[MONSTER_PANEL_STYLE_KEYS[panel]])) {
        result.push(panel);
      }
    }
  }
  return result;
}
