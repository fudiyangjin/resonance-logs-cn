# 实时监控

**{{ui:routes.tools.skillMonitor}}** 在游戏画面上叠加一层透明浮窗（实时监控遮罩），显示**你自己**的技能 CD、资源、Buff、因子、角色属性和护盾。

![实时监控浮窗效果](../../../shared/img/monitor/buff_4.png)

## 你可以用它做什么

- 不看技能栏也能掌握关键技能的冷却，CD 转好时语音提醒；
- 盯住爆发 Buff、幻想增益、食物药剂是否还在；
- 自动显示当前装配的**因子能量与赛季节点效果**；
- 实时查看攻速、暴击等属性，以及护盾吸收量；
- 统计自己关键增益的覆盖率。

## 顶部开关

页面顶部在任意标签下都可见：

| 开关 | 作用 |
| --- | --- |
| **{{ui:skillMonitor.main.enabled.label}}** | 总开关，关闭后浮窗不再接收数据 |
| **{{ui:skillMonitor.main.autoHideInDailyScenes.label}}** | 在主城等日常场景自动隐藏浮窗，进入战斗场景后恢复 |
| **{{ui:skillMonitor.layout.toggleOverlayWindow}}** | 显示 / 隐藏浮窗 |
| **{{ui:skillMonitor.layout.editOverlayLayout}}** | 进入布局编辑，拖动和缩放各个区域 |

## 页面结构

| 标签 | 在浮窗中显示 | 文档 | 例 |
| --- | --- | --- | --- |
| **{{ui:skillMonitor.tabs.skillCd}}** | 技能冷却图标 | [技能 CD](./skill-cd.md) | — |
| **{{ui:skillMonitor.tabs.buff}}** | 自身 Buff 图标或进度条 | [Buff 监控](./buff.md) | [蒂娜 CD 转好时语音提醒](./examples/tina-cd.md) · [用组合 Buff 监控 3 层效果](./examples/attribute-symphony.md) |
| **{{ui:skillMonitor.tabs.panelAttr}}** | 角色属性数值 | [角色面板](./panel-attr.md) | — |
| **{{ui:skillMonitor.tabs.customPanel}}** | 因子区、赛季节点区、自由组合的 Buff 与计数器 | [自定义监控](./custom-panel.md) | [自动显示因子能量与赛季节点](./examples/factor-energy.md) · [用预设计数器盯炎角的绝对幸运](./examples/preset-counter.md) |
| **{{ui:skillMonitor.tabs.shieldDetail}}** | HP 与护盾条 | [血量护盾区](./shield.md) | — |
| **{{ui:skillMonitor.tabs.buffCoverage}}** | 增益覆盖率 | [Buff 覆盖率](./buff-coverage.md) | [复盘队伍的增益覆盖率](./examples/buff-coverage.md) |
| **{{ui:skillMonitor.tabs.overlay}}** | 控制以上各区域是否显示 | [启用窗口与布局](./overlay.md) | — |

所有配置都保存在当前总方案的 **技能监控子方案** 中，切换方案即可整套切换，见 [监控方案](../app/loadouts.md)。

> [!WARNING]
> 如果应用是在游戏中途才打开的，技能 CD、属性、因子可能显示不全——游戏只推送变化的数据。**切换一次场景**即可获得完整同步。
