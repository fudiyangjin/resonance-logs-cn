#!/usr/bin/env python3
"""Export DbmTable structure with official Content and separate name provenance."""

import argparse
import json
from pathlib import Path

from game_data_paths import DATA_ROOT

from localized_names import OfficialNames, add_arguments


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = SCRIPT_DIR / "output"
ZH_DBM_PATH = DATA_ROOT / "ZTable" / "DbmTable.json"
OVERRIDE_FILE_NAME = "dbm_content_overrides.json"

LANG_CONFIGS = {
    "zh": {
        "overrides_dir": SCRIPT_DIR / "overrides",
        "output_name": "DbmTable.json",
    },
    "en": {
        "overrides_dir": SCRIPT_DIR / "overrides_en",
        "output_name": "DbmTable_en.json",
    },
    "jp": {
        "overrides_dir": SCRIPT_DIR / "overrides_jp",
        "output_name": "DbmTable_jp.json",
    },
}


def load_json(path: Path, missing_ok: bool = False) -> dict:
    if not path.exists():
        if missing_ok:
            return {}
        raise FileNotFoundError(path)
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def source_dbm_table() -> dict:
    table = load_json(ZH_DBM_PATH)
    result = {}
    for key, entry in table.items():
        if not isinstance(entry, dict):
            continue
        source_key = str(entry.get("Id", key))
        result[source_key] = dict(entry)
    return result


def load_overrides(lang: str) -> dict:
    if lang == "zh":
        return {}
    path = LANG_CONFIGS[lang]["overrides_dir"] / OVERRIDE_FILE_NAME
    return load_json(path, missing_ok=True)


def build_dbm_table(lang: str, source_table: dict) -> tuple[dict, int]:
    overrides = load_overrides(lang)
    result = {key: dict(entry) for key, entry in source_table.items()}
    applied_count = 0
    for dbm_id, content in overrides.items():
        entry = result.get(str(dbm_id))
        if isinstance(entry, dict):
            entry["Content"] = content
            applied_count += 1
    return result, applied_count


def write_dbm_table(lang: str, result: dict, override_count: int) -> Path:
    output_path = OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(result, file, ensure_ascii=False, indent=2)
    print(f"Generated {output_path}: {len(result)} rows, {override_count} fallback inputs; official text wins")
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export localized DbmTable configuration.")
    add_arguments(parser)
    parser.add_argument(
        "--lang",
        choices=sorted(LANG_CONFIGS),
        help="Export one language; all languages are exported by default.",
    )
    return parser.parse_args()


def main() -> int:
    global OUTPUT_DIR
    args = parse_args()
    OUTPUT_DIR = args.output_dir
    langs = [args.lang] if args.lang else list(LANG_CONFIGS)
    try:
        source_table = source_dbm_table()
        for lang in langs:
            names = OfficialNames(lang, args.localization_dir)
            names.bind("DbmTable", "Content", source_table)
            result, override_count = build_dbm_table(lang, source_table)
            overrides = load_overrides(lang)
            for key, entry in result.items():
                entry["Content"] = names.resolve(
                    "DbmTable", "Content", key, entry["Content"],
                    fallback_source="research_override" if key in overrides else "research_template",
                    research_label=source_table[key]["Content"],
                )
            write_dbm_table(lang, result, override_count)
            names.write_audit(OUTPUT_DIR / LANG_CONFIGS[lang]["output_name"])
    except FileNotFoundError as error:
        print(f"Missing input: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
