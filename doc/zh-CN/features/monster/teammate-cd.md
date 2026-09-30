# 队友 CD

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammateCd}}** 在怪物遮罩里为每位队友显示一行技能冷却，适合指挥或辅助掌握全队的大招、减伤和团队增益什么时候转好。

游戏只会把**你自己**的技能 CD 发给你，所以队友的 CD 由队友自己的插件共享过来：队友也在使用本插件并开启共享时，才会出现在这里。没有安装插件的队友不会显示，也不做推算。

## 开启共享

1. 打开 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}} → {{ui:appSettings.teamShare.title}}**，勾选 **{{ui:appSettings.teamShare.enable}}**。需要显示的一方和被显示的一方**都要开启**。
2. 进入游戏并组队。状态显示为「已连接」后，队友放技能时你这边会立即更新。

- 你的插件会把自己的**全部**技能 CD 共享出去；每个人在自己这边决定看哪些技能。
- 冷却时间以游戏服务器时间为基准，两台电脑的时钟误差和网络转发延迟都不会让倒计时变快或变慢。
- 同一游戏的 Steam、Epic 与官方启动器视为同一发行区，可以互相共享。

> [!NOTE]
> {{ui:appSettings.teamShare.privacy}}

## 设置要显示的技能

在 **{{ui:monsterMonitor.tabs.teammateCd}}** 标签页：

1. 点职业按钮切换职业，按钮上的数字是已选技能数；
2. 点技能图标加入或移出显示，下方可以用 ← → 调整显示顺序；
3. 没有选择技能的职业，该职业的队友不会显示。

## 样式

**{{ui:monsterMonitor.teammateCd.styleTitle}}**：**{{ui:monsterMonitor.teammateCd.style.iconSize}}**、**{{ui:monsterMonitor.teammateCd.style.iconGap}}**、**{{ui:monsterMonitor.teammateCd.style.rowGap}}**、**{{ui:monsterMonitor.teammateCd.style.nameColumnWidth}}**、**{{ui:monsterMonitor.teammateCd.style.fontSize}}**、**{{ui:monsterMonitor.teammateCd.style.showClassIcon}}**、**{{ui:monsterMonitor.style.nameColor}}**、**{{ui:monsterMonitor.style.deadNameColor}}** 和 **{{ui:monsterMonitor.style.deadRowPlacement}}**。

技能格子的显示与 [技能 CD](../monitor/skill-cd.md) 相同：冷却中变暗并显示剩余秒数，充能技能在右上角显示可用层数。与服务器的连接中断时，整行变淡，表示显示的是最后一次收到的状态。

浮窗中是否显示由 [启用窗口](./overlay.md) 的 **{{ui:monsterOverlay.teammateCdGroupTag}}** 控制。
