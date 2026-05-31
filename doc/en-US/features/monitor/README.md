# Buff Monitor

Guides for skill CD, buff tracking, custom panels, and related features.

## Overview

Live monitor includes:

- **Skill CD**: Track skill cooldowns
- **Buff Monitor**: Track duration, stacks, etc. for selected buffs
- **Character Panel**: Stats such as attack speed, crit rate, intelligence
- **Custom Monitor**: Standard zones, factor zones, counters, and buff progress bars
- **Enable Overlay**: Overlay module toggles and layout editing

> **⚠️ Opening mid-fight**: If you open the app while already in-game, skill CD and character panel attributes may be incomplete. The game only sends **incremental updates**, so the app cannot fetch the full current state. **Change zone** (switch scene/map) once to trigger a full attribute sync; display will then recover.

## Sub-guides

| Document | UI location | Description |
|------|----------|------|
| [Skill CD](./skill-cd.md) | Live Monitor → Skill CD | Class skill selection, skill transforms |
| [Buff Monitor](./buff.md) | Live Monitor → Buff Monitor | Standalone/grouped, aliases, quick listen |
| [Character Panel](./panel-attr.md) | Live Monitor → Character Panel | Attribute selection, colors, row order |
| [Custom Monitor](./custom-panel.md) | Live Monitor → Custom Monitor | Standard zones, factor zones, counters, advanced examples |
| [Enable Overlay](./overlay.md) | Live Monitor → Enable Overlay | Overlay toggles, modules, layout editing |

## Enable & Profiles

- **Enable Live Monitor**: Master switch at the top; when off, no data is pushed to the overlay.
- Top bar **Toggle Overlay** / **Edit Overlay Layout**: See [Enable Overlay](./overlay.md).

## Profiles

- Create different **profiles** for different classes or playstyles
- Each profile has its own skill CD, buff list, layout, etc.
- Switch profiles to swap the entire monitor setup

## Best Practices

After configuration, use **`Ctrl+\`** for **UI-less mode**: the main window hides and only overlays show skill CD, resources, buffs, etc. Place overlays at screen edges or in peripheral vision so you can track cooldowns and resources without looking down—even on large screens.

![Best practices](../../../shared/img/monitor/buff_4.png)
