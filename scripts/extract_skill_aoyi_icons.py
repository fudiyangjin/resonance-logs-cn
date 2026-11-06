#!/usr/bin/env python3
"""导出图标前缀为 skill_aoyi、ID为1000–9999的技能。

Id/Icon/maxCharges 使用统一 ZTable 结构，NameDesign 输出字段承载各语言
SkillTable.Name 官方文本；override仅用于官方空值。名称来源写入 name_sources。
支持 --lang、--output-dir、--localization-dir；-o/--output 要求指定 --lang。
"""

import argparse
import json
import sys
from pathlib import Path

from game_data_paths import DATA_ROOT

from localized_names import OfficialNames, add_arguments

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
ZTABLE_DIR = DATA_ROOT / "ZTable"
OUTPUT_DIR = SCRIPT_DIR / "output"
SKILL_TABLE_PATH = ZTABLE_DIR / "SkillTable.json"
ICON_PREFIX = "ui/textures/skill_aoyi/skill_aoyi_skill_icon"

LANG_CONFIGS = {
    "zh": {
        "overrides_dir": SCRIPT_DIR / "overrides",
        "output_name": "skill_aoyi_icons.json",
    },
    "en": {
        "overrides_dir": SCRIPT_DIR / "overrides_en",
        "output_name": "skill_aoyi_icons_en.json",
    },
    "jp": {
        "overrides_dir": SCRIPT_DIR / "overrides_jp",
        "output_name": "skill_aoyi_icons_jp.json",
    },
}

OVERRIDE_FILE_NAME = "skill_aoyi_name_overrides.json"


def load_json(path: Path) -> dict | list:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_icon_filename(icon_path: str) -> str:
    """从 Icon 路径取最后一段作为文件名，并加上 .png。"""
    if not icon_path:
        return ""
    name = icon_path.replace("\\", "/").split("/")[-1]
    return f"{name}.png"


def build_base_entries(skill_table: dict) -> list[dict]:
    results = []
    for key, entry in skill_table.items():
        if not isinstance(entry, dict):
            continue
        icon = entry.get("Icon")
        if not icon or not str(icon).startswith(ICON_PREFIX):
            continue
        skill_id = entry.get("Id")
        if skill_id is None:
            skill_id = key
        skill_id = int(skill_id)
        if not (1000 <= skill_id <= 9999):
            continue
        item = {
            "id": skill_id,
            "NameDesign": entry.get("NameDesign", ""),
            "Icon": extract_icon_filename(icon),
        }
        if entry.get("SkillType") == 5:
            item["maxCharges"] = entry.get("MaxEnergyChargeNum", 0)
        results.append(item)

    results.sort(key=lambda x: (x["id"], x["Icon"]))
    return results


def apply_language_names(
    base_entries: list[dict],
    name_overrides: dict,
) -> tuple[list[dict], int]:
    localized_entries = []
    with_name_override = 0

    for item in base_entries:
        entry = dict(item)
        override_key = str(entry["id"])

        if override_key in name_overrides:
            entry["NameDesign"] = name_overrides[override_key]
            with_name_override += 1

        localized_entries.append(entry)

    return localized_entries, with_name_override


def write_output(lang: str, output_data: list[dict], with_name_override: int) -> Path:
    output_path = OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print(
        f"已生成: {output_path}，共 {len(output_data)} 条"
        f"（匹配 {with_name_override} 条回退例外，非空官方名称优先）"
    )
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="提取 skill_aoyi 技能图标信息")
    add_arguments(parser)
    parser.add_argument(
        "-o", "--output",
        help="仅单语言模式时指定输出 JSON 路径（默认使用 output 目录下的语言文件名）",
    )
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
    if args.output and not args.lang:
        raise ValueError("--output requires --lang; use --output-dir for all languages")
    langs = [args.lang] if args.lang else list(LANG_CONFIGS.keys())

    if not SKILL_TABLE_PATH.exists():
        print(f"错误: 未找到 {SKILL_TABLE_PATH}", file=sys.stderr)
        return 1

    skill_table = load_json(SKILL_TABLE_PATH)
    base_entries = build_base_entries(skill_table)
    if not base_entries:
        print("未找到任何 skill_aoyi 条目")
        return 0

    research_labels = {str(item["id"]): item["NameDesign"] for item in base_entries}
    for lang in langs:
        names = OfficialNames(lang, args.localization_dir)
        names.bind("SkillTable", "Name", skill_table)
        lang_config = LANG_CONFIGS[lang]
        name_overrides = load_json(lang_config["overrides_dir"] / OVERRIDE_FILE_NAME)
        if not isinstance(name_overrides, dict):
            name_overrides = {}

        output_data, with_name_override = apply_language_names(
            base_entries,
            name_overrides,
        )
        for entry in output_data:
            key = str(entry["id"])
            entry["NameDesign"] = names.resolve(
                "SkillTable", "Name", key, entry["NameDesign"],
                fallback_source="research_override" if key in name_overrides else "research_template",
                research_label=research_labels[key],
            )

        if args.output and len(langs) == 1:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)
            print(f"已提取 {len(output_data)} 条记录 -> {out_path}")
        else:
            out_path = write_output(lang, output_data, with_name_override)
        names.write_audit(out_path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
