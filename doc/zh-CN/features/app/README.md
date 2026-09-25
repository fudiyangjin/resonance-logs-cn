# 应用设置

**{{ui:routes.tools.appSettings}}** 汇集了与具体功能无关的全局设置：语言、主窗口外观、抓包、快捷键和诊断工具。这些设置保存在本机，**不随方案导出分享**。

| 标签页 | 内容 |
| --- | --- |
| [{{ui:appSettings.tabs.general}}](#通用) | 界面语言、关闭按钮行为 |
| [{{ui:appSettings.tabs.appearance}}](#外观) | 主窗口配色、背景图、字体 |
| [{{ui:appSettings.tabs.network}}](#网络) | 抓包方式与网卡 |
| [{{ui:appSettings.tabs.shortcuts}}](#快捷键) | 全局快捷键 |
| [{{ui:appSettings.tabs.diagnostics}}](#诊断) | 日志与调试压缩包 |

## 通用

- **{{ui:appSettings.language.title}}**：简体中文 / English / 日本語。建议与游戏客户端一致，Buff 和技能名称会随之切换，预置语音音色也按界面语言选择。
- **{{ui:appSettings.behavior.exitOnClose}}**：默认关闭，点击主窗口关闭按钮只会隐藏到系统托盘，浮窗和语音继续工作。开启后关闭按钮直接退出应用。

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

推荐的绑定方式见 [例：用快捷键在战斗中调整浮窗](#例用快捷键在战斗中调整浮窗)。

> [!TIP]
> 避免使用与游戏冲突的按键。例如 `Ctrl+\` 是游戏自带的隐藏 UI 键，不要绑定到这里。

## 诊断

- **{{ui:settings.debug.openLogs}}**：打开日志文件所在目录。
- **{{ui:settings.debug.createDiagnosticsBundle}}**：把日志和必要的配置打包为一个 Zip 文件。反馈问题时附上它，能大大加快排查速度。

## 例

### 例：用快捷键在战斗中调整浮窗

**场景**：你全屏玩游戏，不想为了挪浮窗或清空数据切回主窗口。你希望打木桩前一键重置统计，发现浮窗挡视线时一键进入编辑布局，截图时一键收起所有窗口。

#### 第 1 步：绑定快捷键

打开 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.shortcuts}}**，点击某一项后按下组合键。推荐：

| 操作 | 推荐按键 |
| --- | --- |
| **{{ui:settings.shortcuts.resetEncounter}}** | `Ctrl+Shift+R` |
| **{{ui:settings.shortcuts.toggleClickthrough}}** | `Ctrl+Shift+C` |
| **{{ui:settings.shortcuts.toggleOverlayEdit}}** | `Ctrl+Shift+E` |
| **{{ui:settings.shortcuts.toggleMinimizeAll}}** | `Ctrl+Shift+H` |

绑错了**右键**该项即可清除。

#### 第 2 步：在游戏中使用

- **打木桩前**：按 `Ctrl+Shift+R` 清空上一次的数据。
- **挪 DPS 窗口**：按 `Ctrl+Shift+C` 关闭点击穿透，拖到新位置后再按一次，恢复穿透。
- **挪监控浮窗**：按 `Ctrl+Shift+E` 进入编辑布局，拖动、缩放各个区域，再按一次退出。
- **截图或切出游戏**：按 `Ctrl+Shift+H` 收起 DPS 窗口和所有遮罩，再按一次弹出。

> [!WARNING]
> 不要绑定游戏已经使用的按键。`Ctrl+\` 是游戏自带的隐藏 UI 键，绑定后会互相冲突。

#### 如果浮窗找不到了

浮窗被拖出屏幕或者尺寸异常时，右键系统托盘图标选择 **Reset All Windows**，所有窗口会回到默认位置，见 [系统托盘](./update.md#系统托盘)。

## 相关页面

- [监控方案](./loadouts.md)：保存、切换、分享整套监控配置。
- [更新、托盘与配置恢复](./update.md)
