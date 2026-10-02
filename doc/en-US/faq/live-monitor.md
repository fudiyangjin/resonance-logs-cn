# FAQ · Live Monitor

Related guides: [Live Monitor](../features/monitor/README.md) · [Skill CD](../features/monitor/skill-cd.md) · [Buff Monitor](../features/monitor/buff.md) · [Custom Monitor](../features/monitor/custom-panel.md) · [Enable Window & Layout](../features/monitor/overlay.md)

### Skill CDs or attributes are incomplete — what do I do?

The game only pushes data that changes, so if you open the app mid-session it can't get the full state. **Change zones once** to fix it.

### How do I show factor energy and season nodes?

You don't need to configure counters manually. In **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}}**, click **{{ui:skillMonitor.customPanel.newFactor}}**. The app creates a factor config area or season node area for the current season and automatically shows the factors and nodes you have equipped. See [Factor Config Area](../features/monitor/custom-panel.md#factor-zone) and [Example: Show factor energy and season nodes automatically](../features/monitor/examples/factor-energy.md).

### I can't make sense of a Buff's name — can I change it?

Yes. Set an alias in **{{ui:skillMonitor.buff.alias.title}}** in Buff Monitor. See [Names and icons](../features/monitor/buff.md#names-and-icons).

### I don't know what the Buff I want to monitor is called?

First turn on "Monitor All Buffs"; the overlay then shows every Buff on you. Once you've confirmed the name, add it to the exact monitoring list, then turn "Monitor All Buffs" off again.

### How do I monitor all food or alchemy Buffs at once?

Use [Category Quick Monitor](../features/monitor/buff.md#category-quick-watch).

### The overlay doesn't appear?

1. Make sure the Live Monitor switch at the top of the page is on.
2. In **{{ui:skillMonitor.tabs.overlay}}**, make sure the relevant area is set to show.
3. The overlay may be off-screen: right-click the tray icon and choose **Reset All Windows**.

### After changing class, the overlay still shows the previous class?

The overlay content follows your current [loadout](../features/app/loadouts.md). Switch loadouts, or turn on **{{ui:loadout.autoSwitch.toggle}}**; see [Example: Switch loadouts automatically when changing spec](../features/app/examples/spec-loadout.md).
