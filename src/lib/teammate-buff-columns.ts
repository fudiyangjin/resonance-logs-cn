/**
 * @file Pure helpers for the teammate buff matrix columns.
 *
 * A column is a single buff (`buff:<id>`) or a buff category
 * (`category:<key>`). The settings page and the overlay both take the
 * ordered column list from here. Per-column color overrides are stored
 * beside the column list, and any write that removes a column prunes them
 * in the same update.
 */
import type { BuffCategoryKey } from "./config/buff-name-table";
import type {
  MonsterMonitorConfig,
  TeammateBuffColumnKey,
  TeammateBuffColumnStyle,
  TeammateBuffColumnStyleMap,
} from "./settings-store";

type TeammateColumnConfig = Pick<
  MonsterMonitorConfig,
  "teammateBuffIds" | "teammateBuffCategories" | "teammateBuffColumnOrder"
>;

type TeammateColumnSelection = Partial<
  Pick<MonsterMonitorConfig, "teammateBuffIds" | "teammateBuffCategories">
>;

export type TeammateColumnRef =
  | { key: TeammateBuffColumnKey; kind: "buff"; buffId: number }
  | {
      key: TeammateBuffColumnKey;
      kind: "category";
      categoryKey: BuffCategoryKey;
    };

/** A column's resolved colors. */
export type TeammateColumnColors = {
  progressColor: string;
  valueColor: string;
};

export function teammateBuffColumnKey(buffId: number): TeammateBuffColumnKey {
  return `buff:${buffId}`;
}

export function teammateCategoryColumnKey(
  categoryKey: BuffCategoryKey,
): TeammateBuffColumnKey {
  return `category:${categoryKey}`;
}

/**
 * The configured columns in their saved order. Columns missing from the
 * saved order follow in configuration order; duplicates and stale keys are
 * dropped.
 */
export function orderedTeammateColumns(
  config: TeammateColumnConfig,
): TeammateColumnRef[] {
  const columns: TeammateColumnRef[] = [
    ...(config.teammateBuffIds ?? []).map(
      (buffId): TeammateColumnRef => ({
        key: teammateBuffColumnKey(buffId),
        kind: "buff",
        buffId,
      }),
    ),
    ...(config.teammateBuffCategories ?? []).map(
      (categoryKey): TeammateColumnRef => ({
        key: teammateCategoryColumnKey(categoryKey),
        kind: "category",
        categoryKey,
      }),
    ),
  ];
  const pending = new Map(columns.map((column) => [column.key, column]));
  const ordered: TeammateColumnRef[] = [];
  const take = (key: TeammateBuffColumnKey) => {
    const column = pending.get(key);
    if (!column) return;
    ordered.push(column);
    pending.delete(key);
  };
  for (const key of config.teammateBuffColumnOrder ?? []) take(key);
  for (const column of columns) take(column.key);
  return ordered;
}

/** The saved column order reconciled with the configured columns. */
export function syncTeammateColumnOrder(
  config: TeammateColumnConfig,
): TeammateBuffColumnKey[] {
  return orderedTeammateColumns(config).map((column) => column.key);
}

function colorOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A stored column style with only its color fields; `undefined` if empty. */
export function ensureTeammateBuffColumnStyle(
  style: unknown,
): TeammateBuffColumnStyle | undefined {
  if (!style || typeof style !== "object") return undefined;
  const record = style as Record<string, unknown>;
  const progressColor = colorOrUndefined(record["progressColor"]);
  const valueColor = colorOrUndefined(record["valueColor"]);
  if (progressColor === undefined && valueColor === undefined) {
    return undefined;
  }
  return {
    ...(progressColor !== undefined ? { progressColor } : {}),
    ...(valueColor !== undefined ? { valueColor } : {}),
  };
}

const COLUMN_STYLE_FIELDS = ["progressColor", "valueColor"] as const;

/** True when `stored` is already exactly the normalized color fields. */
function columnStyleFieldsMatch(
  stored: unknown,
  normalized: TeammateBuffColumnStyle,
): boolean {
  if (!stored || typeof stored !== "object") return false;
  const record = stored as Record<string, unknown>;
  const storedKeys = Object.keys(record);
  const expectedKeys = COLUMN_STYLE_FIELDS.filter(
    (field) => normalized[field] !== undefined,
  );
  return (
    storedKeys.length === expectedKeys.length &&
    expectedKeys.every((field) => record[field] === normalized[field])
  );
}

/**
 * Column styles of the given columns only, without empty entries.
 * Returns `styles` itself when that map is already in this shape.
 */
export function ensureTeammateBuffColumnStyles(
  styles: TeammateBuffColumnStyleMap | null | undefined,
  keys: Iterable<TeammateBuffColumnKey>,
): TeammateBuffColumnStyleMap {
  if (!styles || typeof styles !== "object") return {};
  const result: TeammateBuffColumnStyleMap = {};
  const kept = new Set<TeammateBuffColumnKey>();
  let unchanged = true;
  for (const key of keys) {
    const normalized = ensureTeammateBuffColumnStyle(styles[key]);
    if (!normalized) {
      if (Object.prototype.hasOwnProperty.call(styles, key)) unchanged = false;
      continue;
    }
    if (kept.has(key)) continue;
    kept.add(key);
    result[key] = normalized;
    if (!columnStyleFieldsMatch(styles[key], normalized)) unchanged = false;
  }
  if (unchanged) {
    for (const key of Object.keys(styles)) {
      if (!kept.has(key as TeammateBuffColumnKey)) {
        unchanged = false;
        break;
      }
    }
  }
  return unchanged ? styles : result;
}

/**
 * `styles` with `key`'s overrides patched, or removed by `null`. Never keeps
 * an empty entry, so a reset column leaves no trace in the profile.
 */
export function withTeammateBuffColumnStyle(
  styles: TeammateBuffColumnStyleMap | undefined,
  key: TeammateBuffColumnKey,
  patch: TeammateBuffColumnStyle | null,
): TeammateBuffColumnStyleMap {
  const { [key]: current, ...rest } = styles ?? {};
  const style =
    patch && ensureTeammateBuffColumnStyle({ ...current, ...patch });
  return style ? { ...rest, [key]: style } : rest;
}

/**
 * The update for a change of the configured columns: `selection` plus the
 * column order and styles reconciled with it, so removing a column also
 * drops its order slot and colors in the same write.
 */
export function patchTeammateColumns(
  state: TeammateColumnConfig &
    Pick<MonsterMonitorConfig, "teammateBuffColumnStyles">,
  selection: TeammateColumnSelection,
): TeammateColumnSelection &
  Required<
    Pick<
      MonsterMonitorConfig,
      "teammateBuffColumnOrder" | "teammateBuffColumnStyles"
    >
  > {
  const order = syncTeammateColumnOrder({ ...state, ...selection });
  return {
    ...selection,
    teammateBuffColumnOrder: order,
    teammateBuffColumnStyles: ensureTeammateBuffColumnStyles(
      state.teammateBuffColumnStyles,
      order,
    ),
  };
}

/** A column's colors: its own overrides, else the panel's. */
export function resolveTeammateColumnColors(
  styles: TeammateBuffColumnStyleMap | null | undefined,
  key: string,
  fallback: TeammateColumnColors,
): TeammateColumnColors {
  const style = ensureTeammateBuffColumnStyle(
    styles?.[key as TeammateBuffColumnKey],
  );
  if (!style) return fallback;
  return {
    progressColor: style.progressColor ?? fallback.progressColor,
    valueColor: style.valueColor ?? fallback.valueColor,
  };
}
