# 切专精时自动换方案

对应页面：[监控方案](../loadouts.md)

**场景**：你的角色平时打愈合，偶尔切到惩击。你希望在游戏里切换专精后，技能 CD、Buff 和 DPS 窗口设置自动换成对应的那套，不用每次回主窗口手动切换。

## 第 1 步：准备两套方案

1. 打开 **{{ui:routes.tools.loadouts}}**。
2. 在 **{{ui:loadout.page.presetsTitle}}** 中点「愈合」和「惩击」，各创建一套方案。已有自己方案的，直接用自己的。

## 第 2 步：关联专精

在每套方案的 **{{ui:loadout.page.linkedSpecLabel}}** 下拉框中选择对应专精：

| 方案 | {{ui:loadout.page.linkedSpecLabel}} |
| --- | --- |
| 愈合 | 愈合 |
| 惩击 | 惩击 |
| 其他不想自动切换的方案 | {{ui:loadout.page.linkedSpecNone}} |

## 第 3 步：开启自动切换

打开页面上方的 **{{ui:loadout.autoSwitch.toggle}}**，旁边的 **{{ui:loadout.autoSwitch.detected}}** 会显示游戏中当前的专精。

## 第 4 步：验证

在游戏中切到惩击。应用提示「已自动切换到『惩击』」，左侧栏的 **{{ui:loadout.sidebar.label}}** 也变了，浮窗内容随之更新。

> [!TIP]
> 两套方案共用同一套怪物监控时，在两套方案中选择同一个 **{{ui:loadout.page.monsterProfileLabel}}**，以后只需要维护一份。

**{{ui:loadout.autoSwitch.detected}}** 显示 **{{ui:loadout.autoSwitch.unknown}}**，说明应用还没收到专精信息，切一次场景即可。
