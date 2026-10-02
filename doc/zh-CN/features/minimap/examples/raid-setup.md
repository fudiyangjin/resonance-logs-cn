# 团本开荒前的小地图设置

对应页面：[副本机制](../README.md)

**场景**：你们第一次打「遗忘幻梦之野」，机制多、点名频繁。你希望小地图只显示和自己相关的信息，被点名时能立刻找到自己，并且有语音提醒。

## 第 1 步：开启并摆放浮窗

1. **{{ui:routes.tools.minimap}} → {{ui:minimap.tabs.minimap}}**，打开 **{{ui:minimap.settings.enabled.label}}**。
2. **{{ui:minimap.actions.editLayout}}**：把 **{{ui:minimap.panels.map}}** 放在屏幕一侧，不挡角色；**{{ui:minimap.panels.info}}** 放在它下方。完成后点 **{{ui:minimap.edit.done}}**。

## 第 2 步：减少干扰

- 打开 **{{ui:minimap.settings.hideNormalTeammates.label}}**：没被点名的队友不显示。
- 打开 **{{ui:minimap.settings.autoHideInDailyScenes.label}}**：回城后自动隐藏。
- 如果团队用标点指挥，打开 **{{ui:minimap.settings.showMarkers.label}}**。

## 第 3 步：让自己醒目

1. 打开 **{{ui:minimap.settings.localRing.enabled.label}}**，**{{ui:minimap.settings.localRing.color}}** 选一个和机制色区分明显的颜色（如白色），线宽调粗一些。
2. 打开 **{{ui:minimap.settings.localFacing.label}}**。
3. 在 **{{ui:minimap.settings.sizes.title}}** 中把 **{{ui:minimap.settings.sizes.local}}** 调大。

## 第 4 步：点名时语音提醒

1. 进入副本（或者直接展开 **{{ui:minimap.settings.voiceCues.title}}**），找到 **{{ui:minimap.s3Raid.shareGroup}}**、**{{ui:minimap.s3Raid.killMark.group}}** 等需要提醒的机制。
2. 为每个机制填写简短文案，例如「分摊」「去角落」。
3. 到 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** 点击 **{{ui:voice.bindings.generateMissing}}**。

> [!TIP]
> 文案越短播报越快。同一时间可能有多个机制，建议把最致命的机制设为高优先级，见 [优先级与队列](../../voice/playback.md#优先级与队列)。

## 第 5 步：配合 Boss DBM

在 [怪物监控](../../monster/README.md) 中开启 Boss DBM 区，放在屏幕中上方。小地图告诉你站哪里，Boss DBM 告诉你还剩几秒，参考 [例：给 Boss 技能起别名并语音预警](../../monster/examples/boss-alias.md)。
