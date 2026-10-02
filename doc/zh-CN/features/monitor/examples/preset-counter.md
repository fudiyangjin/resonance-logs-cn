# 用预设计数器盯炎角的绝对幸运

对应页面：[自定义监控](../custom-panel.md)

**场景**：你玩的是炎角专精，想在浮窗中同时看到「还差几次施法触发绝对幸运」「绝对幸运的内置冷却」以及绝对幸运 Buff 本身。

这类信息不完全体现为 Buff，需要计数器。应用内置了 **炎角-被动** 预设，不用自己写规则。

## 第 1 步：新建普通自定义区

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}} → {{ui:skillMonitor.customPanel.new}}**，命名为「炎角」。

## 第 2 步：添加两个计数器槽位

在 **{{ui:skillMonitor.customPanel.counter.title}}** 中找到 **炎角-被动**，依次添加：

| 槽位 | 含义 |
| --- | --- |
| **Slot 1** | 按技能施法完成累计，显示距离触发绝对幸运还差几次 |
| **Slot 2** | 绝对幸运的冷却：平时约 15 秒，特定主动 Buff 生效期间约 5 秒 |

![炎角-被动预设设置](../../../../shared/img/monitor/buff_6.png)

## 第 3 步：把幸运 Buff 放进同一个区

在同一个监控区中 **{{ui:skillMonitor.customPanel.addBuff}}**，搜索 **炎角-被动-幸运** 并添加。这样三条信息挨在一起，一眼就能看出节奏。

## 效果

![炎角-被动浮窗效果](../../../../shared/img/monitor/buff_5.png)

## 其他预设

同样的方法适用于其他内置预设，例如：

- **N20-蒂娜降攻冷却**、**N20-治疗机器人冷却**：监控 N20 模组效果的内置冷却；
- **重装S4-自动龙炮**、**射线S4-冰之灌注四件套** 等 S4 套装效果；
- **超然触发计数**、**幻想冲击层数-30-冰法** 等。

完整列表见上文 [内置预设计数器](../custom-panel.md#内置预设计数器)。任何计数器都可以点 **{{ui:skillMonitor.customPanel.counter.voiceConfigure}}**，在达到目标时语音提醒。
