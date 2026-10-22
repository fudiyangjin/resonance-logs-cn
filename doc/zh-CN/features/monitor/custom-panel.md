# 自定义监控

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}}** 让你在浮窗中创建若干个**文字监控区**，每个区是一块独立的列表，可以单独拖动、缩放和设置样式。

![自定义监控区](../../../shared/img/monitor/buff_3.png)

## 三种监控区

| 类型 | 创建方式 | 内容 | 需要配置吗 |
| --- | --- | --- | --- |
| **{{ui:skillMonitor.customPanel.kind.factor}}** | **{{ui:skillMonitor.customPanel.newFactor}}**（S3 及更早赛季） | 当前装配的因子能量、因子 Buff 效果 | 不需要，自动生成 |
| **{{ui:skillMonitor.customPanel.kind.seasonNode}}** | **{{ui:skillMonitor.customPanel.newFactor}}**（S4 起） | 已激活赛季节点的 Buff 效果 | 不需要，自动生成 |
| **{{ui:skillMonitor.customPanel.kind.manual}}** | **{{ui:skillMonitor.customPanel.new}}** | 你手动挑选的 Buff 与计数器 | 需要 |

点击 **{{ui:skillMonitor.customPanel.newFactor}}** 时，应用会根据当前赛季自动决定创建哪一种：S4 起显示赛季节点区，之前的赛季显示因子配置区。

> [!IMPORTANT]
> 想看因子或节点的触发情况，**直接新建因子区**即可，不需要自己配置计数器。

## 因子配置区

新建后，应用会根据你当前装配的因子自动生成条目，常见的有：

- **真实因子 A / B 能量**：计数进度；
- **真实因子 A / B Buff 效果**：因子触发后的 Buff 持续时间。

条目完全由系统维护：

- 切图时整体同步一次；之后在游戏里切换因子路径或更换装填因子，条目会自动更新；
- 因子区里**不能**手动添加 Buff 或计数器。

**改显示名：**

| 条目 | 在哪里改 |
| --- | --- |
| 能量等计数类条目 | 选中因子区后，在 **{{ui:skillMonitor.customPanel.factorSlots.title}}** 中搜索 slot（名称 / 描述），填写自定义显示名。按 slot 模板保存，换方案后仍然沿用 |
| Buff 效果条目 | [Buff 监控 · Buff 别名设置](./buff.md#名称与图标)（全局生效） |

## 赛季节点区

S4 起，**{{ui:skillMonitor.customPanel.newFactor}}** 创建的是赛季节点区：显示已激活节点的 Buff 效果，节点激活后自动出现，**无需配置显示名**。

![S4 赛季节点区](../../../shared/img/changelog/v0.2.1_1.png)

## 普通自定义区

点击 **{{ui:skillMonitor.customPanel.new}}** 创建，然后往里放东西：

- **{{ui:skillMonitor.customPanel.addBuff}}**：从 Buff 搜索中选取，只加入当前监控区；也可以选 [组合 Buff](./buff.md#组合-buff)；
- **{{ui:skillMonitor.customPanel.entries.stateOnly}}**：勾选后该 Buff 条目常驻显示，只标明激活 / 未激活，不显示时间；
- **{{ui:skillMonitor.customPanel.counter.title}}**：从预设计数器和你[自己定义的计数器](#自定义计数器)中选择槽位；
- **{{ui:skillMonitor.customPanel.hideWhenZero}}**：计数器为 0 时不占位置；
- **{{ui:skillMonitor.customPanel.counter.voiceConfigure}}**：计数达到目标时播报。

在 **{{ui:skillMonitor.customPanel.entries.title}}** 中可以修改显示名、调整顺序或移除。

> [!NOTE]
> 同一个 Buff 或计数器槽位在**所有**自定义监控区中只能出现一次，已被其他区占用的项会显示「已在 xxx」。Buff 监控和 Buff 覆盖率不受此限制：放在这里的 Buff 仍会在那些区域照常显示。

### 内置预设计数器

有些触发不体现为 Buff，而是需要计数（例如「每打几次触发一次」「内置冷却」）。应用内置了以下预设，添加计数器时可以直接选：

| 分类 | 预设 |
| --- | --- |
| 通用 / 职业 | 超然触发计数、岩之心触发计数、迷狂劈杀连招计数、猛击追击计数、岩怒追击计数、裁决追击计数-光盾、裁决追击计数-防盾 |
| 幻想冲击 | 幻想冲击层数-30-冰法、幻想冲击层数-30-吉他 |
| 专精被动 | 炎角-被动 |
| 模组 / 套装 | N20-治疗机器人冷却、N20-蒂娜降攻冷却 |
| S4 | 重装S4-自动龙炮、重装S4-额外神影螺旋、射线S4-冰之灌注四件套、森语S4-灵感X6苍月慰藉 |

### 自定义计数器

预设不够用时，在 **{{ui:skillMonitor.customPanel.counter.title}}** 中点 **{{ui:skillMonitor.customPanel.counterEditor.new}}**，用表单自己定义计数器。可填的参数与内置预设完全相同，最省事的做法是先 **{{ui:skillMonitor.customPanel.counterEditor.copyFromPreset}}**，再在此基础上修改。

一个计数器由两部分组成：

- **{{ui:skillMonitor.customPanel.counterEditor.sources}}**：什么事件让计数增加。任一来源触发时，按「每次增加」累加到所有槽位；也可以没有来源（例如只靠 Buff 触发的冷却）。
- **{{ui:skillMonitor.customPanel.counterEditor.slots}}**：面板上显示的每一行，各自有目标值、清零规则和冷却。

保存后，计数器和预设一起出现在列表里，同样可以添加到监控区、配置语音播报；点 ✎ 修改、点 🗑 删除。表单有缺漏时，保存会定位到需要修改的地方。

技能、伤害、Buff 都可以按名称搜索；名称表里找不到的，直接输入 ID 后回车。不常用的设置收在每个来源和槽位的 **{{ui:skillMonitor.customPanel.counterEditor.advanced}}** 里。

> [!NOTE]
> 旧版「自定义计数器规则」（从因子模板勾选拼装）已被因子区取代。升级后这些规则会被自动删除，连同它们在监控区中的条目和语音播报。

#### 计数来源

| 类型 | 何时累加 |
| --- | --- |
| 释放技能 / 技能释放完成 | 释放（或释放完成）所选技能时 |
| 技能持续期间定时 | 所选技能持续期间，每隔一段时间 |
| 技能命中 | 所选伤害每命中一次；高级里可设「每 N 次命中才计一次」和伤害类型（暴击、格挡、幸运一击等） |
| 技能命中（多目标只计一次） | 同一时刻打中多个目标，只按命中次数最多的那个目标计 |
| 命中自己 | 所选伤害命中自己时（如自我治疗） |
| 任意命中 / 受到伤害 | 自己造成任意命中时 / 受到伤害时（受到伤害可以限定伤害） |
| 获得 Buff | 获得所选 Buff 时 |
| 消耗 Buff 层数 | 所选 Buff 每减少指定层数 |
| Buff 持续期间定时 | 所选 Buff 存在期间，每隔一段时间 |
| Buff 期间移动距离 | 所选 Buff 存在期间，每移动指定距离 |
| 消耗战斗资源 | 战斗资源每消耗指定数量 |

#### 槽位

| 设置 | 说明 |
| --- | --- |
| 目标值 | 留空表示不设目标。设置后可以选显示方式（计数、计数/目标、剩余、百分比），以及「达到目标后从 0 重新计」 |
| 关联 Buff | 选一个 Buff，分别指定它「获得时 / 变化时 / 消失时」对计数做什么；可以选 Buff 在自己身上还是任意队友身上 |
| 冷却 | 由「暂停计数」「清零并暂停」「清零并开始冷却」动作开始，面板显示冷却进度；「冷却结束后」决定接下来怎么做 |
| 高级 | 关联 Buff 的来源配置 ID、带有条件 Buff 时改用另一个冷却时长、进入副本时冷却、命中指定伤害或被动技能触发时执行动作、目标值或冷却按属性缩减 |

可选的动作：

| 动作 | 效果 |
| --- | --- |
| 不处理 | 不改变计数 |
| 清零 | 计数归零 |
| 暂停计数 | 停止累加；设置了冷却时同时开始冷却 |
| 继续计数 | 恢复累加 |
| 清零并开始计数 | 归零后继续累加 |
| 清零并暂停 | 归零并停止累加；设置了冷却时同时开始冷却 |
| 清零并开始冷却（不暂停计数） | 归零并开始冷却，冷却期间照常累加 |

这是面向进阶用户的功能，一般用户使用预设或因子区即可。

## 监控区样式

每个监控区都可以单独设置 **{{ui:skillMonitor.customPanel.style.title}}**：行间距、字体大小、名称与数值间距、名称 / 数值 / 进度条颜色和透明度。

## 例

- [自动显示因子能量与赛季节点](./examples/factor-energy.md)
- [用预设计数器盯炎角的绝对幸运](./examples/preset-counter.md)