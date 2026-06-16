import type { MinimapBuffFact, MinimapEntity, MinimapSnapshot } from "$lib/api";
import type { MechanicRegion, MechanicRow } from "../../scene-types";
import {
  FLOOR_CORNER_CELLS,
  FLOOR_EDGE_MID_CELLS,
  RING_BANDS,
  cellRect,
  nearestFloorCell,
  yInArena,
  type FloorCell,
  type S3RaidArena,
} from "./arena";

const text = {
  ringInner: "电网内环",
  ringMid: "电网中环",
  ringOuter: "电网外环",
  electricNet: "电网",
  phaseCorner: "四角爆炸",
  phaseEdge: "边中爆炸",
  phase: "相位",
  topLeft: "左上",
  midLeft: "左中",
  bottomLeft: "左下",
  topRight: "右上",
  midRight: "右中",
  bottomRight: "右下",
  phaseMirage: "相位映射·幻",
  shareGroup: "分摊/衰减/分散",
  mirageShareGroup: "幻想分摊/衰减/分散",
  share: "分摊",
  mirageShare: "幻想分摊",
  decay: "衰减",
  mirageDecay: "幻想衰减",
  spread: "分散",
  mirageSpread: "幻想分散",
  causalJumpGroup: "神之刻度·因果折跃",
  causalJump: "因果折跃弹射",
  killMarkGroup: "累刎宣告",
  killMarkMirageGroup: "累刎宣告·幻",
  divineTrickKillMark: "神之诡谲·累刎宣告",
  killMark: "累刎宣告",
  divineTrickKillMarkMirage: "神之诡谲·累刎宣告·幻",
  presetReturn: "神之刻度·预置的归途",
  floorSuffix: "号地块",
} as const;

type RingSlot = keyof typeof RING_BANDS;

export type MechanicView = {
  regions: MechanicRegion[];
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
};

const ELECTRIC_NET_BY_SKILL: Record<number, { slot: RingSlot; label: string }> =
  {
    10310062: { slot: "inner", label: text.ringInner },
    10310063: { slot: "mid", label: text.ringMid },
    10310064: { slot: "outer", label: text.ringOuter },
  };

const PHASE_BUFFS: Record<
  number,
  { cells: FloorCell[]; label: string; colorSlot: number }
> = {
  829214: { cells: FLOOR_EDGE_MID_CELLS, label: text.phaseEdge, colorSlot: 4 },
  829215: { cells: FLOOR_CORNER_CELLS, label: text.phaseCorner, colorSlot: 3 },
};

const PHASE_MAPPING: Record<
  number,
  { cell: FloorCell; label: string; colorSlot: number }
> = {
  829327: { cell: "topLeft", label: text.topLeft, colorSlot: 0 },
  829328: { cell: "midLeft", label: text.midLeft, colorSlot: 1 },
  829329: { cell: "bottomLeft", label: text.bottomLeft, colorSlot: 2 },
  829330: { cell: "topRight", label: text.topRight, colorSlot: 3 },
  829331: { cell: "midRight", label: text.midRight, colorSlot: 4 },
  829332: { cell: "bottomRight", label: text.bottomRight, colorSlot: 5 },
};

const PRESET_RETURN_COUNT_BUFFS: Record<number, number> = {
  829372: 1,
  829373: 2,
  829374: 3,
};

const CALLOUT_BUFFS: Record<
  number,
  { group: string; label: string; colorSlot: number }
> = {
  829304: { group: text.shareGroup, label: text.share, colorSlot: 0 },
  829305: {
    group: text.mirageShareGroup,
    label: text.mirageShare,
    colorSlot: 3,
  },
  829306: { group: text.shareGroup, label: text.decay, colorSlot: 1 },
  829307: {
    group: text.mirageShareGroup,
    label: text.mirageDecay,
    colorSlot: 4,
  },
  829308: { group: text.shareGroup, label: text.spread, colorSlot: 2 },
  829309: {
    group: text.mirageShareGroup,
    label: text.mirageSpread,
    colorSlot: 5,
  },
  829316: { group: text.causalJumpGroup, label: text.causalJump, colorSlot: 4 },
  829323: {
    group: text.killMarkGroup,
    label: text.divineTrickKillMark,
    colorSlot: 0,
  },
  829324: { group: text.killMarkGroup, label: text.killMark, colorSlot: 1 },
  829326: {
    group: text.killMarkMirageGroup,
    label: text.divineTrickKillMarkMirage,
    colorSlot: 2,
  },
};

export function buildMechanicView(
  snapshot: MinimapSnapshot,
  displayName: (entity: MinimapEntity) => string,
  arena: S3RaidArena,
): MechanicView {
  const regions: MechanicRegion[] = [];
  const rows = new Map<string, MechanicRow>();
  const entityColorSlots = new Map<string, number>();
  const visibleEntities = snapshot.entities.filter((entity) =>
    yInArena(entity.y, arena),
  );
  const entitiesByUuid = new Map(
    snapshot.entities.map((entity) => [entity.entityUuid, entity]),
  );
  const buffsByTarget = groupBuffsByTarget(snapshot.buffs);

  if (arena !== "grid") {
    addRingSkillRegions(visibleEntities, regions, rows);
  }
  if (arena !== "ring") {
    addPhaseBuffs(
      snapshot,
      entitiesByUuid,
      regions,
      rows,
      entityColorSlots,
      displayName,
    );
    addPhaseMapping(
      snapshot,
      entitiesByUuid,
      regions,
      rows,
      entityColorSlots,
      displayName,
    );
    addPresetReturn(
      entitiesByUuid,
      buffsByTarget,
      regions,
      rows,
      entityColorSlots,
      displayName,
    );
    addCalloutRows(
      snapshot,
      entitiesByUuid,
      rows,
      entityColorSlots,
      displayName,
    );
  }

  return {
    regions: dedupeRegions(regions),
    rows: [...rows.values()],
    entityColorSlots,
  };
}

function groupBuffsByTarget(
  buffs: MinimapBuffFact[],
): Map<string, MinimapBuffFact[]> {
  const out = new Map<string, MinimapBuffFact[]>();
  for (const buff of buffs) {
    const list = out.get(buff.targetEntityUuid) ?? [];
    list.push(buff);
    out.set(buff.targetEntityUuid, list);
  }
  return out;
}

function addRingSkillRegions(
  entities: MinimapEntity[],
  regions: MechanicRegion[],
  rows: Map<string, MechanicRow>,
) {
  for (const entity of entities) {
    const skillId = entity.currentSkillId ?? 0;
    const mapping = ELECTRIC_NET_BY_SKILL[skillId];
    if (!mapping) continue;
    const [rInner, rOuter] = RING_BANDS[mapping.slot];
    regions.push({
      kind: "ring",
      rInner,
      rOuter,
      colorSlot: 0,
    });
    upsertRow(rows, {
      key: `ring:${skillId}`,
      group: text.electricNet,
      label: mapping.label,
      colorSlot: 0,
      createTimeMs: 0,
      durationMs: 0,
      targets: [],
    });
  }
}

function addPhaseBuffs(
  snapshot: MinimapSnapshot,
  entitiesByUuid: Map<string, MinimapEntity>,
  regions: MechanicRegion[],
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
  displayName: (entity: MinimapEntity) => string,
) {
  for (const buff of snapshot.buffs) {
    const mapping = PHASE_BUFFS[buff.baseId];
    if (!mapping) continue;
    for (const cell of mapping.cells) {
      regions.push({
        kind: "rect",
        ...cellRect(cell),
        colorSlot: mapping.colorSlot,
      });
    }
    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (target) entityColorSlots.set(target.entityUuid, mapping.colorSlot);
    upsertRow(rows, {
      key: `phase:${buff.baseId}`,
      group: text.phase,
      label: mapping.label,
      colorSlot: mapping.colorSlot,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: target ? [displayName(target)] : [],
    });
  }
}

function addPhaseMapping(
  snapshot: MinimapSnapshot,
  entitiesByUuid: Map<string, MinimapEntity>,
  regions: MechanicRegion[],
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
  displayName: (entity: MinimapEntity) => string,
) {
  for (const buff of snapshot.buffs) {
    const mapping = PHASE_MAPPING[buff.baseId];
    if (!mapping) continue;
    regions.push({
      kind: "rect",
      ...cellRect(mapping.cell),
      colorSlot: mapping.colorSlot,
    });
    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (target) entityColorSlots.set(target.entityUuid, mapping.colorSlot);
    upsertRow(rows, {
      key: `phaseMapping:${buff.baseId}`,
      group: text.phaseMirage,
      label: mapping.label,
      colorSlot: mapping.colorSlot,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: target ? [displayName(target)] : [],
    });
  }
}

function addPresetReturn(
  entitiesByUuid: Map<string, MinimapEntity>,
  buffsByTarget: Map<string, MinimapBuffFact[]>,
  regions: MechanicRegion[],
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
  displayName: (entity: MinimapEntity) => string,
) {
  for (const [targetUuid, buffs] of buffsByTarget) {
    const linkBuff = buffs.find((buff) => buff.baseId === 829318);
    if (!linkBuff) continue;
    const countBuff = buffs.find(
      (buff) => PRESET_RETURN_COUNT_BUFFS[buff.baseId] !== undefined,
    );
    if (!countBuff) continue;

    const count = PRESET_RETURN_COUNT_BUFFS[countBuff.baseId];
    if (count === undefined) continue;

    const sourceEntity = linkBuff.fireUuid
      ? entitiesByUuid.get(linkBuff.fireUuid)
      : undefined;
    const cell = sourceEntity
      ? nearestFloorCell(sourceEntity.x, sourceEntity.z)
      : null;
    const colorSlot = count - 1;
    if (cell) {
      regions.push({
        kind: "rect",
        ...cellRect(cell),
        colorSlot,
        label: String(count),
      });
    }
    const target = entitiesByUuid.get(targetUuid);
    if (target) entityColorSlots.set(target.entityUuid, colorSlot);
    upsertRow(rows, {
      key: `presetReturn:${count}:${cell ?? "unknown"}`,
      group: text.presetReturn,
      label: `${count}${text.floorSuffix}${cell ? "" : "?"}`,
      colorSlot,
      createTimeMs: Math.min(linkBuff.createTimeMs, countBuff.createTimeMs),
      durationMs: Math.max(linkBuff.durationMs, countBuff.durationMs),
      targets: target ? [displayName(target)] : [],
    });
  }
}

function addCalloutRows(
  snapshot: MinimapSnapshot,
  entitiesByUuid: Map<string, MinimapEntity>,
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
  displayName: (entity: MinimapEntity) => string,
) {
  for (const buff of snapshot.buffs) {
    const mapping = CALLOUT_BUFFS[buff.baseId];
    if (!mapping) continue;
    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (target) entityColorSlots.set(target.entityUuid, mapping.colorSlot);
    upsertRow(rows, {
      key: `callout:${buff.baseId}:${buff.layer}`,
      group: mapping.group,
      label:
        buff.baseId === 829324
          ? `${mapping.label} x${buff.layer}`
          : mapping.label,
      colorSlot: mapping.colorSlot,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: target ? [displayName(target)] : [],
    });
  }
}

function upsertRow(rows: Map<string, MechanicRow>, next: MechanicRow) {
  const existing = rows.get(next.key);
  if (!existing) {
    rows.set(next.key, { ...next, targets: [...next.targets] });
    return;
  }
  existing.createTimeMs =
    existing.createTimeMs <= 0
      ? next.createTimeMs
      : Math.min(existing.createTimeMs, next.createTimeMs);
  existing.durationMs = Math.max(existing.durationMs, next.durationMs);
  for (const target of next.targets) {
    if (!existing.targets.includes(target)) existing.targets.push(target);
  }
}

function dedupeRegions(regions: MechanicRegion[]): MechanicRegion[] {
  const seen = new Set<string>();
  const out: MechanicRegion[] = [];
  for (const region of regions) {
    const key =
      region.kind === "ring"
        ? `ring:${region.rInner}:${region.rOuter}:${region.colorSlot}`
        : `rect:${region.x}:${region.z}:${region.halfX}:${region.halfZ}:${region.colorSlot}:${region.label ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(region);
  }
  return out;
}
