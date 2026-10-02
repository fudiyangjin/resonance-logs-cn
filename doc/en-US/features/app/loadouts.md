# Loadouts

A **loadout** bundles together all the configuration you've prepared for a class: skill CDs, buffs, custom panels, monster monitoring, DPS window settings, and their voice bindings. When you change class, switch the loadout once and all the overlays switch with it.

## What a loadout is made of

| Profile | Contents |
| --- | --- |
| **{{ui:loadout.page.skillProfileLabel}}** | Skill CDs, buffs, custom panels and the attribute panel of the [Live Monitor](../monitor/README.md), plus their voice |
| **{{ui:loadout.page.monsterProfileLabel}}** | Buffs, Boss DBM and entity timers of the [Monster Monitor](../monster/README.md), plus their voice |
| **{{ui:loadout.page.liveProfileLabel}}** | Columns, name display, refresh rate and so on for the [DPS window](../dps/settings.md) |

Profiles can be shared between loadouts. For example, two DPS classes may use different skill monitoring but the same monster monitoring: just select the same **{{ui:loadout.page.monsterProfileLabel}}** in both loadouts, and a change in one place takes effect in both.

Appearance, shortcuts, packet capture and other settings in [App Settings](./README.md) are not part of a loadout and don't change when you switch loadouts.

## Managing loadouts

Open **{{ui:routes.tools.loadouts}}**, or click **{{ui:loadout.sidebar.manage}}** next to **{{ui:loadout.sidebar.label}}** in the left sidebar:

- **{{ui:loadout.page.new}}**: create a new, empty loadout.
- **{{ui:loadout.page.activate}}**: switch to this loadout. You can also switch directly from **{{ui:loadout.sidebar.label}}** in the left sidebar.
- **{{ui:loadout.page.rename}}** / **{{ui:loadout.page.duplicate}}** / **{{ui:loadout.page.delete}}**: at least one loadout must remain.
- Change the three profile dropdowns to decide which profiles this loadout uses.

## Preset loadouts

**{{ui:loadout.page.presetsTitle}}** offers ready-made loadouts for some specs (such as Shield, Recovery, Block, Earthfort, Smite, Lifebind, Vanguard and Concerto). Clicking one creates a new loadout that you can modify from there without affecting any other loadout. The **{{ui:loadout.firstRun.title}}** dialog shown on first launch offers these same presets.

## Auto-switching by spec

1. Set **{{ui:loadout.page.linkedSpecLabel}}** for each loadout, for example link the "Lifebind" loadout to the Lifebind spec.
2. Turn on **{{ui:loadout.autoSwitch.toggle}}**.

After that, when you change spec in the game, the app automatically switches to the linked loadout. **{{ui:loadout.autoSwitch.detected}}** shows the current spec the app has detected; if it shows **{{ui:loadout.autoSwitch.unknown}}**, change zones once. For the full steps, see [Example: Switch loadouts automatically when changing spec](./examples/spec-loadout.md).

## Import and export

- **{{ui:loadout.page.exportButton}}**: the download icon on the right of each loadout saves the whole loadout (including its three profiles and voice bindings) as a JSON file.
- **{{ui:loadout.page.importButton}}**: choose a JSON file someone shared with you to import it as a new loadout. It does not overwrite your existing loadouts.

> [!NOTE]
> What gets exported is the configuration; it does not include generated voice audio or imported sound effect files. After importing, the other person just clicks **{{ui:voice.bindings.generateMissing}}** in **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** to regenerate them.

For the sharing workflow, see [Example: Share a loadout with teammates](./examples/share-loadout.md).

## Examples

- [Switch loadouts automatically when changing spec](./examples/spec-loadout.md)
- [Share a loadout with teammates](./examples/share-loadout.md)