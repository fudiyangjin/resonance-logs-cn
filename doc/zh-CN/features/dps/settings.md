# 显示设置

**{{ui:routes.tools.dps}} → {{ui:routes.dps.settings}}** 决定 DPS 窗口「显示哪些数据」：名称、列、数值格式、刷新频率和打桩规则。分为 **{{ui:settings.tabs.live}}** 与 **{{ui:settings.tabs.history}}** 两个标签，两边互不影响。

> [!NOTE]
> 这些设置保存在 **DPS 设置子方案** 中，会随 [总方案](../app/loadouts.md) 切换和导出。抓包、快捷键、日志等应用级设置已移到 [应用设置](../app/README.md)。

## 实时

### 通用设置

| 设置 | 说明 |
| --- | --- |
| **{{ui:settings.common.name.your}}** / **{{ui:settings.common.name.others}}** | 显示名称、职业、名称 - 职业、名称 - 专精，或隐藏（录视频时常用） |
| **能力评分 / 赛季强度** | 是否在名字旁显示你和他人的评分 |
| **以最高值为基准** | 条形长度相对全场最高者，还是相对总量 |
| **缩写数值** | DPS / TPS / 能力评分是否缩写 |
| **{{ui:settings.common.abbreviationStyle}}** | {{ui:settings.common.abbreviationStyle.western}} 或 {{ui:settings.common.abbreviationStyle.cn}} |
| **{{ui:settings.common.decimalPlaces}}** | 1～4 位 |
| **{{ui:settings.live.fantasyCastIcons}}** | 在玩家名字旁显示最近释放的幻想图标 |
| **{{ui:settings.live.refreshRate}}** | 50～2000 ms，越低越流畅，也越耗 CPU |

### 列

**{{ui:settings.common.columns.dpsPlayers}}**、**{{ui:settings.common.columns.dpsSkills}}**、治疗、承伤以及 **{{ui:settings.common.columns.deathReplay}}** 各有一组列配置：

- 开关控制列是否显示；
- 箭头调整列顺序；
- 可以输入**自定义表头**，留空则用默认列名。

死亡回放列在实时与历史之间共用。

### 打桩

| 设置 | 说明 |
| --- | --- |
| **{{ui:settings.live.trainingWindow}}** | 从你命中木桩起计时，到点结束本轮，默认 3:03（183 秒） |
| **{{ui:settings.live.trainingLockPolicy}}** | **{{ui:settings.live.trainingLockPolicy.eliteDummies}}**：只认训练场的精英木桩；**{{ui:settings.live.trainingLockPolicy.firstMonster}}**：锁定你（含召唤物）打中的下一只怪物，适合在野外或副本中测试 |

打桩流程见 [例：用打桩模式测一轮 3 分钟输出](./README.md#例用打桩模式测一轮-3-分钟输出)。

## 历史

历史标签有一组与实时相同结构的通用设置和列设置，只在打开历史详情时生效。另有时间轴相关设置：

| 设置 | 说明 |
| --- | --- |
| **{{ui:settings.history.timeline.laneH}}** | 每条泳道的高度 |
| **{{ui:settings.history.timeline.curveH}}** | DPS 曲线区域的高度 |
| **{{ui:settings.history.timeline.instantWindow}}** | 瞬时 DPS 曲线统计最近多少秒 |
| **{{ui:settings.history.fantasyCastIcons}}** | 在玩家名字旁显示整场最近释放的 2 种幻想 |
