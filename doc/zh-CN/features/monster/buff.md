# 目标 Buff

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.buff}}** 配置在怪物 Buff 区中显示目标身上的哪些 Buff。

## 两种监控方式

搜索前先选择加入方式：

| 方式 | 显示条件 | 适合 |
| --- | --- | --- |
| **{{ui:monsterMonitor.buffSearch.self}}** | 只显示**你**施加到目标身上的 | 自己负责维持的易伤、DoT |
| **{{ui:monsterMonitor.buffSearch.global}}** | 不论谁施加，目标身上有就显示 | Boss 自身的机制 Buff、团队共享的 Debuff |

同一个 Buff 只能属于其中一种；换另一种方式添加会自动转移。

**{{ui:monsterMonitor.buffGroups.self.monitorAll}}**：开启后浮窗列出你施加的所有 Buff，适合先摸清名称再精简。

## 优先级、告警与显示名

| 设置 | 作用 |
| --- | --- |
| **{{ui:monsterMonitor.priority.title}}** | 空间有限时，靠前的 Buff 优先显示 |
| **{{ui:monsterMonitor.alert.title}}** | 剩余 ≤ 设定秒数时高亮，可选闪烁 |
| **{{ui:monsterMonitor.alias.title}}** | 为已监控的 Buff 设置浮窗中的别名 |
| **{{ui:monsterMonitor.style.panelTitle}}** | 行 / 列间距、字号、名称 / 数值 / 进度条颜色与透明度 |

从监控中移除一个 Buff 时，它的优先级、告警和语音配置会一并清理。

## 语音播报

**{{ui:monsterMonitor.buffVoice.title}}** 中可以为已监控的 Buff 配置 **生效时 / 剩 x 秒 / 失效时** 播报。每条会标明来源范围：

- **{{ui:monsterMonitor.buffVoice.scope.localPlayerSource}}**：严格按你施加的那一份判断，队友挂的同名 Buff 不会触发或延长你的播报；
- **{{ui:monsterMonitor.buffVoice.scope.anySource}}**：按 Buff 整体是否存在判断，多人施加时第一份出现算生效、最后一份消失算失效。

## 常用 Debuff 参考

| 幻想 | 搜索名 | Buff ID | 效果 |
| --- | --- | --- | --- |
| 剧毒蜂巢 | 蜂巢易伤 | 2110099 | 怪物易伤 |
| 罗罗拉 | 罗罗拉增伤 | 2110111 | 怪物增伤 |
| 罗罗拉 | 罗罗拉叠层增伤 | 2110135 | 叠层增伤 |

玩家侧的增益和幻想 CD 见 [实时监控 · Buff 监控](../monitor/buff.md#常用-buff-参考)。

## 例

### 例：盯住自己挂的易伤，快掉时提醒

**场景**：你带了剧毒蜂巢，负责给 Boss 挂「蜂巢易伤」。你想在浮窗中看到易伤剩余时间，快结束时高亮提醒，掉了时语音提醒你补。

#### 第 1 步：加入「仅自身施加」

1. 打开 **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.buff}}**。
2. 选择 **{{ui:monsterMonitor.buffSearch.self}}**，搜索 **蜂巢易伤**（ID 2110099）并添加。

选「仅自身」是因为你只关心自己挂的那一份；如果队伍里有两个人带蜂巢，选「全局」就分不清是谁的了。

#### 第 2 步：设置告警

在 **{{ui:monsterMonitor.alert.title}}** 中为「蜂巢易伤」添加告警：剩余 ≤ 3 秒时高亮为红色，开启闪烁。

#### 第 3 步：失效时语音提醒

在 **{{ui:monsterMonitor.buffVoice.title}}** 中添加「蜂巢易伤」，勾选 **失效时**，文案写「补易伤」。确认 [语音播报](../voice/README.md) 已开启并生成了音频。

#### 第 4 步：打开浮窗并摆位

1. 确认 **{{ui:monsterMonitor.enabled}}** 已开启，点击 **{{ui:monsterMonitor.actions.toggleOverlay}}**。
2. **{{ui:monsterMonitor.actions.editLayout}}**，把怪物 Buff 区拖到 Boss 血条附近。

#### 验证

在训练场对木桩挂一次蜂巢——木桩必须是你的**当前攻击目标**，浮窗才会显示它的 Buff。

> [!TIP]
> 不知道自己挂的 Debuff 叫什么？先开启 **{{ui:monsterMonitor.buffGroups.self.monitorAll}}**，打木桩看浮窗里出现了什么，再精确添加。
