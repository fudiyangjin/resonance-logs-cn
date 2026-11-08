/**
 * @file Monsters the battle roster hides out of the box.
 *
 * Mechanic carriers the game spawns as monsters: they join hate lists and
 * carry HP, but nobody needs to watch that HP. Picked from
 * `MonsterIdNameType.json` by name ("隐身怪" invisible carriers, "标记"
 * markers); 103303 and 103404 were seen on hate lists in captured logs.
 * The mechanic objects at the end (光之塑形, the 对龙机像 cannons, 谜之矩阵)
 * also joined hate lists in logs and were picked by the developer.
 *
 * The presets are not shown in the settings and cannot be turned off; the
 * player's own block list comes on top of them.
 */
export type RosterPresetBlock = {
  monsterId: number;
  /** Table name, for reviewing this list; the UI resolves names itself. */
  note: string;
};

export const ROSTER_PRESET_BLOCKED_MONSTERS: readonly RosterPresetBlock[] = [
  { monsterId: 10314, note: "隐身怪（机械守卫180度转身用）" },
  { monsterId: 40325, note: "隐身怪" },
  { monsterId: 103201, note: "隐身怪（闪现的目标点 长边）" },
  { monsterId: 103202, note: "隐身怪（场景中心点）" },
  { monsterId: 103204, note: "隐身怪（闪现的目标点 宽边）" },
  { monsterId: 103209, note: "隐身怪（结局表演冲锋用）" },
  { monsterId: 103404, note: "光矛（隐身怪）" },
  { monsterId: 103506, note: "扬升（隐身怪）" },
  { monsterId: 103507, note: "场景中央占位（隐身怪）" },
  { monsterId: 103303, note: "地块A标记" },
  { monsterId: 103304, note: "地块A标记" },
  { monsterId: 103305, note: "地块A标记" },
  { monsterId: 103306, note: "地块A标记" },
  { monsterId: 33505, note: "场中标记" },
  { monsterId: 33507, note: "场中标记偏移点" },
  { monsterId: 34006, note: "场中标记" },
  { monsterId: 34014, note: "地火标记" },
  { monsterId: 34036, note: "垂直方向标记" },
  { monsterId: 6611033, note: "薇尔达道中精英战场中标记" },
  { monsterId: 103501, note: "光之塑形" },
  { monsterId: 103502, note: "光之塑形" },
  { monsterId: 103503, note: "光之塑形" },
  { monsterId: 103504, note: "光之塑形" },
  { monsterId: 103505, note: "光之塑形" },
  { monsterId: 103508, note: "光之塑形" },
  { monsterId: 103511, note: "光之塑形" },
  { monsterId: 103110, note: "对龙机像-炮管子右" },
  { monsterId: 103111, note: "对龙机像-炮管子左" },
  { monsterId: 103301, note: "对龙机像-炮管子右" },
  { monsterId: 103302, note: "对龙机像-炮管子左" },
  { monsterId: 4639, note: "谜之矩阵" },
];

export const ROSTER_PRESET_BLOCKED_IDS: ReadonlySet<number> = new Set(
  ROSTER_PRESET_BLOCKED_MONSTERS.map((entry) => entry.monsterId),
);
