# Live Monitor

**{{ui:routes.tools.skillMonitor}}** lays a transparent overlay (the live monitor overlay) on top of the game screen, showing **your own** skill CDs, resources, Buffs, factors, character attributes and shields.

![Live monitor overlay](../../../shared/img/monitor/buff_4.png)

## What you can do with it

- Keep track of key skill cooldowns without looking at the skill bar, with a voice reminder when a CD comes back;
- Keep an eye on whether burst Buffs, Fantasy boosts, and food / potions are still active;
- Automatically show the **factor energy and season node effects** you currently have equipped;
- See attributes such as attack speed and crit in real time, along with shield absorption;
- Track the coverage of your own key boosts.

## Top switches

These are visible at the top of the page on every tab:

| Switch | What it does |
| --- | --- |
| **{{ui:skillMonitor.main.enabled.label}}** | Master switch; when off, the overlay no longer receives data |
| **{{ui:skillMonitor.main.autoHideInDailyScenes.label}}** | Hides the overlay automatically in daily scenes such as the main city, and brings it back when you enter a combat scene |
| **{{ui:skillMonitor.layout.toggleOverlayWindow}}** | Shows / hides the overlay |
| **{{ui:skillMonitor.layout.editOverlayLayout}}** | Enters layout editing, where you drag and resize each area |

## Page layout

| Tab | Shown in the overlay | Docs | Examples |
| --- | --- | --- | --- |
| **{{ui:skillMonitor.tabs.skillCd}}** | Skill cooldown icons | [Skill CD](./skill-cd.md) | — |
| **{{ui:skillMonitor.tabs.buff}}** | Your own Buff icons or progress bars | [Buff Monitor](./buff.md) | [Voice reminder when Tina's CD is ready](./examples/tina-cd.md) · [Track 3-stack buff](./examples/attribute-symphony.md) |
| **{{ui:skillMonitor.tabs.panelAttr}}** | Character attribute values | [Character Panel](./panel-attr.md) | — |
| **{{ui:skillMonitor.tabs.customPanel}}** | Factor zone, season node zone, and freely combined Buffs and counters | [Custom Monitor](./custom-panel.md) | [Show factor energy and season nodes](./examples/factor-energy.md) · [Track Absolute Luck with a preset counter](./examples/preset-counter.md) |
| **{{ui:skillMonitor.tabs.shieldDetail}}** | HP and shield bars | [HP/Shield Area](./shield.md) | — |
| **{{ui:skillMonitor.tabs.buffCoverage}}** | Boost coverage | [Buff Coverage](./buff-coverage.md) | [Review your team's boost coverage](./examples/buff-coverage.md) |
| **{{ui:skillMonitor.tabs.overlay}}** | Controls whether each of the areas above is shown | [Enable Window & Layout](./overlay.md) | — |

All settings are saved in the **skill monitor profile** of the current loadout, so switching loadouts swaps the whole setup at once. See [Loadouts](../app/loadouts.md).

> [!WARNING]
> If you open the app partway through a play session, skill CDs, attributes and factors may be incomplete, because the game only pushes data that changes. **Change scenes once** to get a full sync.
