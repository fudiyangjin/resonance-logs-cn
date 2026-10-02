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

- [盯住自己挂的易伤，快掉时提醒](./examples/vulnerability.md)
- [监听罗罗拉幻想 Buff 与叠层](./examples/lorola.md)