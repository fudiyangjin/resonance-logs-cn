# 启用窗口与布局

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.overlay}}** 决定实时监控浮窗中显示哪些区域。每个开关都**按方案保存**，不同职业方案可以显示不同的区域。

## 浮窗区域

| 区域 | 内容来源 |
| --- | --- |
| **技能CD区** | [技能 CD](./skill-cd.md) |
| **资源监控区** | 当前职业的能量、层数等资源 |
| **角色属性区** | [角色面板](./panel-attr.md) |
| **自定义监控区** | [自定义监控](./custom-panel.md)，每个监控区是一个独立区域 |
| **血量护盾区** | [血量护盾区](./shield.md) |
| **Buff覆盖率区** | [Buff 覆盖率](./buff-coverage.md) |

Buff 图标（独立模式下每个 Buff、分组模式下每个分组）会作为独立区域出现在浮窗中，是否显示由 [Buff 监控](./buff.md) 中的选择决定。

### 资源分区

**{{ui:skillMonitor.overlay.resourceSections}}** 把当前职业的资源拆成几个小块，每一块都可以**单独显示 / 隐藏、单独拖动**。例如森语者愈合专精的「愈合三花」倒计时就是一个独立分区。

![资源区中的愈合三花倒计时](../../../shared/img/changelog/v0.2.4_1.gif)

### 文字样式

**{{ui:skillMonitor.overlay.sharedTextStyle}}** 统一调整技能、资源和 Buff 图标上的文字大小与颜色。

## 编辑布局

1. 点击页面顶部 **{{ui:skillMonitor.layout.editOverlayLayout}}**，浮窗中每个区域出现边框。
2. 拖动区域移动位置，拖动边角缩放。
3. 完成后退出编辑，浮窗恢复点击穿透。

> [!TIP]
> 布局满意后，可以用游戏自带的隐藏界面功能收起游戏 UI，只保留浮窗，把技能 CD 和资源放在角色附近的视线余光处。可以绑定快捷键 **一键最小化 / 弹出 DPS 与遮罩窗口**，在需要截图或过场时一键收起所有浮窗，见 [例：一键隐藏所有浮窗](../app/examples/combat-shortcuts.md)。

![最佳实践](../../../shared/img/monitor/buff_4.png)
