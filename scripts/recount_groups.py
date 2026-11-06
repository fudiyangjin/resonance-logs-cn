"""Read native localized Recount rows and pair only by complete DamageId sets."""

from localized_names import read_json


def damage_signature(row: dict) -> tuple[int, ...]:
    values = row.get("DamageId")
    if not isinstance(values, list) or any(type(x) is not int for x in values):
        raise ValueError("Recount DamageId must be an integer array; floats/booleans are not accepted")
    if len(values) != len(set(values)):
        raise ValueError("Duplicate DamageId within Recount group")
    return tuple(sorted(values))


def damage_index(rows: dict) -> dict[tuple[int, ...], str]:
    result = {}
    for key, row in rows.items():
        signature = damage_signature(row)
        if not signature:
            continue  # All empty lists must not be mistaken for one matched group.
        if signature in result:
            raise ValueError(f"Ambiguous Recount DamageId group: rows {result[signature]} and {key}")
        result[signature] = key
    return result


def pair_groups(chinese: dict, target: dict) -> dict[str, str | None]:
    source_index, target_index = damage_index(chinese), damage_index(target)
    missing = source_index.keys() - target_index.keys()
    extra = target_index.keys() - source_index.keys()
    if missing or extra:
        raise ValueError(f"Recount DamageId groups differ (missing={len(missing)}, extra={len(extra)}); "
                         "partial overlap and equal row IDs are not translation matches")
    return {key: source_index.get(damage_signature(row)) for key, row in target.items()}


def load_native_rows(names) -> dict:
    entry = names.tables.get("RecountTable", {})
    relative = entry.get("textMapping", {}).get("fullTable")
    if not entry.get("complete") or not relative:
        raise ValueError("Missing native Recount fullTable; re-export --tables RecountTable for all languages")
    path = (names.directory / relative).resolve()
    if not path.is_relative_to(names.directory.resolve()):
        raise ValueError("Recount fullTable path escapes the language directory")
    rows = read_json(path)
    if not isinstance(rows, dict) or entry.get("rowCount") != len(rows):
        raise ValueError("Recount fullTable row count mismatch")
    # This is integrity within one native export, not cross-language ID alignment.
    names.bind("RecountTable", "RecountName", rows)
    for key, row in rows.items():
        damage_signature(row)
        if not isinstance(row.get("RecountName"), str):
            raise ValueError("Native RecountName must be a string")
        if row["RecountName"] != names.mappings["RecountTable", "RecountName"][key]:
            raise ValueError("Native Recount fullTable and field mapping are stale/inconsistent")
    damage_index(rows)
    return rows
