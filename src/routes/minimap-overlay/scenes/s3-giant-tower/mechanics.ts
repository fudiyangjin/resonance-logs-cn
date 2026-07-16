import type {
  MinimapBuffFact,
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import { overlayNow } from "../../../game-overlay/overlay-clock.svelte.js";
import type {
  MechanicRow,
  MinimapVoiceCueDef,
  MinimapVoiceCueFire,
} from "../../scene-types";
import {
  entityInstanceKey,
  resolveBuffVoiceCues,
  skillCastInstanceKey,
} from "../../voice-cue-utils";

const textKeys = {
  portalGroup: "minimap.s3GiantTower.portal.group",
  correctPortal: "minimap.s3GiantTower.portal.correct",
  gravityGroup: "minimap.s3GiantTower.gravity.group",
  gravityBlast: "minimap.s3GiantTower.gravity.blast",
  stickyGroup: "minimap.s3GiantTower.sticky.group",
  stickyBomb: "minimap.s3GiantTower.sticky.bomb",
} satisfies Record<string, MessageKey>;

const CORRECT_PORTAL_MONSTER_ID = 2106;
const OTHER_PORTAL_MONSTER_ID = 2107;
const COLOR_SLOT_CORRECT_PORTAL = 6;
const COLOR_SLOT_OTHER_PORTAL = 7;

const GRAVITY_BLAST_SKILL_ID = 111103;
const GRAVITY_BLAST_DURATION_MS = 8_500;
const COLOR_SLOT_GRAVITY_BLAST = 3;

const STICKY_BOMB_BUFF_ID = 821076;
const COLOR_SLOT_STICKY = 5;

const voiceCueIds = {
  portal: "s3-giant-tower.portal",
  gravity: "s3-giant-tower.gravity",
  sticky: "s3-giant-tower.sticky",
} as const;

export const S3_GIANT_TOWER_VOICE_CUES: MinimapVoiceCueDef[] = [
  {
    id: voiceCueIds.portal,
    labelKey: textKeys.portalGroup,
    autoText: "正确传送门出现",
  },
  {
    id: voiceCueIds.gravity,
    labelKey: textKeys.gravityGroup,
    autoText: "引力雷爆",
  },
  {
    id: voiceCueIds.sticky,
    labelKey: textKeys.stickyGroup,
    autoText: "粘着弹点名",
  },
];

export function resolveGiantTowerVoiceCues(
  snapshot: MinimapSnapshot,
  skillCasts: MinimapSkillCast[],
): MinimapVoiceCueFire[] {
  const entitiesByUuid = new Map(
    snapshot.entities.map((entity) => [entity.entityUuid, entity]),
  );
  const fires = resolveBuffVoiceCues(
    snapshot,
    { [STICKY_BOMB_BUFF_ID]: voiceCueIds.sticky },
    "localTarget",
  );
  for (const entity of snapshot.entities) {
    if (entity.monsterId !== CORRECT_PORTAL_MONSTER_ID) continue;
    fires.push({
      cueId: voiceCueIds.portal,
      instanceKey: entityInstanceKey(entity),
    });
  }
  for (const cast of skillCasts) {
    if (cast.skillId !== GRAVITY_BLAST_SKILL_ID) continue;
    if (entitiesByUuid.get(cast.entityUuid)?.kind !== "boss") continue;
    fires.push({
      cueId: voiceCueIds.gravity,
      instanceKey: skillCastInstanceKey(cast),
    });
  }
  return fires;
}

export type MechanicView = {
  rows: MechanicRow[];
  entityColorSlots: Map<string, number>;
};

export function buildMechanicView(
  snapshot: MinimapSnapshot,
  displayName: (entity: MinimapEntity) => string,
  skillCasts: MinimapSkillCast[] = [],
): MechanicView {
  const rows = new Map<string, MechanicRow>();
  const entityColorSlots = new Map<string, number>();
  const entitiesByUuid = new Map(
    snapshot.entities.map((entity) => [entity.entityUuid, entity]),
  );

  let hasCorrectPortal = false;
  for (const entity of snapshot.entities) {
    if (entity.monsterId === CORRECT_PORTAL_MONSTER_ID) {
      entityColorSlots.set(entity.entityUuid, COLOR_SLOT_CORRECT_PORTAL);
      hasCorrectPortal = true;
    } else if (entity.monsterId === OTHER_PORTAL_MONSTER_ID) {
      entityColorSlots.set(entity.entityUuid, COLOR_SLOT_OTHER_PORTAL);
    }
  }

  if (hasCorrectPortal) {
    upsertRow(rows, {
      key: "s3GiantTower:portal:correct",
      group: t(textKeys.portalGroup),
      label: t(textKeys.correctPortal),
      colorSlot: COLOR_SLOT_CORRECT_PORTAL,
      createTimeMs: 0,
      durationMs: 0,
      targets: [],
      hideTimer: true,
    });
  }

  addGravityBlastRows(skillCasts, entitiesByUuid, rows);
  addStickyBombRows(
    snapshot.buffs,
    entitiesByUuid,
    rows,
    entityColorSlots,
    displayName,
  );

  return {
    rows: [...rows.values()],
    entityColorSlots,
  };
}

function addGravityBlastRows(
  skillCasts: MinimapSkillCast[],
  entitiesByUuid: Map<string, MinimapEntity>,
  rows: Map<string, MechanicRow>,
) {
  const now = overlayNow();
  for (const cast of skillCasts) {
    if (cast.skillId !== GRAVITY_BLAST_SKILL_ID) continue;
    const entity = entitiesByUuid.get(cast.entityUuid);
    if (!entity || entity.kind !== "boss") continue;
    const ageMs = now - cast.timeMs;
    if (ageMs < -500 || ageMs > GRAVITY_BLAST_DURATION_MS) continue;
    upsertRow(rows, {
      key: `s3GiantTower:gravityBlast:${cast.entityUuid}:${cast.timeMs}`,
      group: t(textKeys.gravityGroup),
      label: t(textKeys.gravityBlast),
      colorSlot: COLOR_SLOT_GRAVITY_BLAST,
      createTimeMs: cast.timeMs,
      durationMs: GRAVITY_BLAST_DURATION_MS,
      targets: [],
    });
  }
}

function addStickyBombRows(
  buffs: MinimapBuffFact[],
  entitiesByUuid: Map<string, MinimapEntity>,
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
  displayName: (entity: MinimapEntity) => string,
) {
  for (const buff of buffs) {
    if (buff.baseId !== STICKY_BOMB_BUFF_ID) continue;
    const target = entitiesByUuid.get(buff.targetEntityUuid);
    if (target) entityColorSlots.set(target.entityUuid, COLOR_SLOT_STICKY);
    upsertRow(rows, {
      key: `s3GiantTower:sticky:${buff.baseId}:${buff.createTimeMs}`,
      group: t(textKeys.stickyGroup),
      label: t(textKeys.stickyBomb),
      colorSlot: COLOR_SLOT_STICKY,
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
  if (existing.hideTimer || next.hideTimer) {
    existing.hideTimer = Boolean(existing.hideTimer && next.hideTimer);
  }
  for (const target of next.targets) {
    if (!existing.targets.includes(target)) existing.targets.push(target);
  }
}
