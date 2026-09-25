# 播放与提醒

本页介绍播报在实战中如何排队和播放、如何在文案中带上幻想阶数，以及排本时的匹配提醒。

## 播放设置

在 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.overview}}** 中：

- **{{ui:voice.overview.enabled}}**：总开关，关闭后所有播报都不会播放。
- **音量**：所有播报共用。
- **{{ui:voice.overview.stopPlayback}}**：立即停止当前播放。
- **{{ui:voice.overview.status.title}}**：查看模型、生成引擎、音色数量和短句数量。

## 优先级与队列

战斗中可能同时触发好几条播报。每条播报都可以设置 **{{ui:voice.binding.priority}}**：

| 档位 | 建议用途 |
| --- | --- |
| **{{ui:voice.binding.priority.default}}** | 不重要的提示 |
| **{{ui:voice.binding.priority.low}}** / **{{ui:voice.binding.priority.medium}}** | 日常循环提醒，如 Buff 就绪 |
| **{{ui:voice.binding.priority.high}}** | 需要马上反应的，如 Boss 大招 |
| **{{ui:voice.binding.priority.urgent}}** | 不处理就会团灭的机制 |

同一优先级的播报不会互相打断，按顺序逐条播放。在 **{{ui:voice.overview.queuePolicy}}** 中还可以开启：

- **{{ui:voice.overview.queue.drop}}**：高峰时丢掉排在后面的低优先级播报，避免提醒越积越晚。
- **{{ui:voice.overview.queue.interrupt}}**：只有优先级**严格高于**当前播报的事件才能打断它。

> [!TIP]
> 大部分播报保持默认或低优先级，只把少数真正关键的设为高或紧急，打断才有意义。

## 幻想阶数占位符

部分 Buff 由幻想施加，其来源幻想有 **0～5 阶**。想在播报中说出阶数，可以在 **生效时 / 失效时** 的自定义文本中写占位符：

| 占位符 | 说明 |
| --- | --- |
| `${阶数}` | 中文写法 |
| `${remodelLevel}` | 与上面等价 |

例如自定义文本「蒂娜${阶数}已生效」，当你的蒂娜是 5 阶时，会播报「蒂娜5阶已生效」。

- 只在 **实时监控 Buff** 和 **怪物 Buff** 的「生效时 / 失效时」中有效。「剩 x 秒」、计数器、Boss DBM 和副本机制不会展开阶数。
- 应用会为 0～5 阶各生成一条音频，再加一条去掉占位符的兜底文案，用于识别不到阶数的情况。
- **试听**按 5 阶示例播放；实战中按当次识别到的阶数选择音频。
- 改完文案后记得到 **{{ui:voice.tabs.bindings}}** 中 **{{ui:voice.bindings.generateMissing}}**。

浮窗中能识别来源幻想阶数的 Buff，也会显示为「名称 | n阶」，与是否配置语音无关。完整示例见 [例：蒂娜 CD 转好时语音提醒](../monitor/buff.md#例蒂娜-cd-转好时语音提醒)。

## 匹配提醒

**{{ui:voice.tabs.alerts}}** 可以在切出游戏时提醒你排本进度，三种通知可以分别开启：

| 通知 | 何时触发 |
| --- | --- |
| **{{ui:voice.alerts.matchReady.title}}** | 匹配成功，需要你点确认 |
| **{{ui:voice.alerts.readyCheck.title}}** | 队长发起准备确认 |
| **{{ui:voice.alerts.teamVote.title}}** | 队伍发起进本投票 |

每种通知的文案可以用默认的（如「{{ui:voice.alerts.autoText.matchReady}}」），也可以自定义或引用短句。匹配提醒同样需要先打开 **{{ui:voice.overview.enabled}}**。

## 例

### 例：挂机排本时听到匹配成功

**场景**：你在排本，同时切出去看视频。你希望匹配成功、队长发起准备确认或进本投票时，能听到语音提醒，别错过确认。

#### 第 1 步：开启语音

**{{ui:routes.tools.voice}} → {{ui:voice.tabs.overview}}**，打开 **{{ui:voice.overview.enabled}}**，把音量调到切出游戏后也能听清。

#### 第 2 步：开启三种提醒

打开 **{{ui:voice.tabs.alerts}}**，分别开启：

- **{{ui:voice.alerts.matchReady.title}}**
- **{{ui:voice.alerts.readyCheck.title}}**
- **{{ui:voice.alerts.teamVote.title}}**

文案可以保持默认，也可以改成更醒目的，比如「快回来确认」。

#### 第 3 步：生成语音

**{{ui:voice.tabs.bindings}}** → **{{ui:voice.bindings.generateMissing}}**。这三条提醒在总览中归入匹配提醒分组。

#### 第 4 步：设置优先级

排本提醒一般发生在战斗之外，不会和战斗播报冲突，保持默认即可。如果你经常在打小怪时排本，可以把它设为 **{{ui:voice.binding.priority.high}}**，避免被其他播报挡住。

> [!NOTE]
> 提醒依赖游戏推送的网络通知，应用必须保持运行（隐藏到托盘也可以）。
