#!/usr/bin/env python3
"""从统一 BuffTable 结构导出图标和三语名称。

官方名称读取 Localization/<语言>/Tables/BuffTable/Name.json；官方为空时
保留 NameDesign、Mod/天赋研究说明和对应语言 override。原始官方值与回退来源
写入 output/name_sources，Id/Icon/SpriteFile 及图标回退行为不变。
可用 --lang、--id、--no-copy、--output-dir、--localization-dir。
"""

import argparse
import json
import shutil
import sys
from functools import lru_cache
from pathlib import Path

from game_data_paths import DATA_ROOT

from localized_names import OfficialNames, add_arguments

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
ZTABLE_DIR = DATA_ROOT / "ZTable"
BUFF_TABLE_PATH = ZTABLE_DIR / "BuffTable.json"
MOD_EFFECT_TABLE_PATH = ZTABLE_DIR / "ModEffectTable.json"
TALENT_TABLE_PATH = ZTABLE_DIR / "TalentTable.json"
OUTPUT_DIR = SCRIPT_DIR / "output"
SPRITE_DIR = DATA_ROOT / "scripts" / "exported_images" / "__no_container" / "Sprite"

LANG_CONFIGS = {
    "zh": {
        "overrides_dir": SCRIPT_DIR / "overrides",
        "output_name": "BuffName.json",
    },
    "en": {
        "overrides_dir": SCRIPT_DIR / "overrides_en",
        "output_name": "BuffName_en.json",
    },
    "jp": {
        "overrides_dir": SCRIPT_DIR / "overrides_jp",
        "output_name": "BuffName_jp.json",
    },
}

OVERRIDE_FILE_NAME = "buff_name_overrides.json"
EFFECT_CONFIG_TYPE_BUFF = 3


def load_json(path: Path) -> dict | list:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_icon_short(icon_path: str) -> str:
    """从 Icon 路径提取短名称"""
    if not icon_path:
        return ""
    return icon_path.split("/")[-1].split("\\")[-1]


def extract_buff_entries(buff_table: dict, target_id: int | None = None):
    """从 BuffTable 提取 Id、Icon 短名、NameDesign，返回 [(Id, icon_short, name_design), ...]"""
    results = []
    for key, entry in buff_table.items():
        if not isinstance(entry, dict):
            continue
        entry_id = entry.get("Id")
        icon = entry.get("Icon", "")
        name_design = entry.get("NameDesign", "")
        if target_id is not None and entry_id != target_id:
            continue
        icon_short = extract_icon_short(icon) if icon else ""
        results.append((entry_id, icon_short, name_design))
    return results


@lru_cache(maxsize=None)
def _sprite_paths(sprite_dir: Path) -> tuple[Path, ...]:
    # Keep the original filesystem order, including first-match selection.
    return tuple(sprite_dir.glob("*.png")) if sprite_dir.exists() else ()


@lru_cache(maxsize=None)
def find_sprite_images(sprite_dir: Path, icon_short: str) -> list[Path]:
    """在 Sprite 目录中搜索以 icon_short_ 开头的 png 文件"""
    prefix = f"{icon_short}_"
    return [f for f in _sprite_paths(sprite_dir) if f.name.startswith(prefix)]


def load_buff_ids(buff_table: dict) -> set[int]:
    """从 BuffTable 收集所有 Buff Id"""
    return {
        int(entry.get("Id"))
        for key, entry in buff_table.items()
        if isinstance(entry, dict) and entry.get("Id") is not None
    }


def collect_buff_ids_from_talent_effect(talent_effect: list, valid_buff_ids: set[int]) -> list[int]:
    """从 TalentEffect 中提取类型 3（buff）且在 BuffTable 中存在的 buff id。格式 [3, buff_id, ...]"""
    if not talent_effect or not valid_buff_ids:
        return []
    buff_ids = []
    for effect in talent_effect:
        if isinstance(effect, (list, tuple)) and len(effect) >= 2 and effect[0] == EFFECT_CONFIG_TYPE_BUFF:
            candidate = effect[1]
            if isinstance(candidate, int) and candidate in valid_buff_ids and candidate not in buff_ids:
                buff_ids.append(candidate)
    return buff_ids


def build_talent_fallback(talent_table: dict | None, valid_buff_ids: set[int], sprite_dir: Path):
    """
    从 TalentTable 构建：组 base_id -> 天赋信息（用于名称拼接与图标回退）。
    天赋关联的 buff 所在组为 base_id = (buff_id // 10) * 10，同组内子 buff 为 +1,+2,...
    返回: (base_id_to_talent_list, talent_id_to_sprite)
    base_id_to_talent_list[base_id] = [(talent_name, icon_short, sprite_file, buff_ids_set), ...]
    同一组可能被多个天赋引用，优先使用包含当前 buff_id 的天赋。
    """
    if not talent_table or not isinstance(talent_table, dict):
        return {}, {}

    base_id_to_talents: dict[int, list[tuple[str, str, str | None, set[int]]]] = {}
    talent_id_to_sprite: dict[int, str | None] = {}

    for key, entry in talent_table.items():
        if not isinstance(entry, dict):
            continue
        talent_id = entry.get("Id")
        talent_effect = entry.get("TalentEffect", [])
        buff_ids = collect_buff_ids_from_talent_effect(talent_effect, valid_buff_ids)
        if not buff_ids:
            continue
        talent_name = (entry.get("Des") or "").strip() or (entry.get("TalentName") or "").strip()
        icon_path = entry.get("TalentIcon", "")
        icon_short = extract_icon_short(icon_path) if icon_path else ""
        sprites = find_sprite_images(sprite_dir, icon_short) if icon_short else []
        sprite_file = sprites[0].name if sprites else None
        talent_id_to_sprite[talent_id] = sprite_file

        buff_ids_set = set(buff_ids)
        seen_bases: set[int] = set()
        for bid in buff_ids:
            base_id = (bid // 10) * 10
            if base_id in seen_bases:
                continue
            seen_bases.add(base_id)
            if base_id not in base_id_to_talents:
                base_id_to_talents[base_id] = []
            base_id_to_talents[base_id].append((talent_name, icon_short, sprite_file, buff_ids_set))

    return base_id_to_talents, talent_id_to_sprite


def get_talent_for_buff(entry_id: int, base_id_to_talents: dict) -> tuple[str, str | None] | None:
    """
    获取与当前 buff 关联的天赋（名称、sprite_file）。优先使用直接引用该 entry_id 的天赋。
    返回 (talent_name, sprite_file) 或 None。
    """
    base_id = (entry_id // 10) * 10
    talents = base_id_to_talents.get(base_id)
    if not talents:
        return None
    for talent_name, _icon_short, sprite_file, buff_ids_set in talents:
        if entry_id in buff_ids_set:
            return (talent_name, sprite_file)
    first = talents[0]
    return (first[0], first[2])


def build_mod_effect_buff_fallback(mod_effect_table: dict | None) -> dict[int, str]:
    """从 ModEffectTable Level 6 建立 buff_id -> EffectConfigIcon 映射"""
    if not mod_effect_table or not isinstance(mod_effect_table, dict):
        return {}
    result: dict[int, str] = {}
    for entry in mod_effect_table.values():
        if not isinstance(entry, dict) or entry.get("Level") != 6:
            continue
        effect_config = entry.get("EffectConfig", [])
        effect_config_icon = entry.get("EffectConfigIcon", "")
        if not effect_config_icon:
            continue
        for config in effect_config:
            if not isinstance(config, (list, tuple)) or len(config) < 2 or config[0] != EFFECT_CONFIG_TYPE_BUFF:
                continue
            try:
                buff_id = int(config[1])
            except (ValueError, TypeError):
                continue
            if buff_id not in result:
                result[buff_id] = effect_config_icon
    return result


def build_base_entries(
    buff_table: dict,
    buff_id_to_mod_icon: dict[int, str],
    base_id_to_talents: dict,
    target_id: int | None = None,
) -> tuple[list[dict], dict[str, int]]:
    """以中文 ZTable 为模板源，构建 Id/Icon/SpriteFile/NameDesign 基础条目。"""
    entries = extract_buff_entries(buff_table, target_id=target_id)
    output_data = []
    stats = {
        "with_talent_name_fix": 0,
        "with_talent_icon_fallback": 0,
    }

    for entry_id, icon_short, name_design in entries:
        sprites = find_sprite_images(SPRITE_DIR, icon_short) if icon_short else []
        sprite_file = sprites[0].name if sprites else None
        base_id = (entry_id // 10) * 10

        mod_ref_id = None
        if not icon_short and not sprite_file:
            if entry_id in buff_id_to_mod_icon:
                mod_ref_id = entry_id
            elif base_id in buff_id_to_mod_icon:
                mod_ref_id = base_id
        if mod_ref_id is not None:
            mod_icon_path = buff_id_to_mod_icon[mod_ref_id]
            mod_icon_short = extract_icon_short(mod_icon_path)
            mod_sprites = find_sprite_images(SPRITE_DIR, mod_icon_short) if mod_icon_short else []
            if mod_sprites:
                sprite_file = mod_sprites[0].name
            if mod_ref_id != entry_id:
                parent_entry = buff_table.get(str(mod_ref_id), {})
                parent_name = parent_entry.get("NameDesign", "") if isinstance(parent_entry, dict) else ""
                if parent_name:
                    name_design = f"{parent_name}-{name_design}" if name_design else parent_name

        talent_info = get_talent_for_buff(entry_id, base_id_to_talents)
        if talent_info:
            talent_name, talent_sprite = talent_info
            if talent_name and talent_name not in (name_design or ""):
                name_design = f"{name_design}-{talent_name}" if name_design else talent_name
                stats["with_talent_name_fix"] += 1
            if not sprite_file and talent_sprite:
                sprite_file = talent_sprite
                stats["with_talent_icon_fallback"] += 1

        output_data.append({
            "Id": entry_id,
            "Icon": icon_short,
            "NameDesign": name_design,
            "SpriteFile": sprite_file,
        })

    output_data.sort(key=lambda item: str(item["Id"]))
    return output_data, stats


def apply_language_names(
    base_entries: list[dict],
    lang: str,
    name_overrides: dict,
) -> tuple[list[dict], int]:
    """按语言生成最终 NameDesign，保持 Id/Icon/SpriteFile 与中文模板一致。"""
    localized_entries = []
    with_name_override = 0

    for item in base_entries:
        entry = dict(item)
        entry_id = entry["Id"]
        override_key = str(entry_id)

        if override_key in name_overrides:
            entry["NameDesign"] = name_overrides[override_key]
            with_name_override += 1

        localized_entries.append(entry)

    return localized_entries, with_name_override


def copy_sprite_images(output_data: list[dict]) -> tuple[int, Path]:
    """复制 Sprite 图片到 output/buff_icons。"""
    image_output_dir = OUTPUT_DIR / "buff_icons"
    image_output_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    copied_files: set[str] = set()

    for item in output_data:
        fname = item.get("SpriteFile")
        if fname and fname not in copied_files:
            src = SPRITE_DIR / fname
            if src.exists():
                dst = image_output_dir / fname
                if not dst.exists() or dst.stat().st_size != src.stat().st_size:
                    shutil.copy2(src, dst)
                    copied += 1
                    copied_files.add(fname)

    return copied, image_output_dir


def write_buff_output(lang: str, output_data: list[dict], with_name_override: int) -> Path:
    output_path = OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2, sort_keys=True)
    print(
        f"已生成: {output_path}，共 {len(output_data)} 条"
        f"（匹配 {with_name_override} 条回退例外，非空官方名称优先）"
    )
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="从 BuffTable 提取 Id/Icon/NameDesign，支持 ModEffect 与天赋回退")
    add_arguments(parser)
    parser.add_argument("--id", type=int, default=None, help="仅提取指定 Id（可选）")
    parser.add_argument("--no-copy", action="store_true", help="不复制图片到 output")
    parser.add_argument(
        "--lang",
        choices=sorted(LANG_CONFIGS.keys()),
        help="只生成指定语言；默认生成所有语言。",
    )
    return parser.parse_args()


def main():
    global OUTPUT_DIR
    args = parse_args()
    OUTPUT_DIR = args.output_dir
    langs = [args.lang] if args.lang else list(LANG_CONFIGS.keys())

    if not BUFF_TABLE_PATH.exists():
        print(f"错误: BuffTable.json 不存在: {BUFF_TABLE_PATH}", file=sys.stderr)
        return 2

    buff_table = load_json(BUFF_TABLE_PATH)
    valid_buff_ids = load_buff_ids(buff_table)

    mod_effect_table = load_json(MOD_EFFECT_TABLE_PATH) if MOD_EFFECT_TABLE_PATH.exists() else None
    buff_id_to_mod_icon = build_mod_effect_buff_fallback(mod_effect_table)

    talent_table = load_json(TALENT_TABLE_PATH) if TALENT_TABLE_PATH.exists() else None
    base_id_to_talents, _talent_id_to_sprite = build_talent_fallback(talent_table, valid_buff_ids, SPRITE_DIR)

    base_entries, build_stats = build_base_entries(
        buff_table,
        buff_id_to_mod_icon,
        base_id_to_talents,
        target_id=args.id,
    )
    if not base_entries:
        print("未找到任何 Buff 条目")
        return 0

    zh_overrides = load_json(LANG_CONFIGS["zh"]["overrides_dir"] / OVERRIDE_FILE_NAME)
    zh_entries, _ = apply_language_names(base_entries, "zh", zh_overrides)
    research_labels = {str(item["Id"]): item["NameDesign"] for item in zh_entries}
    for lang in langs:
        names = OfficialNames(lang, args.localization_dir)
        names.bind("BuffTable", "Name", buff_table)
        name_overrides = load_json(LANG_CONFIGS[lang]["overrides_dir"] / OVERRIDE_FILE_NAME)
        if not isinstance(name_overrides, dict):
            name_overrides = {}

        output_data, with_name_override = apply_language_names(
            base_entries,
            lang,
            name_overrides,
        )
        for entry in output_data:
            key = str(entry["Id"])
            entry["NameDesign"] = names.resolve(
                "BuffTable", "Name", key, entry["NameDesign"],
                fallback_source="research_override" if key in name_overrides else "research_template",
                research_label=research_labels[key],
            )
        write_buff_output(lang, output_data, with_name_override)
        names.write_audit(OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"])

    copied = 0
    image_output_dir = OUTPUT_DIR / "buff_icons"
    if not args.no_copy:
        copied, image_output_dir = copy_sprite_images(base_entries)

    with_sprite = len([x for x in base_entries if x["SpriteFile"]])
    with_mod_fallback = sum(
        1 for x in base_entries
        if not x["Icon"] and x["SpriteFile"]
        and (x["Id"] in buff_id_to_mod_icon or ((x["Id"] // 10) * 10) in buff_id_to_mod_icon)
    )
    print(f"提取到 {len(base_entries)} 条 Buff 条目（中文模板源）")
    print(f"其中找到对应 Sprite 图片的: {with_sprite} 个")
    print(f"通过 Level 6 ModEffect 回退图标的: {with_mod_fallback} 个")
    print(f"通过天赋补全名称的: {build_stats['with_talent_name_fix']} 个")
    print(f"通过天赋回退图标的: {build_stats['with_talent_icon_fallback']} 个")
    if copied > 0:
        print(f"已复制 {copied} 个图片到 {image_output_dir}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
