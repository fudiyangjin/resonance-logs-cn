# 用时间轴找出输出空窗

对应页面：[历史记录](../history.md)

**场景**：一场 Boss 战打完，你的秒伤比平时低，想弄清楚是哪一段掉了输出、为什么掉。

## 第 1 步：打开这场战斗

1. 进入 **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}**。
2. 用「首领」筛选出这个 Boss，点开刚才那一条。

## 第 2 步：看瞬时 DPS 曲线

在 **{{ui:history.timeline.title}}** 中，把曲线切到 **{{ui:history.timeline.series.instant}}**，并在曲线选择里只勾选自己和一两位参照队友。

- 曲线整体偏低 → 循环或配置问题；
- 某一段突然跌到接近 0 → 这段时间有空窗。

![历史时间轴](../../../../shared/img/changelog/v0.2.1_2.png)

## 第 3 步：框选空窗

1. 在曲线上**拖拽**框出掉下去的那一段。
2. 页面的伤害统计会**只按这一段**重新计算，可以看到这段时间内你打了哪些技能、打在谁身上。
3. 点 **{{ui:history.timeline.selection.zoomToRange}}** 放大，对照上方 **{{ui:history.timeline.lanes.boss}}** 泳道：常见原因是 Boss 转阶段 / 无敌，或者你在躲机制。

## 第 4 步：确认增益是否断了

如果你配置了 [Buff 覆盖率](../../monitor/buff-coverage.md)，点时间轴表头的 **{{ui:history.timeline.buff.title}}** 展开（默认显示自己），看看空窗期间爆发 Buff 是否恰好不在。

![Buff 覆盖时间轴](../../../../shared/img/changelog/v0.2.3_2.png)

## 第 5 步：如果是倒地了

切到 **{{ui:history.detail.tabs.death}}**，查看死亡前几秒受到的每一次伤害，判断是哪个机制导致的。

> [!TIP]
> 想长期对比，可以把表现最好的一场 **{{ui:history.detail.actions.addFavorite}}**，之后复盘时和它对照同一阶段的曲线。
