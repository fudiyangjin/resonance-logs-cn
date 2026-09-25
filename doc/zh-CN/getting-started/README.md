# 快速入门

跟着本页走一遍，大约 5 分钟即可从安装到看到第一条战斗数据。

## 1. 安装应用

从 [下载页](https://github.com/fudiyangjin/resonance-logs-cn/releases/latest) 获取最新的 Windows x64 安装包并安装。

- 升级时直接覆盖安装即可，**不要删除用户设置目录**，你的方案、主题和历史记录都会保留。
- 之后的新版本可以在应用内一键更新，见 [更新、托盘与配置恢复](../features/app/update.md)。

首次启动后，界面语言可在 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}}** 中切换（简体中文 / English / 日本語），建议与游戏客户端保持一致，Buff 与技能名称会随之切换。

![首次启动后的主界面，标出左侧工具栏](../../shared/img/start/start_1.zh-CN.png)

## 2. 选择一个初始方案

第一次打开时会弹出 **{{ui:loadout.firstRun.title}}**。如果你的职业专精在列表中（如光盾、防盾、格挡、岩盾、惩击、愈合、重装、协奏），直接选中即可获得一整套配好的技能 CD、Buff、怪物监控与 DPS 设置；否则点 **{{ui:loadout.firstRun.skip}}**，稍后在 [监控方案](../features/app/loadouts.md) 中自行搭建。

![首次启动的「选择一个初始方案」弹窗](../../shared/img/start/start_2.zh-CN.png)

## 3. 设置抓包方式

应用通过读取游戏网络数据来统计战斗，需要先选好抓包方式。打开 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.network}}**，二选一：

| 方式 | 准备工作 | 适合情况 |
| --- | --- | --- |
| **WinDivert**（推荐先试） | 无需额外安装，以管理员权限运行应用 | 大多数用户 |
| **Npcap** | 安装 [Npcap](https://npcap.com/)，并在 **网络设备** 中选择网卡 | WinDivert 被安全软件拦截，或需要指定网卡 |

使用 Npcap 时，请选择真正承载游戏流量的以太网或 Wi-Fi 网卡，不要选 Loopback、VirtualBox、VMware 等虚拟网卡；如果开了加速器或 VPN，先确认游戏流量实际经过哪块网卡。

> [!WARNING]
> 更换抓包方式或网卡后，必须**完全退出并重新启动**应用才会生效。点击主窗口关闭按钮默认只是隐藏到系统托盘，请在右下角托盘图标上右键选择 **Quit** 后再重新打开。

![应用设置 → 网络 页面](../../shared/img/start/start_3.zh-CN.png)

## 4. 验证第一条战斗数据

1. 启动游戏并进入可以战斗的场景（例如训练场木桩）。
2. 打出一次伤害，屏幕上会出现 **实时 DPS 窗口**，显示你的名字和伤害。
3. 如果应用是在游戏中途才打开的，**切换一次场景**（传送、进出副本或换线），让游戏重新下发完整的角色数据。

![实时 DPS 窗口](../../shared/img/dps/dps_1.png)

看到数据就说明一切就绪。如果没有数据，按 [没有数据 / 抓不到包怎么办？](../faq/app-runtime.md#没有数据--抓不到包怎么办) 逐项排查。

> [!TIP]
> 游戏只会推送**变化的**数据。任何时候发现技能 CD、角色属性或 Buff 显示不全，先切一次场景，通常就能恢复。

## 5. 接下来做什么

| 我想要… | 去看 |
| --- | --- |
| 看懂 DPS 窗口、复盘一场战斗 | [DPS 检测](../features/dps/README.md) |
| 在屏幕上显示自己的技能 CD、Buff、因子 | [实时监控](../features/monitor/README.md) |
| 盯 Boss 身上的 Debuff、仇恨、机制倒计时 | [怪物监控](../features/monster/README.md) |
| 在副本里看站位与点名提示 | [副本机制](../features/minimap/README.md) |
| 让关键事件用语音提醒我 | [语音播报](../features/voice/README.md) |
| 计算最优模组搭配 | [模组计算](../features/module-calc/README.md) |
| 保存 / 切换 / 分享整套配置 | [监控方案](../features/app/loadouts.md) |

不熟悉界面的话，可以先看 [界面导览](./interface.md)，或者直接跟着 [例：第一次打本前的准备](#例第一次打本前的准备) 做一遍。

## 例

### 例：第一次打本前的准备

**场景**：你刚装好应用，今晚要和固定队打一次大师本，希望能看到队伍 DPS、自己的技能 CD 和 Boss 的机制，打完还能复盘。

本例假设你已经按上文完成了 [抓包设置](#3-设置抓包方式)，并能看到实时 DPS 窗口。

#### 第 1 步：套用一个预置方案

1. 打开 **{{ui:routes.tools.loadouts}}**。
2. 在 **{{ui:loadout.page.presetsTitle}}** 中找到你的专精（例如「森语者 · 愈合」），点击应用。
3. 应用后该方案自动关联专精；以后切到这个专精时会自动启用这套配置。

没有你的专精也没关系，先新建一个空白总方案，后面几步手动添加即可。

#### 第 2 步：打开技能 CD 与 Buff 浮窗

1. 打开 **{{ui:routes.tools.skillMonitor}}**，确认页顶 **{{ui:skillMonitor.main.enabled.label}}** 已开启。
2. 在 **{{ui:skillMonitor.tabs.skillCd}}** 中勾选你最关心的几个技能（最多 10 个）。
3. 在 **{{ui:skillMonitor.tabs.buff}}** 中搜索并加入自己的爆发 Buff。
4. 点击 **{{ui:skillMonitor.layout.editOverlayLayout}}**，把浮窗拖到角色附近的余光位置，点完成。

详见 [技能 CD](../features/monitor/skill-cd.md) 与 [Buff 监控](../features/monitor/buff.md)。

#### 第 3 步：打开怪物遮罩和副本机制

1. 打开 **{{ui:routes.tools.monsterMonitor}}**，开启 **{{ui:monsterMonitor.enabled}}**。
2. 在 **{{ui:monsterMonitor.tabs.overlay}}** 中打开 **Boss DBM 区**（默认关闭），Boss 读条时会弹出预警条。
3. 如果这个副本在 [已支持副本](../features/minimap/dungeons.md) 列表中，再到 **{{ui:routes.tools.minimap}}** 打开 **{{ui:minimap.settings.enabled.label}}**。

#### 第 4 步：确认 DPS 窗口排版

- 屏幕空间紧张时，在 **{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}}** 中改用「小号」尺寸预设，或开启 [紧凑模式](../features/dps/themes.md#紧凑模式)。
- 想让窗口透明，参考 [例：透明的极简 DPS 窗口](../features/dps/themes.md#例透明的极简-dps-窗口)。

#### 第 5 步：进本前切一次图

如果应用是在游戏中途打开的，在进本前随便传送一次，让技能 CD、属性和因子获得完整同步。

#### 打完之后

- 每个 Boss 会自动保存为一条历史记录，在 **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** 中查看。
- 想找出哪一段掉了输出，跟着 [例：用时间轴找出输出空窗](../features/dps/history.md#例用时间轴找出输出空窗) 操作。
- 觉得这套配置不错，可以 [导出分享给队友](../features/app/loadouts.md#例把方案分享给队友)。
