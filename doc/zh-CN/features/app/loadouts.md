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

之后在游戏中切换专精时，应用会自动切到关联的方案。**{{ui:loadout.autoSwitch.detected}}** 显示应用识别到的当前专精；显示为 **{{ui:loadout.autoSwitch.unknown}}** 时，切一次场景即可。完整步骤见 [例：切专精时自动换方案](#例切专精时自动换方案)。

## 导入与导出

- **{{ui:loadout.page.exportButton}}**：每套方案右侧的下载图标，把整套总方案（含三个子方案和语音绑定）保存为一个 JSON 文件。
- **{{ui:loadout.page.importButton}}**：选择别人分享的 JSON 文件，导入为一套新的总方案，不会覆盖你已有的方案。

> [!NOTE]
> 导出的是配置，不包括生成好的语音音频和导入的音效文件。对方导入后在 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** 中点 **{{ui:voice.bindings.generateMissing}}** 即可重新生成。

分享流程见 [例：把方案分享给队友](#例把方案分享给队友)。

## 例

### 例：切专精时自动换方案

**场景**：你的角色平时打愈合，偶尔切到惩击。你希望在游戏里切换专精后，技能 CD、Buff 和 DPS 窗口设置自动换成对应的那套，不用每次回主窗口手动切换。

#### 第 1 步：准备两套方案

1. 打开 **{{ui:routes.tools.loadouts}}**。
2. 在 **{{ui:loadout.page.presetsTitle}}** 中点「愈合」和「惩击」，各创建一套方案。已有自己方案的，直接用自己的。

#### 第 2 步：关联专精

在每套方案的 **{{ui:loadout.page.linkedSpecLabel}}** 下拉框中选择对应专精：

| 方案 | {{ui:loadout.page.linkedSpecLabel}} |
| --- | --- |
| 愈合 | 愈合 |
| 惩击 | 惩击 |
| 其他不想自动切换的方案 | {{ui:loadout.page.linkedSpecNone}} |

#### 第 3 步：开启自动切换

打开页面上方的 **{{ui:loadout.autoSwitch.toggle}}**，旁边的 **{{ui:loadout.autoSwitch.detected}}** 会显示游戏中当前的专精。

#### 第 4 步：验证

在游戏中切到惩击。应用提示「已自动切换到『惩击』」，左侧栏的 **{{ui:loadout.sidebar.label}}** 也变了，浮窗内容随之更新。

> [!TIP]
> 两套方案共用同一套怪物监控时，在两套方案中选择同一个 **{{ui:loadout.page.monsterProfileLabel}}**，以后只需要维护一份。

**{{ui:loadout.autoSwitch.detected}}** 显示 **{{ui:loadout.autoSwitch.unknown}}**，说明应用还没收到专精信息，切一次场景即可。

### 例：把方案分享给队友

**场景**：你花了一晚上配好了愈合的技能 CD、因子区和 Boss 播报，队里另一位愈合也想用。

#### 你这边：导出

1. 打开 **{{ui:routes.tools.loadouts}}**。
2. 在要分享的方案右侧点下载图标（**{{ui:loadout.page.exportButton}}**），选择保存位置，得到一个 `.json` 文件。
3. 把文件通过聊天软件发给队友。

如果播报用了你自己 [导入的音效](../voice/voices.md#方式四导入现成音频)，把音效原文件一并发过去。

#### 队友那边：导入

1. 打开 **{{ui:routes.tools.loadouts}}**，点击 **{{ui:loadout.page.importButton}}**，选择收到的文件。
2. 列表中多出一套同名方案，点 **{{ui:loadout.page.activate}}**。导入不会覆盖原有方案，也不会自动切换。
3. 如果有音效文件，在 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}** 中用 **{{ui:voice.phrases.import.newButton}}** 导入同一个文件，绑定会自动对上。
4. 到 **{{ui:voice.tabs.bindings}}** 中点 **{{ui:voice.bindings.generateMissing}}**，用自己电脑生成语音。
5. 进游戏，在 [实时监控](../monitor/README.md) 和 [怪物监控](../monster/README.md) 中各点一次 **编辑布局**，按自己的分辨率调整浮窗位置。

> [!NOTE]
> 方案中的关联专精会一起导入。如果队友开启了 **{{ui:loadout.autoSwitch.toggle}}**，切到对应专精时就会自动使用这套方案。
