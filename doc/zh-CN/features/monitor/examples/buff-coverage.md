# 复盘队伍的增益覆盖率

对应页面：[Buff 覆盖率](../buff-coverage.md)

**场景**：你是辅助，负责给队伍挂增伤 Buff，想知道这场 Boss 战中增益的覆盖率有多高，哪一段断了。

## 第 1 步：添加要统计的 Buff

1. 打开 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buffCoverage}}**。
2. 在 **{{ui:skillMonitor.buffCoverage.list.title}}** 中搜索你负责的增益，例如「山贼增伤」「巴西增伤」，逐个添加。

## 第 2 步：决定是否在浮窗中显示

- 想在战斗中实时看自己的覆盖率：打开该条目的 **{{ui:skillMonitor.buffCoverage.entry.showInLive}}**，并在 [启用窗口](.././overlay.md) 中开启 **Buff覆盖率区**。
- 只想事后复盘：保持关闭，统计照样进行。

![实时覆盖率](../../../../shared/img/changelog/v0.2.3_1.png)

## 第 3 步：打完后看历史

1. 打开 **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}**，点开这场战斗。
2. **{{ui:history.buffCoverage.title}}** 每行一个 Buff，列出每位玩家的覆盖率与触发次数，覆盖率按**活跃战斗时间**计算，Boss 无敌、转场的空档不会拉低数值。

![覆盖率汇总](../../../../shared/img/changelog/v0.2.3_3.png)

3. 点时间轴表头的 **{{ui:history.timeline.buff.title}}** 展开，默认显示自己，其他人在 **{{ui:history.timeline.buff.players}}** 选择器中勾选。每一段色块就是 Buff 生效的时间，灰色斜线是不计入覆盖率的非活跃时段。和下方 DPS 曲线对照，能看出增益是否对上了爆发期；想看全队谁没吃到同一个 Buff，切换到 **{{ui:history.timeline.buff.groupByBuff}}**。

![Buff 覆盖时间轴](../../../../shared/img/changelog/v0.2.3_2.png)

> [!NOTE]
> 只有已经加入监听列表的 Buff 才会被记录。新添加的 Buff 从下一场战斗开始统计。
