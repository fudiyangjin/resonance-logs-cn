# Buff 覆盖率

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buffCoverage}}** 统计指定 Buff 在战斗中的**覆盖率**（生效时间 ÷ 活跃战斗时间）与**触发次数**，既能实时看，也能在历史记录中复盘。

![实时覆盖率](../../../shared/img/changelog/v0.2.3_1.png)

## 添加监听

在 **{{ui:skillMonitor.buffCoverage.list.title}}** 中搜索 Buff 并添加，数量有上限，页面会显示「已添加 / 上限」。

每个条目都有 **{{ui:skillMonitor.buffCoverage.entry.showInLive}}** 开关：

- **开启**：你自己的覆盖率会显示在实时监控浮窗的 Buff 覆盖率区；
- **关闭**：不在浮窗显示，但仍会统计队友和历史数据。

## 浮窗样式

**{{ui:skillMonitor.buffCoverage.style.title}}** 可以控制每行是否显示 **状态点**、**名称**、**剩余时长**、**覆盖率 %**、**触发次数** 和 **倒计时条**，并设置名称、数值、进度条颜色。

## 在历史中查看

战斗结束后，打开 [历史记录](../dps/history.md#buff-覆盖) 的详情页，可以看到每位队员这些 Buff 的覆盖时间轴与覆盖率汇总。

![覆盖率汇总](../../../shared/img/changelog/v0.2.3_3.png)

## 例

### 例：复盘队伍的增益覆盖率

**场景**：你是辅助，负责给队伍挂增伤 Buff，想知道这场 Boss 战中增益的覆盖率有多高，哪一段断了。

#### 第 1 步：添加要统计的 Buff

1. 打开 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buffCoverage}}**。
2. 在 **{{ui:skillMonitor.buffCoverage.list.title}}** 中搜索你负责的增益，例如「山贼增伤」「巴西增伤」，逐个添加。

#### 第 2 步：决定是否在浮窗中显示

- 想在战斗中实时看自己的覆盖率：打开该条目的 **{{ui:skillMonitor.buffCoverage.entry.showInLive}}**，并在 [启用窗口](./overlay.md) 中开启 **Buff覆盖率区**。
- 只想事后复盘：保持关闭，统计照样进行。

![实时覆盖率](../../../shared/img/changelog/v0.2.3_1.png)

#### 第 3 步：打完后看历史

1. 打开 **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}**，点开这场战斗。
2. **{{ui:history.buffCoverage.title}}** 列出每个 Buff 的覆盖率与触发次数，覆盖率按**活跃战斗时间**计算，Boss 无敌、转场的空档不会拉低数值。

![覆盖率汇总](../../../shared/img/changelog/v0.2.3_3.png)

3. 展开 **{{ui:history.timeline.buff.title}}**，选择要查看的玩家，每一段色块就是 Buff 生效的时间。和上方 DPS 曲线对照，能看出增益是否对上了爆发期。

![Buff 覆盖时间轴](../../../shared/img/changelog/v0.2.3_2.png)

> [!NOTE]
> 只有已经加入监听列表的 Buff 才会被记录。新添加的 Buff 从下一场战斗开始统计。
