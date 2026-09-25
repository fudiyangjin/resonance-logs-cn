# 常见问题 · 怪物监控

相关说明：[怪物监控](../features/monster/README.md) · [目标 Buff](../features/monster/buff.md) · [Boss DBM](../features/monster/boss-dbm.md) · [实体持续](../features/monster/entity-duration.md) · [启用窗口](../features/monster/overlay.md)

### 怪物监控和实时监控有什么区别？

- **实时监控**：看**你自己**的技能 CD、Buff、属性。
- **怪物监控**：看**你当前攻击目标**身上的 Buff、仇恨、韧性、Boss 技能预警等。

两边配置互不影响，使用不同的浮窗。

### 浮窗显示的是哪只怪？

你的**当前攻击目标**，切换目标后自动跟随，不需要指定怪物 ID。旧版的 `ExtraBuffMonitoredMonsters.json` 已经废弃，修改它不会生效。

### 木桩或小怪上看不到 Buff？

1. 木桩不是当前攻击目标：先对它造成伤害。
2. 怪物监控或浮窗没打开：确认 **{{ui:monsterMonitor.enabled}}** 已开启，并点了 **{{ui:monsterMonitor.actions.toggleOverlay}}**。
3. 没有添加要看的 Buff：在 **{{ui:monsterMonitor.tabs.buff}}** 中加入，或先开启「监控全部」查找名称。
4. 目标已经死亡：数据停止更新，换一个目标。

### 看不到 Boss DBM 预警？

1. **Boss DBM 区** 默认关闭，在 **{{ui:monsterMonitor.tabs.overlay}}** 中打开。
2. 确认怪物监控和浮窗都已打开。
3. 不是所有 Boss 技能都有预警事件，没有事件时该区域不显示（编辑布局模式下能看到占位）。

### Boss DBM 和 Buff 监控有什么区别？

Boss DBM 自动显示 Boss 读条和阶段技能，不需要添加监控项；Buff 监控需要先加入列表，用于盯特定 Buff 的时间和层数。见 [Boss DBM](../features/monster/boss-dbm.md)。

### 召唤物的剩余时间怎么看？

用 [实体持续](../features/monster/entity-duration.md)，常见召唤物有预设，例如 [镰车](../features/monster/entity-duration.md#例显示镰车剩余时间)。
