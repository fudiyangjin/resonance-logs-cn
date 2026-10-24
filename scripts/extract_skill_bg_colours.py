#!/usr/bin/env python3
"""
从 SkillTable.json 提取技能按钮的元素底色下标 PCBgColour。
战斗按钮把它当作下标，从 1–5 号颜色里取一个，染在技能底图上（0 表示不染色）。

只记录 PCBgColour 非零、Id 小于 100000 的技能（更大的 Id 不是玩家技能）。
输出 JSON 到 scripts/output：{ "技能Id": 颜色下标 }，按 Id 升序。
生成后复制到 src/lib/config/skill_bg_colours.json。

用法:
  python extract_skill_bg_colours.py
  python extract_skill_bg_colours.py --ztable ../../StarResonanceTool-main/ZTable
  python extract_skill_bg_colours.py -o custom_output.json
"""

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_ZTABLE_DIR = PROJECT_ROOT / "ZTable"
OUTPUT_PATH = SCRIPT_DIR / "output" / "skill_bg_colours.json"
MAX_PLAYER_SKILL_ID = 100000
COLOUR_COUNT = 5


def build_colours(skill_table: dict) -> dict[str, int]:
    colours: dict[int, int] = {}
    for key, entry in skill_table.items():
        if not isinstance(entry, dict):
            continue
        colour = entry.get("PCBgColour") or 0
        if not 1 <= colour <= COLOUR_COUNT:
            continue
        skill_id = int(entry.get("Id", key))
        if 0 < skill_id < MAX_PLAYER_SKILL_ID:
            colours[skill_id] = colour
    return {str(skill_id): colours[skill_id] for skill_id in sorted(colours)}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="提取技能按钮元素底色 PCBgColour")
    parser.add_argument(
        "--ztable",
        type=Path,
        default=DEFAULT_ZTABLE_DIR,
        help="ZTable 目录（默认项目根目录下的 ZTable）",
    )
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=OUTPUT_PATH,
        help="输出 JSON 路径（默认 scripts/output/skill_bg_colours.json）",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    table_path = args.ztable / "SkillTable.json"
    if not table_path.exists():
        print(f"错误: 未找到 {table_path}", file=sys.stderr)
        return 1
    with open(table_path, "r", encoding="utf-8") as f:
        colours = build_colours(json.load(f))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(colours, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"已生成: {args.output}，共 {len(colours)} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
