# 实体持续

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.entityDuration}}** 为召唤物、地面装置等**场上实体**计时：实体出现时开始倒计时，消失时移除，显示在怪物遮罩的 **实体监控区**。

典型用途：镰车等持续型召唤、需要续放的地面区域。

> [!NOTE]
> 本功能取代了实时监控中原来的「持续时间技能」，旧方案里勾选的镰车会自动迁移为一条「仅自己」的条目。

## 工作原理

这类技能会在场上生成一个独立实体，带有**实体 ID**（怪物模板 ID）和**释放者**。应用监测实体的出现与消失：

- 重放技能导致旧实体消失、新实体生成时，旧行移除、新行重新计时；
- 切图时实体消失，条目一并移除。

## 预设

**{{ui:monsterMonitor.entityDuration.presetsTitle}}** 中目前内置 **镰车**（ID 179903，35 秒，仅自己），点击即可添加。

## 手动添加

| 字段 | 说明 |
| --- | --- |
| **{{ui:monsterMonitor.entityDuration.monsterId}}** | 正整数的实体 ID |
| **{{ui:monsterMonitor.entityDuration.label}}** | 面板上显示的名字，留空则用游戏内名称 |
| **{{ui:monsterMonitor.entityDuration.durationSeconds}}** | 倒计时长度；留空则显示 `∞`，直到实体消失 |
| **{{ui:monsterMonitor.entityDuration.scope}}** | **{{ui:monsterMonitor.entityDuration.scope.self}}**：只显示你放的；**{{ui:monsterMonitor.entityDuration.scope.any}}**：显示所有人的，名称变为「名称-释放者」 |

每个实体 ID 只保留一条，最多 32 条。在 **{{ui:monsterMonitor.entityDuration.listTitle}}** 中可以修改、排序或删除。

## 语音播报

可以配置 **出现时 / 剩 x 秒 / 消失时** 三种事件：

- 「剩 x 秒」需要该条目设置了持续时间；
- 实体提前消失时只播报「消失」；
- 修改持续时间后，场上已有的实体按新时长重新计时；
- 语音绑定按「实体 ID + 释放者范围」记录，改了范围需要重新配置。

## 例

### 例：显示镰车剩余时间

**场景**：你需要在镰车到期前续放，希望浮窗显示自己镰车的剩余时间，并在剩 5 秒时提醒。

#### 第 1 步：添加预设

1. 打开 **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.entityDuration}}**。
2. 在 **{{ui:monsterMonitor.entityDuration.presetsTitle}}** 中点击 **镰车**（ID 179903，35 秒，仅自己）。

#### 第 2 步：配置提醒

在语音播报中为镰车勾选 **剩 x 秒**，秒数填 5，文案写「镰车快到了」。

#### 第 3 步：确认显示

1. **{{ui:monsterMonitor.tabs.overlay}}** 中确认 **实体监控区** 为显示。
2. **{{ui:monsterMonitor.actions.editLayout}}** 调整位置。
3. 放一次镰车，实体监控区出现「镰车」与倒计时。

#### 看队友的镰车

如果还想看队友的镰车，手动添加同一个 ID 不行（每个 ID 只保留一条），把现有条目的 **{{ui:monsterMonitor.entityDuration.scope}}** 改为 **{{ui:monsterMonitor.entityDuration.scope.any}}**，每一行会显示为「镰车-释放者」。改了范围后语音需要重新配置。

#### 其他实体

对于没有预设的召唤物或地面装置，在 **{{ui:monsterMonitor.entityDuration.manualTitle}}** 中填写实体 ID 与持续时间即可。不知道持续多久时留空，显示为 `∞`，直到实体消失。
