# 更新、托盘与配置恢复

## 自动更新

有新版本时，左侧栏底部会出现 **{{ui:updater.available}}** 按钮，鼠标悬停可看到新版本号。

1. 点击 **{{ui:updater.available}}**，应用在后台静默下载，按钮上显示下载进度。你可以继续正常使用，包括打本。
2. 下载完成后自动校验、安装并重启应用。
3. 如果中途失败，按钮会变为 **{{ui:updater.retry}}**，点击重试即可。

更新会保留所有方案、主题、语音和历史记录。也可以随时从 [下载页](https://github.com/fudiyangjin/resonance-logs-cn/releases/latest) 下载安装包覆盖安装，同样不会丢失数据，只要**不删除用户设置目录**。

> [!TIP]
> 更新会重启应用，建议在两场战斗之间点击，而不是在 Boss 战中途。

## 系统托盘

点击主窗口的关闭按钮默认只是隐藏到右下角托盘，浮窗、统计和语音继续工作。右键托盘图标：

| 菜单项 | 作用 |
| --- | --- |
| **Show Settings** | 重新打开主窗口 |
| **Show Live Meter** | 显示实时 DPS 窗口 |
| **Reset All Windows** | 把所有窗口恢复到默认位置和大小，窗口跑出屏幕时使用 |
| **Disable Clickthrough** | 关闭 DPS 窗口的点击穿透，让它重新可以拖动 |
| **Quit** | 完全退出应用 |

想让关闭按钮直接退出，在 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}}** 中开启 **{{ui:appSettings.behavior.exitOnClose}}**。

## 配置恢复

如果监控配置文件损坏（例如写入时断电），应用启动时会自动恢复到可用的状态，并显示 **{{ui:monitoring.recovery.noticeTitle}}**：

- 无法读取的原始配置会保留在通知中显示的恢复目录中，不会被删除；
- 其他应用设置不受影响。

如果自动恢复失败，会显示 **{{ui:monitoring.recovery.errorTitle}}**。先点 **{{ui:monitoring.recovery.reload}}**；仍然不行时点 **{{ui:monitoring.recovery.openLogs}}**，并在 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.diagnostics}}** 中 **{{ui:settings.debug.createDiagnosticsBundle}}**，附在反馈中。

> [!TIP]
> 定期 [导出方案](./loadouts.md#导入与导出) 是最简单的备份方式，重装系统或换电脑时直接导入即可。
