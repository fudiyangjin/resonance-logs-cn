/**
 * Weapon resource bar state, following `fighter_battle_res_*.lua`.
 *
 * Each class's `FightResAttrTemplateTable` row (generated into
 * `fight_res_templates.json`) lists its resources with a UI type and an unlock
 * buff, plus `EffectShowBuff` rows whose buff timers drive the coloured bar.
 * Pure functions only: the overlay components feed live maps in.
 */
import type { BuffUpdateState } from "$lib/bindings";
import type { BarMotion } from "$lib/bar-motion";
import type { AppLocale } from "$lib/i18n/index.svelte";
import fightResTemplatesRaw from "$lib/config/fight_res_templates.json";
import fightResExactValuesRaw from "$lib/config/fight_res_exact_values.json";
import { getResourceBarLayout } from "./resource-bar-layouts";

/** `E.ResUIType` (Dot 1, Line 2, Guitar 3, SiderLine 4, AxeBall 5). */
export type ResourceUiType =
  | "line"
  | "dot"
  | "guitar"
  | "siderLine"
  | "axeBall";

export type TemplateResource = {
  id: number;
  /** `FightResAttrTable` name (zh); see {@link fightResName}. */
  name: string;
  ui: ResourceUiType;
  /** Buff that must be on the player for the resource to show; 0 = always. */
  openBuff: number;
};

/** `E.PlayerBattleResType`: 0 BarEffect, 1 Bar, 2 DotEffect. */
export type EffectShowBuffRow = { type: number; buffId: number };

export type FightResTemplate = {
  templateId: number;
  resources: TemplateResource[];
  effectShowBuff: EffectShowBuffRow[];
};

/** `RES_MAX_ID_OFFSET`: the cap of resource `id` is attribute `id + 6`. */
export const RES_MAX_ID_OFFSET = 6;
/** `maxBeanNum_`: beyond this cap the row collapses to one bean plus `xN`. */
export const MAX_BEANS = 6;

export const EFFECT_BAR_EFFECT = 0;
export const EFFECT_BAR = 1;
export const EFFECT_DOT_EFFECT = 2;

/** Marksman beast contracts that swap the bar frame; wolf is checked first. */
export const WOLF_CONTRACT_BUFF = 2203040;
export const HAWK_CONTRACT_BUFF = 2203290;

const FIGHT_RES_TEMPLATES = fightResTemplatesRaw as Record<
  string,
  FightResTemplate
>;
const EXACT_VALUES = fightResExactValuesRaw as Record<string, number>;
const LOCALIZED_NAMES = import.meta.glob("./config/*/fight_res_names.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, string> | undefined>;

/** Display name of a resource in `locale`, the table name otherwise. */
export function fightResName(
  resource: Pick<TemplateResource, "id" | "name">,
  locale: AppLocale,
): string {
  const names = LOCALIZED_NAMES[`./config/${locale}/fight_res_names.json`];
  return names?.[String(resource.id)] ?? resource.name;
}

/** Every resource of every class template, for id lookups. */
export function allFightResources(): TemplateResource[] {
  return Object.keys(FIGHT_RES_TEMPLATES).flatMap(
    (classKey) => getFightResTemplate(classKey)?.resources ?? [],
  );
}

/** The class template with the layout's supplementary resources appended. */
export function getFightResTemplate(
  classKey: string,
): FightResTemplate | undefined {
  const template = FIGHT_RES_TEMPLATES[classKey];
  if (!template) return undefined;
  const supplement = getResourceBarLayout(classKey)?.supplementResources;
  if (!supplement?.length) return template;
  return { ...template, resources: [...template.resources, ...supplement] };
}

/**
 * Display value of a fight resource attribute: `floor(raw / ExactValue)` when
 * the table scales it, the raw value otherwise. `null` until received.
 */
export function resourceValue(
  fightResMap: ReadonlyMap<number, number>,
  resourceId: number,
): number | null {
  const raw = fightResMap.get(resourceId);
  if (raw === undefined) return null;
  const exact = EXACT_VALUES[String(resourceId)] ?? 1;
  return exact > 1 ? Math.floor(raw / exact) : raw;
}

export type ResolvedResource = TemplateResource & {
  now: number;
  max: number;
  /** Either attribute has arrived from the server. */
  received: boolean;
  open: boolean;
};

export type ResolvedResourceBar = {
  resources: ResolvedResource[];
  /** UI types with at least one open resource (`TypeOpen`). */
  typeOpen: ReadonlySet<ResourceUiType>;
  /** Buff currently owning the coloured bar, if any. */
  barBuff: BuffUpdateState | null;
  barEffectOpen: boolean;
  dotEffectOpen: boolean;
};

function isUnlocked(
  openBuff: number,
  buffMap: ReadonlyMap<number, BuffUpdateState>,
): boolean {
  return openBuff === 0 || buffMap.has(openBuff);
}

/**
 * The first `EffectShowBuff` row of `type` whose buff is on, in table order:
 * `OnBuffChange` only replaces a type's entry while it is still closed.
 */
export function firstPresentEffect(
  rows: readonly EffectShowBuffRow[],
  type: number,
  buffMap: ReadonlyMap<number, BuffUpdateState>,
): BuffUpdateState | null {
  for (const row of rows) {
    if (row.type !== type) continue;
    const buff = buffMap.get(row.buffId);
    if (buff) return buff;
  }
  return null;
}

export function resolveResourceBar(
  template: FightResTemplate,
  fightResMap: ReadonlyMap<number, number>,
  buffMap: ReadonlyMap<number, BuffUpdateState>,
): ResolvedResourceBar {
  const typeOpen = new Set<ResourceUiType>();
  const resources = template.resources.map((resource) => {
    const now = resourceValue(fightResMap, resource.id);
    const max = resourceValue(fightResMap, resource.id + RES_MAX_ID_OFFSET);
    const open = isUnlocked(resource.openBuff, buffMap);
    if (open) typeOpen.add(resource.ui);
    return {
      ...resource,
      now: now ?? 0,
      max: max ?? 0,
      received: now !== null || max !== null,
      open,
    };
  });
  const rows = template.effectShowBuff;
  return {
    resources,
    typeOpen,
    barBuff: firstPresentEffect(rows, EFFECT_BAR, buffMap),
    barEffectOpen:
      firstPresentEffect(rows, EFFECT_BAR_EFFECT, buffMap) !== null,
    dotEffectOpen:
      firstPresentEffect(rows, EFFECT_DOT_EFFECT, buffMap) !== null,
  };
}

/**
 * The open resource of `ui` that refreshes last. `OnRefresh` walks `ResIDs` in
 * order and every open entry rewrites the same widget, so the last one wins
 * (beat performer's two Line resources share one bar).
 */
export function lastOpenResource(
  bar: ResolvedResourceBar,
  ui: ResourceUiType,
): ResolvedResource | null {
  let result: ResolvedResource | null = null;
  for (const resource of bar.resources) {
    if (resource.ui === ui && resource.open) result = resource;
  }
  return result;
}

export function resourceRatio(resource: { now: number; max: number }): number {
  if (!(resource.max > 0)) return 0;
  return Math.max(0, Math.min(1, resource.now / resource.max));
}

/**
 * `OnDisPlayProcess_1`: `Play(1 - elapsed / Duration, 0, remaining)`. The
 * table's fourth column is the string `"0"`/`"1"`, never equal to the number
 * 1 in Lua 5.3, so every bar drains towards 0. Without a buff (or a duration)
 * the bar stays at the activation `Play(0, 0, 0)`.
 */
export function barMotionOf(buff: BuffUpdateState | null): BarMotion {
  if (!buff || !(buff.durationMs > 0)) return { kind: "static", scale: 0 };
  return {
    kind: "countdown",
    deadlineMs: buff.createTimeMs + buff.durationMs,
    spanMs: buff.durationMs,
  };
}

export type DotSlots = {
  /** One entry per visible bean, left to right. */
  lit: boolean[];
  /** `lab_res_num`: `x{now}` once the cap exceeds six beans, else empty. */
  overflowText: string;
};

/**
 * `fighterBattleResDot.Refresh`. `allLit` mirrors `HideUIDotCd(true)`, which
 * sets every bean's `img_on` visible while the DotEffect buff is on.
 */
export function dotSlots(now: number, max: number, allLit = false): DotSlots {
  const cap = Math.max(0, Math.floor(max));
  const count = Math.max(0, Math.floor(now));
  if (cap > MAX_BEANS) {
    return { lit: [allLit || count > 0], overflowText: `x${count}` };
  }
  return {
    lit: Array.from({ length: cap }, (_, index) => allLit || index < count),
    overflowText: "",
  };
}

export type AxeBallView = {
  percent: number;
  fill: number;
  /** `img_adorn` shows only once the value reaches its cap. */
  full: boolean;
};

/** `fighterBattleResAxe.OnRefresh` for the AxeBall resource. */
export function axeBallView(now: number, max: number): AxeBallView {
  if (max === 0) return { percent: 0, fill: 0, full: false };
  return {
    percent: Math.floor((now / max) * 100),
    fill: Math.max(0, Math.min(1, now / max)),
    full: max <= now,
  };
}

export type ShooterForm = "normal" | "wolf" | "hawk";

/** `refreshDisplayEffect` picks the bar by wolf first, then hawk. */
export function shooterForm(
  buffMap: ReadonlyMap<number, BuffUpdateState>,
): ShooterForm {
  if (buffMap.has(WOLF_CONTRACT_BUFF)) return "wolf";
  if (buffMap.has(HAWK_CONTRACT_BUFF)) return "hawk";
  return "normal";
}

/**
 * Buffs the resource bar reads: unlock buffs, every `EffectShowBuff` row and
 * the marksman contracts. They must be published for the overlay to see them.
 */
export function getResourceBarBuffIds(classKey: string): number[] {
  const template = getFightResTemplate(classKey);
  if (!template) return [];
  const ids = new Set<number>();
  for (const resource of template.resources) {
    if (resource.openBuff !== 0) ids.add(resource.openBuff);
  }
  for (const row of template.effectShowBuff) ids.add(row.buffId);
  if (getResourceBarLayout(classKey)?.beastFrames) {
    ids.add(WOLF_CONTRACT_BUFF);
    ids.add(HAWK_CONTRACT_BUFF);
  }
  return [...ids].sort((left, right) => left - right);
}
