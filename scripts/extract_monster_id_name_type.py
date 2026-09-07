# -*- coding: utf-8 -*-
"""Extract monster Id -> {Name, MonsterType} into scripts/output.

All languages share the Chinese ZTable as the template source so every output
keeps the same keys. Language-specific override folders supply translated names
and corrections such as MonsterType fixes.

When MonsterTable.Name is empty, fill from ModelTable.ModelDesc via ModelID.
Cleared official Chinese names are restored from overrides; ModelDesc is only
a fallback for entries that never had a display name.
"""

import argparse
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = SCRIPT_DIR / "output"
ZTABLE_DIR = PROJECT_ROOT / "ZTable"

# ModelDesc values that are placeholders, not usable display names.
GENERIC_MODEL_DESCS = frozenset({
    "虚拟体",
    "子弹",
})

LANG_CONFIGS = {
    "zh": {
        "overrides_dir": SCRIPT_DIR / "overrides",
        "output_name": "MonsterIdNameType.json",
    },
    "en": {
        "overrides_dir": SCRIPT_DIR / "overrides_en",
        "output_name": "MonsterIdNameType_en.json",
    },
    "jp": {
        "overrides_dir": SCRIPT_DIR / "overrides_jp",
        "output_name": "MonsterIdNameType_jp.json",
    },
}

OVERRIDE_FILE_NAME = "monster_id_name_type_overrides.json"
TYPE_OUTPUT_NAME = "MonsterIdType.json"


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _apply_overrides(result: dict, overrides: dict) -> None:
    for monster_id, override in overrides.items():
        key = str(monster_id)
        if isinstance(override, str):
            if key in result:
                result[key]["Name"] = override
            else:
                result[key] = {"Name": override}
            continue

        if not isinstance(override, dict):
            continue

        target = result.setdefault(key, {})
        if "Name" in override:
            target["Name"] = override["Name"]
        if "MonsterType" in override:
            target["MonsterType"] = override["MonsterType"]


def _sort_by_key(data: dict) -> dict:
    return {key: data[key] for key in sorted(data)}


def _usable_text(value) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _load_monster_table() -> dict:
    source_path = ZTABLE_DIR / "MonsterTable.json"
    if not source_path.exists():
        raise FileNotFoundError(f"未找到中文模板源: {source_path}")
    return _load_json(source_path)


def _load_model_table() -> dict:
    source_path = ZTABLE_DIR / "ModelTable.json"
    if not source_path.exists():
        raise FileNotFoundError(f"未找到模型表: {source_path}")
    return _load_json(source_path)


def _source_monster_ids(monster_table: dict) -> list[str]:
    monster_ids = []
    for entry in monster_table.values():
        if isinstance(entry, dict) and "Id" in entry:
            monster_ids.append(str(entry["Id"]))
    return monster_ids


def _lookup_monster(monster_id: str, monster_table: dict) -> dict | None:
    entry = monster_table.get(monster_id)
    if isinstance(entry, dict):
        return entry
    return next(
        (
            item
            for item in monster_table.values()
            if isinstance(item, dict) and str(item.get("Id")) == monster_id
        ),
        None,
    )


def _name_from_model_id(model_id, model_table: dict) -> str:
    if model_id is None:
        return ""
    model_entry = model_table.get(str(model_id))
    if not isinstance(model_entry, dict):
        return ""
    desc = _usable_text(model_entry.get("ModelDesc"))
    if not desc or desc in GENERIC_MODEL_DESCS:
        return ""
    return desc


def _monster_entry(
    monster_id: str, monster_table: dict, model_table: dict
) -> tuple[dict, bool] | tuple[None, bool]:
    entry = _lookup_monster(monster_id, monster_table)
    if not isinstance(entry, dict) or "MonsterType" not in entry:
        return None, False

    name = _usable_text(entry.get("Name"))
    filled_from_model = False
    if not name:
        name = _name_from_model_id(entry.get("ModelID"), model_table)
        filled_from_model = bool(name)

    return {
        "Name": name,
        "MonsterType": entry["MonsterType"],
    }, filled_from_model


def _build_monster_names(
    lang: str, monster_ids: list[str], monster_table: dict, model_table: dict
) -> tuple[dict, int, int]:
    overrides_path = LANG_CONFIGS[lang]["overrides_dir"] / OVERRIDE_FILE_NAME
    overrides = _load_json(overrides_path)

    result = {}
    model_filled_ids = set()
    for monster_id in monster_ids:
        entry, used_model = _monster_entry(monster_id, monster_table, model_table)
        if entry is not None:
            result[monster_id] = entry
            if used_model:
                model_filled_ids.add(monster_id)

    names_before_override = {
        monster_id: entry.get("Name") for monster_id, entry in result.items()
    }
    _apply_overrides(result, overrides)
    filled_from_model = sum(
        1
        for monster_id in model_filled_ids
        if result.get(monster_id, {}).get("Name") == names_before_override.get(monster_id)
    )
    return result, len(overrides), filled_from_model


def _write_monster_names(
    lang: str, result: dict, override_count: int, filled_from_model: int
) -> None:
    output_path = OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)

    print(
        f"已生成: {output_path}，共 {len(result)} 条"
        f"（{override_count} 条由例外文件覆盖，"
        f"{filled_from_model} 条名称由 ModelID 补全）"
    )


def _write_type_map(result: dict) -> None:
    type_result = _sort_by_key(
        {
            monster_id: entry["MonsterType"]
            for monster_id, entry in result.items()
            if isinstance(entry, dict) and "MonsterType" in entry
        }
    )
    output_path = OUTPUT_DIR / TYPE_OUTPUT_NAME
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(type_result, f, ensure_ascii=False, indent=2, sort_keys=True)
    print(f"已生成: {output_path}，共 {len(type_result)} 条")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="从 ZTable/MonsterTable.json 提取多语言怪物 Id -> Name/Type；空名称按 ModelID 回退 ModelDesc。"
    )
    parser.add_argument(
        "--lang",
        choices=sorted(LANG_CONFIGS.keys()),
        help="只生成指定语言；默认生成所有语言。",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    langs = [args.lang] if args.lang else list(LANG_CONFIGS.keys())

    try:
        monster_table = _load_monster_table()
        model_table = _load_model_table()
        monster_ids = _source_monster_ids(monster_table)
        zh_result = None
        for lang in langs:
            result, override_count, filled_from_model = _build_monster_names(
                lang, monster_ids, monster_table, model_table
            )
            _write_monster_names(lang, result, override_count, filled_from_model)
            if lang == "zh":
                zh_result = result
        if zh_result is not None:
            _write_type_map(zh_result)
    except FileNotFoundError as exc:
        print(f"错误: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
