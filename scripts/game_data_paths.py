"""Resolve extracted game data independently of the downstream application root."""

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def data_root(explicit: Path | None = None, *, validate: bool = False) -> Path:
    configured = explicit or os.environ.get("STAR_RESONANCE_DATA_ROOT")
    if configured:
        root = Path(configured).expanduser().resolve()
    elif (PROJECT_ROOT / "ZTable").is_dir() and (PROJECT_ROOT / "output/Localization").is_dir():
        root = PROJECT_ROOT
    else:
        root = PROJECT_ROOT.parent / "StarResonanceTool-main"
    if validate:
        required = [root / "ZTable", root / "output/Localization/field_rules.json"]
        required += [root / "output/Localization" / lang / "manifest.json"
                     for lang in ("chinese", "english", "japanese")]
        missing = [str(path) for path in required if not path.exists()]
        if missing:
            raise FileNotFoundError("Missing extracted game data. Set STAR_RESONANCE_DATA_ROOT. "
                                    "Missing: " + ", ".join(missing))
    return root.resolve()


DATA_ROOT = data_root()
