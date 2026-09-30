# 怪物监控

**{{ui:routes.tools.monsterMonitor}}** 用一个独立的**怪物遮罩**浮窗，显示你**当前攻击目标**的信息：身上的 Buff / Debuff、队友挂上的效果、仇恨、韧性、生命，以及 Boss 技能预警和场上实体的持续时间。

## 你可以用它做什么

- 盯住自己挂在 Boss 身上的易伤、增伤是否还在，快掉时高亮提醒；
- 看队友的 Debuff 是否都挂上了；
- 坦克查看仇恨排名，输出查看 Boss 韧性还差多少破防；
- Boss 读条时弹出 DBM 预警条并语音提醒；
- 为召唤物、地面装置（如镰车）显示剩余时间。

## 跟随当前目标

浮窗内容跟随你角色的**攻击目标**自动切换，不需要事先指定怪物：

- 攻击或选中另一只怪，浮窗就切到它；
- 目标死亡或丢失后，相关内容清空，直到有新的目标；
- 木桩和小怪同样适用，只要它是你当前的攻击目标。

## 顶部开关与子方案

| 开关 | 作用 |
| --- | --- |
| **{{ui:monsterMonitor.enabled}}** | 总开关 |
| **{{ui:monsterMonitor.autoHideInDailyScenes.label}}** | 在日常场景自动隐藏浮窗 |
| **{{ui:monsterMonitor.actions.toggleOverlay}}** | 显示 / 隐藏怪物遮罩 |
| **{{ui:monsterMonitor.actions.editLayout}}** | 拖动、缩放各区域；无实时数据时显示占位预览 |

怪物监控有自己的**配置子方案**（新建、重命名、删除），总方案会引用其中一个，见 [监控方案](../app/loadouts.md)。

## 页面结构

| 标签 | 文档 | 例 |
| --- | --- | --- |
| **{{ui:monsterMonitor.tabs.buff}}** | [目标 Buff](./buff.md) | [盯住自己挂的易伤，快掉时提醒](./buff.md#例盯住自己挂的易伤快掉时提醒) |
| **{{ui:monsterMonitor.tabs.teammate}}** | [队友 Buff](./teammate.md) | — |
| **{{ui:monsterMonitor.tabs.teammateCd}}** | [队友 CD](./teammate-cd.md) | — |
| **{{ui:monsterMonitor.tabs.hate}}** | [仇恨列表](./hate.md) | — |
| **{{ui:monsterMonitor.tabs.stun}}** / **{{ui:monsterMonitor.tabs.hp}}** / **{{ui:monsterMonitor.tabs.fantasy}}** | [韧性、生命与队友幻想](./status.md) | — |
| **{{ui:monsterMonitor.tabs.bossDbm}}** | [Boss DBM](./boss-dbm.md) | [给 Boss 技能起别名并语音预警](./boss-dbm.md#例给-boss-技能起别名并语音预警) |
| **{{ui:monsterMonitor.tabs.entityDuration}}** | [实体持续](./entity-duration.md) | [显示镰车剩余时间](./entity-duration.md#例显示镰车剩余时间) |
| **{{ui:monsterMonitor.tabs.overlay}}** | [启用窗口](./overlay.md) | — |

## 和实时监控有什么不同

| | 实时监控 | 怪物监控 |
| --- | --- | --- |
| 看谁 | 你自己 | 你当前的目标 |
| 典型内容 | 技能 CD、自身 Buff、因子、属性 | 目标 Debuff、仇恨、韧性、Boss 技能 |
| 浮窗 | 实时监控遮罩 | 怪物遮罩 |

两者配置互不影响，可以同时开启。
