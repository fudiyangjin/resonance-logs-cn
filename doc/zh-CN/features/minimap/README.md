# 副本机制

在已适配的副本中，**{{ui:routes.tools.minimap}}** 会在游戏上方显示一张俯视小地图和一份机制报幕：谁被点名、该站哪里、下一个机制还有几秒，一眼就能看清。

![诅咒煌墓的机制小地图](../../../shared/img/minimap/s3_minimap_1.png)

## 它能帮你做什么

- **看站位**：小地图上画出自己、队友、Boss 以及机制相关的点位和区域（安全区、危险扇区、连线）。
- **看点名**：被机制点名的队友会被染成对应颜色，机制报幕同时列出点名对象和倒计时。
- **听提醒**：为机制预警绑定语音，不用盯屏幕也知道轮到自己了。

进入已支持的副本时，应用会根据场景自动加载对应的机制解析；在其他场景中浮窗不显示机制内容。支持的副本和各自显示的机制见 [已支持副本](./dungeons.md)。

## 开启浮窗

1. 打开 **{{ui:routes.tools.minimap}} → {{ui:minimap.tabs.minimap}}**。
2. 打开 **{{ui:minimap.settings.enabled.label}}**，或者点击页面顶部的 **{{ui:minimap.actions.toggleOverlay}}**，两者是同一个开关。
3. 点击 **{{ui:minimap.actions.editLayout}}**，拖动、缩放两个面板，完成后点 **{{ui:minimap.edit.done}}**。

浮窗由两个面板组成，可在 **{{ui:minimap.overlay.title}}** 中分别开关：

| 面板 | 内容 |
| --- | --- |
| **{{ui:minimap.panels.map}}** | 俯视小地图：玩家、Boss、标点和机制区域 |
| **{{ui:minimap.panels.info}}** | 文字列表：进行中的机制名称、点名对象与剩余时间 |

## 显示选项

| 选项 | 效果 |
| --- | --- |
| **{{ui:minimap.settings.autoHideInDailyScenes.label}}** | 回到主城等日常场景时自动隐藏，离开后恢复 |
| **{{ui:minimap.settings.hideNormalTeammates.label}}** | 平时只显示自己；队友一旦被机制点名或染色就自动出现，画面最干净 |
| **{{ui:minimap.settings.hideAllTeammates.label}}** | 队友一律不显示，即使被点名也不显示，只保留自己。优先级高于上一项 |
| **{{ui:minimap.settings.showBoss.label}}** | 在地图上标出 Boss 位置，默认关闭 |
| **{{ui:minimap.settings.showMarkers.label}}** | 显示队伍标点 1～6 号（彩色数字），默认关闭 |

> [!TIP]
> 第一次打某个副本，建议先把队友都显示出来，熟悉机制后再开 **{{ui:minimap.settings.hideNormalTeammates.label}}**，只看和自己相关的点。

## 让自己更好找

被机制点名时自己的圆点会变色，混在一群队友里容易看丢。可以组合使用：

- **{{ui:minimap.settings.localRing.title}}**：打开 **{{ui:minimap.settings.localRing.enabled.label}}**，在自己的圆点外加一圈描边，颜色和线宽可调。
- **{{ui:minimap.settings.localFacing.label}}**：在自己的标记上画一个指向当前朝向的小箭头，方便判断面向。
- **{{ui:minimap.settings.sizes.title}}**：把 **{{ui:minimap.settings.sizes.local}}** 调得比队友大一点。

## 颜色与阵亡样式

- **{{ui:minimap.settings.colors.title}}**：设置没有机制染色时 **{{ui:minimap.settings.colors.local}}**、**{{ui:minimap.settings.colors.teammate}}**、**{{ui:minimap.settings.colors.boss}}** 以及 **{{ui:minimap.settings.colors.marker1}}**～6 的颜色。机制点名始终使用专用的高区分度颜色，不受这里影响。
- **{{ui:minimap.settings.deadStyle.title}}**：队友或自己阵亡后的显示方式，可以改用 × 标记，并设置颜色和透明度。阵亡样式会覆盖机制点名颜色。

## 机制语音播报

**{{ui:minimap.settings.voiceCues.title}}** 列出当前副本中可以播报的机制，展开后的配置方式与 Buff、Boss 机制的播报相同：选择事件、填写文案、生成语音。如果当前地图还没有接入可播报的机制，这里会显示为空。语音相关的通用设置见 [语音播报](../voice/README.md)。

## 和 Boss DBM 有什么不同

| | 副本机制 | [怪物监控 · Boss DBM](../monster/boss-dbm.md) |
| --- | --- | --- |
| 回答的问题 | 站在哪里、点了谁 | Boss 什么时候放什么技能 |
| 显示内容 | 小地图 + 机制报幕 | 技能名 + 倒计时 |
| 适用范围 | 仅已适配的副本 | 任意有 Boss 技能事件的战斗 |

两者可以同时开启，放在屏幕不同位置互补使用。

## 例

### 例：团本开荒前的小地图设置

**场景**：你们第一次打「遗忘幻梦之野」，机制多、点名频繁。你希望小地图只显示和自己相关的信息，被点名时能立刻找到自己，并且有语音提醒。

#### 第 1 步：开启并摆放浮窗

1. **{{ui:routes.tools.minimap}} → {{ui:minimap.tabs.minimap}}**，打开 **{{ui:minimap.settings.enabled.label}}**。
2. **{{ui:minimap.actions.editLayout}}**：把 **{{ui:minimap.panels.map}}** 放在屏幕一侧，不挡角色；**{{ui:minimap.panels.info}}** 放在它下方。完成后点 **{{ui:minimap.edit.done}}**。

#### 第 2 步：减少干扰

- 打开 **{{ui:minimap.settings.hideNormalTeammates.label}}**：没被点名的队友不显示。
- 打开 **{{ui:minimap.settings.autoHideInDailyScenes.label}}**：回城后自动隐藏。
- 如果团队用标点指挥，打开 **{{ui:minimap.settings.showMarkers.label}}**。

#### 第 3 步：让自己醒目

1. 打开 **{{ui:minimap.settings.localRing.enabled.label}}**，**{{ui:minimap.settings.localRing.color}}** 选一个和机制色区分明显的颜色（如白色），线宽调粗一些。
2. 打开 **{{ui:minimap.settings.localFacing.label}}**。
3. 在 **{{ui:minimap.settings.sizes.title}}** 中把 **{{ui:minimap.settings.sizes.local}}** 调大。

#### 第 4 步：点名时语音提醒

1. 进入副本（或者直接展开 **{{ui:minimap.settings.voiceCues.title}}**），找到 **{{ui:minimap.s3Raid.shareGroup}}**、**{{ui:minimap.s3Raid.killMark.group}}** 等需要提醒的机制。
2. 为每个机制填写简短文案，例如「分摊」「去角落」。
3. 到 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** 点击 **{{ui:voice.bindings.generateMissing}}**。

> [!TIP]
> 文案越短播报越快。同一时间可能有多个机制，建议把最致命的机制设为高优先级，见 [优先级与队列](../voice/playback.md#优先级与队列)。

#### 第 5 步：配合 Boss DBM

在 [怪物监控](../monster/README.md) 中开启 Boss DBM 区，放在屏幕中上方。小地图告诉你站哪里，Boss DBM 告诉你还剩几秒，参考 [例：给 Boss 技能起别名并语音预警](../monster/boss-dbm.md#例给-boss-技能起别名并语音预警)。
