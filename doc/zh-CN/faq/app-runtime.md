# 常见问题 · 安装与抓包

## 数据捕获

### 没有数据 / 抓不到包怎么办？

按顺序逐项排查：

1. 确认游戏正在运行，并且你已经打出伤害。
2. 打开 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.network}}**，检查抓包方式。
3. 使用 **Npcap** 时：确认已安装 Npcap，并在 **{{ui:settings.network.device}}** 中选择真正承载游戏流量的网卡，不要选择虚拟网卡。
4. 使用 **WinDivert** 时：确认以管理员权限运行应用，并检查防火墙或杀毒软件是否拦截（见下一条）。
5. **完全退出**应用（托盘右键 **Quit**）后重新启动。更换抓包方式或网卡后必须重启才会生效。
6. 关闭可能冲突的 VPN、代理或其他抓包工具后重试。
7. 如果是游戏中途才打开应用，切换一次场景。

仍然不行时，在 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.diagnostics}}** 中 **{{ui:settings.debug.createDiagnosticsBundle}}**，附在反馈中。

### 选 WinDivert 还是 Npcap？

| 方式 | 说明 |
| --- | --- |
| **WinDivert** | 内置驱动，不需要额外安装；需要管理员权限，可能被杀毒软件误报 |
| **Npcap** | 需要单独安装 [Npcap](https://npcap.com/)，并选择正确的网卡 |

建议先用 WinDivert；被安全软件拦截或者需要指定网卡时，改用 Npcap。完整步骤见 [快速入门](../getting-started/README.md#3-设置抓包方式)。

### WinDivert 被防火墙或杀毒软件拦截怎么办？

WinDivert 会加载网络驱动，部分安全软件会将其当作风险行为，表现为启动后一直没有数据。

1. 在 Windows 防火墙中允许应用通过，或临时关闭防火墙，确认是否是拦截导致。
2. 检查杀毒软件的隔离区，确认 `WinDivert.dll`、`WinDivert64.sys` 或应用安装目录没有被隔离。
3. 使用火绒时，进入 **防护中心 → 病毒防护 → 信任区**，把应用安装目录加入信任；隔离区中已有 WinDivert 文件时，先恢复再加入信任。
4. 完全退出应用后重新启动。
5. 仍然反复被隔离的话，改用 Npcap。

![WinDivert 被火绒拦截](../../shared/img/faq/faq_1.png)

### 技能 CD、属性或 Buff 显示不全？

游戏只推送**变化的**数据。如果在游戏中途才打开应用，应用拿不到完整状态。**切换一次场景**（传送、进出副本或换线）即可恢复。

## 安装与配置

### 升级后设置会丢失吗？

不会。应用内 [自动更新](../features/app/update.md#自动更新) 和覆盖安装都会保留所有方案、主题、语音和历史记录，只要**不删除用户设置目录**。

### 如何把我的配置分享给别人？

在 **{{ui:routes.tools.loadouts}}** 中 **{{ui:loadout.page.exportButton}}**，把得到的 JSON 文件发给对方，对方用 **{{ui:loadout.page.importButton}}** 导入即可，见 [例：把方案分享给队友](../features/app/examples/share-loadout.md)。

外观、快捷键和抓包设置属于本机设置，不随方案分享。

### 日志文件在哪里？

**{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.diagnostics}} → {{ui:settings.debug.openLogs}}**。

### 点关闭按钮后应用还在运行？

默认关闭按钮只会隐藏到系统托盘。右键托盘图标选 **Quit** 完全退出；想让关闭按钮直接退出，在 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}}** 中开启 **{{ui:appSettings.behavior.exitOnClose}}**。

### 浮窗跑到屏幕外面了？

右键托盘图标选 **Reset All Windows**，所有窗口会恢复默认位置和大小。

### 提示监控配置已自动恢复？

监控配置文件损坏时，应用会自动恢复，并保留原始文件。详见 [配置恢复](../features/app/update.md#配置恢复)。

### 从 0.0.2 / 0.0.3 升级后出现异常？

仅适用于从很早期版本升级的用户：关闭应用，删除 `%LOCALAPPDATA%\resonance-logs-cn` 目录下的 `resonance-logs-cn.db`，然后重新启动。
