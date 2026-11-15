# 寒冰射线一次施法的总伤害

对应页面：[技能伤害显示](../README.md)

**场景**：冰法的寒冰射线是持续施法，每一跳的伤害都不大，逐条弹出只会刷屏。你想在引导期间看到一个不断累加的数字和跳数，射线结束后再看到这一轮的总伤害。

## 第 1 步：新建技能组

1. 打开左侧栏 **{{ui:routes.tools.skillDamage}}**，打开 **{{ui:skillDamage.enabled}}**。
2. 点击 **{{ui:skillDamage.addGroup}}**，**{{ui:skillDamage.groupName}}** 填「寒冰射线」。
3. 在组设置底部搜索「寒冰射线」，把它的伤害添加进来。

## 第 2 步：改为连续显示

1. **{{ui:skillDamage.displayMode}}** 选 **{{ui:skillDamage.continuousMode}}**。
2. **{{ui:skillDamage.windowMode}}** 选 **{{ui:skillDamage.windowCast}}**，**{{ui:skillDamage.windowPreset}}** 选 **{{ui:skillDamage.castRay}}**。窗口跟着你自己的施法开始和结束开关，没有超时。
3. **{{ui:skillDamage.castCloseDelay}}** 设为 0.3 秒左右：射线结束时最后几跳伤害可能还没到，稍等一下再结算。
4. 打开 **{{ui:skillDamage.showComboCount}}**，格式选 `1 HIT`，位置选 **{{ui:skillDamage.comboBottom}}**。
5. **{{ui:skillDamage.continuousTotalDuration}}** 设为 3 秒。

## 第 3 步：摆放位置

点击页面顶部 **{{ui:skillDamage.actions.editLayout}}**，把这个组的区域拖到角色旁边。

## 效果

开始引导射线时出现一个不断累加的数字，下面是跳数；射线结束（再过关闭延迟）后播放总计动画，总伤害停留 3 秒。

> [!NOTE]
> 累计哪些伤害由本组添加的技能决定。想把射线期间其他技能的伤害也算进去，打开 **{{ui:skillDamage.continuousAll}}**；开启窗口的仍然只有射线本身。

> [!TIP]
> 没有施法预设的技能，可以改用 **{{ui:skillDamage.windowRolling}}**（一段时间内没有新命中就结算），或者 **{{ui:skillDamage.windowSkills}}**（指定由哪个技能开启、哪个技能结束）。
