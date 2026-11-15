# 卡破防和斩杀线爆发

对应页面：[韧性、生命与队友幻想](../status.md)

**场景**：Boss 破防后会进入一段易伤窗口，你想看到韧性还剩多少，提前把爆发留到破防时；Boss 血量到某个百分比会转阶段，也想卡着血线交技能。

## 第 1 步：打开韧性条区和生命条区

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.overlay}}**，打开 **韧性条区** 和 **生命条区**（默认都关闭）。
2. 点击 **{{ui:monsterMonitor.actions.editLayout}}**，把两条叠放在屏幕中上方，韧性在上、生命在下。

## 第 2 步：调整样式

- 在 **{{ui:monsterMonitor.tabs.stun}}** 的 **{{ui:monsterMonitor.stun.styleTitle}}** 中，把韧性条换成和生命条区分得开的颜色，宽度和生命条一致；
- 在 **{{ui:monsterMonitor.tabs.hp}}** 的 **{{ui:monsterMonitor.hp.styleTitle}}** 中调大字号，百分比更好读。

## 第 3 步（可选）：看队友的幻想

打开 **{{ui:monsterMonitor.tabs.fantasy}}**，打开 **{{ui:monsterMonitor.fantasy.showAll}}**，或者只搜索你关心的几个幻想；再在启用窗口中打开 **队友幻想区**。

## 效果

韧性条快降到 0 时开始准备爆发，破防瞬间全力输出；血量接近转阶段的百分比时，按计划交技能。两条都跟随当前目标。
