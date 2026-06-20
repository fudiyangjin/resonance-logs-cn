import type { MinimapEntity, MinimapSnapshot } from "$lib/api";
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import type { MechanicRegion, MechanicRow } from "../../../scene-types";

export type SeaRingedReefMechanicView = {
  regions: MechanicRegion[];
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
};

const MATRIX_MONSTER_ID = 4639;

const textKeys = {
  matrixGroup: "minimap.s3SeaRingedReef.matrix.group",
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
  const rows = new Map<string, MechanicRow>();
  const entityColorSlots = new Map<string, number>();
  const entitiesByUuid = new Map(
    snapshot.entities.map((entity) => [entity.entityUuid, entity]),
  );

  for (const buff of snapshot.buffs) {
    const mapping = RUNE_BUFFS[buff.baseId];
    if (!mapping) continue;

    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (!target || target.monsterId !== MATRIX_MONSTER_ID) continue;

    entityColorSlots.set(target.entityUuid, mapping.colorSlot);
    upsertRow(rows, {
      key: `matrixRune:${buff.baseId}`,
      group: t(textKeys.matrixGroup),
      label: t(mapping.labelKey),
      colorSlot: mapping.colorSlot,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: [displayName(target)],
    });
  }

  return {
    regions: [],
    rows: [...rows.values()],
    entityColorSlots,
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
