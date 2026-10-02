# 把方案分享给队友

对应页面：[监控方案](../loadouts.md)

**场景**：你花了一晚上配好了愈合的技能 CD、因子区和 Boss 播报，队里另一位愈合也想用。

## 你这边：导出

1. 打开 **{{ui:routes.tools.loadouts}}**。
2. 在要分享的方案右侧点下载图标（**{{ui:loadout.page.exportButton}}**），选择保存位置，得到一个 `.json` 文件。
3. 把文件通过聊天软件发给队友。

如果播报用了你自己 [导入的音效](../../voice/voices.md#方式四导入现成音频)，把音效原文件一并发过去。

## 队友那边：导入

1. 打开 **{{ui:routes.tools.loadouts}}**，点击 **{{ui:loadout.page.importButton}}**，选择收到的文件。
2. 列表中多出一套同名方案，点 **{{ui:loadout.page.activate}}**。导入不会覆盖原有方案，也不会自动切换。
3. 如果有音效文件，在 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}** 中用 **{{ui:voice.phrases.import.newButton}}** 导入同一个文件，绑定会自动对上。
4. 到 **{{ui:voice.tabs.bindings}}** 中点 **{{ui:voice.bindings.generateMissing}}**，用自己电脑生成语音。
5. 进游戏，在 [实时监控](../../monitor/README.md) 和 [怪物监控](../../monster/README.md) 中各点一次 **编辑布局**，按自己的分辨率调整浮窗位置。

> [!NOTE]
> 方案中的关联专精会一起导入。如果队友开启了 **{{ui:loadout.autoSwitch.toggle}}**，切到对应专精时就会自动使用这套方案。
