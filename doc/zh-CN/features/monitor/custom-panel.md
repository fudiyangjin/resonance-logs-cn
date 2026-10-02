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
> 想看因子或节点的触发情况，**直接新建因子区**即可，不需要再像旧版那样用「自定义计数器规则」手动组合 Sources 和 Slots。

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
- **{{ui:skillMonitor.customPanel.counter.title}}**：从预设规则或你的自定义规则中选择计数器槽位；
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

### 自定义计数器规则

预设不够用时，可以在 **{{ui:skillMonitor.customPanel.rule.title}}** 中自己组合：

1. **{{ui:skillMonitor.customPanel.rule.new}}**；
2. 在 **{{ui:skillMonitor.customPanel.rule.sources}}** 中选择推进计数的事件来源（可多选）；
3. 在 **{{ui:skillMonitor.customPanel.rule.slots}}** 中选择要在面板上展示的槽位（可多选）；
4. 填写 **{{ui:skillMonitor.customPanel.rule.name}}** 并保存；
5. 回到普通自定义区，**{{ui:skillMonitor.customPanel.counter.title}}** 选中刚保存的规则。

这是面向进阶用户的功能，一般用户使用预设或因子区即可。

## 监控区样式

每个监控区都可以单独设置 **{{ui:skillMonitor.customPanel.style.title}}**：行间距、字体大小、名称与数值间距、名称 / 数值 / 进度条颜色和透明度。

## 例

- [自动显示因子能量与赛季节点](./examples/factor-energy.md)
- [用预设计数器盯炎角的绝对幸运](./examples/preset-counter.md)