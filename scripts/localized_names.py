"""Official table-ID text lookup and explicit provenance for legacy name exports.

The main export's Localization directory remains immutable. Overrides passed to
resolve() are research fallbacks; only a separately reviewed display alias may
take precedence over nonempty official text.
"""

import argparse
import json
from collections import Counter
from pathlib import Path

from game_data_paths import DATA_ROOT

ROOT = Path(__file__).resolve().parent.parent
LANGUAGES = {"zh": "chinese", "en": "english", "jp": "japanese"}


def read_json(path: Path):
    with path.open(encoding="utf-8-sig") as stream:
        return json.load(stream)


def write_json(path: Path, value, *, sort_keys: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, sort_keys=sort_keys)
        stream.write("\n")


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--localization-dir", type=Path, default=DATA_ROOT / "output/Localization",
                        help="Official Localization directory with complete manifests and Tables")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "scripts/output",
                        help="Output directory (including name_sources audit files)")


class OfficialNames:
    def __init__(self, lang: str, localization_dir: Path = DATA_ROOT / "output/Localization"):
        self.language = LANGUAGES[lang]
        self.root = localization_dir.resolve()
        self.directory = self.root / self.language
        self.manifest = read_json(self.directory / "manifest.json")
        if self.manifest.get("status") != "complete" or self.manifest.get("language") != self.language:
            raise ValueError(f"Incomplete/wrong-language localization manifest: {self.directory}")
        rules = read_json(self.root / "field_rules.json")
        if rules.get("status") != "classified":
            raise ValueError("Localization field rules are not classified")
        self.fields = {(x["Type"], x["Field"]): x["Kind"] for x in rules["fields"]}
        self.tables = {x["name"]: x for x in self.manifest["tables"]}
        self.mappings = {}
        self.references = {}
        self.records = {}

    def bind(self, table: str, field: str, template: dict) -> None:
        """Check the entire source ID set before looking up a filtered subset."""
        if self.fields.get((f"Bokura.{table}Base", field)) != "localized":
            raise ValueError(f"Not a verified localized string: {table}.{field}")
        entry = self.tables.get(table, {})
        relative = entry.get("textMapping", {}).get("fields", {}).get(field)
        if not entry.get("complete") or not relative:
            raise ValueError(f"Missing complete text mapping: {table}.{field}")
        path = (self.directory / relative).resolve()
        if not path.is_relative_to(self.directory.resolve()):
            raise ValueError(f"Text mapping escapes language directory: {relative}")
        mapping = read_json(path)
        ids = {str(row.get("Id", key)) for key, row in template.items()}
        if ids != set(template) or set(mapping) != ids or entry.get("rowCount") != len(ids):
            raise ValueError(f"Source IDs do not match localization: {table}.{field}")
        if not all(isinstance(value, str) for value in mapping.values()):
            raise ValueError(f"Expected scalar text mapping: {table}.{field}")
        refs = [x for x in read_json(self.directory / "References" / f"{table}.json")
                if x["field"] == field]
        by_id = {x["rowKey"]: x for x in refs}
        if len(refs) != len(ids) or set(by_id) != ids:
            raise ValueError(f"References do not match mapping: {table}.{field}")
        self.mappings[table, field] = mapping
        self.references[table, field] = by_id

    def resolve(self, table: str, field: str, ident, fallback: str = "", *,
                fallback_source: str = "research_template", alias: str | None = None,
                record_id=None, research_label: str | None = None) -> str:
        key = str(ident)
        mapping = self.mappings[table, field]
        if key not in mapping:
            raise ValueError(f"ID absent from official mapping: {table}.{field}[{key}]")
        official = mapping[key]
        ref = self.references[table, field][key]
        research = {}
        if alias is not None:
            if not isinstance(alias, str) or not alias:
                raise ValueError(f"Invalid reviewed display alias: {key}")
            value, source = alias, "display_alias"
        elif official:
            value, source = official, "official"
        else:
            value, source = fallback, fallback_source if fallback else "empty"
            if research_label:
                # Reviewed translations are maintained per object in overrides.
                # Do not compose a new translation over an explicit override at export time.
                research = {"researchChinese": research_label}
        if not isinstance(value, str):
            raise ValueError(f"Expected name string: {table}.{field}[{key}]")
        self.records[str(record_id if record_id is not None else ident)] = {
            "table": table, "field": field, "textId": key, "official": official,
            "officialSource": ref["source"], "languageKey": ref["key"],
            "source": source, "value": value,
            **research,
        }
        return value

    def research(self, ident, value: str, source: str, **details) -> str:
        """Record a plain/internal name without representing it as official text."""
        self.records[str(ident)] = {"source": source, "value": value, **details}
        return value

    def write_audit(self, output_path: Path) -> None:
        write_json(output_path.parent / "name_sources" / output_path.name, {
            "language": self.language,
            "localizationDirectory": str(self.root),
            "counts": dict(Counter(x["source"] for x in self.records.values())),
            "records": self.records,
        })
