# DPS Meter

Live damage stats, history, and custom column settings.

## Overview

DPS Meter parses combat data from network capture and supports:

- **Live stats**: Damage, DPS, etc. updated during combat
- **History**: Saved past encounters
- **Multiple dimensions**: Damage, healing, damage taken (DPS / HPS / TPS)

## Sub-guides

| Document | UI location | Description |
|------|----------|------|
| [Themes](./themes.md) | DPS Meter → Themes | Colors, Compact Mode, title bar, active combat time |
| [History](./history.md) | DPS Meter → History | Review, target breakdown, auto cleanup |
| [Settings](./settings.md) | DPS Meter → Settings | Columns, refresh rate, network, shortcuts |

## Training Dummy Mode

Training dummy mode records one rotation on a fixed dummy. After it ends, the **Live view freezes** so you can review skill breakdown and DPS without opening [History](./history.md) immediately.

### Entry

- **Show Training Dummy Button**: `DPS Meter → Themes → Live → Header Settings → Show Training Dummy Button` (see [Themes](./themes.md))
- **Start/stop**: Crosshair button in the Live window header

No need to pre-select dummy type in settings. After enabling training dummy mode, the **first hit on a supported dummy** auto-detects **Elite Enemy Dummy** or **Elite Guardian Dummy** (based on the target you hit).

### State Flow

```
Standby (dummy ready) → In progress → Ended
         ↑                              |
         └──────── Click Reset ─────────┘
```

- **Dummy ready**: Training dummy mode on, waiting for your first hit on a dummy to lock the target
- **In progress**: Current dummy locked; only that target’s combat data is counted
- **Ended**: Stats frozen; Live no longer updates—you decide when to start the next round

Click **Reset** to return to **dummy ready** before the next **in progress** (hit the dummy again). A new segment does **not** start automatically after training dummy mode ends.

### Workflow

1. In **Header Settings**, ensure **Show Training Dummy Button** is enabled; click the crosshair on the Live window (**dummy ready**).
2. First damage to **Elite Enemy Dummy** or **Elite Guardian Dummy** locks that dummy and enters **in progress**.
3. Only locked dummy data is accumulated; teammates’ damage to the same dummy may appear—that is normal.
4. When the single-round time limit is reached, enter **ended**—Live freezes for review; data is also written to [History](./history.md).
5. After review, click **Reset** for **dummy ready**, then start the next round when ready.

### Notes

- Only **your** first hit on a supported dummy triggers lock and official recording.
- After **ended**, further attacks do not start a new segment—you must **Reset** first.
- You can **Reset** during **in progress** to end early and return to **dummy ready**.
- Click the crosshair again to turn off training dummy mode.
- Leaving guild, changing zone, changing channel, etc. auto-cancels training dummy mode—re-enable manually.

## Metrics

### Skill Bar Structure

The DPS skill bar follows client DPS logic: each skill may have multiple damage sources; each hit is combined into a **damage ID** by fixed rules, then aggregated into one skill row. Expanding some skills shows multiple sub-entries.

![Skill bar – before aggregation](../../../shared/img/dps/dps_1.png)

![Skill bar – expanded entries](../../../shared/img/dps/dps_2.png)

Aggregation summary:

1. **Raw damage entries**: One record per hit—skill ID, damage source, hit event ID, etc.
2. **Aggregated display**: Entries with the same damage ID merge into one “skill”; expand to see sub-entries

### True DPS & Active Combat Time

- **DPS**: Calculated over wall-clock time for the whole fight
- **True DPS**: Calculated over “active time” when actual damage occurred

Under **DPS Meter → Themes → Live → Header Settings**, enable **Show Active Combat Time** to view active time. See [Themes](./themes.md).

### Healing / Damage Taken Columns

Healing and damage-taken modes use similar column structures—HPS, TPS, crit, luck, and related metrics.

## Reset Logic

Combat segmentation and reset behavior:

| Scenario | Behavior |
|------|------|
| **Zone change** | On scene/map change: if this segment has combat data, it is saved to history; Live does not clear immediately—it resets on your **next damage** and starts the new scene |
| **Master dungeon** | Auto-splits trash and Boss; history has 2 entries: trash segment, Boss segment |
| **Raid** | Each Boss split independently; one history entry per Boss |
| **Wipe** | Auto-reset current stats on wipe |

### Zone Change Details

- **Only if there is data**: No valid combat before zone change → no extra history write, no delayed reset above.
- **Live vs history**: History saves on zone change; Live keeps previous numbers until you attack again—avoids numbers vanishing mid-transition.

Same-scene resets trigger on **next attack target**:

- **Master dungeon**: After clearing trash, first Boss hit auto-resets; Boss segment counted separately
- **Raid**: Auto-reset on each new Boss attack
- **After wipe**: Auto-reset on next Boss attack
