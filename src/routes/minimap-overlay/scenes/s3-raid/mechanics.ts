import type { MinimapBuffFact, MinimapEntity, MinimapSnapshot } from "$lib/api";
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import type { MechanicRegion, MechanicRow } from "../../scene-types";
import {
  FLOOR_CORNER_CELLS,
  FLOOR_EDGE_MID_CELLS,
  cellRect,
  nearestFloorCell,
  type FloorCell,
  type S3RaidArena,
} from "./arena";

const textKeys = {
  phaseCorner: "minimap.s3Raid.phase.corner",
  phaseEdge: "minimap.s3Raid.phase.edge",
  phase: "minimap.s3Raid.phase.group",
  topLeft: "minimap.s3Raid.floor.topLeft",
  midLeft: "minimap.s3Raid.floor.midLeft",
  bottomLeft: "minimap.s3Raid.floor.bottomLeft",
  topRight: "minimap.s3Raid.floor.topRight",
  midRight: "minimap.s3Raid.floor.midRight",
  bottomRight: "minimap.s3Raid.floor.bottomRight",
  phaseMirage: "minimap.s3Raid.phaseMirage",
  shareGroup: "minimap.s3Raid.shareGroup",
  mirageShareGroup: "minimap.s3Raid.mirageShareGroup",
  share: "minimap.s3Raid.share",
  mirageShare: "minimap.s3Raid.mirageShare",
  decay: "minimap.s3Raid.decay",
  mirageDecay: "minimap.s3Raid.mirageDecay",
  spread: "minimap.s3Raid.spread",
  mirageSpread: "minimap.s3Raid.mirageSpread",
  causalJumpGroup: "minimap.s3Raid.causalJump.group",
  causalJump: "minimap.s3Raid.causalJump.label",
  killMarkGroup: "minimap.s3Raid.killMark.group",
  killMarkMirageGroup: "minimap.s3Raid.killMark.mirageGroup",
  divineTrickKillMark: "minimap.s3Raid.killMark.divineTrick",
  killMark: "minimap.s3Raid.killMark.label",
  divineTrickKillMarkMirage: "minimap.s3Raid.killMark.divineTrickMirage",
  presetReturn: "minimap.s3Raid.presetReturn.group",
  floorSuffix: "minimap.s3Raid.presetReturn.floorSuffix",
  electromagneticPulseGroup: "minimap.s3Raid.electromagneticPulse.group",
  electromagneticPulseA: "minimap.s3Raid.electromagneticPulse.a",
  electromagneticPulseB: "minimap.s3Raid.electromagneticPulse.b",
  electromagneticPulseC: "minimap.s3Raid.electromagneticPulse.c",
  shareMirageGroup: "minimap.s3Raid.shareMirage.group",
  normalDecayGroup: "minimap.s3Raid.normalDecay.group",
  normalTarget: "minimap.s3Raid.normalDecay.normalTarget",
  decayTarget: "minimap.s3Raid.normalDecay.decayTarget",
  hitOrderGroup: "minimap.s3Raid.hitOrder.group",
  hitOrder1: "minimap.s3Raid.hitOrder.mark1",
  hitOrder2: "minimap.s3Raid.hitOrder.mark2",
  hitOrder3: "minimap.s3Raid.hitOrder.mark3",
} satisfies Record<string, MessageKey>;

export type MechanicView = {
  regions: MechanicRegion[];
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
};

const PHASE_BUFFS: Record<
  number,
  { cells: FloorCell[]; labelKey: MessageKey; colorSlot: number }
> = {
  829214: {
    cells: FLOOR_EDGE_MID_CELLS,
    labelKey: textKeys.phaseEdge,
    colorSlot: 4,
  },
  829215: {
    cells: FLOOR_CORNER_CELLS,
    labelKey: textKeys.phaseCorner,
    colorSlot: 3,
  },
};

const PHASE_MAPPING: Record<
  number,
  { cell: FloorCell; labelKey: MessageKey; colorSlot: number }
> = {
  829327: { cell: "topLeft", labelKey: textKeys.topLeft, colorSlot: 0 },
  829328: { cell: "midLeft", labelKey: textKeys.midLeft, colorSlot: 1 },
  829329: { cell: "bottomLeft", labelKey: textKeys.bottomLeft, colorSlot: 2 },
  829330: { cell: "topRight", labelKey: textKeys.topRight, colorSlot: 3 },
  829331: { cell: "midRight", labelKey: textKeys.midRight, colorSlot: 4 },
  829332: {
    cell: "bottomRight",
    labelKey: textKeys.bottomRight,
    colorSlot: 5,
  },
};

const PRESET_RETURN_COUNT_BUFFS: Record<number, number> = {
  829372: 1,
  829373: 2,
  829374: 3,
};

const CALLOUT_BUFFS: Record<
  number,
  { groupKey: MessageKey; labelKey: MessageKey; colorSlot: number }
> = {
  829104: {
    groupKey: textKeys.electromagneticPulseGroup,
    labelKey: textKeys.electromagneticPulseA,
    colorSlot: 0,
  },
  829105: {
    groupKey: textKeys.electromagneticPulseGroup,
    labelKey: textKeys.electromagneticPulseB,
    colorSlot: 1,
  },
  829106: {
    groupKey: textKeys.electromagneticPulseGroup,
    labelKey: textKeys.electromagneticPulseC,
    colorSlot: 2,
  },
  829115: {
    groupKey: textKeys.shareMirageGroup,
    labelKey: textKeys.share,
    colorSlot: 0,
  },
  829116: {
    groupKey: textKeys.shareMirageGroup,
    labelKey: textKeys.mirageShare,
    colorSlot: 3,
  },
  829304: {
    groupKey: textKeys.shareGroup,
    labelKey: textKeys.share,
    colorSlot: 0,
  },
  829305: {
    groupKey: textKeys.mirageShareGroup,
    labelKey: textKeys.mirageShare,
    colorSlot: 3,
  },
  829306: {
    groupKey: textKeys.shareGroup,
    labelKey: textKeys.decay,
    colorSlot: 1,
  },
  829307: {
    groupKey: textKeys.mirageShareGroup,
    labelKey: textKeys.mirageDecay,
    colorSlot: 4,
  },
  829308: {
    groupKey: textKeys.shareGroup,
    labelKey: textKeys.spread,
    colorSlot: 2,
  },
  829309: {
    groupKey: textKeys.mirageShareGroup,
    labelKey: textKeys.mirageSpread,
    colorSlot: 5,
  },
  829316: {
    groupKey: textKeys.causalJumpGroup,
    labelKey: textKeys.causalJump,
    colorSlot: 4,
  },
  829217: {
    groupKey: textKeys.normalDecayGroup,
    labelKey: textKeys.normalTarget,
    colorSlot: 1,
  },
  829245: {
    groupKey: textKeys.normalDecayGroup,
    labelKey: textKeys.decayTarget,
    colorSlot: 2,
  },
  829226: {
    groupKey: textKeys.hitOrderGroup,
    labelKey: textKeys.hitOrder1,
    colorSlot: 0,
  },
  829227: {
    groupKey: textKeys.hitOrderGroup,
    labelKey: textKeys.hitOrder2,
    colorSlot: 1,
  },
  829228: {
    groupKey: textKeys.hitOrderGroup,
    labelKey: textKeys.hitOrder3,
    colorSlot: 2,
  },
  829323: {
    groupKey: textKeys.killMarkGroup,
    labelKey: textKeys.divineTrickKillMark,
    colorSlot: 0,
  },
  829324: {
    groupKey: textKeys.killMarkGroup,
    labelKey: textKeys.killMark,
    colorSlot: 1,
  },
  829326: {
    groupKey: textKeys.killMarkMirageGroup,
    labelKey: textKeys.divineTrickKillMarkMirage,
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
  const entitiesByUuid = new Map(
    snapshot.entities.map((entity) => [entity.entityUuid, entity]),
  );
  const buffsByTarget = groupBuffsByTarget(snapshot.buffs);

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
      group: t(textKeys.phase),
      label: t(mapping.labelKey),
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
      group: t(textKeys.phaseMirage),
      label: t(mapping.labelKey),
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
      group: t(textKeys.presetReturn),
      label: `${count}${t(textKeys.floorSuffix)}${cell ? "" : "?"}`,
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
      group: t(mapping.groupKey),
      label:
        buff.baseId === 829324
          ? `${t(mapping.labelKey)} x${buff.layer}`
          : t(mapping.labelKey),
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
