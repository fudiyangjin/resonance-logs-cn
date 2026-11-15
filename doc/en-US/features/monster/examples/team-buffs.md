# Check that the whole party has your buffs

Related page: [Teammate Buffs](../teammate.md)

**Scenario**: You are the support and keep a few party buffs up. You want one table that shows how long each buff has left on every teammate, so you can see at a glance who is missing one and whose is about to drop.

## Step 1: Add the buffs

1. Open **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammate}}**.
2. Search for the party buffs you are responsible for and add them to **{{ui:monsterMonitor.teammate.groupTitle}}**. With many buffs, you can also add them by category.

## Step 2: Tell the columns apart

Each monitored buff is a column in the table. Give the most important column its own **{{ui:monsterMonitor.style.progressColor}}** so it stands out.

## Step 3: Adjust the table

In **{{ui:monsterMonitor.teammate.styleTitle}}**:

- Adjust **{{ui:monsterMonitor.style.rowHeight}}**, **{{ui:monsterMonitor.style.nameColumnWidth}}** and **{{ui:monsterMonitor.style.buffColumnWidth}}** so a 5-player table doesn't take much room;
- Set **{{ui:monsterMonitor.style.deadNameColor}}** and **{{ui:monsterMonitor.style.deadRowPlacement}}** so dead teammates are easy to spot;
- To refresh buffs to the second, turn on **{{ui:monsterMonitor.style.preciseTimer}}** to show the countdown to 0.1 seconds.

## Step 4: Place it

1. In **{{ui:monsterMonitor.tabs.overlay}}**, make sure the **Teammate Buff Area** is on (it is by default).
2. Click **{{ui:monsterMonitor.actions.editLayout}}** and drag the table next to the game's party panel.

## Result

One row per teammate, one column per buff. An empty cell means that teammate doesn't have the buff; a nearly empty bar means it is about to drop.
