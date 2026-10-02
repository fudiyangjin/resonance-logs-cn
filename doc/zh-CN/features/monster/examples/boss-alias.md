# 给 Boss 技能起别名并语音预警

对应页面：[Boss DBM](../boss-dbm.md)

**场景**：某个 Boss 的大招名字很长，队伍里都叫它「分摊」。你希望 Boss 读条时浮窗显示「分摊」，并且语音喊出来。

## 第 1 步：开启 Boss DBM 区

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.overlay}}**，打开 **Boss DBM 区**。
2. **{{ui:monsterMonitor.actions.editLayout}}**，把预警区拖到屏幕中上方。

## 第 2 步：设置技能别名

1. 打开 **{{ui:monsterMonitor.tabs.bossDbm}}**，在 **{{ui:monsterMonitor.bossDbm.alias.title}}** 中搜索这个技能。
2. 显示名称填「分摊」。

如果搜不到，先打一次这个 Boss：浮窗中显示为 `#数字` 的条目，数字就是技能效果 ID，可以用它搜索。

## 第 3 步：配置语音

1. 在 **{{ui:monsterMonitor.bossDbm.voice.title}}** 中添加这个技能，事件选 **触发时**。
2. 文案选自定义，输入「分摊，靠近」。
3. 到 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** 点击 **{{ui:voice.bindings.generateMissing}}**。
4. 大招提醒比较重要，把这条播报的优先级设为 **高**，以免被普通播报挡住，见 [播放与优先级](../../voice/playback.md#优先级与队列)。

## 效果

Boss 开始读条时，预警区出现「分摊」和倒计时，同时听到语音提醒。

> [!TIP]
> 如果这个副本在 [副本机制](../../minimap/dungeons.md) 的支持列表中，还可以同时开启机制小地图，Boss DBM 负责「什么时候」，小地图负责「站哪里」。
