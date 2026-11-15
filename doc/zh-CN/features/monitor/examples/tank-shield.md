# 坦克看还能扛多少

对应页面：[血量护盾区](../shield.md)

**场景**：你是坦克，Boss 大招前想确认自己的血量加护盾还能扛住；护盾来自好几个来源，想知道每一层还剩多少。

## 第 1 步：选择显示项

打开 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.shieldDetail}}**，打开：

- **{{ui:skillMonitor.shieldDetail.showHpBar}}**：当前生命值；
- **{{ui:skillMonitor.shieldDetail.showTotalShieldBar}}**：所有护盾的合计；
- **{{ui:skillMonitor.shieldDetail.showShieldEntries}}**：每个护盾来源单独一行。

## 第 2 步：调整颜色和宽度

把 **{{ui:skillMonitor.shieldDetail.hpColor}}**、**{{ui:skillMonitor.shieldDetail.shieldColor}}**、**{{ui:skillMonitor.shieldDetail.healShieldColor}}** 设成容易区分的三种颜色，条宽调到和技能 CD 区差不多宽。

## 第 3 步：打开血量护盾区

1. 在 **{{ui:skillMonitor.tabs.overlay}}** 中打开 **血量护盾区**（默认关闭）。
2. 点击页面顶部 **{{ui:skillMonitor.layout.editOverlayLayout}}**，把它拖到屏幕中下方、角色附近。

## 效果

战斗中，生命条下面是总盾和每一层护盾的剩余量，大招前看一眼就知道要不要先开减伤。

> [!TIP]
> 神盾骑士「光铸身躯」期间的竖向盾条在资源分区里，可以和这里一起看，见 [用资源分区盯职业资源](./resource-bar.md)。
