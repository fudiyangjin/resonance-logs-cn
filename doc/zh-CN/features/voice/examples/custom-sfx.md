# 用自己的音效提醒 Boss 大招

对应页面：[音色与短句](../voices.md)

**场景**：团队约定 Boss 放某个大招时听一声警报，而不是一句 TTS 语音。你手上有一段 2 秒的警报音效 `alarm.mp3`，想让它在大招读条时以最高优先级播放。

## 第 1 步：导入音效

1. 打开 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}**。
2. 在 **{{ui:voice.phrases.namePlaceholder}}** 中填写「大招警报」。
3. 点击 **{{ui:voice.phrases.import.newButton}}**，选择 `alarm.mp3`。
4. 列表中出现「大招警报」，状态为 **{{ui:voice.phrases.status.imported}}**，点 **{{ui:voice.phrases.tryPlay}}** 确认声音正常。

导入音频不需要安装语音模型。

## 第 2 步：在 Boss DBM 中引用

1. 打开 **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.bossDbm}}**。
2. 在 **{{ui:monsterMonitor.bossDbm.voice.title}}** 中添加这个技能，事件选 **{{ui:voice.binding.event.onCast}}**。
3. 文案来源选 **{{ui:voice.binding.source.phrase}}**，点 **{{ui:voice.binding.pickPhrase}}**，选「大招警报」。
4. **{{ui:voice.binding.priority}}** 选 **{{ui:voice.binding.priority.urgent}}**。

## 第 3 步：允许打断

在 **{{ui:voice.tabs.overview}} → {{ui:voice.overview.queuePolicy}}** 中开启 **{{ui:voice.overview.queue.interrupt}}**。这样即使正在播报别的内容，警报也会立即响起。

## 分享给队友

把方案 [导出](../../app/examples/share-loadout.md) 给队友时，播报绑定会一起带过去，但音频文件不会。让队友把同一个 `alarm.mp3` 也导入短句库：导入短句的 ID 由音频内容决定，同一个文件的 ID相同，绑定会自动对上。

> [!TIP]
> 音效时长最好控制在 1～3 秒。过长的音效会占住队列，拖慢后面的播报。
