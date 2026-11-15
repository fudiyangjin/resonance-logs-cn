# 爆发期确认属性是否吃满

对应页面：[角色面板](../panel-attr.md)

**场景**：你在爆发期会叠一堆增益，想直接看到{{ui:game.panelAttr.11710}}、{{ui:game.panelAttr.11930}}、{{ui:game.panelAttr.11780}}涨到了多少，确认 Buff 都吃上了；其他属性不需要。

## 第 1 步：只启用需要的属性

1. 打开 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.panelAttr}}**。
2. 在启用属性中只勾选{{ui:game.panelAttr.11710}}、{{ui:game.panelAttr.11930}}、{{ui:game.panelAttr.11780}}。

## 第 2 步：调整颜色和顺序

1. 在 **{{ui:skillMonitor.panelAttr.displayColor}}** 中给最关心的{{ui:game.panelAttr.11930}}换一个醒目的颜色。
2. 在 **{{ui:skillMonitor.panelAttr.rowOrder}}** 中把{{ui:game.panelAttr.11930}}移到第一行。
3. 在 **{{ui:skillMonitor.panelAttr.textStyle}}** 中调大字号，缩小行间距。

## 第 3 步：打开角色属性区

1. 在 **{{ui:skillMonitor.tabs.overlay}}** 中确认 **角色属性区** 已打开（默认打开）。
2. 点击页面顶部 **{{ui:skillMonitor.layout.editOverlayLayout}}**，把属性区拖到技能 CD 旁边。

## 效果

开爆发时，属性区里的数值实时上涨，Buff 没吃上一眼就能看出来。

> [!NOTE]
> 属性显示不全或数值明显滞后时，切换一次场景即可恢复完整同步。
