# 在队伍栏旁看队友的减伤

对应页面：[队友 CD](../teammate-cd.md)

**场景**：你在 5 人副本里负责指挥，想在游戏左侧队伍栏每位队友旁边看到他们的大招和减伤还要多久转好，安排谁来接下一个大招。

## 第 1 步：双方开启共享

队友的 CD 由队友自己的插件共享过来，你和队友都要安装本插件并开启共享：

1. 打开 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}} → {{ui:appSettings.teamShare.title}}**，确认已勾选 **{{ui:appSettings.teamShare.enable}}**（默认开启）。
2. 进入游戏组队，状态显示为「已连接」即可。

## 第 2 步：选要显示的技能

打开 **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammateCd}}**：

1. 点职业按钮切换到队友的职业，点技能图标把大招和减伤加进来；
2. 每个可能出现的职业都要选，没有选技能的职业，该职业的队友不会显示。

## 第 3 步：对齐游戏队伍栏

1. 在 **{{ui:monsterMonitor.tabs.overlay}}** 中打开 **队友 CD 区**，显示方式保持 **{{ui:monsterMonitor.teammateCd.mode.slots}}**。
2. 点击 **{{ui:monsterMonitor.actions.editLayout}}**，在 **{{ui:monsterMonitor.teammateCd.slots.editKind}}** 中选 **{{ui:monsterOverlay.teammateCd.slotKind.five}}**。
3. 拖动带编号的占位图标，让第 1 格贴到队伍栏第 1 行旁边；再调整 **{{ui:monsterMonitor.teammateCd.slots.rowPitch}}**，让第 5 格对齐第 5 行。
4. 用 **{{ui:monsterMonitor.teammateCd.slots.side}}** 决定图标往哪边排。

## 效果

有队友放出减伤后，他那一行旁边的图标变暗并显示剩余秒数；转好后恢复亮色。有人进出队伍时，图标跟着队伍栏一起移动。

> [!NOTE]
> 没装插件的队友和机器人那一行留空，不做推算。20 人团要另外对齐一次 **{{ui:monsterOverlay.teammateCd.slotKind.twenty}}**，见 [对齐游戏队伍栏](../teammate-cd.md#对齐游戏队伍栏)。
