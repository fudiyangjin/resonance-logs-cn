# -*- coding: utf-8 -*-
"""Export native localized Recount rows; verify groups by DamageId, never row ID.

Each language supplies its own complete CTB rows, including RecountName and
DamageId together. No name overrides or research translations are applied.
"""

import argparse
from pathlib import Path

from localized_names import OfficialNames, add_arguments, write_json
from recount_groups import damage_signature, load_native_rows, pair_groups

OUTPUT_NAMES = {"zh": "RecountTable.json", "en": "RecountTable_en.json", "jp": "RecountTable_jp.json"}


def build_output(chinese: dict, native: dict, names, include_other: bool = False) -> dict:
    matches = pair_groups(chinese, native)
    other = [damage_signature(row) for row in chinese.values() if row["RecountName"] == "其他"]
    if len(other) > 1 or any(not signature for signature in other):
        raise ValueError("Cannot identify the Chinese catch-all by a unique nonempty DamageId group")
    other_signature = other[0] if other else None
    output = {}
    for key, row in native.items():
        signature = damage_signature(row)
        if not include_other and signature and signature == other_signature:
            continue
        output[key] = dict(row)
        ref = names.references["RecountTable", "RecountName"][key]
        value = row["RecountName"]
        names.records[key] = {
            "source": "official" if value else "official_empty", "value": value,
            "table": "RecountTable", "field": "RecountName", "textId": key,
            "official": value, "officialSource": ref["source"], "languageKey": ref["key"],
            "damageIds": list(signature), "damageVerified": bool(signature),
            "damageMatch": "exact_set" if signature else "empty_unverifiable",
            "chineseSourceRow": matches[key],
        }
    return output


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    add_arguments(parser)
    parser.add_argument("--lang", choices=sorted(OUTPUT_NAMES), help="Export one language; default: all three")
    parser.add_argument("--include-other", action="store_true", help="Include the catch-all group for a complete native table")
    return parser.parse_args()


def main():
    args = parse_args()
    chinese_names = OfficialNames("zh", args.localization_dir)
    chinese = load_native_rows(chinese_names)
    planned = []
    for language in ([args.lang] if args.lang else OUTPUT_NAMES):
        names = OfficialNames(language, args.localization_dir)
        native = load_native_rows(names)
        output = build_output(chinese, native, names, args.include_other)
        planned.append((args.output_dir / OUTPUT_NAMES[language], output, names))
    # Do all language/group checks before publishing any file.
    for path, output, names in planned:
        # Native row ids are contiguous integers. Text sorting puts 10 before 2.
        output = {key: output[key] for key in sorted(output, key=int)}
        write_json(path, output, sort_keys=False)
        names.write_audit(path)
        verified = sum(record["damageVerified"] for record in names.records.values())
        print(f"Generated {path}: {len(output)} native rows; {verified} exact DamageId groups, "
              f"{len(output) - verified} empty groups unverified by damage; no name overrides")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
