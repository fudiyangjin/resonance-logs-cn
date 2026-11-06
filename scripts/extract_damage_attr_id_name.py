# -*- coding: utf-8 -*-
"""Export DamageAttr labels, whose own Name is a plain string.

The source object is DamageType plus TypeEnum: 1 SkillTable, 2 BuffTable, 3 BulletTable.
A skill-panel line may add its official SkillAttrDes label only when this damage ID is
the sole ID behind that line and the line is not shared with a different label.
Merged panel lines describe a sum, so they do not rename each member.
BulletTable.Name is plain text and may replace a more internal damage Name.
A direct DamageAttr.Name mapping is accepted only if its getter is classified ML.
"""

import argparse
import json
import re
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
        "output_name": "DamageAttrIdName.json",
    },
    "en": {
        "overrides_dir": SCRIPT_DIR / "overrides_en",
        "output_name": "DamageAttrIdName_en.json",
    },
    "jp": {
        "overrides_dir": SCRIPT_DIR / "overrides_jp",
        "output_name": "DamageAttrIdName_jp.json",
    },
}

OVERRIDE_FILE_NAME = "damage_attr_id_name_overrides.json"
TYPED_TABLES = {1: "SkillTable", 2: "BuffTable", 3: "BulletTable"}
LOCALIZATION_LANG = {"zh": "chinese", "en": "english", "jp": "japanese"}
GENERIC_LABELS = {
    "伤害", "治疗", "总伤害", "总治疗", "技能伤害", "技能治疗",
    "单次伤害", "单次治疗", "每段伤害", "基础伤害", "持续伤害", "持续治疗",
}
GENERIC_LABEL_RE = re.compile(r"(?:强化)?[0-9一二三四五六七八九十]+段(?:伤害|治疗)")
MERGE_RE = re.compile(r"skillpara\.damageMerge\(\{([^}]*)\}")
SINGLE_RE = re.compile(r"skillpara\.damage\((\d+)")
INTERNAL_RE = re.compile(r"[A-Za-z]{3,}|_")
INTERNAL_MARKS = ("废弃", "不用", "虚拟体", "虚拟机")


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _pick_name(entry: dict) -> str | None:
    if not isinstance(entry, dict):
        return None
    for field in ("NameDesign", "Name"):
        value = entry.get(field)
        if value:
            return value
    return None


def is_internal_name(name: str) -> bool:
    text = (name or "").strip()
    if not text:
        return True
    if any(mark in text for mark in INTERNAL_MARKS):
        return True
    return INTERNAL_RE.search(text) is not None


def is_generic_label(label: str) -> bool:
    text = (label or "").strip()
    return text in GENERIC_LABELS or GENERIC_LABEL_RE.fullmatch(text) is not None


def typed_display(official: str, label: str, *, allow_bare_label: bool) -> str | None:
    official = (official or "").strip()
    label = (label or "").strip()
    if official and label:
        return official if official == label else f"{official}·{label}"
    if allow_bare_label and label and not official:
        return label
    return None


def panel_label_applies(entry: dict, skill_table: dict, effect_rows: dict, effect_ids) -> bool:
    """A panel line names this damage only when its skill is the typed source.

    Buff and bullet rows have no skill ID of their own; their panel line still
    describes this damage ID. A skill row accepts the line only from itself or
    from the skill level group that contains it.
    """
    hosts = set()
    for effect_id in effect_ids or []:
        row = effect_rows.get(str(effect_id))
        if not isinstance(row, dict) or row.get("SkillId") is None:
            return False
        hosts.add(str(row.get("SkillId")))
    damage_type = entry.get("DamageType")
    if damage_type in (2, 3):
        return True
    if damage_type != 1 or not hosts:
        return False
    skill = skill_table.get(str(entry.get("TypeEnum")), {})
    group = str(skill.get("SkillLevelGroup") or "")
    type_enum = str(entry.get("TypeEnum"))
    return type_enum in hosts or (group not in {"", "0"} and group in hosts)


def clearer_bullet_name(damage_name: str, bullet_name: str) -> str | None:
    bullet = (bullet_name or "").strip()
    current = damage_name or ""
    if not bullet or bullet == current or is_internal_name(bullet):
        return None
    if current and not is_internal_name(current):
        return None
    return bullet


def _formula_groups(formula: str) -> list[tuple[str, ...]]:
    groups = []
    for match in MERGE_RE.finditer(formula or ""):
        ids = tuple(part for part in match.group(1).split(",") if part)
        if ids and ids not in groups:
            groups.append(ids)
    for match in SINGLE_RE.finditer(formula or ""):
        group = (match.group(1),)
        if group not in groups:
            groups.append(group)
    return groups


def _reference_index(path: Path) -> dict[tuple[str, int], str]:
    if not path.exists():
        return {}
    return {
        (item["rowKey"], item["element"]): item["source"]
        for item in json.loads(path.read_text(encoding="utf-8"))
        if item.get("field") == "SkillAttrDes"
    }


def _language_lines(localization_dir: Path, lang: str) -> dict[tuple[str, int], tuple[str, tuple]]:
    folder = localization_dir / LOCALIZATION_LANG[lang]
    manifest_path = folder / "manifest.json"
    if not manifest_path.exists():
        return {}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    relative = next(
        (table.get("textMapping", {}).get("fields", {}).get("SkillAttrDes")
         for table in manifest.get("tables", []) if table.get("name") == "SkillEffectTable"),
        None,
    )
    if not relative:
        return {}
    text_path = folder / relative
    if not text_path.exists():
        return {}
    descriptions = json.loads(text_path.read_text(encoding="utf-8"))
    references = _reference_index(folder / "References" / "SkillEffectTable.json")
    lines = {}
    for effect_id, pairs in descriptions.items():
        if not isinstance(pairs, list):
            continue
        for index, pair in enumerate(pairs):
            if not isinstance(pair, list) or len(pair) != 2:
                continue
            label, formula = pair
            if not isinstance(label, str) or not isinstance(formula, str):
                continue
            if "{*" in label or "skillpara.damage" not in formula:
                continue
            element = index * 2
            if references.get((str(effect_id), element)) != "language_pool":
                continue
            groups = tuple(_formula_groups(formula))
            if groups:
                lines[(str(effect_id), element)] = (label.strip(), groups)
    return lines


def load_skill_line_labels(localization_dir: Path) -> dict[str, dict[str, dict]]:
    """Sole official panel labels keyed by damage ID.

    A hit cited by several IDs, or one ID cited under more than one label, is omitted.
    Another language is included only when its formula cites the same IDs.
    """
    chinese = _language_lines(localization_dir, "zh")
    if not chinese:
        return {lang: {} for lang in LANG_CONFIGS}
    citations: dict[str, list[tuple]] = {}
    for (effect_id, element), (label, groups) in chinese.items():
        for group in groups:
            merged = len(group) != 1
            for damage_id in group:
                citations.setdefault(damage_id, []).append((effect_id, element, label, merged))
    eligible = {}
    for damage_id, rows in citations.items():
        labels = {label for _, _, label, _ in rows if label}
        if any(merged for _, _, _, merged in rows) or len(labels) != 1:
            continue
        eligible[damage_id] = rows
    result = {lang: {} for lang in LANG_CONFIGS}
    other = {lang: _language_lines(localization_dir, lang) for lang in ("en", "jp")}
    for damage_id, rows in eligible.items():
        zh_label = rows[0][2]
        result["zh"][damage_id] = {
            "label": zh_label,
            "effectIds": sorted({effect_id for effect_id, _, _, _ in rows}),
            "elements": sorted({element for _, element, _, _ in rows}),
        }
        for lang, lines in other.items():
            translated = []
            for effect_id, element, _, _ in rows:
                found = lines.get((effect_id, element))
                if not found or found[1] != chinese[(effect_id, element)][1]:
                    translated = []
                    break
                translated.append(found[0])
            if translated and len(set(translated)) == 1 and translated[0]:
                result[lang][damage_id] = {
                    "label": translated[0],
                    "effectIds": result["zh"][damage_id]["effectIds"],
                    "elements": result["zh"][damage_id]["elements"],
                }
    return result


def _strict_source(entry: dict, tables: dict[str, dict]) -> tuple[str | None, str | None]:
    table_name = TYPED_TABLES.get(entry.get("DamageType"))
    if not table_name:
        return None, None
    source = tables.get(table_name, {}).get(str(entry.get("TypeEnum")))
    if not isinstance(source, dict):
        return None, table_name
    return _pick_name(source), table_name


def _untyped_name(entry: dict, tables: dict[str, dict], strict_name: str | None) -> str | None:
    """Keep a historical plain label only when the typed row itself has no name."""
    if entry.get("Name") or strict_name:
        return None
    preferred = TYPED_TABLES.get(entry.get("DamageType"))
    key = str(entry.get("TypeEnum"))
    for table_name, table in tables.items():
        if table_name == preferred:
            continue
        name = _pick_name(table.get(key, {}))
        if name:
            return name
    return None


def _build_base_names(table: dict, tables: dict[str, dict]) -> dict[str, str]:
    result: dict[str, str] = {}
    for entry in table.values():
        if not (isinstance(entry, dict) and "Id" in entry):
            continue
        attr_id = str(entry["Id"])
        name = entry.get("Name")
        if name:
            result[attr_id] = name
            continue
        strict_name, _ = _strict_source(entry, tables)
        fallback = strict_name or _untyped_name(entry, tables, strict_name)
        if fallback:
            result[attr_id] = fallback
    return result


def _build_damage_attr_names(lang: str, table: dict, tables: dict[str, dict]) -> tuple[dict, int]:
    overrides_path = LANG_CONFIGS[lang]["overrides_dir"] / OVERRIDE_FILE_NAME
    name_overrides = _load_json(overrides_path)
    result = _build_base_names(table, tables)
    result.update({str(attr_id): name for attr_id, name in name_overrides.items()})
    return result, len(name_overrides)


def _related_match(entry: dict, plain_label: str, related_entry: dict, official_zh: str | None) -> str | None:
    if not entry.get("Name"):
        return "empty_plain_name"
    if plain_label.strip() == (related_entry.get("NameDesign") or "").strip() and related_entry.get("NameDesign"):
        return "same_design_name"
    if official_zh and plain_label == official_zh:
        return "same_official_chinese_name"
    return None


def _write_damage_attr_names(lang: str, result: dict, override_count: int) -> None:
    output_path = OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)
    print(f"已生成: {output_path}，共 {len(result)} 条（{override_count} 条研究例外输入，按正式术语校准）")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="从 ZTable/DamageAttrTable.json 提取多语言伤害属性 Id -> Name。"
    )
    add_arguments(parser)
    parser.add_argument(
        "--lang",
        choices=sorted(LANG_CONFIGS.keys()),
        help="只生成指定语言；默认生成所有语言。",
    )
    return parser.parse_args()


def _choose_name(key: str, entry: dict, value: str, lang: str, *, tables, related_templates,
                 names: OfficialNames, chinese: OfficialNames, overrides: dict, plain_label: str,
                 ui_labels: dict, effect_rows: dict) -> tuple[str, str, dict]:
    damage_type = entry.get("DamageType")
    related_table = TYPED_TABLES.get(damage_type) if damage_type in (1, 2) else None
    related_id = str(entry.get("TypeEnum"))
    source_name = "research_override" if key in overrides else "research_plain"
    official = ""
    if related_table and related_id in names.mappings[related_table, "Name"]:
        official = names.mappings[related_table, "Name"][related_id]
    strict_name, _ = _strict_source(entry, tables)
    ui = ui_labels.get(lang, {}).get(key)
    zh_ui = ui_labels.get("zh", {}).get(key, {})
    allow_bare = bool(
        ui and zh_ui.get("label") and not official
        and not is_generic_label(zh_ui["label"])
        and is_internal_name(entry.get("Name") or strict_name or "")
    )
    known_relation = damage_type == 3 or (
        related_table is not None and related_id in names.mappings[related_table, "Name"]
    )
    composed = typed_display(official, ui["label"] if ui else "", allow_bare_label=allow_bare)
    panel_applies = bool(ui) and panel_label_applies(
        entry, tables.get("SkillTable", {}), effect_rows, ui.get("effectIds") if ui else [],
    )
    if composed and ui and known_relation and panel_applies:
        return composed, "typed_ui", {
            "table": related_table or TYPED_TABLES.get(damage_type), "field": "Name", "textId": related_id,
            "damageType": damage_type, "typeEnum": entry.get("TypeEnum"), "uiLabel": ui["label"],
            "uiLabelChinese": zh_ui.get("label", ""), "officialName": official, "effectIds": ui["effectIds"],
        }

    related_entry = related_templates.get(related_table, {}).get(related_id, {})
    related_chinese = chinese.mappings.get((related_table, "Name"), {}).get(related_id)
    match = _related_match(entry, plain_label, related_entry, related_chinese)
    if match and related_table and related_id in names.mappings[related_table, "Name"]:
        return value, "related", {"match": match, "fallback": value, "source_name": source_name}

    if key not in overrides and damage_type == 3:
        bullet_name = _pick_name(tables["BulletTable"].get(related_id, {}))
        replacement = clearer_bullet_name(entry.get("Name") or "", bullet_name or "")
        if replacement:
            value = replacement
    return value, source_name, {}


def main() -> int:
    global OUTPUT_DIR
    args = parse_args()
    OUTPUT_DIR = args.output_dir
    langs = [args.lang] if args.lang else list(LANG_CONFIGS.keys())

    input_path = ZTABLE_DIR / "DamageAttrTable.json"
    if not input_path.exists():
        print(f"错误: 未找到伤害属性表: {input_path}")
        return 1

    table = _load_json(input_path)
    tables = {name: _load_json(ZTABLE_DIR / f"{name}.json") for name in ("SkillTable", "BuffTable", "BulletTable")}
    effect_rows = _load_json(ZTABLE_DIR / "SkillEffectTable.json")
    zh_result, _ = _build_damage_attr_names("zh", table, tables)
    canonical_keys = set(zh_result.keys())
    related_templates = {source: tables[source] for source in ("SkillTable", "BuffTable")}
    ui_labels = load_skill_line_labels(args.localization_dir)
    chinese = OfficialNames("zh", args.localization_dir)
    for source, template in related_templates.items():
        chinese.bind(source, "Name", template)
    zh_overrides = _load_json(LANG_CONFIGS["zh"]["overrides_dir"] / OVERRIDE_FILE_NAME)
    chinese_display = {}
    for key in canonical_keys:
        if key not in zh_result or key not in table:
            continue
        chosen, _kind, _extra = _choose_name(
            key, table[key], zh_result[key], "zh", tables=tables, related_templates=related_templates,
            names=chinese, chinese=chinese, overrides=zh_overrides, plain_label=zh_result[key],
            ui_labels=ui_labels, effect_rows=effect_rows,
        )
        chinese_display[key] = chosen

    for lang in langs:
        names = OfficialNames(lang, args.localization_dir)
        for source in ("SkillTable", "BuffTable"):
            names.bind(source, "Name", related_templates[source])
        own_localized = names.fields.get(("Bokura.DamageAttrTableBase", "Name")) == "localized"
        if own_localized:
            names.bind("DamageAttrTable", "Name", table)
        overrides = _load_json(LANG_CONFIGS[lang]["overrides_dir"] / OVERRIDE_FILE_NAME)
        result, override_count = _build_damage_attr_names(lang, table, tables)
        result = {key: result[key] for key in sorted(canonical_keys) if key in result}
        for key, value in list(result.items()):
            entry = table.get(key, {})
            plain_label = zh_result[key]
            display_zh = chinese_display.get(key, plain_label)
            if own_localized and names.mappings["DamageAttrTable", "Name"].get(key):
                result[key] = names.resolve("DamageAttrTable", "Name", key)
                continue
            chosen, kind, extra = _choose_name(
                key, entry, value, lang, tables=tables, related_templates=related_templates,
                names=names, chinese=chinese, overrides=overrides, plain_label=plain_label,
                ui_labels=ui_labels, effect_rows=effect_rows,
            )
            if kind == "typed_ui":
                result[key] = names.research(key, chosen, "typed_ui", researchChinese=display_zh, **extra)
            elif kind == "related":
                result[key] = names.resolve(
                    TYPED_TABLES[entry.get("DamageType")], "Name", entry.get("TypeEnum"), extra["fallback"],
                    fallback_source=extra["source_name"], record_id=key, research_label=plain_label,
                )
                names.records[key]["relatedMatch"] = extra["match"]
                names.records[key]["researchChinese"] = plain_label
                if names.records[key]["source"] == "official":
                    names.records[key]["source"] = "related_official"
            else:
                result[key] = names.research(
                    key, chosen, kind, table="DamageAttrTable", field="Name",
                    damageType=entry.get("DamageType"), typeEnum=entry.get("TypeEnum"),
                    researchChinese=display_zh,
                )
        _write_damage_attr_names(lang, result, override_count)
        names.write_audit(OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
