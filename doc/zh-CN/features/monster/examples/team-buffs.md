# 辅助确认全队增益都在

对应页面：[队友 Buff](../teammate.md)

**场景**：你是辅助，负责给全队上几个团队增益。你想在一张表里看到每位队友身上这几个增益还剩多久，谁没吃到、谁快掉了一眼就能看出来。

## 第 1 步：添加要看的增益

1. 打开 **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammate}}**。
2. 搜索你负责的几个团队增益，加入 **{{ui:monsterMonitor.teammate.groupTitle}}**。增益较多时，也可以按分类快捷添加。

## 第 2 步：区分每一列

已监控的每个增益是表里的一列。给最重要的那一列单独设置 **{{ui:monsterMonitor.style.progressColor}}**，和其他列区分开。

## 第 3 步：调整表格

在 **{{ui:monsterMonitor.teammate.styleTitle}}** 中：

- 调整 **{{ui:monsterMonitor.style.rowHeight}}**、**{{ui:monsterMonitor.style.nameColumnWidth}}** 和 **{{ui:monsterMonitor.style.buffColumnWidth}}**，让 5 人小队的表格不占太大地方；
- 设置 **{{ui:monsterMonitor.style.deadNameColor}}** 和 **{{ui:monsterMonitor.style.deadRowPlacement}}**，阵亡的队友一眼就能认出来；
- 需要卡秒补增益时，打开 **{{ui:monsterMonitor.style.preciseTimer}}**，倒计时显示到 0.1 秒。

## 第 4 步：摆放位置

1. 在 **{{ui:monsterMonitor.tabs.overlay}}** 中确认 **队友 Buff 区** 已打开（默认打开）。
2. 点击 **{{ui:monsterMonitor.actions.editLayout}}**，把表格拖到游戏队伍栏旁边。

## 效果

每位队友一行，每个增益一列。某一格空着就是这位队友没吃到，进度条快走完的就是快掉了。
