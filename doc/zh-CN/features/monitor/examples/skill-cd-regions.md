# 职业技能和幻想技能分开摆放

对应页面：[技能 CD](../skill-cd.md)

**场景**：你想把职业爆发技能排成一排放在角色右边，幻想和职责技能放在左边；大招转好前 3 秒，听到一句提醒。

## 第 1 步：选择职业和技能

1. 在页面顶部 **{{ui:skillMonitor.profile.title}} → {{ui:skillMonitor.profile.classLabel}}** 选择你的职业。
2. 打开 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.skillCd}}**，在 **{{ui:skillMonitor.skillCd.skills.title}}** 中点选要看的职业技能。所有区域合计最多 10 个技能。

## 第 2 步：分成两个区域

1. 在 **{{ui:skillMonitor.skillCd.preview.title}}** 中点击 **{{ui:skillMonitor.skillCd.region.add}}**，把新区域命名为「幻想」。
2. 切到「幻想」区域，在 **{{ui:skillMonitor.skillCd.resonance.title}}** 中搜索幻想技能、在 **{{ui:skillMonitor.skillCd.duty.title}}** 中选择职责技能，它们会放进当前区域。
3. 把「区域 1」的 **{{ui:skillMonitor.skillCd.layout.rows}}** 设为 1、**{{ui:skillMonitor.skillCd.layout.columns}}** 设为 5；「幻想」设为 1 行 3 列。

## 第 3 步：打开技能CD区并摆放

1. 在 **{{ui:skillMonitor.tabs.overlay}}** 中打开 **技能CD区**。
2. 点击页面顶部 **{{ui:skillMonitor.layout.editOverlayLayout}}**，把两个区域分别拖到角色两侧，各自缩放到合适大小。

## 第 4 步：大招就绪前提醒

1. 在 **{{ui:skillMonitor.skillCd.voice.title}}** 的 **{{ui:skillMonitor.skillCd.voice.classSkills}}** 分页中点击大招，打开 **就绪前 x 秒**，秒数填 3。
2. 想在最后几秒听到数字，再勾选 **{{ui:voice.binding.countdown}}**。
3. 打开 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}**，点击 **{{ui:voice.bindings.generateMissing}}**。

## 效果

战斗中两侧各有一排技能图标，冷却中变暗并显示剩余秒数；大招转好前 3 秒听到提醒。

> [!TIP]
> 游戏技能栏上已经能看到 CD 的技能，只想听提醒时不必加入 CD 监控，在语音播报区块里直接配置即可。
