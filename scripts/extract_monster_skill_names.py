# -*- coding: utf-8 -*-
"""Export monster skill names within MonsterTable.SkillIds.

Nonempty official SkillTable.Name wins over planner labels and research overrides.
Empty official fields keep research names, with separate name_sources provenance.
All languages share the same IDs; no language-specific placeholder heuristic.
"""

import argparse
import json
from pathlib import Path

from game_data_paths import DATA_ROOT

from localized_names import OfficialNames, add_arguments

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = SCRIPT_DIR / "output"
ZTABLE_DIR = DATA_ROOT / "ZTable"

LANG_CONFIGS = {
    "zh": {
        "overrides_dir": SCRIPT_DIR / "overrides",
        "output_name": "MonsterSkillName.json",
    },
    "en": {
        "overrides_dir": SCRIPT_DIR / "overrides_en",
        "output_name": "MonsterSkillName_en.json",
    },
    "jp": {
        "overrides_dir": SCRIPT_DIR / "overrides_jp",
        "output_name": "MonsterSkillName_jp.json",
    },
}

OVERRIDE_FILE_NAME = "monster_skill_name_overrides.json"

def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _monster_skill_name(entry: dict) -> str:
    """Plain planner label, used only when the verified official name is empty."""
    value = entry.get("NameDesign")
    return value.strip() if isinstance(value, str) else ""


def _source_monster_skill_ids() -> list[str]:
    source_path = ZTABLE_DIR / "MonsterTable.json"
    if not source_path.exists():
        raise FileNotFoundError(f"未找到怪物表: {source_path}")

    monster_table = _load_json(source_path)
    skill_ids: set[int] = set()
    for entry in monster_table.values():
        if not isinstance(entry, dict):
            continue
        for item in entry.get("SkillIds") or []:
            if isinstance(item, list):
                skill_ids.update(x for x in item if isinstance(x, int))
            elif isinstance(item, int):
                skill_ids.add(item)
    return [str(skill_id) for skill_id in sorted(skill_ids)]


def _build_monster_skill_names(lang: str, skill_ids: list[str], names: OfficialNames) -> tuple[dict, int]:
    input_path = ZTABLE_DIR / "SkillTable.json"
    overrides_path = LANG_CONFIGS[lang]["overrides_dir"] / OVERRIDE_FILE_NAME

    if not input_path.exists():
        raise FileNotFoundError(f"未找到技能表: {input_path}")

    skill_table = _load_json(input_path)
    name_overrides = _load_json(overrides_path)
    names.bind("SkillTable", "Name", skill_table)

    result = {}
    for skill_id in skill_ids:
        entry = skill_table.get(skill_id)
        if not isinstance(entry, dict):
            continue
        name = names.resolve(
            "SkillTable", "Name", skill_id,
            name_overrides.get(skill_id, _monster_skill_name(entry)),
            fallback_source="research_override" if skill_id in name_overrides else "research_template",
            research_label=_monster_skill_name(entry),
        )
        if name:
            result[skill_id] = name
        else:
            names.records.pop(skill_id, None)

    return result, len(name_overrides)


def _write_monster_skill_names(lang: str, result: dict, override_count: int) -> None:
    output_path = OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")

    print(f"已生成: {output_path}，共 {len(result)} 条（{override_count} 条研究回退输入，非空官方名称优先）")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="从 ZTable/SkillTable.json + MonsterTable.json 提取多语言怪物技能 Id -> Name。"
    )
    add_arguments(parser)
    parser.add_argument(
        "--lang",
        choices=sorted(LANG_CONFIGS.keys()),
        help="只生成指定语言；默认生成所有语言。",
    )
    return parser.parse_args()


def main() -> int:
    global OUTPUT_DIR
    args = parse_args()
    OUTPUT_DIR = args.output_dir
    langs = [args.lang] if args.lang else list(LANG_CONFIGS.keys())

    try:
        skill_ids = _source_monster_skill_ids()
        for lang in langs:
            names = OfficialNames(lang, args.localization_dir)
            result, override_count = _build_monster_skill_names(lang, skill_ids, names)
            _write_monster_skill_names(lang, result, override_count)
            names.write_audit(OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"])
    except FileNotFoundError as exc:
        print(f"错误: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
