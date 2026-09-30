# Teammate CD

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammateCd}}** shows one row of skill cooldowns per teammate in the monster overlay, so a caller or support can see when the team's ultimates, mitigation and group buffs come back.

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

## Style

**{{ui:monsterMonitor.teammateCd.styleTitle}}**: **{{ui:monsterMonitor.teammateCd.style.iconSize}}**, **{{ui:monsterMonitor.teammateCd.style.iconGap}}**, **{{ui:monsterMonitor.teammateCd.style.rowGap}}**, **{{ui:monsterMonitor.teammateCd.style.nameColumnWidth}}**, **{{ui:monsterMonitor.teammateCd.style.fontSize}}**, **{{ui:monsterMonitor.teammateCd.style.showClassIcon}}**, **{{ui:monsterMonitor.style.nameColor}}**, **{{ui:monsterMonitor.style.deadNameColor}}** and **{{ui:monsterMonitor.style.deadRowPlacement}}**.

Skill cells look the same as in [Skill CD](../monitor/skill-cd.md): a cooling skill darkens and shows the seconds left, and charge skills show the available charges in the top-right corner. While the connection to the server is down, rows fade to show that they hold the last state received.

Whether it appears in the overlay is controlled by **{{ui:monsterOverlay.teammateCdGroupTag}}** in [Enable Window](./overlay.md).
