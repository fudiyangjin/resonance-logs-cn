# 自动显示因子能量与赛季节点

对应页面：[自定义监控](../custom-panel.md)

**场景**：你想在战斗中随时看到因子能量攒了多少、因子效果或赛季节点 Buff 什么时候触发，但不想研究计数器规则怎么配。

## 第 1 步：新建因子区

1. 打开 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}}**。
2. 点击 **{{ui:skillMonitor.customPanel.newFactor}}**。
3. 在 **{{ui:skillMonitor.customPanel.groupName}}** 中起个名字，例如「因子」。

根据当前赛季，新建出来的会是：

- **S3 及更早**：{{ui:skillMonitor.customPanel.kind.factor}}，列出当前装配因子的能量和 Buff 效果；
- **S4 起**：{{ui:skillMonitor.customPanel.kind.seasonNode}}，列出已激活节点的 Buff 效果。

## 第 2 步：切一次图

条目来自游戏同步的完整角色数据。新建后传送或进出一次副本，因子区就会填满内容。之后在游戏中更换因子或切换路径时，条目会自动更新，不用重新建区。

![S4 赛季节点区效果](../../../../shared/img/changelog/v0.2.1_1.png)

## 第 3 步：把名字改得好认（仅因子配置区）

默认名称可能是一串内部描述，可以改成你习惯的叫法：

- **能量类条目**：在 **{{ui:skillMonitor.customPanel.factorSlots.title}}** 中搜索该 slot，在「自定义显示名」中输入例如「A 能量」。
- **Buff 效果条目**：到 **{{ui:skillMonitor.tabs.buff}} → {{ui:skillMonitor.buff.alias.title}}** 中搜索这个 Buff 并设置别名，例如「A 触发」。

赛季节点区的名称直接取自节点 Buff，无需设置。

## 第 4 步：调整样式与位置

1. 在 **{{ui:skillMonitor.customPanel.style.title}}** 中调大字号、设置进度条颜色。
2. 点击页面顶部 **{{ui:skillMonitor.layout.editOverlayLayout}}**，把因子区拖到技能 CD 旁边。

## 进阶：和其他 Buff 放在一起看

因子区里不能手动添加条目。如果你还想同时看某个爆发 Buff，可以再 **{{ui:skillMonitor.customPanel.new}}** 一个普通自定义区放那个 Buff，然后在布局中把两个区紧挨着摆放。
