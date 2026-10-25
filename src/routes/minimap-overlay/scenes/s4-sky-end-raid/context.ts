import type {
  MinimapBuffFact,
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import { mergeMechanicTargets, toMechanicTargets } from "../../mechanic-row";
import type {
  MechanicRegion,
  MechanicRow,
  MechanicRowTarget,
} from "../../scene-types";

export type DisplayName = (entity: MinimapEntity) => string;

export type BuildContext = {
  snapshot: MinimapSnapshot;
  displayName: DisplayName;
  skillCasts: readonly MinimapSkillCast[];
  nowMs: number;
  entitiesByUuid: Map<string, MinimapEntity>;
  boss: MinimapEntity | undefined;
  regions: MechanicRegion[];
  rows: Map<string, MechanicRow>;
  entityColorSlots: Map<string, number>;
};

/** Merges rows sharing a key (e.g. a cast and the buff it applies). */
export function addRow(ctx: BuildContext, next: MechanicRow) {
  const current = ctx.rows.get(next.key);
  if (!current) {
    ctx.rows.set(next.key, next);
    return;
  }
  const currentEnd = current.createTimeMs + current.durationMs;
  const nextEnd = next.createTimeMs + next.durationMs;
  current.createTimeMs = Math.min(current.createTimeMs, next.createTimeMs);
  current.durationMs = Math.max(currentEnd, nextEnd) - current.createTimeMs;
  mergeMechanicTargets(current.targets, next.targets);
}

export function activeBuffs(
  ctx: BuildContext,
  buffId: number,
): MinimapBuffFact[] {
  return ctx.snapshot.buffs.filter(
    (buff) =>
      buff.baseId === buffId &&
      activeAt(buff.createTimeMs, buff.durationMs, ctx.nowMs),
  );
}

export function playerTargets(
  ctx: BuildContext,
  buffs: readonly MinimapBuffFact[],
): MechanicRowTarget[] {
  const targets: MechanicRowTarget[] = [];
  for (const buff of buffs) {
    const entity = ctx.entitiesByUuid.get(buff.targetEntityUuid);
    if (!entity || (entity.kind !== "local" && entity.kind !== "teammate")) {
      continue;
    }
    mergeMechanicTargets(
      targets,
      toMechanicTargets(entity, ctx.snapshot.localPlayerUuid, ctx.displayName),
    );
  }
  return targets;
}

export function latestCast(
  ctx: BuildContext,
  skillId: number,
  windowMs: number,
): MinimapSkillCast | undefined {
  let latest: MinimapSkillCast | undefined;
  for (const cast of ctx.skillCasts) {
    if (cast.skillId !== skillId || !activeAt(cast.timeMs, windowMs, ctx.nowMs))
      continue;
    if (!latest || cast.timeMs > latest.timeMs) latest = cast;
  }
  return latest;
}

export function circle(
  center: { x: number; z: number },
  radius: number,
  colorSlot: number,
): MechanicRegion {
  return {
    kind: "sector",
    x: center.x,
    z: center.z,
    radius,
    startDeg: 0,
    endDeg: 360,
    colorSlot,
  };
}

/** A circle drawn as a polygon so its label sits at the centre. */
export function labeledDisc(
  center: { x: number; z: number },
  radius: number,
  colorSlot: number,
  label: string,
): MechanicRegion {
  const points = Array.from({ length: 24 }, (_, i) => {
    const rad = (i * Math.PI) / 12;
    return {
      x: center.x + Math.sin(rad) * radius,
      z: center.z + Math.cos(rad) * radius,
    };
  });
  return { kind: "polygon", points, colorSlot, label };
}

export function maxDuration(buffs: readonly MinimapBuffFact[]): number {
  return Math.max(0, ...buffs.map((buff) => buff.durationMs));
}

export function activeAt(
  createTimeMs: number,
  durationMs: number,
  nowMs: number,
  graceMs = 500,
): boolean {
  if (nowMs < createTimeMs - graceMs) return false;
  return durationMs <= 0 || nowMs <= createTimeMs + durationMs + graceMs;
}
