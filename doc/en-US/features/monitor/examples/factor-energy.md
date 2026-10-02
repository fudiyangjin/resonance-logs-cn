# Automatically show factor energy and season nodes

Related page: [Custom Monitor](../custom-panel.md)

**Scenario**: During combat you want to see at any time how much factor energy you have built up and when factor effects or season node Buffs trigger, without having to figure out how to configure counter rules.

## Step 1: Create a factor zone

1. Open **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}}**.
2. Click **{{ui:skillMonitor.customPanel.newFactor}}**.
3. Give it a name in **{{ui:skillMonitor.customPanel.groupName}}**, for example "Factors".

Depending on the current season, the new area will be:

- **S3 and earlier**: {{ui:skillMonitor.customPanel.kind.factor}}, listing the energy and Buff effects of your equipped factors;
- **From S4**: {{ui:skillMonitor.customPanel.kind.seasonNode}}, listing the Buff effects of activated nodes.

## Step 2: Change maps once

The entries come from the full character data synced by the game. After creating the zone, teleport or enter and leave a dungeon once, and the factor zone fills up. After that, when you change factors or switch paths in game, the entries update automatically, with no need to recreate the zone.

![S4 season node zone](../../../../shared/img/changelog/v0.2.1_1.png)

## Step 3: Give entries recognizable names (factor zone only)

The default names may be internal descriptions; you can change them to whatever you are used to:

- **Energy entries**: search for the slot in **{{ui:skillMonitor.customPanel.factorSlots.title}}** and enter, for example, "A Energy" as the custom display name.
- **Buff effect entries**: go to **{{ui:skillMonitor.tabs.buff}} → {{ui:skillMonitor.buff.alias.title}}**, search for the Buff and set an alias, for example "A Trigger".

Names in the season node zone come straight from the node Buffs, so there is nothing to set.

## Step 4: Adjust style and position

1. In **{{ui:skillMonitor.customPanel.style.title}}**, increase the font size and set the progress bar color.
2. Click **{{ui:skillMonitor.layout.editOverlayLayout}}** at the top of the page and drag the factor zone next to your skill CDs.

## Advanced: view it alongside other Buffs

You cannot add entries to a factor zone by hand. If you also want to watch a particular burst Buff, create a manual zone with **{{ui:skillMonitor.customPanel.new}}** to hold that Buff, then place the two areas right next to each other in the layout.
