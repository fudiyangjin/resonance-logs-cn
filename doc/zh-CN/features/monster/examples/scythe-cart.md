# 显示镰车剩余时间

对应页面：[实体持续](../entity-duration.md)

**场景**：你需要在镰车到期前续放，希望浮窗显示自己镰车的剩余时间，并在剩 5 秒时提醒。

## 第 1 步：添加预设

1. 打开 **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.entityDuration}}**。
2. 在 **{{ui:monsterMonitor.entityDuration.presetsTitle}}** 中点击 **镰车**（ID 179903，35 秒，仅自己，合并同 ID）。镰车一次释放会生成 2 个实体，预设已默认勾选 **{{ui:monsterMonitor.entityDuration.merge}}**，浮窗只显示一行。

## 第 2 步：配置提醒

在语音播报中为镰车勾选 **剩 x 秒**，秒数填 5，文案写「镰车快到了」。

## 第 3 步：确认显示

1. **{{ui:monsterMonitor.tabs.overlay}}** 中确认 **实体监控区** 为显示。
2. **{{ui:monsterMonitor.actions.editLayout}}** 调整位置。
3. 放一次镰车，实体监控区出现「镰车」与倒计时。

## 看队友的镰车

如果还想看队友的镰车，手动添加同一个 ID 不行（每个 ID 只保留一条），把现有条目的 **{{ui:monsterMonitor.entityDuration.scope}}** 改为 **{{ui:monsterMonitor.entityDuration.scope.any}}**，每一行会显示为「镰车-释放者」。改了范围后语音需要重新配置。

## 其他实体

对于没有预设的召唤物或地面装置，在 **{{ui:monsterMonitor.entityDuration.manualTitle}}** 中填写实体 ID 与持续时间即可。不知道持续多久时留空，显示为 `∞`，直到实体消失。
