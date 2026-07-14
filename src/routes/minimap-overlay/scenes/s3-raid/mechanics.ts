import type {
  MinimapBuffFact,
  MinimapEntity,
  MinimapSkillCast,
  MinimapSnapshot,
} from "$lib/api";
import { t, type MessageKey } from "$lib/i18n/index.svelte";
import { overlayNow } from "../../../game-overlay/overlay-clock.svelte.js";
import {
  electromagneticRingResetMs,
  entityFirstSeen,
} from "../../minimap-runtime.svelte.js";
import type {
  MechanicRegion,
  MechanicRow,
  MinimapVoiceCueDef,
  MinimapVoiceCueFire,
} from "../../scene-types";
import {
  buffInstanceKey,
  resolveBuffVoiceCues,
  resolveSkillVoiceCues,
} from "../../voice-cue-utils";
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
  pinballGroup: "minimap.s3Raid.pinball.group",
  pinballCast: "minimap.s3Raid.pinball.cast",
  pinballBall: "minimap.s3Raid.pinball.ball",
  electromagneticRingGroup: "minimap.s3Raid.electromagneticRing.group",
} satisfies Record<string, MessageKey>;

const PINBALL_CAST_BUFF_ID = 829314;
const PINBALL_BALL_MONSTER_ID = 10330051;
const PINBALL_BALL_DURATION_MS = 6000;
const PINBALL_COLOR_SLOT = 5;

const ELECTROMAGNETIC_RING_SLOTS = 3;
const ELECTROMAGNETIC_RING_SKILLS: Record<
  number,
  { labelKey: MessageKey; colorSlot: number }
> = {
  10310062: {
    labelKey: "minimap.s3Raid.electromagneticRing.inner",
    colorSlot: 0,
  },
  10310063: {
    labelKey: "minimap.s3Raid.electromagneticRing.mid",
    colorSlot: 1,
  },
  10310064: {
    labelKey: "minimap.s3Raid.electromagneticRing.outer",
    colorSlot: 2,
  },
};
const ELECTROMAGNETIC_RING_MONSTER_IDS = new Set([
  10310062, 10310063, 10310064,
]);

const voiceCueIds = {
  phase: "s3-raid.phase",
  phaseMirage: "s3-raid.phaseMirage",
  share: "s3-raid.share",
  mirageShare: "s3-raid.mirageShare",
  causalJump: "s3-raid.causalJump",
  killMark: "s3-raid.killMark",
  killMarkMirage: "s3-raid.killMarkMirage",
  presetReturn: "s3-raid.presetReturn",
  electromagneticPulse: "s3-raid.electromagneticPulse",
  shareMirage: "s3-raid.shareMirage",
  normalDecay: "s3-raid.normalDecay",
  hitOrder: "s3-raid.hitOrder",
  pinball: "s3-raid.pinball",
  ringInner: "s3-raid.electromagneticRing.inner",
  ringMid: "s3-raid.electromagneticRing.mid",
  ringOuter: "s3-raid.electromagneticRing.outer",
} as const;

export const S3_RAID_VOICE_CUES: MinimapVoiceCueDef[] = [
  { id: voiceCueIds.phase, labelKey: textKeys.phase, autoText: "相位变化" },
  {
    id: voiceCueIds.phaseMirage,
    labelKey: textKeys.phaseMirage,
    autoText: "相位映射",
  },
  {
    id: voiceCueIds.share,
    labelKey: textKeys.shareGroup,
    autoText: "分摊衰减分散",
  },
  {
    id: voiceCueIds.mirageShare,
    labelKey: textKeys.mirageShareGroup,
    autoText: "幻想分摊衰减分散",
  },
  {
    id: voiceCueIds.causalJump,
    labelKey: textKeys.causalJumpGroup,
    autoText: "因果折跃",
  },
  {
    id: voiceCueIds.killMark,
    labelKey: textKeys.killMarkGroup,
    autoText: "累刎宣告",
  },
  {
    id: voiceCueIds.killMarkMirage,
    labelKey: textKeys.killMarkMirageGroup,
    autoText: "幻想累刎宣告",
  },
  {
    id: voiceCueIds.presetReturn,
    labelKey: textKeys.presetReturn,
    autoText: "预置的归途",
  },
  {
    id: voiceCueIds.electromagneticPulse,
    labelKey: textKeys.electromagneticPulseGroup,
    autoText: "电磁脉冲点名",
  },
  {
    id: voiceCueIds.shareMirage,
    labelKey: textKeys.shareMirageGroup,
    autoText: "分摊幻分摊",
  },
  {
    id: voiceCueIds.normalDecay,
    labelKey: textKeys.normalDecayGroup,
    autoText: "普通衰减点名",
  },
  {
    id: voiceCueIds.hitOrder,
    labelKey: textKeys.hitOrderGroup,
    autoText: "打击顺序",
  },
  {
    id: voiceCueIds.pinball,
    labelKey: textKeys.pinballGroup,
    autoText: "弹球",
  },
  {
    id: voiceCueIds.ringInner,
    labelKey: "minimap.s3Raid.electromagneticRing.inner",
    autoText: "内",
  },
  {
    id: voiceCueIds.ringMid,
    labelKey: "minimap.s3Raid.electromagneticRing.mid",
    autoText: "中",
  },
  {
    id: voiceCueIds.ringOuter,
    labelKey: "minimap.s3Raid.electromagneticRing.outer",
    autoText: "外",
  },
];

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

const PHASE_VOICE_CUES = Object.fromEntries(
  Object.keys(PHASE_BUFFS).map((buffId) => [buffId, voiceCueIds.phase]),
);

const PHASE_MAPPING_VOICE_CUES = Object.fromEntries(
  Object.keys(PHASE_MAPPING).map((buffId) => [buffId, voiceCueIds.phaseMirage]),
);

const LOCAL_CALLOUT_VOICE_CUES: Record<number, string> = {
  829104: voiceCueIds.electromagneticPulse,
  829105: voiceCueIds.electromagneticPulse,
  829106: voiceCueIds.electromagneticPulse,
  829115: voiceCueIds.shareMirage,
  829116: voiceCueIds.shareMirage,
  829304: voiceCueIds.share,
  829305: voiceCueIds.mirageShare,
  829306: voiceCueIds.share,
  829307: voiceCueIds.mirageShare,
  829308: voiceCueIds.share,
  829309: voiceCueIds.mirageShare,
  829316: voiceCueIds.causalJump,
  829217: voiceCueIds.normalDecay,
  829245: voiceCueIds.normalDecay,
  829226: voiceCueIds.hitOrder,
  829227: voiceCueIds.hitOrder,
  829228: voiceCueIds.hitOrder,
  829323: voiceCueIds.killMark,
  829324: voiceCueIds.killMark,
  829326: voiceCueIds.killMarkMirage,
};

const RING_SKILL_VOICE_CUES: Record<number, string> = {
  10310062: voiceCueIds.ringInner,
  10310063: voiceCueIds.ringMid,
  10310064: voiceCueIds.ringOuter,
};

export function resolveRaidVoiceCues(
  snapshot: MinimapSnapshot,
  skillCasts: MinimapSkillCast[],
): MinimapVoiceCueFire[] {
  const fires = [
    ...resolveBuffVoiceCues(snapshot, PHASE_VOICE_CUES, "global"),
    ...resolveBuffVoiceCues(snapshot, PHASE_MAPPING_VOICE_CUES, "localTarget"),
    ...resolveBuffVoiceCues(snapshot, LOCAL_CALLOUT_VOICE_CUES, "localTarget"),
    ...resolveBuffVoiceCues(
      snapshot,
      { [PINBALL_CAST_BUFF_ID]: voiceCueIds.pinball },
      "global",
    ),
  ];

  const hasRingEntity = snapshot.entities.some((entity) =>
    ELECTROMAGNETIC_RING_MONSTER_IDS.has(entity.monsterId ?? 0),
  );
  if (hasRingEntity) {
    fires.push(...resolveSkillVoiceCues(skillCasts, RING_SKILL_VOICE_CUES));
  }

  const localBuffs = snapshot.buffs.filter(
    (buff) => buff.targetEntityUuid === snapshot.localPlayerUuid,
  );
  const linkBuff = localBuffs.find((buff) => buff.baseId === 829318);
  const countBuff = localBuffs.find(
    (buff) => PRESET_RETURN_COUNT_BUFFS[buff.baseId] !== undefined,
  );
  if (linkBuff && countBuff) {
    fires.push({
      cueId: voiceCueIds.presetReturn,
      instanceKey: `${buffInstanceKey(linkBuff)}:${buffInstanceKey(countBuff)}`,
    });
  }

  return fires;
}

export function buildMechanicView(
  snapshot: MinimapSnapshot,
  displayName: (entity: MinimapEntity) => string,
  arena: S3RaidArena,
  skillCasts: MinimapSkillCast[],
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

  // Pinball runs in any phase, so it lives outside the non-ring block.
  addPinballRows(snapshot, rows, entityColorSlots);
  // Electromagnetic ring runs in the ring arena; gated by virtual-body
  // presence inside the helper, so it is safe to call unconditionally.
  addElectromagneticRingRows(snapshot, skillCasts, rows);

  return {
    regions: dedupeRegions(regions),
    rows: [...rows.values()],
    entityColorSlots,
  };
}

function addPinballRows(
  snapshot: MinimapSnapshot,
  rows: Map<string, MechanicRow>,
  entityColorSlots: Map<string, number>,
) {
  for (const buff of snapshot.buffs) {
    if (buff.baseId !== PINBALL_CAST_BUFF_ID) continue;
    upsertRow(rows, {
      key: `pinball:cast:${PINBALL_CAST_BUFF_ID}`,
      group: t(textKeys.pinballGroup),
      label: t(textKeys.pinballCast),
      colorSlot: PINBALL_COLOR_SLOT,
      createTimeMs: buff.createTimeMs,
      durationMs: buff.durationMs,
      targets: [],
    });
  }

  for (const entity of snapshot.entities) {
    if (entity.monsterId !== PINBALL_BALL_MONSTER_ID) continue;
    entityColorSlots.set(entity.entityUuid, PINBALL_COLOR_SLOT);
    upsertRow(rows, {
      key: `pinball:ball:${entity.entityUuid}`,
      group: t(textKeys.pinballGroup),
      label: t(textKeys.pinballBall),
      colorSlot: PINBALL_COLOR_SLOT,
      createTimeMs: entityFirstSeen(entity.entityUuid) ?? overlayNow(),
      durationMs: PINBALL_BALL_DURATION_MS,
      targets: [],
    });
  }
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

function addElectromagneticRingRows(
  snapshot: MinimapSnapshot,
  skillCasts: MinimapSkillCast[],
  rows: Map<string, MechanicRow>,
) {
  const hasEntity = snapshot.entities.some((entity) =>
    ELECTROMAGNETIC_RING_MONSTER_IDS.has(entity.monsterId ?? 0),
  );
  if (!hasEntity) return;

  const resetMs = electromagneticRingResetMs();
  type RingMatch = {
    cast: MinimapSkillCast;
    entry: { labelKey: MessageKey; colorSlot: number };
  };
  const matched = skillCasts
    .map((cast): RingMatch | undefined => {
      const entry = ELECTROMAGNETIC_RING_SKILLS[cast.skillId];
      if (entry === undefined) return undefined;
      if (cast.timeMs < resetMs) return undefined;
      return { cast, entry };
    })
    .filter((item): item is RingMatch => item !== undefined)
    .slice(-ELECTROMAGNETIC_RING_SLOTS);
  if (matched.length === 0) return;

  const latest = matched.at(-1);
  if (!latest) return;
  upsertRow(rows, {
    key: `electromagneticRing:${matched.map((item) => item.cast.skillId).join("-")}`,
    group: t(textKeys.electromagneticRingGroup),
    label: matched.map((item) => t(item.entry.labelKey)).join(" → "),
    colorSlot: latest.entry.colorSlot,
    createTimeMs: 0,
    durationMs: 0,
    targets: [],
    hideTimer: true,
  });
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
    const key = regionKey(region);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(region);
  }
  return out;
}

function regionKey(region: MechanicRegion): string {
  switch (region.kind) {
    case "ring":
      return `ring:${region.rInner}:${region.rOuter}:${region.colorSlot}`;
    case "rect":
      return `rect:${region.x}:${region.z}:${region.halfX}:${region.halfZ}:${region.colorSlot}:${region.label ?? ""}`;
    case "sector":
      return `sector:${region.x}:${region.z}:${region.radius}:${region.startDeg}:${region.endDeg}:${region.colorSlot}:${region.label ?? ""}`;
    case "polygon":
      return `polygon:${region.points.map((point) => `${point.x}:${point.z}`).join("|")}:${region.colorSlot}:${region.label ?? ""}`;
    case "line":
      return `line:${region.x1}:${region.z1}:${region.x2}:${region.z2}:${region.colorSlot}:${region.widthPx ?? ""}:${region.label ?? ""}`;
  }
}
