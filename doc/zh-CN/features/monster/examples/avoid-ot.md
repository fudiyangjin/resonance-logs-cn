# 输出时避免 OT

对应页面：[仇恨列表](../hate.md)

**场景**：你是输出，开局爆发经常把 Boss 从坦克手里抢过来（OT）。你想随时看到自己在仇恨榜上的位置，离坦克太近时先收一收。

## 第 1 步：打开仇恨列表区

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.overlay}}**，打开 **仇恨列表区**（默认关闭）。
2. 点击 **{{ui:monsterMonitor.actions.editLayout}}**，把仇恨列表拖到 Boss 血条附近，视线不用离开 Boss 太远。

## 第 2 步：调整显示

打开 **{{ui:monsterMonitor.tabs.hate}}**：

1. **{{ui:monsterMonitor.hate.maxDisplay}}** 设为 5，5 人副本只看前几名就够了；
2. 在 **{{ui:monsterMonitor.hate.styleTitle}}** 中调大字号，给进度条换一个醒目的颜色。

## 效果

战斗中能看到当前目标的仇恨排名和每个人的仇恨值。你的进度条快追上坦克时，先停一下爆发或者开减仇恨的技能。

> [!TIP]
> 坦克也可以用它确认自己稳住了仇恨；一次拉多只怪时，再配合 [战斗名单](../roster.md) 的坦克模式，看哪些怪没在打你。
