# Switch loadouts automatically when changing spec

Related page: [Loadouts](../loadouts.md)

**Scenario**: your character usually plays Lifebind and occasionally switches to Smite. After you change spec in the game, you want the skill CDs, buffs and DPS window settings to switch to the matching set automatically, instead of going back to the main window to switch by hand every time.

## Step 1: Prepare two loadouts

1. Open **{{ui:routes.tools.loadouts}}**.
2. In **{{ui:loadout.page.presetsTitle}}**, click "Lifebind" and "Smite" to create one loadout each. If you already have your own loadouts, just use those.

## Step 2: Link the specs

In each loadout's **{{ui:loadout.page.linkedSpecLabel}}** dropdown, choose the matching spec:

| Loadout | {{ui:loadout.page.linkedSpecLabel}} |
| --- | --- |
| Lifebind | Lifebind |
| Smite | Smite |
| Other loadouts you don't want to auto-switch | {{ui:loadout.page.linkedSpecNone}} |

## Step 3: Turn on auto-switching

Turn on **{{ui:loadout.autoSwitch.toggle}}** at the top of the page. **{{ui:loadout.autoSwitch.detected}}** next to it shows your current spec in the game.

## Step 4: Verify

Switch to Smite in the game. The app shows a message that it has automatically switched to "Smite", **{{ui:loadout.sidebar.label}}** in the left sidebar changes too, and the overlay contents update accordingly.

> [!TIP]
> If both loadouts share the same monster monitoring, select the same **{{ui:loadout.page.monsterProfileLabel}}** in both, and from then on you only need to maintain one copy.

If **{{ui:loadout.autoSwitch.detected}}** shows **{{ui:loadout.autoSwitch.unknown}}**, the app hasn't received spec information yet; change zones once.
