#!/usr/bin/env python3
"""
从天赋表生成技能伤害"天赋图标"的职业 / 专精分组和各语言名称。

- TalentTreeTable 的 WeaponType 就是职业 Id，映射到 classKey 取
  src/lib/config/class_skill_configs.json 的 classId（与 extract_fight_res 相同）。
- TalentStage=0 是职业通用树；TalentStage=1 时 BdType 区分两个专精，
  专精分区的 stageId 取 TalentStageTable 里同 WeaponType + BdType + TalentStage=1 的行 Id
  （与 src/lib/config/talent-stages.ts 的 TALENT_STAGE_SPECS 一致，例如 101 居合 / 102 月刃）。
- TalentTable.TalentIcon 的末段对到 static/images/talent 里的 <末段>_<hash>.png，对不上直接报错。
- 归类：common_* 是属性节点的占位图标，只进"公共"；同一职业内只在一个专精出现的进该专精，
  出现在通用树或两个专精都有的进"通用"（stageId 为 null）；跨职业的非 common 图标每个职业各一份。
  文件夹里没被任何天赋树用到的图标也进"公共"，保证所有分组的并集就是整个文件夹。
- 名称取各语言 TalentTable.TalentName 官方文本；按天赋 Id 顺序去重，空文本跳过（前端回落中文）。

输出目录的结构与 src/lib/config 相同，可以直接用 -o src/lib/config：
  talent-icon-groups.json
  talent_icon_names.json、en-US/talent_icon_names.json、ja-JP/talent_icon_names.json

用法:
  python extract_talent_icons.py
  python extract_talent_icons.py --ztable <ZTable> -o src/lib/config
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from game_data_paths import DATA_ROOT

from localized_names import OfficialNames, add_arguments

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CLASS_CONFIG_PATH = PROJECT_ROOT / "src" / "lib" / "config" / "class_skill_configs.json"
TALENT_IMAGE_DIR = PROJECT_ROOT / "static" / "images" / "talent"
IMAGE_URL_PREFIX = "/images/talent/"
COMMON_PREFIX = "common_"
GROUPS_FILE = "talent-icon-groups.json"
NAMES_FILE = "talent_icon_names.json"
# 语言 -> 相对输出目录的子目录（中文是基础文件，放在根上）。
LANG_DIRS = {"zh": "", "en": "en-US", "jp": "ja-JP"}
FILE_PATTERN = re.compile(r"^(?P<stem>.+)_-?\d+\.png$")


def load_table(ztable: Path, name: str) -> dict:
    with open(ztable / f"{name}.json", "r", encoding="utf-8") as f:
        return json.load(f)


def class_keys_by_id() -> dict[int, str]:
    with open(CLASS_CONFIG_PATH, "r", encoding="utf-8") as f:
        configs = json.load(f)
    return {int(config["classId"]): key for key, config in configs.items()}


def icon_files(directory: Path) -> dict[str, str]:
    """stem -> 文件名；同一个 stem 出现两次视为错误。"""
    files: dict[str, str] = {}
    for path in sorted(directory.iterdir()):
        match = FILE_PATTERN.match(path.name)
        if not match:
            continue
        stem = match["stem"]
        if stem in files:
            raise ValueError(f"重复的天赋图标: {files[stem]} / {path.name}")
        files[stem] = path.name
    return files


def icon_stem(talent: dict) -> str:
    return str(talent.get("TalentIcon") or "").replace("\\", "/").split("/")[-1]


def spec_stage_ids(stages: dict) -> dict[tuple[int, int], int]:
    return {
        (int(row["WeaponType"]), int(row["BdType"])): int(row.get("Id", key))
        for key, row in stages.items()
        if isinstance(row, dict) and row.get("TalentStage") == 1
    }


def collect_usage(talents: dict, tree: dict, stages: dict, class_keys: dict[int, str]):
    """返回 classKey -> stem -> {分区 stageId 或 None}、专精行表，以及 stem -> 排序用的最小天赋 Id。"""
    spec_ids = spec_stage_ids(stages)
    usage: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    order: dict[str, int] = {}
    for row in tree.values():
        if not isinstance(row, dict):
            continue
        class_key = class_keys.get(int(row.get("WeaponType") or 0))
        talent = talents.get(str(row.get("TalentId")))
        if not class_key or not talent:
            continue
        stem = icon_stem(talent)
        if not stem:
            continue
        if row.get("TalentStage") == 0:
            section = None
        else:
            key = (int(row["WeaponType"]), int(row.get("BdType") or 0))
            if key not in spec_ids:
                raise ValueError(f"TalentStageTable 缺少专精行: WeaponType={key[0]} BdType={key[1]}")
            section = spec_ids[key]
        usage[class_key][stem].add(section)
        talent_id = int(talent.get("Id", row["TalentId"]))
        order[stem] = min(order.get(stem, talent_id), talent_id)
    return usage, spec_ids, order


def build_groups(usage, spec_ids, class_keys: dict[int, str], files: dict[str, str], order) -> dict:
    missing = sorted({
        stem for stems in usage.values() for stem in stems
        if stem not in files and not stem.startswith(COMMON_PREFIX)
    })
    if missing:
        raise ValueError(f"static/images/talent 缺少 {len(missing)} 个天赋图标: {', '.join(missing)}")

    def url(stem: str) -> str:
        return IMAGE_URL_PREFIX + files[stem]

    def sort_key(stem: str):
        return (order.get(stem, sys.maxsize), stem)

    classes = []
    placed: set[str] = set()
    for class_id, class_key in sorted(class_keys.items()):
        stems = usage.get(class_key, {})
        spec_stages = sorted(stage for (weapon, _), stage in spec_ids.items() if weapon == class_id)
        buckets: dict[int | None, list[str]] = {None: [], **{stage: [] for stage in spec_stages}}
        for stem, sections in stems.items():
            if stem.startswith(COMMON_PREFIX) or stem not in files:
                continue
            specs = sections - {None}
            target = next(iter(specs)) if None not in sections and len(specs) == 1 else None
            buckets[target].append(stem)
            placed.add(stem)
        classes.append({
            "classKey": class_key,
            "sections": [
                {"stageId": stage, "icons": [url(stem) for stem in sorted(items, key=sort_key)]}
                for stage, items in buckets.items()
            ],
        })
    common = sorted(url(stem) for stem in files if stem not in placed)
    return {"classes": classes, "common": common}


def build_names(names: OfficialNames, talents: dict, tree: dict, files: dict[str, str]) -> dict:
    in_tree = {str(row.get("TalentId")) for row in tree.values() if isinstance(row, dict)}
    by_stem: dict[str, list[tuple[bool, int, str]]] = defaultdict(list)
    for key, talent in talents.items():
        stem = icon_stem(talent)
        if stem not in files:
            continue
        name = names.resolve("TalentTable", "TalentName", key, "", fallback_source="empty").strip()
        if name:
            by_stem[stem].append((key not in in_tree, int(talent.get("Id", key)), name))
    result: dict[str, list[str]] = {}
    for stem in sorted(by_stem):
        rows = sorted(by_stem[stem])
        # 天赋树里用到的名字优先；只有树外条目时（公共属性图标）才用树外名字。
        if not rows[0][0]:
            rows = [row for row in rows if not row[0]]
        unique = list(dict.fromkeys(name for _, _, name in rows))
        result[files[stem]] = unique
    return result


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"已生成: {path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成天赋图标的职业 / 专精分组和名称")
    add_arguments(parser)
    parser.add_argument("--ztable", type=Path, default=DATA_ROOT / "ZTable",
                        help="ZTable 目录（默认取 game_data_paths 的数据根目录）")
    parser.add_argument("--images", type=Path, default=TALENT_IMAGE_DIR,
                        help="天赋图标目录（默认 static/images/talent）")
    parser.add_argument("-o", "--output", type=Path, default=None,
                        help="输出目录，结构同 src/lib/config（默认同 --output-dir）")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output or args.output_dir
    for name in ("TalentTable", "TalentTreeTable", "TalentStageTable"):
        if not (args.ztable / f"{name}.json").exists():
            print(f"错误: 未找到 {args.ztable / f'{name}.json'}", file=sys.stderr)
            return 1
    talents = load_table(args.ztable, "TalentTable")
    tree = load_table(args.ztable, "TalentTreeTable")
    stages = load_table(args.ztable, "TalentStageTable")
    class_keys = class_keys_by_id()
    files = icon_files(args.images)

    usage, spec_ids, order = collect_usage(talents, tree, stages, class_keys)
    write_json(output / GROUPS_FILE, build_groups(usage, spec_ids, class_keys, files, order))

    for lang, subdir in LANG_DIRS.items():
        names = OfficialNames(lang, args.localization_dir)
        names.bind("TalentTable", "TalentName", talents)
        path = output / subdir / NAMES_FILE if subdir else output / NAMES_FILE
        write_json(path, build_names(names, talents, tree, files))
        names.write_audit(args.output_dir / f"talent_icon_names_{lang}.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
