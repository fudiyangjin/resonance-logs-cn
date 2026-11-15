# 给大招配醒目的伤害数字

对应页面：[技能伤害显示](../README.md)

**场景**：打出大招时，你想在角色上方看到一个大号的金色数字，带上大招图标；其他技能的伤害不显示，免得屏幕太乱。

## 第 1 步：开启并新建技能组

1. 打开左侧栏 **{{ui:routes.tools.skillDamage}}**，打开 **{{ui:skillDamage.enabled}}**。
2. 点击 **{{ui:skillDamage.addGroup}}**，**{{ui:skillDamage.groupName}}** 填「大招」。

## 第 2 步：添加大招的伤害

1. 在组设置底部的搜索框中输入大招名称，点击结果添加。
2. 同名的结果有好几条时，先打开 DPS 技能明细的「ID」列（[显示设置](../../dps/settings.md)），打一次大招，记下它的伤害 ID，再按 ID 搜索添加。
3. 大招由几段伤害组成时，把这几段都加进来，并打开 **{{ui:skillDamage.groupMerge}}**：同一批次的几段会相加成一个数字，以组名「大招」显示。

## 第 3 步：调整样式

1. **{{ui:skillDamage.displayMode}}** 保持 **{{ui:skillDamage.mergeMode}}**。
2. **{{ui:skillDamage.labelMode}}** 选 **{{ui:skillDamage.nameIcon}}**，在 **{{ui:skillDamage.iconPresets}}** 中按职业找到大招的图标。
3. **{{ui:skillDamage.fontSize}}** 调到 40 左右；在 **{{ui:skillDamage.numberStyle}}** 中把 **{{ui:skillDamage.fill}}** 改成金色渐变，再加一层深色 **{{ui:skillDamage.outline}}**，在亮的场景里也看得清。
4. **{{ui:skillDamage.format}}** 选 **{{ui:skillDamage.cn}}**，大数字更好读。
5. 点击 **{{ui:skillDamage.test}}** 预览，满意后继续。

## 第 4 步：摆放位置

点击页面顶部 **{{ui:skillDamage.actions.editLayout}}**，把「大招」组的区域拖到角色上方，拖动边角缩放。完成后退出编辑。

## 效果

打出大招时，角色上方弹出带图标的金色伤害数字。

![技能伤害显示效果](../../../../shared/img/changelog/v0.2.9_1.png)

> [!TIP]
> 想顺便看普通技能，再建一个技能组，用小号字、放在另一侧。各组的显示区域和风格互不影响。
