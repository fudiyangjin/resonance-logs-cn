# 精英怪危险读条提醒

对应页面：[怪物技能](../monster-skill.md)

**场景**：某个精英怪的读条技能没有 DBM 预警，被打中就倒地。你希望它一开始读条，浮窗就显示一行醒目的提示并倒计时，同时听到语音。

## 第 1 步：找到技能

1. 打开 **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.monsterSkill}}**，在 **{{ui:monsterMonitor.monsterSkill.searchTitle}}** 中按技能名称搜索。
2. 不知道名称时，先打一次这只怪，到 [历史记录](../../dps/history.md) 时间轴的技能标记里找到技能 ID，再按 ID 搜索；表里没有收录的技能，输入完整 ID 也能添加。

## 第 2 步：设置显示

在 **{{ui:monsterMonitor.monsterSkill.listTitle}}** 中：

1. **{{ui:monsterMonitor.monsterSkill.label}}** 填「快躲开」；
2. **{{ui:monsterMonitor.monsterSkill.displaySeconds}}** 填这个技能读条的秒数；
3. 勾选 **{{ui:monsterMonitor.monsterSkill.countdown}}**，这一行会显示剩余秒数和进度条。

## 第 3 步：配置语音

给这个技能打开 **触发时** 播报，文案选自定义，输入「快躲开」；再到 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** 点击 **{{ui:voice.bindings.generateMissing}}**。

## 第 4 步：打开怪物技能区

在 **{{ui:monsterMonitor.tabs.overlay}}** 中打开 **怪物技能区**（默认关闭），点击 **{{ui:monsterMonitor.actions.editLayout}}** 拖到屏幕中间偏上。

## 效果

精英怪一开始读条，浮窗出现「快躲开」和倒计时，同时听到语音；倒计时归零时正是技能落下的时候。

> [!TIP]
> 有些 Boss 放出技能 A 后，固定若干秒释放技能 B。把 A 加进列表，别名填「B 来了」，显示秒数填两者的间隔，就能提前预告 B，见 [用倒计时预告下一个技能](../monster-skill.md#用倒计时预告下一个技能)。
