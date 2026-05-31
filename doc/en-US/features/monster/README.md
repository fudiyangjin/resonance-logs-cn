# Monster Monitor

Corresponds to **Monster Monitor** in the toolbox—separate in-game overlay for buffs on your **current main attack target**, related teammate buffs, and the threat list.

Independent from **Live Monitor** (your skill CD, your buffs, etc.): config lives under **Monster Monitor**, shown on the **monster overlay**, not mixed with Live Monitor profiles.

## Overview

- **Current main attack target**: **Monster buffs** and **threat list** follow your character’s **attack target** automatically (in-game target ID)—no `ExtraBuffMonitoredMonsters.json` (deprecated).
- **When it switches**: Attacking another monster updates display; on death or lost target, buffs/threat clear until a new main target exists.
- **Dummies / trash**: Any unit that can be your attack target and syncs from the game works like a Boss—you must **target the dummy** (damage or select it), not merely stand near one.

> If buff names are hard to read, set **Display Name** aliases on monitored entries in each tab.

## Sub-guides

| Document | Tab | Description |
|------|----------|------|
| [Buff Monitor](./buff.md) | Buff Monitor | Global / self-only, priority, alerts, styling |
| [Teammate Buffs](./teammate.md) | Teammate Buffs | Teammate-applied buffs, category shortcuts, matrix styling |
| [Threat List](./hate.md) | Hate List | Threat panel toggle, player limit, styling |
| [Enable Overlay](./overlay.md) | Enable Window | Monster overlay three-zone toggles |

## Enable & Top Bar

- **Enable Monster Monitor**: Master switch at top; when off, no data to monster overlay.
- **Toggle Monster Overlay**: Show or hide in-game **Monster Monitor** overlay.
- **Edit Monster Layout**: Drag and resize monster buff, teammate buff, and threat areas on the overlay.

Config is **global** (no multi-profile like Live Monitor); changes persist—if lists look wrong on first enable, try toggling the master switch off and on (see release notes on persistence).

## vs Live Monitor

| Item | Live Monitor | Monster Monitor |
|------|----------|----------|
| Overlay | Game overlay | Monster overlay |
| Main focus | Your skills, your buffs, stats, etc. | Main-target buffs, teammate buffs, threat |
| Profiles | Multiple switchable profiles | Single global config |
| Buff scope | Player-related | On monster + teammates on monster |
