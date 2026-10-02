# 第一次打本前的准备

对应页面：[快速入门](../README.md)

**场景**：你刚装好应用，今晚要和固定队打一次大师本，希望能看到队伍 DPS、自己的技能 CD 和 Boss 的机制，打完还能复盘。

本例假设你已经按上文完成了 [抓包设置](../README.md#3-设置抓包方式)，并能看到实时 DPS 窗口。

## 第 1 步：套用一个预置方案

1. 打开 **{{ui:routes.tools.loadouts}}**。
2. 在 **{{ui:loadout.page.presetsTitle}}** 中找到你的专精（例如「森语者 · 愈合」），点击应用。
3. 应用后该方案自动关联专精；以后切到这个专精时会自动启用这套配置。

没有你的专精也没关系，先新建一个空白总方案，后面几步手动添加即可。

## 第 2 步：打开技能 CD 与 Buff 浮窗

1. 打开 **{{ui:routes.tools.skillMonitor}}**，确认页顶 **{{ui:skillMonitor.main.enabled.label}}** 已开启。
2. 在 **{{ui:skillMonitor.tabs.skillCd}}** 中勾选你最关心的几个技能（最多 10 个）。
3. 在 **{{ui:skillMonitor.tabs.buff}}** 中搜索并加入自己的爆发 Buff。
4. 点击 **{{ui:skillMonitor.layout.editOverlayLayout}}**，把浮窗拖到角色附近的余光位置，点完成。

详见 [技能 CD](../../features/monitor/skill-cd.md) 与 [Buff 监控](../../features/monitor/buff.md)。

## 第 3 步：打开怪物遮罩和副本机制

1. 打开 **{{ui:routes.tools.monsterMonitor}}**，开启 **{{ui:monsterMonitor.enabled}}**。
2. 在 **{{ui:monsterMonitor.tabs.overlay}}** 中打开 **Boss DBM 区**（默认关闭），Boss 读条时会弹出预警条。
3. 如果这个副本在 [已支持副本](../../features/minimap/dungeons.md) 列表中，再到 **{{ui:routes.tools.minimap}}** 打开 **{{ui:minimap.settings.enabled.label}}**。

## 第 4 步：确认 DPS 窗口排版

- 屏幕空间紧张时，在 **{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}}** 中改用「小号」尺寸预设，或开启 [紧凑模式](../../features/dps/themes.md#紧凑模式)。
- 想让窗口透明，参考 [例：透明的极简 DPS 窗口](../../features/dps/examples/transparent-window.md)。

## 第 5 步：进本前切一次图

如果应用是在游戏中途打开的，在进本前随便传送一次，让技能 CD、属性和因子获得完整同步。

## 打完之后

- 每个 Boss 会自动保存为一条历史记录，在 **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** 中查看。
- 想找出哪一段掉了输出，跟着 [例：用时间轴找出输出空窗](../../features/dps/examples/timeline-gaps.md) 操作。
- 觉得这套配置不错，可以 [导出分享给队友](../../features/app/examples/share-loadout.md)。
