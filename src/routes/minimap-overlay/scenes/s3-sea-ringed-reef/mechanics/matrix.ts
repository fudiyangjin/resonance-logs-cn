import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import type { MechanicRegion, MechanicRow } from "../../../scene-types";

export type SeaRingedReefMechanicView = {
  regions: MechanicRegion[];
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
};

const MATRIX_MONSTER_ID = 4639;
const CALLOUT_BUFF_ID = 522602;
const CALLOUT_BEAM_RANGE = 48;
const CALLOUT_BEAM_WIDTH_PX = 10;

const textKeys = {
  matrixGroup: "minimap.s3SeaRingedReef.matrix.group",
  calloutGroup: "minimap.s3SeaRingedReef.matrix.calloutGroup",
  callout: "minimap.s3SeaRingedReef.matrix.callout",
  runeA: "minimap.s3SeaRingedReef.matrix.runeA",
  runeB: "minimap.s3SeaRingedReef.matrix.runeB",
  runeC: "minimap.s3SeaRingedReef.matrix.runeC",
  runeD: "minimap.s3SeaRingedReef.matrix.runeD",
} satisfies Record<string, MessageKey>;

const RUNE_BUFFS: Record<number, { labelKey: MessageKey; colorSlot: number }> =
  {
    883707: { labelKey: textKeys.runeA, colorSlot: 1 },
    883708: { labelKey: textKeys.runeB, colorSlot: 7 },
    883709: { labelKey: textKeys.runeC, colorSlot: 6 },
    883710: { labelKey: textKeys.runeD, colorSlot: 0 },
  };

export function buildMatrixMechanicView(
  snapshot: MinimapSnapshot,
  displayName: (entity: MinimapEntity) => string,
): SeaRingedReefMechanicView {
  const regions: MechanicRegion[] = [];
  const rows = new Map<string, MechanicRow>();
  const entityColorSlots = new Map<string, number>();
  const matrixColorByUuid = new Map<string, number>();
  const entitiesByUuid = new Map(
    snapshot.entities.map((entity) => [entity.entityUuid, entity]),
  );

  for (const buff of snapshot.buffs) {
    const mapping = RUNE_BUFFS[buff.baseId];
    if (!mapping) continue;

    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (!target || target.monsterId !== MATRIX_MONSTER_ID) continue;

    entityColorSlots.set(target.entityUuid, mapping.colorSlot);
    matrixColorByUuid.set(target.entityUuid, mapping.colorSlot);
  }

  for (const buff of snapshot.buffs) {
    if (buff.baseId !== CALLOUT_BUFF_ID) continue;

    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (!target) continue;

    const source = buff.fireUuid ? entitiesByUuid.get(buff.fireUuid) : undefined;
    const sourceColorSlot =
      source && source.monsterId === MATRIX_MONSTER_ID
        ? (matrixColorByUuid.get(source.entityUuid) ??
          entityColorSlots.get(source.entityUuid) ??
          0)
        : 0;
    entityColorSlots.set(target.entityUuid, sourceColorSlot);

    if (source && source.monsterId === MATRIX_MONSTER_ID) {
      const beamEnd = extendedBeamEnd(source, target);
      if (beamEnd) {
        regions.push({
          kind: "line",
          x1: source.x,
          z1: source.z,
          x2: beamEnd.x,
          z2: beamEnd.z,
          colorSlot: sourceColorSlot,
          widthPx: CALLOUT_BEAM_WIDTH_PX,
        });
      }
    }

    upsertRow(rows, {
      key: `matrixCallout:${source?.entityUuid ?? "unknown"}:${sourceColorSlot}`,
      group: t(textKeys.calloutGroup),
      label: t(textKeys.callout),
      colorSlot: sourceColorSlot,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: [displayName(target)],
    });
  }

  return {
    regions,
    rows: [...rows.values()],
    entityColorSlots,
  };
}

function extendedBeamEnd(
  source: MinimapEntity,
  target: MinimapEntity,
): { x: number; z: number } | null {
  const dx = target.x - source.x;
  const dz = target.z - source.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0) return null;
  return {
    x: source.x + (dx / distance) * CALLOUT_BEAM_RANGE,
    z: source.z + (dz / distance) * CALLOUT_BEAM_RANGE,
  };
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
