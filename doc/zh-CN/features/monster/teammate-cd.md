# 队友 CD

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammateCd}}** 在怪物遮罩里显示队友的技能冷却：默认画在游戏队伍栏里对应角色那一行旁边，也可以改成独立的列表面板。适合指挥或辅助掌握全队的大招、减伤和团队增益什么时候转好。

游戏只会把**你自己**的技能 CD 发给你，所以队友的 CD 由队友自己的插件共享过来：队友也在使用本插件并开启共享时，才会出现在这里。没有安装插件的队友不会显示，也不做推算。

## 开启共享

1. 打开 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}} → {{ui:appSettings.teamShare.title}}**，确认已勾选 **{{ui:appSettings.teamShare.enable}}**（默认开启）。需要显示的一方和被显示的一方**都要开启**。
2. 进入游戏并组队。状态显示为「已连接」后，队友放技能时你这边会立即更新。

- 你的插件会把自己的**全部**技能 CD 共享出去；每个人在自己这边决定看哪些技能。
- 冷却时间以游戏服务器时间为基准，两台电脑的时钟误差和网络转发延迟都不会让倒计时变快或变慢。
- 同一游戏的 Steam、Epic 与官方启动器视为同一发行区，可以互相共享。

> [!NOTE]
> 开启后会向 bptimer.cn 发送：角色 ID、角色名、职业、队伍 ID 和技能冷却。服务器只把这些数据转发给同队且同样开启共享的队友，只保存在内存里，不写数据库；离开队伍或关闭后即删除。

## 设置要显示的技能

在 **{{ui:monsterMonitor.tabs.teammateCd}}** 标签页：

1. 点职业按钮切换职业，按钮上的数字是已选技能数；
2. 点技能图标加入或移出显示，下方可以用 ← → 调整显示顺序；
3. 没有选择技能的职业，该职业的队友不会显示。

## 显示方式

- **{{ui:monsterMonitor.teammateCd.mode.slots}}**（默认）：把每位队友选中的技能图标画在游戏左侧队伍栏里该角色那一行旁边。有人进出队伍、队长调整分组时，图标跟着游戏队伍栏一起移动。自己、没装插件的队友和机器人那一行留空。
- **{{ui:monsterMonitor.teammateCd.mode.list}}**：独立面板，每行是队友的名字、职业图标和技能 CD，顺序与游戏队伍栏一致。

> [!NOTE]
> 插件晚于组队启动时，队伍会在下一次有人入队或切换场景（例如进本）时补齐。20 人团的分组位置要等有人入队或队长调整分组后才能对上。

## 对齐游戏队伍栏

使用 **{{ui:monsterMonitor.teammateCd.mode.slots}}** 时，5 人和 20 人的游戏队伍栏位置不同，需要分别对齐一次：

1. 打开浮窗编辑模式，在 **{{ui:monsterMonitor.teammateCd.slots.editKind}}** 里选择 **{{ui:monsterOverlay.teammateCd.slotKind.five}}** 或 **{{ui:monsterOverlay.teammateCd.slotKind.twenty}}**（编辑模式下浮窗显示这里选中的那套格子）。浮窗会显示全部 5 格或 20 格带编号的占位图标。
2. 拖动占位图标，让第 1 格贴到游戏队伍栏第 1 行旁边。
3. 调整 **{{ui:monsterMonitor.teammateCd.slots.rowPitch}}**，让第 5 格对齐第 5 行。20 人队伍栏还要用 **{{ui:monsterMonitor.teammateCd.slots.columnOffset}}** 对齐第 6 格（右列第 1 行），用 **{{ui:monsterMonitor.teammateCd.slots.blockOffset}}** 对齐第 11 格（下半第 1 行）。
4. 用 **{{ui:monsterMonitor.teammateCd.slots.side}}**（20 人分为 **{{ui:monsterMonitor.teammateCd.slots.leftSide}}** 和 **{{ui:monsterMonitor.teammateCd.slots.rightSide}}**）决定图标往哪边排，第一个技能总是贴着队伍栏。

20 人队伍栏的 4 个组位置固定：左上第 1 组、右上第 2 组、左下第 3 组、右下第 4 组。组内有人离开时，下面的人会上移，图标也跟着上移。更改游戏分辨率或界面缩放后需要重新对齐。

## 样式

**{{ui:monsterMonitor.teammateCd.styleTitle}}**：

- **{{ui:monsterMonitor.teammateCd.mode.slots}}**：**{{ui:monsterMonitor.teammateCd.style.iconSize}}**、**{{ui:monsterMonitor.teammateCd.style.iconGap}}**。
- **{{ui:monsterMonitor.teammateCd.mode.list}}**：**{{ui:monsterMonitor.teammateCd.style.iconSize}}**、**{{ui:monsterMonitor.teammateCd.style.iconGap}}**、**{{ui:monsterMonitor.teammateCd.style.rowGap}}**、**{{ui:monsterMonitor.teammateCd.style.nameColumnWidth}}**、**{{ui:monsterMonitor.teammateCd.style.fontSize}}**、**{{ui:monsterMonitor.teammateCd.style.showClassIcon}}**、**{{ui:monsterMonitor.style.nameColor}}**、**{{ui:monsterMonitor.style.deadNameColor}}** 和 **{{ui:monsterMonitor.style.deadRowPlacement}}**。

技能格子的显示与 [技能 CD](../monitor/skill-cd.md) 相同：冷却中变暗并显示剩余秒数，充能技能在右上角显示可用层数。贴队伍栏模式下队友阵亡时图标变暗。与服务器的连接中断时，图标（列表模式下为整行）变淡，表示显示的是最后一次收到的状态。

浮窗中是否显示由 [启用窗口](./overlay.md) 的 **{{ui:monsterOverlay.teammateCdGroupTag}}** 控制。
