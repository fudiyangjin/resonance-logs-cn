# Buff 覆盖率

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buffCoverage}}** 统计指定 Buff 在战斗中的**覆盖率**（生效时间 ÷ 活跃战斗时间）与**触发次数**，既能实时看，也能在历史记录中复盘。

![实时覆盖率](../../../shared/img/changelog/v0.2.3_1.png)

## 添加监听

在 **{{ui:skillMonitor.buffCoverage.list.title}}** 中搜索 Buff 并添加，数量有上限，页面会显示「已添加 / 上限」。

也可以添加 [组合 Buff](./buff.md#组合-buff)：它的覆盖率按满足生效条件（全部或至少 k 个成员同时存在）的时间计算，实时和历史记录（包括队友）都支持。

每个条目都有 **{{ui:skillMonitor.buffCoverage.entry.showInLive}}** 开关：

- **开启**：你自己的覆盖率会显示在实时监控浮窗的 Buff 覆盖率区。覆盖率区显示时，**{{ui:skillMonitor.buff.all.title}}** 不再重复显示这个 Buff，在 Buff 监控中单独选中的仍照常显示；
- **关闭**：不在浮窗显示，但仍会统计队友和历史数据。

## 浮窗样式

**{{ui:skillMonitor.buffCoverage.style.title}}** 可以控制每行是否显示 **状态点**、**名称**、**剩余时长**、**覆盖率 %**、**触发次数** 和 **倒计时条**，并设置名称、数值、进度条颜色。

## 在历史中查看

战斗结束后，打开 [历史记录](../dps/history.md#buff-覆盖) 的详情页，可以看到每位队员这些 Buff 的覆盖时间轴与覆盖率汇总。

![覆盖率汇总](../../../shared/img/changelog/v0.2.3_3.png)

## 例

- [复盘队伍的增益覆盖率](./examples/buff-coverage.md)