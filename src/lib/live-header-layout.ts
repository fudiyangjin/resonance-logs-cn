export const HEADER_LAYOUT_COMPONENT_IDS = [
  "timer",
  "sceneName",
  "trainingDummyStatus",
  "totalDamage",
  "totalDps",
  "bossHealth",
  "navigationTabs",
  "controlButtons",
] as const;

export type HeaderLayoutMode = "classic" | "custom";
export type HeaderLayoutComponentId =
  (typeof HEADER_LAYOUT_COMPONENT_IDS)[number];
export type HeaderLayoutZone = "start" | "end";

export interface HeaderLayoutRow {
  id: string;
  zones: Record<HeaderLayoutZone, HeaderLayoutComponentId[]>;
}

export interface HeaderCustomLayout {
  rows: HeaderLayoutRow[];
  rowGap: number;
  itemGap: number;
}

export const HEADER_LAYOUT_COMPONENT_LABELS: Record<
  HeaderLayoutComponentId,
  string
> = {
  timer: "Timer",
  sceneName: "Scene Name",
  trainingDummyStatus: "Training Dummy Status",
  totalDamage: "Total Damage",
  totalDps: "Total DPS",
  bossHealth: "Boss Health",
  navigationTabs: "Navigation Tabs",
  controlButtons: "Control Buttons",
};

export const HEADER_LAYOUT_ZONE_LABELS: Record<HeaderLayoutZone, string> = {
  start: "Left",
  end: "Right",
};

export const HEADER_LAYOUT_ZONE_IDS: HeaderLayoutZone[] = ["start", "end"];

const VALID_COMPONENT_IDS = new Set<string>(HEADER_LAYOUT_COMPONENT_IDS);

function createZones(
  zones: Partial<Record<HeaderLayoutZone, HeaderLayoutComponentId[]>> = {},
): Record<HeaderLayoutZone, HeaderLayoutComponentId[]> {
  return {
    start: [...(zones.start ?? [])],
    end: [...(zones.end ?? [])],
  };
}

export const DEFAULT_HEADER_CUSTOM_LAYOUT: HeaderCustomLayout = {
  rowGap: 0,
  itemGap: 12,
  rows: [
    {
      id: "primary",
      zones: createZones({
        start: ["timer", "sceneName", "trainingDummyStatus"],
        end: ["controlButtons"],
      }),
    },
    {
      id: "stats",
      zones: createZones({
        start: ["totalDamage", "totalDps"],
        end: ["navigationTabs"],
      }),
    },
    {
      id: "boss",
      zones: createZones({
        start: ["bossHealth"],
      }),
    },
  ],
};

export function cloneHeaderCustomLayout(
  layout: HeaderCustomLayout = DEFAULT_HEADER_CUSTOM_LAYOUT,
): HeaderCustomLayout {
  const normalizedLayout = normalizeHeaderLayout(layout);
  return {
    rowGap: normalizedLayout.rowGap,
    itemGap: normalizedLayout.itemGap,
    rows: normalizedLayout.rows.map((row) => ({
      id: row.id,
      zones: createZones(row.zones),
    })),
  };
}

function isHeaderLayoutComponentId(
  componentId: unknown,
): componentId is HeaderLayoutComponentId {
  return (
    typeof componentId === "string" && VALID_COMPONENT_IDS.has(componentId)
  );
}

function normalizeGap(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(32, value))
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSourceZones(
  row: Record<string, unknown>,
): Record<HeaderLayoutZone, unknown[]> {
  const zones = row["zones"];
  if (isRecord(zones)) {
    return {
      start: Array.isArray(zones["start"]) ? zones["start"] : [],
      end: Array.isArray(zones["end"]) ? zones["end"] : [],
    };
  }

  return { start: [], end: [] };
}

export function normalizeHeaderLayout(
  layout: Partial<HeaderCustomLayout> | null | undefined,
  allowedComponents: HeaderLayoutComponentId[] = [
    ...HEADER_LAYOUT_COMPONENT_IDS,
  ],
): HeaderCustomLayout {
  const source = layout ?? DEFAULT_HEADER_CUSTOM_LAYOUT;
  const allowedSet = new Set(allowedComponents);
  const usedComponents = new Set<HeaderLayoutComponentId>();
  const sourceRows =
    isRecord(source) && Array.isArray(source["rows"])
      ? source["rows"]
      : DEFAULT_HEADER_CUSTOM_LAYOUT.rows;

  let rows = sourceRows
    .map((row, index): HeaderLayoutRow => {
      const sourceRow: Record<string, unknown> = isRecord(row) ? row : {};
      const sourceZones = getSourceZones(sourceRow);
      const zones = createZones();

      for (const zoneId of HEADER_LAYOUT_ZONE_IDS) {
        zones[zoneId] = sourceZones[zoneId].filter(
          (componentId): componentId is HeaderLayoutComponentId => {
            if (!isHeaderLayoutComponentId(componentId)) return false;
            if (!allowedSet.has(componentId)) return false;
            if (usedComponents.has(componentId)) return false;
            usedComponents.add(componentId);
            return true;
          },
        );
      }

      return {
        id:
          typeof sourceRow["id"] === "string" && sourceRow["id"]
            ? sourceRow["id"]
            : `row-${index + 1}`,
        zones,
      };
    })
    .filter((row) =>
      HEADER_LAYOUT_ZONE_IDS.some((zoneId) => row.zones[zoneId].length > 0),
    );

  const missingComponents = allowedComponents.filter(
    (componentId) => !usedComponents.has(componentId),
  );
  if (missingComponents.length > 0) {
    if (rows.length > 0) {
      rows[rows.length - 1]!.zones.start.push(...missingComponents);
    } else {
      rows.push({
        id: "unassigned",
        zones: createZones({ start: missingComponents }),
      });
    }
  }

  if (allowedSet.has("bossHealth") && usedComponents.has("bossHealth")) {
    rows = rows
      .map((row) => ({
        ...row,
        zones: createZones({
          start: row.zones.start.filter(
            (componentId) => componentId !== "bossHealth",
          ),
          end: row.zones.end.filter(
            (componentId) => componentId !== "bossHealth",
          ),
        }),
      }))
      .filter((row) =>
        HEADER_LAYOUT_ZONE_IDS.some((zoneId) => row.zones[zoneId].length > 0),
      );

    rows.push({
      id: "boss",
      zones: createZones({ start: ["bossHealth"] }),
    });
  }

  return {
    rowGap: normalizeGap(
      isRecord(source) ? source.rowGap : undefined,
      DEFAULT_HEADER_CUSTOM_LAYOUT.rowGap,
    ),
    itemGap: normalizeGap(
      isRecord(source) ? source.itemGap : undefined,
      DEFAULT_HEADER_CUSTOM_LAYOUT.itemGap,
    ),
    rows,
  };
}
