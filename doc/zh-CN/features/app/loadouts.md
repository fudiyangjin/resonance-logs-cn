# 监控方案

一套 **总方案** 把你为某个职业准备的所有配置打包在一起：技能 CD、Buff、自定义面板、怪物监控、DPS 窗口设置，以及它们的语音绑定。换职业时切换一次总方案，所有浮窗随之切换。

## 总方案由什么组成

| 子方案 | 包含内容 |
| --- | --- |
| **{{ui:loadout.page.skillProfileLabel}}** | [实时监控](../monitor/README.md) 的技能 CD、Buff、自定义面板、属性面板及其语音 |
| **{{ui:loadout.page.monsterProfileLabel}}** | [怪物监控](../monster/README.md) 的 Buff、Boss DBM、实体计时及其语音 |
| **{{ui:loadout.page.liveProfileLabel}}** | [DPS 窗口](../dps/settings.md) 的列、名称显示、刷新频率等 |

子方案可以在不同总方案之间共用。例如两个输出职业用不同的技能监控，但共用同一套怪物监控：在两个总方案中选择同一个 **{{ui:loadout.page.monsterProfileLabel}}** 即可，修改一处，两边同时生效。

[应用设置](./README.md) 中的外观、快捷键、抓包等不属于方案，不会随方案切换。

## 管理方案

打开 **{{ui:routes.tools.loadouts}}**，或点击左侧栏 **{{ui:loadout.sidebar.label}}** 旁的 **{{ui:loadout.sidebar.manage}}**：

- **{{ui:loadout.page.new}}**：新建一套空白方案。
- **{{ui:loadout.page.activate}}**：切换到这一套。也可以直接在左侧栏的 **{{ui:loadout.sidebar.label}}** 中切换。
- **{{ui:loadout.page.rename}}** / **{{ui:loadout.page.duplicate}}** / **{{ui:loadout.page.delete}}**：至少保留一套方案。
- 修改三个子方案下拉框，决定这套总方案使用哪些子方案。

## 预置方案

**{{ui:loadout.page.presetsTitle}}** 提供了部分专精配好的方案（如光盾、防盾、格挡、岩盾、惩击、愈合、重装、协奏）。点击后会创建一套新的总方案，你可以在此基础上修改，不会影响其他方案。首次启动时弹出的 **{{ui:loadout.firstRun.title}}** 就是这里的预置方案。

## 按专精自动切换

1. 为每套方案设置 **{{ui:loadout.page.linkedSpecLabel}}**，例如把「愈合」方案关联到愈合专精。
2. 打开 **{{ui:loadout.autoSwitch.toggle}}**。

之后在游戏中切换专精时，应用会自动切到关联的方案。**{{ui:loadout.autoSwitch.detected}}** 显示应用识别到的当前专精；显示为 **{{ui:loadout.autoSwitch.unknown}}** 时，切一次场景即可。完整步骤见 [例：切专精时自动换方案](./examples/spec-loadout.md)。

## 导入与导出

- **{{ui:loadout.page.exportButton}}**：每套方案右侧的下载图标，把整套总方案（含三个子方案和语音绑定）保存为一个 JSON 文件。
- **{{ui:loadout.page.importButton}}**：选择别人分享的 JSON 文件，导入为一套新的总方案，不会覆盖你已有的方案。

> [!NOTE]
> 导出的是配置，不包括生成好的语音音频和导入的音效文件。对方导入后在 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** 中点 **{{ui:voice.bindings.generateMissing}}** 即可重新生成。

分享流程见 [例：把方案分享给队友](./examples/share-loadout.md)。

## 例

- [切专精时自动换方案](./examples/spec-loadout.md)
- [把方案分享给队友](./examples/share-loadout.md)