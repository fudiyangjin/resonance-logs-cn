# 主题与外观

**{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}}** 决定实时 DPS 窗口「长什么样」：配色、大小、表格样式和标题栏布局。页面分为 **{{ui:themes.tabs.general}}**、**{{ui:themes.tabs.live}}**、**{{ui:themes.tabs.presets}}** 三个标签。

![主题页](../../../shared/img/dps/dps_4.png)

> [!TIP]
> 最快的方法是先在 **{{ui:themes.tabs.presets}}** 中选一个颜色预设和尺寸预设，再在其他标签里微调。

## 预设

### 颜色预设

| 预设 | 风格 |
| --- | --- |
| **{{ui:themes.preset.color.dark.name}}** | 默认深色，适合大多数场景 |
| **{{ui:themes.preset.color.light.name}}** | 浅色背景 |
| **{{ui:themes.preset.color.pink.name}}** / **{{ui:themes.preset.color.green.name}}** / **{{ui:themes.preset.color.matcha.name}}** | 柔和配色 |
| **{{ui:themes.preset.color.rainbow.name}}** | 彩色渐变行 |

颜色预设作用于**当前总方案**的实时窗口。

![颜色预设](../../../shared/img/faq/faq_3.png)

### 尺寸预设

| 预设 | 效果 |
| --- | --- |
| **{{ui:themes.preset.size.compact.name}}** | 无内边距、不显示标题栏，只剩表格本身 |
| **{{ui:themes.preset.size.small.name}}** / **{{ui:themes.preset.size.medium.name}}** / **{{ui:themes.preset.size.large.name}}** | 行高、字号、图标逐级放大 |

## 颜色

在 **{{ui:themes.tabs.general}} → {{ui:themes.section.colorThemes}}** 中：

- **{{ui:themes.section.customColorTheme}}**：逐项修改背景、**背景（实时）**、文字、按钮、边框、表格文字、K/M/% 后缀、提示框等颜色，每一项都支持透明度。
- **{{ui:themes.section.classSpecColors}}**：表格中按职业 / 专精着色的颜色。

把 **背景（实时）** 的透明度调低就能得到半透明窗口，见 [例：透明的极简 DPS 窗口](./examples/transparent-window.md)。

![调整背景透明度](../../../shared/img/faq/faq_2.png)

> [!NOTE]
> 这里的颜色只影响 DPS 窗口。主窗口自身的配色、背景图和字体在 [应用设置 · 外观](../app/README.md#外观) 中设置。

## 表格

**{{ui:themes.table.playerSettings}}** 与 **{{ui:themes.skillTable.settings}}** 控制每一行的外观：

- 行高、字体大小、图标大小；
- 行高亮模式（渐变带下划线 / 渐变 / 纯色）、**{{ui:themes.table.rowGlowOpacity}}**、行圆角；
- 表头是否显示、高度、字号和颜色；
- K/M/% 后缀的字号。

## 紧凑模式

开启 **{{ui:themes.compact.enable}}** 后，玩家表格会隐藏表头，每行只显示总量（秒伤）与占比，并按总量降序排列；若勾选 **{{ui:themes.compact.includeDetails}}**，点进玩家后的技能明细和承伤明细也会以紧凑样式展示。DPS 面板括号中可以选择显示 **{{ui:themes.compact.option.dps}}** 还是 **{{ui:themes.compact.option.tdps}}**。

![紧凑模式](../../../shared/img/dps/dps_5.png)

## 标题栏设置

**{{ui:themes.tabs.live}} → {{ui:themes.header.title}}** 管理窗口顶部那一条：

- **布局模式**：**{{ui:themes.header.layoutMode.classic}}** 保持固定两行；**{{ui:themes.header.layoutMode.custom}}** 可以把计时器、场景名称、打桩状态、总伤害、总 DPS、Boss 血量、导航标签、控制按钮自由分配到多行，并调整顺序与间距。
- **Boss 血量**：可选 **{{ui:themes.header.bossHealthLayout.vertical}}** 或 **{{ui:themes.header.bossHealthLayout.horizontal}}**，横向适合窄窗口让血量独占一行。
- **按钮**：分别控制重置、暂停、**{{ui:themes.header.showHeaderControl}}**、设置、最小化按钮。
- **计时**：**{{ui:themes.header.showActiveTimer}}** 会在计时器旁显示真秒伤使用的活跃时间。
- **导航标签**：可以关闭 **{{ui:themes.header.showDeathTab}}**，不影响死亡数据本身。
- 各项字号、窗口与标题栏内边距。

![标题栏自由布局](../../../shared/img/dps/dps_6.png)

![标题栏设置](../../../shared/img/faq/faq_4.png)

## 点击穿透

**{{ui:themes.tabs.live}} → 实时窗口显示设置 → {{ui:themes.liveDisplay.clickthrough}}** 开启后，鼠标会穿过 DPS 窗口点到背后的游戏。需要再次操作窗口时，用 [快捷键](../app/README.md#快捷键) 或托盘菜单 **Disable Clickthrough** 关闭。

## 例

- [透明的极简 DPS 窗口](./examples/transparent-window.md)
- [标题栏自由布局与死亡回放](./examples/header-death.md)