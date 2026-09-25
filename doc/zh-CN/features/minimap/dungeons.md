# 已支持副本

下表列出当前能显示机制的副本。同一副本的普通、困难、大师等难度共用同一套解析，只是场景 ID 不同。机制名称以浮窗中实际显示的为准。

| 副本 | 场景 ID | 主要机制 |
| --- | --- | --- |
| [诅咒煌墓](#诅咒煌墓) | 6513 / 6514 / 6515 | 蓝塔、能量柱点名、半场冲锋、冲锋分身、拼图点名 |
| [环海石礁](#环海石礁) | 6563 / 6564 / 6565 | 道中矩阵符文、双响颜色、冰 / 海浪安全区、披萨危险区 |
| [遗忘幻梦之野](#遗忘幻梦之野) | 13021 / 13022 / 13023 | 相位地块、分摊 / 衰减 / 分散、因果折跃、累刎宣告、电磁环、弹球 |
| [蚀·巨塔遗迹](#蚀巨塔遗迹) | 1150 / 1151 / 1152 | 正确传送门、引力雷爆、粘着弹 |
| [蚀·蒂娜精神之界](#蚀蒂娜精神之界) | 1631 / 1632 / 1633 | 披萨危险扇区、重伤、红光束缚、无敌斩标记 |
| [大师·荒芜之庭](#大师荒芜之庭) | 6615 | 虚痕对对碰、转换球、三种轮盘、赫鲁加之影、连环近远圈 |

## 诅咒煌墓

- **{{ui:minimap.s3CursedTomb.tower.group}}**：显示蓝塔激活进度，以及激活完成、待转金塔、金塔完成等状态。
- **{{ui:minimap.s3CursedTomb.energy.group}}**：标出被点名的队友和能量柱位置。
- **{{ui:minimap.s3CursedTomb.chargeTarget.group}}** / **{{ui:minimap.s3CursedTomb.clone.group}}**：提示冲锋方向（左侧、右侧、随机），以及分身在左手、右手还是正前方。
- **{{ui:minimap.s3CursedTomb.puzzle.group}}**：拼图 1 / 拼图 2 的点名对象。

![诅咒煌墓](../../../shared/img/minimap/s3_minimap_1.png)

## 环海石礁

**道中**：{{ui:minimap.s3SeaRingedReef.matrix.group}}（符文 A～D）和 {{ui:minimap.s3SeaRingedReef.matrix.calloutGroup}}，同时显示队友站位。

![环海石礁道中矩阵](../../../shared/img/minimap/s3_minimap_2.png)

**Boss**：

- **{{ui:minimap.s3SeaRingedReef.boss.dualGroup}}**：冰或水。
- **{{ui:minimap.s3SeaRingedReef.boss.waveGroup}}**：冰浪、海浪、单浪安全区，以及十字交点、横线和竖线。
- **{{ui:minimap.s3SeaRingedReef.boss.pizzaGroup}}**：橙色、紫色扇区。

![环海石礁 Boss](../../../shared/img/minimap/s3_minimap_3.png)

## 遗忘幻梦之野

- **{{ui:minimap.s3Raid.phase.group}}**：四角爆炸、边中爆炸，以及对应的地块（左上～右下）。
- **{{ui:minimap.s3Raid.shareGroup}}**：包括幻想版本，队友按点名类型染色。
- **{{ui:minimap.s3Raid.causalJump.group}}**、**{{ui:minimap.s3Raid.killMark.group}}**、**{{ui:minimap.s3Raid.presetReturn.group}}**。
- **{{ui:minimap.s3Raid.electromagneticPulse.group}}**（A / B / C）和 **{{ui:minimap.s3Raid.electromagneticRing.group}}**（内环、中环、外环）。
- **{{ui:minimap.s3Raid.normalDecay.group}}**、**{{ui:minimap.s3Raid.hitOrder.group}}**、**{{ui:minimap.s3Raid.pinball.group}}**。

## 蚀·巨塔遗迹

- **{{ui:minimap.s3GiantTower.portal.group}}**：标出本轮 **{{ui:minimap.s3GiantTower.portal.correct}}** 的颜色。
- **{{ui:minimap.s3GiantTower.gravity.group}}** / **{{ui:minimap.s3GiantTower.sticky.group}}**：显示爆炸倒计时。

## 蚀·蒂娜精神之界

- **{{ui:minimap.s3TinaMindrealm.pizzaGroup}}**：慢波、快波扇区。
- **{{ui:minimap.s3TinaMindrealm.buffGroup}}**：重伤、红光束缚、无敌斩标记（显示为第几刀）。

## 大师·荒芜之庭

- **{{ui:minimap.s4WastelandCourt.pair.group}}**：3 格颜色、锁定状态，以及需要交换的格子；配合 **{{ui:minimap.s4WastelandCourt.orb.group}}** 使用。
- **{{ui:minimap.s4WastelandCourt.wheel.group}}**：{{ui:minimap.s4WastelandCourt.wheel.blue}}、{{ui:minimap.s4WastelandCourt.wheel.red}}、{{ui:minimap.s4WastelandCourt.wheel.doom}}。
- **{{ui:minimap.s4WastelandCourt.shadow.group}}**：{{ui:minimap.s4WastelandCourt.shadow.energyTarget}}。
- **{{ui:minimap.s4WastelandCourt.chain.group}}**：近圈、远圈的数量与爆炸顺序。

![荒芜之庭：虚痕对对碰](../../../shared/img/changelog/v0.2.3_4.png)

![荒芜之庭：能量球追踪](../../../shared/img/changelog/v0.2.3_5.png)

> [!NOTE]
> 不在列表中的副本暂时不会显示小地图。想要支持新副本，欢迎在 [GitHub Issues](https://github.com/fudiyangjin/resonance-logs-cn/issues) 中反馈。
