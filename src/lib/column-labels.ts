export const DPS_PLAYER_COLUMN_KEYS = [
  "totalDmg",
  "dps",
  "tdps",
  "bossDmg",
  "bossDps",
  "dmgPct",
  "critRate",
  "critDmgRate",
  "luckyRate",
  "luckyDmgRate",
  "hits",
  "hitsPerMinute",
] as const;

export const DPS_SKILL_COLUMN_KEYS = [
  "totalDmg",
  "dps",
  "dmgPct",
  "critRate",
  "critDmgRate",
  "luckyRate",
  "luckyDmgRate",
  "hits",
  "hitsPerMinute",
  "avgDmg",
  "maxDmg",
  "minDmg",
] as const;

export type DpsPlayerColumnKey = (typeof DPS_PLAYER_COLUMN_KEYS)[number];
export type DpsSkillColumnKey = (typeof DPS_SKILL_COLUMN_KEYS)[number];

export type TableColumnLabels<Key extends string> = {
  first: string;
  columns: Record<Key, string>;
};

export type DpsColumnLabels = {
  live: {
    players: TableColumnLabels<DpsPlayerColumnKey>;
    skills: TableColumnLabels<DpsSkillColumnKey>;
  };
  history: {
    players: TableColumnLabels<DpsPlayerColumnKey>;
    skills: TableColumnLabels<DpsSkillColumnKey>;
  };
};

function createEmptyColumnMap<const Key extends string>(
  keys: readonly Key[],
): Record<Key, string> {
  return Object.fromEntries(keys.map((key) => [key, ""])) as Record<
    Key,
    string
  >;
}

function createEmptyTableLabels<const Key extends string>(
  keys: readonly Key[],
): TableColumnLabels<Key> {
  return {
    first: "",
    columns: createEmptyColumnMap(keys),
  };
}

export function createDefaultDpsColumnLabels(): DpsColumnLabels {
  return {
    live: {
      players: createEmptyTableLabels(DPS_PLAYER_COLUMN_KEYS),
      skills: createEmptyTableLabels(DPS_SKILL_COLUMN_KEYS),
    },
    history: {
      players: createEmptyTableLabels(DPS_PLAYER_COLUMN_KEYS),
      skills: createEmptyTableLabels(DPS_SKILL_COLUMN_KEYS),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTableColumnLabels<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
): TableColumnLabels<Key> {
  const source = isRecord(value) ? value : {};
  const sourceColumns = isRecord(source["columns"]) ? source["columns"] : {};
  const columns = createEmptyColumnMap(keys);

  for (const key of keys) {
    const candidate = sourceColumns[key];
    if (typeof candidate === "string") {
      columns[key] = candidate;
    }
  }

  return {
    first: typeof source["first"] === "string" ? source["first"] : "",
    columns,
  };
}

export function normalizeDpsColumnLabels(value: unknown): DpsColumnLabels {
  const source = isRecord(value) ? value : {};
  const live = isRecord(source["live"]) ? source["live"] : {};
  const history = isRecord(source["history"]) ? source["history"] : {};

  return {
    live: {
      players: normalizeTableColumnLabels(
        live["players"],
        DPS_PLAYER_COLUMN_KEYS,
      ),
      skills: normalizeTableColumnLabels(live["skills"], DPS_SKILL_COLUMN_KEYS),
    },
    history: {
      players: normalizeTableColumnLabels(
        history["players"],
        DPS_PLAYER_COLUMN_KEYS,
      ),
      skills: normalizeTableColumnLabels(
        history["skills"],
        DPS_SKILL_COLUMN_KEYS,
      ),
    },
  };
}

export function resolveColumnLabel(
  override: string | null | undefined,
  localizedFallback: string,
): string {
  return override?.trim() || localizedFallback;
}
