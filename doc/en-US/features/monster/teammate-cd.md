# Teammate CD

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammateCd}}** shows teammates' skill cooldowns in the monster overlay: by default beside each teammate's row of the in-game team panel, or as a standalone list panel. It helps a caller or support see when the team's ultimates, mitigation and group buffs come back.

The game only sends **your own** cooldowns to you, so each teammate's cooldowns are shared by that teammate's own copy of the app. A teammate appears here only while they also run this app with sharing turned on. Teammates without the app are not shown, and nothing is estimated for them.

## Turn on sharing

1. Open **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}} → {{ui:appSettings.teamShare.title}}** and tick **{{ui:appSettings.teamShare.enable}}**. **Both** the viewer and the teammate being shown need it on.
2. Start the game and join a team. Once the status reads "Connected", a teammate's cast updates your panel right away.

- Your app shares **all** of your skill cooldowns; everyone picks which ones to look at on their own side.
- Cooldowns are anchored to the game server's clock, so clock drift between PCs and relay latency never speed up or slow down a countdown.
- The Steam, Epic and standalone launchers of one game count as the same distribution and can share with each other.

> [!NOTE]
> {{ui:appSettings.teamShare.privacy}}

## Choose the skills to show

In the **{{ui:monsterMonitor.tabs.teammateCd}}** tab:

1. Click a class button to switch class; the number on it is how many skills are selected;
2. Click a skill icon to show or hide it, and use ← → below to reorder;
3. Teammates of a class with no selected skills are not shown.

## Display modes

- **{{ui:monsterMonitor.teammateCd.mode.slots}}** (default): draws each teammate's selected skill icons beside their row of the team panel on the left of the game screen. When members join or leave, or the leader regroups the team, the icons move with the game's team panel. Your own row, rows of teammates without the app, and bot rows stay empty.
- **{{ui:monsterMonitor.teammateCd.mode.list}}**: a standalone panel; each row shows a teammate's name, class icon and skill cooldowns, in the in-game team panel order.

> [!NOTE]
> The team order comes from the notices the game sends when you join and when the team changes, so the app must be **running when you join the team**.

## Line up with the team panel

With **{{ui:monsterMonitor.teammateCd.mode.slots}}**, the game draws 5- and 20-member team panels in different places, so line each one up once:

1. Turn on the overlay's edit mode and pick **{{ui:monsterOverlay.teammateCd.slotKind.five}}** or **{{ui:monsterOverlay.teammateCd.slotKind.twenty}}** under **{{ui:monsterMonitor.teammateCd.slots.editKind}}** (the edit mode shows the grid picked here). The overlay shows numbered placeholder icons for all 5 or 20 slots.
2. Drag the placeholders until slot 1 sits beside the first row of the game's team panel.
3. Adjust **{{ui:monsterMonitor.teammateCd.slots.rowPitch}}** until slot 5 matches row 5. For the 20-member panel, also use **{{ui:monsterMonitor.teammateCd.slots.columnOffset}}** to match slot 6 (first row of the right column) and **{{ui:monsterMonitor.teammateCd.slots.blockOffset}}** to match slot 11 (first row of the lower half).
4. **{{ui:monsterMonitor.teammateCd.slots.side}}** (for 20 members, **{{ui:monsterMonitor.teammateCd.slots.leftSide}}** and **{{ui:monsterMonitor.teammateCd.slots.rightSide}}**) sets which way the icons extend; the first skill always sits next to the team panel.

The four groups of the 20-member panel stay in place: group 1 top left, group 2 top right, group 3 bottom left, group 4 bottom right. When someone in a group leaves, the members below move up and so do their icons. Line the grid up again after changing the game's resolution or UI scale.

## Style

**{{ui:monsterMonitor.teammateCd.styleTitle}}**:

- **{{ui:monsterMonitor.teammateCd.mode.slots}}**: **{{ui:monsterMonitor.teammateCd.style.iconSize}}** and **{{ui:monsterMonitor.teammateCd.style.iconGap}}**.
- **{{ui:monsterMonitor.teammateCd.mode.list}}**: **{{ui:monsterMonitor.teammateCd.style.iconSize}}**, **{{ui:monsterMonitor.teammateCd.style.iconGap}}**, **{{ui:monsterMonitor.teammateCd.style.rowGap}}**, **{{ui:monsterMonitor.teammateCd.style.nameColumnWidth}}**, **{{ui:monsterMonitor.teammateCd.style.fontSize}}**, **{{ui:monsterMonitor.teammateCd.style.showClassIcon}}**, **{{ui:monsterMonitor.style.nameColor}}**, **{{ui:monsterMonitor.style.deadNameColor}}** and **{{ui:monsterMonitor.style.deadRowPlacement}}**.

Skill cells look the same as in [Skill CD](../monitor/skill-cd.md): a cooling skill darkens and shows the seconds left, and charge skills show the available charges in the top-right corner. Beside the team panel, a dead teammate's icons dim. While the connection to the server is down, the icons (whole rows in the list) fade to show that they hold the last state received.

Whether it appears in the overlay is controlled by **{{ui:monsterOverlay.teammateCdGroupTag}}** in [Enable Window](./overlay.md).
