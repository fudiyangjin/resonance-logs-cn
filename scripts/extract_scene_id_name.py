# -*- coding: utf-8 -*-
"""Export SceneTable names with the existing per-language scene overrides.

Chinese scene overrides identify explicit display corrections (difficulty labels).
The corresponding language overrides supply their translations. Other overrides
are used only for empty official names. Official text is kept in the audit.
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
        "output_name": "SceneName.json",
    },
    "en": {
        "overrides_dir": SCRIPT_DIR / "overrides_en",
        "output_name": "SceneName_en.json",
    },
    "jp": {
        "overrides_dir": SCRIPT_DIR / "overrides_jp",
        "output_name": "SceneName_jp.json",
    },
}

OVERRIDE_FILE_NAME = "scene_name_overrides.json"


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _scene_name(scene_id: str, scene_table: dict, map_info_table: dict) -> str:
    entry = scene_table.get(scene_id)
    name = entry.get("Name") if isinstance(entry, dict) else None
    if name:
        return name

    map_entry = map_info_table.get(scene_id)
    if isinstance(map_entry, dict):
        return map_entry.get("Name") or ""

    return ""


def _source_scene_ids() -> list[str]:
    source_path = ZTABLE_DIR / "SceneTable.json"
    if not source_path.exists():
        raise FileNotFoundError(f"未找到中文模板源: {source_path}")

    source_table = _load_json(source_path)
    scene_ids = []
    for entry in source_table.values():
        if isinstance(entry, dict) and "Id" in entry:
            scene_ids.append(str(entry["Id"]))
    return scene_ids


def _build_scene_names(lang: str, scene_ids: list[str]) -> tuple[dict, int]:
    input_path = ZTABLE_DIR / "SceneTable.json"
    map_info_path = ZTABLE_DIR / "MapInfoTable.json"
    overrides_path = LANG_CONFIGS[lang]["overrides_dir"] / OVERRIDE_FILE_NAME

    if not input_path.exists():
        raise FileNotFoundError(f"未找到场景表: {input_path}")

    scene_table = _load_json(input_path)
    map_info_table = _load_json(map_info_path)
    name_overrides = _load_json(overrides_path)

    result = {
        scene_id: _scene_name(scene_id, scene_table, map_info_table)
        for scene_id in scene_ids
    }
    result.update({str(scene_id): name for scene_id, name in name_overrides.items()})

    return result, len(name_overrides)


def _write_scene_names(lang: str, result: dict, override_count: int) -> None:
    output_path = OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)

    print(f"已生成: {output_path}，共 {len(result)} 条（{override_count} 条场景例外输入）")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="从 ZTable/SceneTable.json 提取多语言场景 Id -> Name。"
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
        scene_ids = _source_scene_ids()
        scene_table = _load_json(ZTABLE_DIR / "SceneTable.json")
        display_ids = set(_load_json(LANG_CONFIGS["zh"]["overrides_dir"] / OVERRIDE_FILE_NAME))
        for lang in langs:
            names = OfficialNames(lang, args.localization_dir)
            names.bind("SceneTable", "Name", scene_table)
            result, override_count = _build_scene_names(lang, scene_ids)
            overrides = _load_json(LANG_CONFIGS[lang]["overrides_dir"] / OVERRIDE_FILE_NAME)
            map_info_table = _load_json(ZTABLE_DIR / "MapInfoTable.json")
            result = {
                key: names.resolve(
                    "SceneTable", "Name", key, result[key],
                    alias=overrides.get(key) if key in display_ids else None,
                    fallback_source="research_override" if key in overrides else "research_template",
                    research_label=_scene_name(key, scene_table, map_info_table),
                )
                for key in scene_ids
            }
            for key in display_ids & names.records.keys():
                if names.records[key]["source"] == "display_alias":
                    names.records[key]["source"] = "scene_override"
            _write_scene_names(lang, result, override_count)
            names.write_audit(OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"])
    except FileNotFoundError as exc:
        print(f"错误: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
