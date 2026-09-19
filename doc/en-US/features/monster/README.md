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
| [Boss DBM](./boss-dbm.md) | Boss DBM | Boss mechanic warning bars, styling, layout |
| [Entity Duration](./entity-duration.md) | Entity Duration | Timers driven by entity appear / disappear (e.g. Scythe Cart), presets, manual entries, caster scope |
| [Enable Overlay](./overlay.md) | Enable Window | Monster overlay area display toggles |

## Enable & Top Bar

- **Enable Monster Monitor**: Master switch at top; when off, no data to monster overlay.
- **Toggle Monster Overlay**: Show or hide in-game **Monster Monitor** overlay.
- **Edit Monster Layout**: Drag and resize areas on the overlay (monster buff, teammate buff, threat list, Boss DBM, etc.).

Monster Monitor supports multiple **configuration profiles**. The active loadout references one of them; switching the loadout or selecting another profile on the Monster Monitor page switches its buff, threat, DBM, voice-announcement, and layout settings together. The master switch, auto-hide in daily scenes, and buff aliases remain global and do not change with profiles.

## vs Live Monitor

| Item | Live Monitor | Monster Monitor |
|------|----------|----------|
| Overlay | Game overlay | Monster overlay |
| Main focus | Your skills, your buffs, stats, etc. | Main-target buffs, teammate buffs, threat |
| Profiles | Multiple profiles referenced and switched by loadouts | Multiple profiles referenced and switched by loadouts |
| Buff scope | Player-related | On monster + teammates on monster |
