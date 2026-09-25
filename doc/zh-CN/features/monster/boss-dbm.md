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

### 例：给 Boss 技能起别名并语音预警

**场景**：某个 Boss 的大招名字很长，队伍里都叫它「分摊」。你希望 Boss 读条时浮窗显示「分摊」，并且语音喊出来。

#### 第 1 步：开启 Boss DBM 区

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.overlay}}**，打开 **Boss DBM 区**。
2. **{{ui:monsterMonitor.actions.editLayout}}**，把预警区拖到屏幕中上方。

#### 第 2 步：设置技能别名

1. 打开 **{{ui:monsterMonitor.tabs.bossDbm}}**，在 **{{ui:monsterMonitor.bossDbm.alias.title}}** 中搜索这个技能。
2. 显示名称填「分摊」。

如果搜不到，先打一次这个 Boss：浮窗中显示为 `#数字` 的条目，数字就是技能效果 ID，可以用它搜索。

#### 第 3 步：配置语音

1. 在 **{{ui:monsterMonitor.bossDbm.voice.title}}** 中添加这个技能，事件选 **触发时**。
2. 文案选自定义，输入「分摊，靠近」。
3. 到 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** 点击 **{{ui:voice.bindings.generateMissing}}**。
4. 大招提醒比较重要，把这条播报的优先级设为 **高**，以免被普通播报挡住，见 [播放与优先级](../voice/playback.md#优先级与队列)。

#### 效果

Boss 开始读条时，预警区出现「分摊」和倒计时，同时听到语音提醒。

> [!TIP]
> 如果这个副本在 [副本机制](../minimap/dungeons.md) 的支持列表中，还可以同时开启机制小地图，Boss DBM 负责「什么时候」，小地图负责「站哪里」。
