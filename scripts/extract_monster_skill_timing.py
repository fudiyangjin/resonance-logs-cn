# -*- coding: utf-8 -*-
"""Export monster skill lists and skill timing for the battle roster.

Outputs (to scripts/output, then copied to src/lib/config):

- MonsterSkillIds.json: {monsterId: [skillId, ...]} from MonsterTable.SkillIds.
  Captured logs: 96% of real monster casts are listed there; the rest are
  skills handed out by AI scripts (mechanic objects, boss forms).
- MonsterSkillTiming.json: {skillId: {cd?, start?, sing?, bar?, danger?}} for
  every listed skill with any timing data:
  - cd: SkillFightLevelTable.PVECoolTime of the lowest level row (only 8 of
    ~2900 monster skills change CD by level). Logs show it is a reliable
    lower bound between two casts of one monster.
  - start: RandomPVECoolTime [a, b] when CoolTimeOnBattleStart is set — the
    window of the first cast after the monster enters combat (no first
    cast was earlier than a in the logs); "never" for the 999 sentinel.
  - sing: SkillTable.SingOrGuideTime[0][0], the sing/guide bar duration.
  - bar: SingOrGuideTime[0][3], bar type (1 monster, 2 danger, 3 steel).
  - danger: SkillTable.IsDangerSkill.

Both files are written one entry per line so table updates diff cleanly.
"""

import argparse
import json
from pathlib import Path

from game_data_paths import DATA_ROOT

SCRIPT_DIR = Path(__file__).resolve().parent
ZTABLE_DIR = DATA_ROOT / "ZTable"
#: RandomPVECoolTime values at or above this mean "not at battle start".
NEVER_AT_BATTLE_START = 999.0


def _load_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"未找到表: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _monster_skill_ids() -> dict[int, list[int]]:
    result: dict[int, list[int]] = {}
    for key, entry in _load_json(ZTABLE_DIR / "MonsterTable.json").items():
        if not isinstance(entry, dict):
            continue
        ids: set[int] = set()
        for item in entry.get("SkillIds") or []:
            values = item if isinstance(item, list) else [item]
            ids.update(x for x in values if isinstance(x, int) and x > 0)
        if ids:
            result[int(key)] = sorted(ids)
    return result


def _number(value) -> float | int:
    """Integers stay integers so the JSON reads like the source tables."""
    value = float(value)
    return int(value) if value.is_integer() else round(value, 3)


def _skill_timing(skill_ids: set[int]) -> dict[int, dict]:
    levels: dict[int, dict] = {}
    for row in _load_json(ZTABLE_DIR / "SkillFightLevelTable.json").values():
        skill_id = row.get("SkillId")
        if skill_id not in skill_ids:
            continue
        current = levels.get(skill_id)
        if current is None or (row.get("Level") or 0) < (current.get("Level") or 0):
            levels[skill_id] = row

    skills = _load_json(ZTABLE_DIR / "SkillTable.json")
    result: dict[int, dict] = {}
    for skill_id in sorted(skill_ids):
        timing: dict = {}
        level = levels.get(skill_id) or {}
        cd = level.get("PVECoolTime") or 0
        if cd > 0:
            timing["cd"] = _number(cd)
        window = level.get("RandomPVECoolTime") or []
        if level.get("CoolTimeOnBattleStart") and len(window) == 2:
            if max(window) >= NEVER_AT_BATTLE_START:
                timing["start"] = "never"
            else:
                timing["start"] = [_number(window[0]), _number(window[1])]
        skill = skills.get(str(skill_id)) or {}
        headers = skill.get("SingOrGuideTime") or []
        header = headers[0] if headers and isinstance(headers[0], list) else []
        if header and header[0] > 0:
            timing["sing"] = _number(header[0])
            if len(header) >= 4 and header[3] > 0:
                timing["bar"] = int(header[3])
        if skill.get("IsDangerSkill"):
            timing["danger"] = True
        if timing:
            result[skill_id] = timing
    return result


def _write_lines(path: Path, entries: dict[int, object]) -> None:
    """One `"id": value` per line, keys ascending."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"  {json.dumps(str(key))}: {json.dumps(value, ensure_ascii=False, separators=(', ', ': '))}"
        for key, value in sorted(entries.items())
    ]
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("{\n" + ",\n".join(lines) + "\n}\n")
    print(f"已生成: {path}，共 {len(entries)} 条")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=SCRIPT_DIR / "output",
        help="输出目录（默认 scripts/output），生成后复制到 src/lib/config",
    )
    args = parser.parse_args()
    try:
        monster_skills = _monster_skill_ids()
        skill_ids = {skill for ids in monster_skills.values() for skill in ids}
        _write_lines(args.output_dir / "MonsterSkillIds.json", monster_skills)
        _write_lines(args.output_dir / "MonsterSkillTiming.json", _skill_timing(skill_ids))
    except FileNotFoundError as exc:
        print(f"错误: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
