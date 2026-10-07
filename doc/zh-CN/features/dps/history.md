# 历史记录

**{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** 保存每一场自动切分的战斗，可以随时打开复盘。

![历史记录](../../../shared/img/dps/dps_3.png)

## 历史列表

- **筛选**：按 **{{ui:history.list.filters.favorite}}**、首领、玩家、场景过滤；点 **{{ui:history.list.filters.favoriteOnly}}** 只看收藏。
- **批量删除**：勾选多条后点 **{{ui:history.list.actions.delete}}**，删除不可撤销。
- **分页**：底部可设置每页行数。

> [!NOTE]
> 默认保留 **200 条未收藏记录**，可在应用设置中调整为 1–2000 条。修改后会在下次启动时按时间清理较早的记录。**加入收藏** 可以避免重要记录被清理后找不到。

## 战斗详情

点击任意一条记录进入详情，顶部有四个标签：**{{ui:history.detail.tabs.damage}}**、**{{ui:history.detail.tabs.tanked}}**、**{{ui:history.detail.tabs.healing}}**、**{{ui:history.detail.tabs.death}}**。

右上角的操作：

| 按钮 | 作用 |
| --- | --- |
| **{{ui:history.detail.actions.addFavorite}}** | 收藏这场战斗，可在列表中快速筛选 |
| **编辑备注** | 为这场战斗添加备注，备注会显示在历史列表中 |
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

- **{{ui:history.timeline.buff.title}}** 轨道：点时间轴表头的 **{{ui:history.timeline.buff.title}}** 展开（默认收起），技能泳道和曲线之间会列出自己每个 Buff 的生效时段，左侧是覆盖率；想看其他人，在旁边的 **{{ui:history.timeline.buff.players}}** 选择器中勾选（自己排在第一位，和队友泳道的选择互不影响）。可在 **{{ui:history.timeline.buff.groupByPlayer}}** / **{{ui:history.timeline.buff.groupByBuff}}** 之间切换分组；灰色斜线是不计入覆盖率的非活跃战斗时段。悬停、拖拽选区、缩放都和上面的泳道一致；
- **{{ui:history.buffCoverage.title}}**：每行一个 Buff，列出每位玩家按活跃战斗时间计算的覆盖率与触发次数。

![Buff 覆盖时间轴](../../../shared/img/changelog/v0.2.3_2.png)

![Buff 覆盖率汇总](../../../shared/img/changelog/v0.2.3_3.png)

> [!NOTE]
> 覆盖数据从 v0.2.3 开始记录，更早的历史记录没有这部分内容。

从配置监听到打完复盘的完整流程，见 [例：复盘队伍的增益覆盖率](../monitor/examples/buff-coverage.md)。

## 历史页显示设置

泳道行高、曲线高度、瞬时 DPS 统计窗口和历史表格的列，都在 **{{ui:routes.dps.settings}} → {{ui:settings.tabs.history}}** 中设置，见 [显示设置](./settings.md#历史)。

## 例

- [用时间轴找出输出空窗](./examples/timeline-gaps.md)