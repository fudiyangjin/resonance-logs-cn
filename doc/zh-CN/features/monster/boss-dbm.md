# Boss DBM

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.bossDbm}}** 在 Boss 释放机制技能时，自动在怪物遮罩中弹出**预警条**（技能名 + 倒计时 + 进度条），体验类似 DBM 插件。

## 开启

1. 确认 **{{ui:monsterMonitor.enabled}}** 已开启。
2. 在 **{{ui:monsterMonitor.tabs.overlay}}** 中打开 **Boss DBM 区**（默认关闭）。
3. 点击 **{{ui:monsterMonitor.actions.editLayout}}**，把预警区拖到屏幕中上方显眼的位置。编辑模式下会显示占位条，便于在没有战斗时摆位。

**不需要**手动添加要监控的技能：Boss 释放带 DBM 标记的机制时自动出现，结束后自动消失，多条同时进行时按时间排序。

## 技能别名

默认技能名来自游戏数据，未收录的条目会显示为 `#技能效果ID`。在 **{{ui:monsterMonitor.bossDbm.alias.title}}** 中搜索 Boss 技能，填写你队伍习惯的叫法，例如把某个读条改成「分摊」「躲圈」。

## 语音播报

在 **{{ui:monsterMonitor.bossDbm.voice.title}}** 中为技能配置 **触发时** 播报，Boss 开始读条就能听到提醒。

在别名列表中删除一个条目时，它的语音播报会一起删除。清空别名后离开输入框会恢复默认名称，条目和播报都会保留。

## 样式

Boss DBM 区有独立样式：行间距、列间距、字号、名称 / 数值颜色、进度条颜色与透明度。

## Boss DBM 与其他功能

| 功能 | 显示什么 |
| --- | --- |
| **Boss DBM** | Boss 技能的统一倒计时条，任意有 DBM 事件的战斗 |
| [目标 Buff](./buff.md) | 目标身上某个 Buff 的持续时间与层数 |
| [副本机制](../minimap/README.md) | 已适配副本的站位地图与点名报幕 |

三者可以同时开启。

## 例

- [给 Boss 技能起别名并语音预警](./examples/boss-alias.md)