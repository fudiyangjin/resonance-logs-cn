# 应用设置

**{{ui:routes.tools.appSettings}}** 汇集了与具体功能无关的全局设置：语言、主窗口外观、抓包、快捷键和诊断工具。这些设置保存在本机，**不随方案导出分享**。

| 标签页 | 内容 |
| --- | --- |
| [{{ui:appSettings.tabs.general}}](#通用) | 界面语言、关闭按钮行为、队伍共享、Boss 血量上报 |
| [{{ui:appSettings.tabs.appearance}}](#外观) | 主窗口配色、背景图、字体 |
| [{{ui:appSettings.tabs.network}}](#网络) | 抓包方式与网卡 |
| [{{ui:appSettings.tabs.shortcuts}}](#快捷键) | 全局快捷键 |
| [{{ui:appSettings.tabs.diagnostics}}](#诊断) | 日志与调试压缩包 |

## 通用

- **{{ui:appSettings.language.title}}**：简体中文 / English / 日本語。建议与游戏客户端一致，Buff 和技能名称会随之切换，预置语音音色也按界面语言选择。
- **{{ui:appSettings.behavior.exitOnClose}}**：默认关闭，点击主窗口关闭按钮只会隐藏到系统托盘，浮窗和语音继续工作。开启后关闭按钮直接退出应用。
- **{{ui:appSettings.teamShare.title}}**：默认开启，与同样开启的队友互相共享技能 CD，显示在 [队友 CD](../monster/teammate-cd.md) 面板中；下方会显示当前连接状态。
- **{{ui:appSettings.hpReport.title}}**：默认开启。在野外看到被追踪的 Boss 或魔法生物时，把它的血量上报到 bptimer.cn，网站据此按线路展示各 Boss 的血量；在副本中不上报。下方会显示当前连接状态。

> [!NOTE]
> 血量上报只发送：游戏区服（由游戏客户端判断）、所在线路、怪物 ID、血量（每 5% 一档），以及需要区分刷新点的几只魔法生物的大致坐标。不包含账号、角色 ID 或角色名。

## 外观

这里的设置只影响**主窗口**。DPS 窗口的配色和布局在 [主题与外观](../dps/themes.md) 中单独设置。

- **{{ui:themes.presets.colorTitle}}**：选择一套预设配色；也可以在 **{{ui:themes.section.customColorTheme}}** 中逐项调整颜色和透明度。
- **{{ui:themes.background.title}}**：用一张 PNG / JPG / WebP 图片作背景，可调 **{{ui:themes.background.opacity}}** 和 **{{ui:themes.background.imageMode}}**（**{{ui:themes.background.imageMode.cover}}** 或 **{{ui:themes.background.imageMode.contain}}**；选择包含时还可设置 **{{ui:themes.background.fillColor}}**）。
- **{{ui:themes.fonts.title}}**：导入 .woff2 / .woff / .ttf / .otf 字体，分别替换 **{{ui:themes.fonts.sansTitle}}** 和 **{{ui:themes.fonts.monoTitle}}**。开启 **{{ui:themes.fonts.applyToOverlay}}** 后，技能、怪物、小地图浮窗也使用自定义无衬线字体。

## 网络

选择抓包方式：**WinDivert**（无需额外安装，推荐先试）或 **Npcap**（需安装 [Npcap](https://npcap.com/)，并在 **{{ui:settings.network.device}}** 中选择承载游戏流量的网卡）。详细说明见 [快速入门 · 设置抓包方式](../../getting-started/README.md#3-设置抓包方式)。

> [!WARNING]
> 更改捕获方式或网卡后，需要**完全退出**应用（托盘右键 **Quit**）并重新启动才会生效。

## 快捷键

为常用操作绑定全局快捷键，在游戏中也能生效。点击某一项后按下想要的组合键即可；**右键**可以清除。

| 操作 | 用途 |
| --- | --- |
| **{{ui:settings.shortcuts.toggleLiveMeter}}** / **{{ui:settings.shortcuts.showLiveMeter}}** / **{{ui:settings.shortcuts.hideLiveMeter}}** | 显示或隐藏实时 DPS 窗口 |
| **{{ui:settings.shortcuts.toggleClickthrough}}** / **{{ui:settings.shortcuts.enableClickthrough}}** / **{{ui:settings.shortcuts.disableClickthrough}}** | 切换 DPS 窗口能否被鼠标点到 |
| **{{ui:settings.shortcuts.resetEncounter}}** | 清空当前战斗数据，重新开始统计 |
| **{{ui:settings.shortcuts.togglePauseEncounter}}** | 暂停 / 继续统计 |
| **{{ui:settings.shortcuts.toggleBossHp}}** | 在 DPS 窗口中显示或隐藏 Boss 血量 |
| **{{ui:settings.shortcuts.toggleOverlayWindow}}** | 开关实时监控浮窗 |
| **{{ui:settings.shortcuts.toggleOverlayEdit}}** | 进入 / 退出浮窗的编辑布局模式 |
| **{{ui:settings.shortcuts.toggleMinimizeAll}}** | 一键收起或弹出 DPS 窗口与所有遮罩，切屏、截图时很方便 |

推荐的绑定方式见 [例：用快捷键在战斗中调整浮窗](./examples/combat-shortcuts.md)。

> [!TIP]
> 避免使用与游戏冲突的按键。例如 `Ctrl+\` 是游戏自带的隐藏 UI 键，不要绑定到这里。

## 诊断

- **{{ui:settings.debug.openLogs}}**：打开日志文件所在目录。
- **{{ui:settings.debug.createDiagnosticsBundle}}**：把日志和必要的配置打包为一个 Zip 文件。反馈问题时附上它，能大大加快排查速度。

## 例

- [用快捷键在战斗中调整浮窗](./examples/combat-shortcuts.md)
## 相关页面

- [监控方案](./loadouts.md)：保存、切换、分享整套监控配置。
- [更新、托盘与配置恢复](./update.md)
