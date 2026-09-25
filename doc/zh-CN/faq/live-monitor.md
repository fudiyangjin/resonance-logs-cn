# 常见问题 · 实时监控

相关说明：[实时监控](../features/monitor/README.md) · [技能 CD](../features/monitor/skill-cd.md) · [Buff 监控](../features/monitor/buff.md) · [自定义监控](../features/monitor/custom-panel.md) · [启用窗口与布局](../features/monitor/overlay.md)

### 技能 CD、属性显示不全怎么办？

游戏只推送变化的数据，中途打开应用时拿不到完整状态。**切换一次场景**即可恢复。

### 因子能量、赛季节点怎么显示？

不需要手动配置计数器。在 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}}** 中点 **{{ui:skillMonitor.customPanel.newFactor}}**，应用会按当前赛季自动创建因子配置区或赛季节点区，自动显示你携带的因子与节点。见 [因子配置区](../features/monitor/custom-panel.md#因子配置区) 和 [例：自动显示因子能量与赛季节点](../features/monitor/custom-panel.md#例自动显示因子能量与赛季节点)。

### Buff 名字看不懂，能改吗？

可以。在 Buff 监控的 **{{ui:skillMonitor.buff.alias.title}}** 中设置别名，见 [名称与图标](../features/monitor/buff.md#名称与图标)。

### 不知道要监控的 Buff 叫什么？

先开启「监听所有」，浮窗会显示你身上的所有 Buff。确认名称后再加入精确监控列表，然后关闭监听所有。

### 怎么一次性监控所有食物或炼金 Buff？

使用 [分类快捷监听](../features/monitor/buff.md#分类快捷监听)。

### 浮窗没有出现？

1. 确认页面顶部的实时监控开关已打开。
2. 在 **{{ui:skillMonitor.tabs.overlay}}** 中确认对应区域为显示。
3. 浮窗可能在屏幕外：右键托盘图标选 **Reset All Windows**。

### 换职业后浮窗内容还是上一个职业的？

浮窗内容跟随当前 [监控方案](../features/app/loadouts.md)。切换方案，或开启 **{{ui:loadout.autoSwitch.toggle}}**，见 [例：切专精时自动换方案](../features/app/loadouts.md#例切专精时自动换方案)。
