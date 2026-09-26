# 语音播报

**{{ui:routes.tools.voice}}** 可以在关键时刻用语音提醒你：蒂娜 CD 好了、易伤快掉了、Boss 要放大招了、匹配成功待确认……不用一直盯着浮窗。

所有语音都在本地离线生成并保存。战斗中只是播放已经生成好的音频，不会运行模型，也不会影响游戏性能。

## 工作方式

使用语音播报分两步：

1. **决定什么时候播、播什么**：在 Buff、技能 CD、怪物监控等功能页中，为某个事件绑定一句播报。
2. **把文字变成声音**：选一种音色，把这些文案生成音频。可以用内置的预置音色，克隆某个角色的声音，也可以直接导入现成的音频，见 [音色与短句](./voices.md)。

## 快速开始

1. 打开 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.model}}**，点击 **{{ui:voice.model.install}}** 安装语音模型。下载源默认是 **{{ui:voice.model.downloadSourceAuto}}**，国内网络一般无需修改。
2. 在 **{{ui:voice.tabs.overview}}** 中打开 **{{ui:voice.overview.enabled}}**，调整音量。
3. 到功能页绑定一条播报（见下文）。
4. 回到 **{{ui:voice.tabs.bindings}}**，点击 **{{ui:voice.bindings.generateMissing}}**。默认使用与界面语言对应的预置音色，无需任何准备。
5. 点 **{{ui:voice.bindings.tryPlay}}** 试听，没问题就可以进游戏了。

> [!TIP]
> **{{ui:voice.backend.title}}** 保持 **{{ui:voice.backend.auto}}** 即可；显卡支持 Vulkan 时生成会快很多。如果显示 **{{ui:voice.backend.missing}}**，安装 Vulkan 运行时后点 **{{ui:voice.overview.status.refresh}}**，或者改用 CPU。

## 在功能页绑定播报

播报规则都在各功能页中就地配置。以最常用的 **{{ui:routes.tools.skillMonitor}} → Buff 监控** 为例，展开已监控 Buff 下方的语音播报区块：

![在 Buff 监控中配置播报](../../../shared/img/voice/voice_1.png)

1. 搜索已监控的 Buff，加入播报列表。
2. 勾选事件：**{{ui:voice.binding.event.gained}}**、**{{ui:voice.binding.event.expiring}}**、**{{ui:voice.binding.event.lost}}**。
3. 为每个事件选择文案来源：
   - **{{ui:voice.binding.source.auto}}**：按名称和事件自动生成，例如「蒂娜 失效」。
   - **{{ui:voice.binding.source.custom}}**：自己写，例如「蒂娜好了」。幻想 Buff 还可以带上阶数，见 [幻想阶数占位符](./playback.md#幻想阶数占位符)。
   - **{{ui:voice.binding.source.phrase}}**：选短句库中已有的短句，包括自己导入的音频。
4. 按需设置 **{{ui:voice.binding.priority}}**，然后点 **{{ui:voice.binding.tryPlay}}**。显示 **{{ui:voice.binding.pendingGeneration}}** 说明还没生成音频。

所有可以绑定播报的地方：

| 位置 | 可用事件 | 例 |
| --- | --- | --- |
| [实时监控 · Buff](../monitor/buff.md) | 生效时 / 剩 x 秒 / 失效时 | [蒂娜 CD 转好时语音提醒](../monitor/buff.md#例蒂娜-cd-转好时语音提醒) |
| [实时监控 · 技能 CD](../monitor/skill-cd.md) | 释放时 / 就绪时 / 就绪前 x 秒 | — |
| [实时监控 · 自定义面板计数器](../monitor/custom-panel.md) | 达到目标时 | — |
| [怪物监控 · Buff](../monster/buff.md) | 生效时 / 剩 x 秒 / 失效时 | [盯住自己挂的易伤，快掉时提醒](../monster/buff.md#例盯住自己挂的易伤快掉时提醒) |
| [怪物监控 · Boss DBM](../monster/boss-dbm.md) | 触发时 | [给 Boss 技能起别名并语音预警](../monster/boss-dbm.md#例给-boss-技能起别名并语音预警) · [用自己的音效提醒 Boss 大招](./voices.md#例用自己的音效提醒-boss-大招) |
| [怪物监控 · 实体持续时间](../monster/entity-duration.md) | 出现时 / 剩 x 秒 / 消失时 | [显示镰车剩余时间](../monster/entity-duration.md#例显示镰车剩余时间) |
| [副本机制 · 机制语音播报](../minimap/README.md#机制语音播报) | 各副本已接入的机制 | [团本开荒前的小地图设置](../minimap/README.md#例团本开荒前的小地图设置) |
| [{{ui:voice.tabs.alerts}}](./playback.md#匹配提醒) | 匹配成功 / 准备确认 / 进本投票 | [挂机排本时听到匹配成功](./playback.md#例挂机排本时听到匹配成功) |

注意几点：

- 技能播报只针对自己，且技能要先加入技能 CD 监控。多层充能技能**每恢复一层**都会播报「就绪」，「就绪前 x 秒」也对每一层生效。
- 「剩 x 秒」「就绪前 x 秒」：如果剩余时间被更新（如减 CD、Buff 被缩短、机制重新触发）直接跳进 x 秒以内，会立即补播一次；已经结束的（技能已就绪、Buff 已到期）不补播。刚出现时剩余就不足 x 秒的不播报。
- 实体的「剩 x 秒」需要为条目设置持续时间；实体提前消失时只播「消失」。
- 实体播报按实体 ID 记录，修改范围（仅自己 / 任意）后照常有效。关闭 **{{ui:monsterMonitor.enabled}}** 只会隐藏浮窗，实体播报照常工作。
- 播报跟随它的对象：取消监控技能、删除实体或 DBM 条目、把 Buff 移出监控列表时，对应的播报设置会一起删除。这只影响当前方案，其他方案里同一对象的播报不受影响。

## 播报总览

**{{ui:voice.tabs.bindings}}** 汇总所有功能页中的播报，按来源分组，显示每一条的对象、事件、文案来源、优先级和状态。这里只能查看，不能新建播报：

- 状态为 **{{ui:voice.bindings.status.pending}}** 时，点 **{{ui:voice.bindings.generateMissing}}**。
- 点「前往…」跳转到对应功能页修改。

> [!NOTE]
> 语音绑定随各自的监控方案保存。切换或导入 [监控方案](../app/loadouts.md) 后，建议到播报总览看一眼是否都是 **{{ui:voice.bindings.status.ready}}**，换电脑后通常需要重新生成一次。不同方案为同一对象写了不同文案时，各自的音频互不覆盖，来回切换不需要重新生成。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 试听提示播放失败 | 确认模型已安装，并且这一条已经生成了音频 |
| 生成加速显示不可用 | 安装 Vulkan 运行时后点 **{{ui:voice.overview.status.refresh}}**，或改用 CPU / 自动 |
| 提示已有语音操作正在进行 | 等待当前下载或生成完成，或者取消后再试 |
| 副本机制页看不到可播报项 | 当前副本尚未接入机制语音 |
| 写了 `${阶数}` 但播报没有阶数 | 见 [幻想阶数占位符](./playback.md#幻想阶数占位符) |
| 微调音色不可用 | 见 [方式三：微调音色（进阶）](./voices.md#方式三微调音色进阶) |
