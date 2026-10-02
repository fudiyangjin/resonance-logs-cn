# 常见问题 · DPS 与布局

相关说明：[DPS 检测](../features/dps/README.md) · [历史记录](../features/dps/history.md) · [主题与外观](../features/dps/themes.md) · [显示设置](../features/dps/settings.md)

## 数据

### 秒伤和真秒伤有什么区别？

- **秒伤 (DPS)**：总伤害 ÷ 战斗总时长。
- **真秒伤 (TDPS)**：总伤害 ÷ 活跃战斗时间，排除长时间停手、跑路等空档。

想看活跃时间，在 **{{ui:routes.dps.themes}} → {{ui:themes.tabs.live}} → {{ui:themes.header.title}}** 中打开 **{{ui:themes.header.showActiveTimer}}**。

### 数据什么时候会自动清空？

见 [战斗何时切分、何时重置](../features/dps/README.md#战斗何时切分何时重置)。需要手动清空时，点标题栏的重置按钮或按 [快捷键](../features/app/README.md#快捷键)。

### 历史记录会自动清理吗？

默认保留 200 条未收藏记录，可在应用设置中调整为 1–2000 条；下次启动会按时间自动删除较早的记录。重要的记录请加入收藏，见 [历史记录](../features/dps/history.md#历史列表)。

## 外观

### DPS 窗口怎么变透明？

**{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}} → {{ui:themes.tabs.general}}**，展开 **{{ui:themes.section.customColorTheme}}**，把 **背景（实时）** 的透明度调低。

![背景透明度](../../shared/img/faq/faq_2.png)

完整做法见 [例：透明的极简 DPS 窗口](../features/dps/examples/transparent-window.md)。

### 标题栏太挤，怎么精简？

在 **{{ui:themes.tabs.live}} → {{ui:themes.header.title}}** 中关掉不需要的项目和按钮，或改用自由布局把它们分到多行，见 [标题栏设置](../features/dps/themes.md#标题栏设置)。

### 想修改表格里显示哪些列？

- 实时窗口：**{{ui:routes.dps.settings}} → {{ui:settings.tabs.live}}**。
- 历史详情：**{{ui:routes.dps.settings}} → {{ui:settings.tabs.history}}**。

两边的列设置互不影响。每列都可以开关、调整顺序、自定义表头。见 [显示设置](../features/dps/settings.md)。

### 窗口被点击穿透后点不到了？

用快捷键 **{{ui:settings.shortcuts.toggleClickthrough}}**，或者右键托盘图标选 **Disable Clickthrough**。

### 主窗口的配色和 DPS 窗口不一样？

两者分开设置：DPS 窗口在 [主题与外观](../features/dps/themes.md) 中，主窗口在 [应用设置 · 外观](../features/app/README.md#外观) 中。
