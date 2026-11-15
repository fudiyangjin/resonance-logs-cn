# See teammates' mitigation next to the party panel

Related page: [Teammate CD](../teammate-cd.md)

**Scenario**: You lead a 5-player dungeon and want to see, next to each teammate on the game's party panel, how long until their ultimate and mitigation are back, so you can assign who covers the next big attack.

## Step 1: Both sides turn on sharing

Teammates' CDs are shared by their own plugin, so you and your teammates all need this plugin with sharing on:

1. Open **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}} → {{ui:appSettings.teamShare.title}}** and make sure **{{ui:appSettings.teamShare.enable}}** is ticked (on by default).
2. Form a party in game; you are set once the status shows "Connected".

## Step 2: Pick the skills to show

Open **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammateCd}}**:

1. Click a class button to switch to your teammate's class, then click skill icons to add their ultimate and mitigation;
2. Do this for every class that may show up: teammates of a class with no skills selected are not shown.

## Step 3: Line up with the party panel

1. Turn on the **Teammate CD Area** in **{{ui:monsterMonitor.tabs.overlay}}** and keep the display mode at **{{ui:monsterMonitor.teammateCd.mode.slots}}**.
2. Click **{{ui:monsterMonitor.actions.editLayout}}** and pick **{{ui:monsterOverlay.teammateCd.slotKind.five}}** in **{{ui:monsterMonitor.teammateCd.slots.editKind}}**.
3. Drag the numbered placeholder icons so slot 1 sits next to the first row of the party panel; then adjust **{{ui:monsterMonitor.teammateCd.slots.rowPitch}}** so slot 5 lines up with the fifth row.
4. Use **{{ui:monsterMonitor.teammateCd.slots.side}}** to choose which way the icons extend.

## Result

When a teammate uses a mitigation skill, the icon next to their row dims and shows the seconds left, then lights up again when it is ready. When people join or leave, the icons move with the party panel.

> [!NOTE]
> Rows of teammates without the plugin and of bots stay empty; nothing is estimated. 20-player raids need a separate alignment for **{{ui:monsterOverlay.teammateCd.slotKind.twenty}}**; see [Line up with the team panel](../teammate-cd.md#line-up-with-the-team-panel).
