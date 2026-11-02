#!/usr/bin/env python3
"""
从战斗资源相关的表生成资源栏和职业计数的配置。

- ProfessionTable.FightResTemplateId 把职业接到 FightResAttrTemplateTable 的模板。
  职业 Id 到 classKey 的映射取 src/lib/config/class_skill_configs.json 的 classId。
- 模板的 ResIDs / UIType / OpenBuff 按下标对齐。OpenBuff 取不到下标时记 0
  （Lua 的 checkContainBuff(nil) 为真，和 0 一样一直显示）。空 ResIDs 原样保留。
- EffectShowBuff 每行是 [类型, buffId, 标志, 路径]，只留类型和 buffId，按表里顺序。
- 资源名取 FightResAttrTable.Name 去掉「当前战斗资源量-」后最后一段（按 - 和 _ 切）。
  英文、日文名在 src/lib/config/<locale>/fight_res_names.json 手写覆盖。
- FightResAttrTable 只收 ExactValue > 1 的行，界面显示值是 floor(属性 / ExactValue)。
- FightResIconTable 是职业计数的显示表，effectId 就是它的行 Id。

输出到 scripts/output，生成后复制到 src/lib/config：
  fight_res_templates.json、fight_res_exact_values.json、fight_res_icons.json

用法:
  python extract_fight_res.py --ztable ../../StarResonanceTool-main/ZTable
  python extract_fight_res.py --ztable <ZTable> -o <输出目录>
"""

import argparse
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_ZTABLE_DIR = PROJECT_ROOT / "ZTable"
OUTPUT_DIR = SCRIPT_DIR / "output"
CLASS_CONFIG_PATH = PROJECT_ROOT / "src" / "lib" / "config" / "class_skill_configs.json"

# E.ResUIType（battle_res_ui_helper.lua）
UI_TYPES = {1: "dot", 2: "line", 3: "guitar", 4: "siderLine", 5: "axeBall"}
NUMBER_ICON_PREFIX = "ui/atlas/fightres_number/fightres_number"
RESOURCE_NAME_PREFIX = "当前战斗资源量-"


def load_table(ztable: Path, name: str) -> dict:
    with open(ztable / f"{name}.json", "r", encoding="utf-8") as f:
        return json.load(f)


def class_keys_by_profession() -> dict[int, str]:
    with open(CLASS_CONFIG_PATH, "r", encoding="utf-8") as f:
        configs = json.load(f)
    return {int(config["classId"]): key for key, config in configs.items()}


def resource_name(attrs: dict, res_id: int) -> str:
    name = (attrs.get(str(res_id)) or {}).get("Name") or ""
    name = name.removeprefix(RESOURCE_NAME_PREFIX)
    return re.split(r"[-_]", name)[-1] or str(res_id)


def build_templates(professions: dict, templates: dict, attrs: dict) -> dict:
    result: dict[str, dict] = {}
    class_keys = class_keys_by_profession()
    for profession_id, class_key in sorted(class_keys.items()):
        profession = professions.get(str(profession_id))
        template_id = (profession or {}).get("FightResTemplateId") or 0
        template = templates.get(str(template_id))
        if not template:
            continue
        ui_types = template.get("UIType") or []
        open_buffs = template.get("OpenBuff") or []
        resources = []
        for index, res_id in enumerate(template.get("ResIDs") or []):
            ui = UI_TYPES.get(ui_types[index]) if index < len(ui_types) else None
            if ui is None:
                continue
            open_buff = open_buffs[index] if index < len(open_buffs) else 0
            resources.append({
                "id": res_id,
                "name": resource_name(attrs, res_id),
                "ui": ui,
                "openBuff": open_buff or 0,
            })
        effect_show_buff = [
            {"type": int(row[0]), "buffId": int(row[1])}
            for row in template.get("EffectShowBuff") or []
            if len(row) >= 2
        ]
        result[class_key] = {
            "templateId": template_id,
            "resources": resources,
            "effectShowBuff": effect_show_buff,
        }
    return result


def build_exact_values(attrs: dict) -> dict[str, int]:
    values = {
        int(row.get("Id", key)): int(row["ExactValue"])
        for key, row in attrs.items()
        if isinstance(row, dict) and (row.get("ExactValue") or 1) > 1
    }
    return {str(res_id): values[res_id] for res_id in sorted(values)}


def build_icons(icons: dict) -> dict[str, dict]:
    result: dict[int, dict] = {}
    for key, row in icons.items():
        if not isinstance(row, dict):
            continue
        ui_type = row.get("UIType") or []
        res_icon = row.get("ResIcon") or ""
        digits = (
            res_icon[len(NUMBER_ICON_PREFIX):].rstrip("_")
            if res_icon.startswith(NUMBER_ICON_PREFIX)
            else None
        )
        result[int(row.get("Id", key))] = {
            "name": row.get("Name", ""),
            "showType": row.get("UIShowType") or 0,
            "subType": ui_type[0] if len(ui_type) > 0 else None,
            # 空 UIType 时 Lua 的 layerMax 是 nil，表里没有上限。
            "max": ui_type[1] if len(ui_type) > 1 else None,
            "digits": digits,
            "color": row.get("StyleColor") or None,
        }
    return {str(icon_id): result[icon_id] for icon_id in sorted(result)}


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"已生成: {path}，共 {len(data)} 条")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成资源栏模板、ExactValue 和职业计数表")
    parser.add_argument(
        "--ztable",
        type=Path,
        default=DEFAULT_ZTABLE_DIR,
        help="ZTable 目录（默认项目根目录下的 ZTable）",
    )
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=OUTPUT_DIR,
        help="输出目录（默认 scripts/output）",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    names = [
        "ProfessionTable",
        "FightResAttrTemplateTable",
        "FightResAttrTable",
        "FightResIconTable",
    ]
    for name in names:
        if not (args.ztable / f"{name}.json").exists():
            print(f"错误: 未找到 {args.ztable / f'{name}.json'}", file=sys.stderr)
            return 1
    professions, templates, attrs, icons = (load_table(args.ztable, name) for name in names)

    write_json(args.output / "fight_res_templates.json", build_templates(professions, templates, attrs))
    write_json(args.output / "fight_res_exact_values.json", build_exact_values(attrs))
    write_json(args.output / "fight_res_icons.json", build_icons(icons))
    return 0


if __name__ == "__main__":
    sys.exit(main())
