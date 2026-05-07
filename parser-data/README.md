# Parser Data

This folder is the build-time source of truth for JSON data used by the parser and bundled UI lookups.

- `generated/` contains game-derived outputs from the extractor workflow.
- `logic/` contains game-derived tables and small rule inputs used by Rust parser logic.
- `app-rules/` contains app-authored parser rules and display presets.

`logic/DamageFormula.json` is the adjustable damage-model definition used by formula-lab work. Keep it conservative: mark unverified terms as `hypothesis` until controlled hit comparisons prove where they belong.

Update files here before building. During runtime, localization and parser tools can project these master files into the user's AppData as needed.
