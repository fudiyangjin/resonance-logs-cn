# FAQ · Live Monitor

**Detailed guides**: [Buff Monitor Overview](../features/monitor/README.md) · [Skill CD](../features/monitor/skill-cd.md) · [Buff Monitor](../features/monitor/buff.md) · [Character Panel](../features/monitor/panel-attr.md) · [Custom Monitor](../features/monitor/custom-panel.md) · [Enable Overlay](../features/monitor/overlay.md)

## Buff / Skill CD

### I opened the app mid-fight and CD or attributes are incomplete—what do I do?

If you start the app while already in-game, skill CD, buffs, and character panel attributes may be incomplete. The game only sends **incremental updates**, so the app cannot reconstruct the full current state. **Change zone once** (e.g. enter/leave instance, change area, teleport) to trigger a full attribute sync; display should then recover.

### What are buff aliases for?

Some in-game buff names are unclear (e.g. `[热枕]`). Under **Live Monitor → Buff Monitor → Buff Alias Settings**, set a clearer display name (e.g. “Life Fluctuation”). Aliases apply **globally** and do not change when switching profiles.

### What is a “true factor”? Where do I configure it?

“True factor” indicates whether the corresponding season progression factor is active (commonly `0` / `1`). Recommended: **Live Monitor → Custom Monitor → New Factor Zone** to show factor energy and buff effects automatically—no manual counter rules needed.

- **Factor energy bar names**: Set in the factor zone’s **Factor Display Name** search.
- **Factor buff effect names**: Set under **Buff Monitor → Buff Alias Settings**.

See [Custom Monitor · Factor Zone](../features/monitor/custom-panel.md#factor-zone-new-factor-zone).

### How do I quickly monitor all food / alchemy buffs?

- **Standalone mode**: Use **Category Quick Listen** to monitor all food or alchemy buffs at once
- **Grouped mode**: In Buff Monitor, use the **Food** / **Alchemy** shortcut buttons for one-click setup

### I am not sure of a buff name—how do I find what to monitor?

Buff config names can be messy. Enable **Monitor All** first; the overlay lists all buffs so you can match effects to names, then add the exact buffs you want.
