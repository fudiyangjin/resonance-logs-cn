# 队友 Buff

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.teammate}}** 以矩阵形式显示每位队友身上被监控的 Buff。适合指挥或辅助确认全队的增益是否还在。

## 设置

- 搜索 Buff 加入 **{{ui:monsterMonitor.teammate.groupTitle}}**，也可以按分类快捷添加；
- 已监控的每一列可以单独覆盖 **{{ui:monsterMonitor.style.progressColor}}** 和 **{{ui:monsterMonitor.style.valueColor}}**，用 **{{ui:monsterMonitor.teammate.columnColorReset}}** 回到面板颜色；
- **{{ui:monsterMonitor.teammate.styleTitle}}**：**{{ui:monsterMonitor.style.rowHeight}}**、**{{ui:monsterMonitor.style.nameColumnWidth}}**、**{{ui:monsterMonitor.style.buffColumnWidth}}**、**{{ui:monsterMonitor.style.deadNameColor}}**，以及 **{{ui:monsterMonitor.style.deadRowPlacement}}**。阵亡队友仍保留一行，名字改用阵亡颜色，并按所选位置排列。

浮窗中是否显示由 [启用窗口](./overlay.md) 的 **队友 Buff 区** 控制。
