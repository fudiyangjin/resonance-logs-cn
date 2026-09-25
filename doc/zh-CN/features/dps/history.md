# 历史记录

**{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** 保存每一场自动切分的战斗，可以随时打开复盘。

![历史记录](../../../shared/img/dps/dps_3.png)

## 历史列表

- **筛选**：按 **{{ui:history.list.filters.favorite}}**、首领、玩家、场景过滤；点 **{{ui:history.list.filters.favoriteOnly}}** 只看收藏。
- **批量删除**：勾选多条后点 **{{ui:history.list.actions.delete}}**，删除不可撤销。
- **分页**：底部可设置每页行数。

> [!NOTE]
> 历史记录超过 **200 条** 时，下次启动会按时间自动清理较早的记录。**加入收藏** 可以避免重要记录被清理后找不到。

## 战斗详情

点击任意一条记录进入详情，顶部有四个标签：**{{ui:history.detail.tabs.damage}}**、**{{ui:history.detail.tabs.tanked}}**、**{{ui:history.detail.tabs.healing}}**、**{{ui:history.detail.tabs.death}}**。

右上角的操作：

| 按钮 | 作用 |
| --- | --- |
| **{{ui:history.detail.actions.addFavorite}}** | 收藏这场战斗，可在列表中快速筛选 |
| **在网站打开** | 在 resonance-logs.com 查看这场战斗 |
| **删除** | 删除该记录 |

点击某位玩家可以查看技能明细（含最大 / 最小 / 平均伤害），以及 **伤害目标 / 治疗目标 / 伤害来源** 的拆分——例如确认你的伤害是打在 Boss 上还是小怪上。

## 时间轴

详情页的 **{{ui:history.timeline.title}}** 把整场战斗按时间展开：

- **曲线**：**{{ui:history.timeline.series.instant}}** 反映当下输出的起伏，**{{ui:history.timeline.series.average}}** 反映整体走势；可选择要显示的队友曲线。
- **泳道**：**{{ui:history.timeline.lanes.boss}}** 泳道显示 Boss 技能，**{{ui:history.timeline.lanes.team}}** 泳道显示队友关键技能与幻想施放。

![历史时间轴](../../../shared/img/changelog/v0.2.1_2.png)

操作方式：**拖拽** 选出一段时间 · **Shift + 拖拽** 平移 · **滚轮** 缩放 · **双击** 重置 · 拖动底边调整高度。

选中一段时间后，页面上的伤害统计会**只按选区重新计算**；点 **{{ui:history.timeline.selection.zoomToRange}}** 可放大查看。

## Buff 覆盖

如果你在 [Buff 覆盖率](../monitor/buff-coverage.md) 中配置了监听列表，历史详情会额外显示：

- **{{ui:history.timeline.buff.title}}** 时间轴：每个 Buff 在什么时候生效、持续多久；
- **{{ui:history.buffCoverage.title}}**：按活跃战斗时间计算的覆盖率与触发次数。

![Buff 覆盖时间轴](../../../shared/img/changelog/v0.2.3_2.png)

![Buff 覆盖率汇总](../../../shared/img/changelog/v0.2.3_3.png)

> [!NOTE]
> 覆盖数据从 v0.2.3 开始记录，更早的历史记录没有这部分内容。

从配置监听到打完复盘的完整流程，见 [例：复盘队伍的增益覆盖率](../monitor/buff-coverage.md#例复盘队伍的增益覆盖率)。

## 历史页显示设置

泳道行高、曲线高度、瞬时 DPS 统计窗口和历史表格的列，都在 **{{ui:routes.dps.settings}} → {{ui:settings.tabs.history}}** 中设置，见 [显示设置](./settings.md#历史)。

## 例

### 例：用时间轴找出输出空窗

**场景**：一场 Boss 战打完，你的秒伤比平时低，想弄清楚是哪一段掉了输出、为什么掉。

#### 第 1 步：打开这场战斗

1. 进入 **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}**。
2. 用「首领」筛选出这个 Boss，点开刚才那一条。

#### 第 2 步：看瞬时 DPS 曲线

在 **{{ui:history.timeline.title}}** 中，把曲线切到 **{{ui:history.timeline.series.instant}}**，并在曲线选择里只勾选自己和一两位参照队友。

- 曲线整体偏低 → 循环或配置问题；
- 某一段突然跌到接近 0 → 这段时间有空窗。

![历史时间轴](../../../shared/img/changelog/v0.2.1_2.png)

#### 第 3 步：框选空窗

1. 在曲线上**拖拽**框出掉下去的那一段。
2. 页面的伤害统计会**只按这一段**重新计算，可以看到这段时间内你打了哪些技能、打在谁身上。
3. 点 **{{ui:history.timeline.selection.zoomToRange}}** 放大，对照上方 **{{ui:history.timeline.lanes.boss}}** 泳道：常见原因是 Boss 转阶段 / 无敌，或者你在躲机制。

#### 第 4 步：确认增益是否断了

如果你配置了 [Buff 覆盖率](../monitor/buff-coverage.md)，展开 **{{ui:history.timeline.buff.title}}**，选择自己，看看空窗期间爆发 Buff 是否恰好不在。

![Buff 覆盖时间轴](../../../shared/img/changelog/v0.2.3_2.png)

#### 第 5 步：如果是倒地了

切到 **{{ui:history.detail.tabs.death}}**，查看死亡前几秒受到的每一次伤害，判断是哪个机制导致的。

> [!TIP]
> 想长期对比，可以把表现最好的一场 **{{ui:history.detail.actions.addFavorite}}**，之后复盘时和它对照同一阶段的曲线。
