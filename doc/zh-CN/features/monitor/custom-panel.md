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

- **{{ui:skillMonitor.customPanel.addBuff}}**：从 Buff 搜索中选取，只加入当前监控区；
- **{{ui:skillMonitor.customPanel.counter.title}}**：从预设规则或你的自定义规则中选择计数器槽位；
- **{{ui:skillMonitor.customPanel.hideWhenZero}}**：计数器为 0 时不占位置；
- **{{ui:skillMonitor.customPanel.counter.voiceConfigure}}**：计数达到目标时播报。

在 **{{ui:skillMonitor.customPanel.entries.title}}** 中可以修改显示名、调整顺序或移除。

> [!NOTE]
> 同一个 Buff 或计数器槽位在**所有**监控区中只能出现一次。已被其他区占用的项会显示「已在 xxx」。

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

### 例：自动显示因子能量与赛季节点

**场景**：你想在战斗中随时看到因子能量攒了多少、因子效果或赛季节点 Buff 什么时候触发，但不想研究计数器规则怎么配。

#### 第 1 步：新建因子区

1. 打开 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}}**。
2. 点击 **{{ui:skillMonitor.customPanel.newFactor}}**。
3. 在 **{{ui:skillMonitor.customPanel.groupName}}** 中起个名字，例如「因子」。

根据当前赛季，新建出来的会是：

- **S3 及更早**：{{ui:skillMonitor.customPanel.kind.factor}}，列出当前装配因子的能量和 Buff 效果；
- **S4 起**：{{ui:skillMonitor.customPanel.kind.seasonNode}}，列出已激活节点的 Buff 效果。

#### 第 2 步：切一次图

条目来自游戏同步的完整角色数据。新建后传送或进出一次副本，因子区就会填满内容。之后在游戏中更换因子或切换路径时，条目会自动更新，不用重新建区。

![S4 赛季节点区效果](../../../shared/img/changelog/v0.2.1_1.png)

#### 第 3 步：把名字改得好认（仅因子配置区）

默认名称可能是一串内部描述，可以改成你习惯的叫法：

- **能量类条目**：在 **{{ui:skillMonitor.customPanel.factorSlots.title}}** 中搜索该 slot，在「自定义显示名」中输入例如「A 能量」。
- **Buff 效果条目**：到 **{{ui:skillMonitor.tabs.buff}} → {{ui:skillMonitor.buff.alias.title}}** 中搜索这个 Buff 并设置别名，例如「A 触发」。

赛季节点区的名称直接取自节点 Buff，无需设置。

#### 第 4 步：调整样式与位置

1. 在 **{{ui:skillMonitor.customPanel.style.title}}** 中调大字号、设置进度条颜色。
2. 点击页面顶部 **{{ui:skillMonitor.layout.editOverlayLayout}}**，把因子区拖到技能 CD 旁边。

#### 进阶：和其他 Buff 放在一起看

因子区里不能手动添加条目。如果你还想同时看某个爆发 Buff，可以再 **{{ui:skillMonitor.customPanel.new}}** 一个普通自定义区放那个 Buff，然后在布局中把两个区紧挨着摆放。

### 例：用预设计数器盯炎角的绝对幸运

**场景**：你玩的是炎角专精，想在浮窗中同时看到「还差几次施法触发绝对幸运」「绝对幸运的内置冷却」以及绝对幸运 Buff 本身。

这类信息不完全体现为 Buff，需要计数器。应用内置了 **炎角-被动** 预设，不用自己写规则。

#### 第 1 步：新建普通自定义区

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}} → {{ui:skillMonitor.customPanel.new}}**，命名为「炎角」。

#### 第 2 步：添加两个计数器槽位

在 **{{ui:skillMonitor.customPanel.counter.title}}** 中找到 **炎角-被动**，依次添加：

| 槽位 | 含义 |
| --- | --- |
| **Slot 1** | 按技能施法完成累计，显示距离触发绝对幸运还差几次 |
| **Slot 2** | 绝对幸运的冷却：平时约 15 秒，特定主动 Buff 生效期间约 5 秒 |

![炎角-被动预设设置](../../../shared/img/monitor/buff_6.png)

#### 第 3 步：把幸运 Buff 放进同一个区

在同一个监控区中 **{{ui:skillMonitor.customPanel.addBuff}}**，搜索 **炎角-被动-幸运** 并添加。这样三条信息挨在一起，一眼就能看出节奏。

#### 效果

![炎角-被动浮窗效果](../../../shared/img/monitor/buff_5.png)

#### 其他预设

同样的方法适用于其他内置预设，例如：

- **N20-蒂娜降攻冷却**、**N20-治疗机器人冷却**：监控 N20 模组效果的内置冷却；
- **重装S4-自动龙炮**、**射线S4-冰之灌注四件套** 等 S4 套装效果；
- **超然触发计数**、**幻想冲击层数-30-冰法** 等。

完整列表见上文 [内置预设计数器](#内置预设计数器)。任何计数器都可以点 **{{ui:skillMonitor.customPanel.counter.voiceConfigure}}**，在达到目标时语音提醒。
