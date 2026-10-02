# 用打桩模式测一轮 3 分钟输出

对应页面：[DPS 检测](../README.md)

**场景**：换了一套模组，想在训练场固定打 3 分钟木桩，对比新旧配置的秒伤。

## 准备

1. 打开 **{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}} → {{ui:themes.tabs.live}} → {{ui:themes.header.title}}**，确认 **{{ui:themes.header.showHeaderControl}}** 已勾选。
2. 打开 **{{ui:routes.tools.dps}} → {{ui:routes.dps.settings}} → {{ui:settings.tabs.live}}**：
   - **{{ui:settings.live.trainingWindow}}** 保持默认 3:03，或改成你习惯的时长；
   - **{{ui:settings.live.trainingLockPolicy}}** 选 **{{ui:settings.live.trainingLockPolicy.eliteDummies}}**。

## 开始一轮

1. 来到训练场，站到精英木桩前。
2. 点击实时窗口标题栏的**准星按钮**，状态变为 **打桩待命**。
3. 对木桩打出第一下，自动锁定该木桩，状态变为 **打桩中**，同时开始计时。
4. 到达设定时长后，状态变为 **打桩结束**：实时窗口定格，数据同时存入历史记录。

```text
打桩待命 ──首次命中──▶ 打桩中 ──到时──▶ 打桩结束
    ▲                                    │
    └──────────────── 点击「重置」 ──────────┘
```

## 下一轮与对比

- 打桩结束后再攻击**不会**自动开始新一轮，要先点 **重置** 回到打桩待命；这样你可以从容换装、等 CD 转好再开打。
- 打桩中途也可以点 **重置** 放弃这一轮。
- 每一轮都会保存到 **{{ui:routes.dps.history}}**，可以**加入收藏**，用「仅收藏」把几轮放在一起对比。

> [!WARNING]
> 切图、换线、进出协会会自动退出打桩模式，回来后需要重新点准星。

> [!TIP]
> 不在训练场？把打桩锁定改成 **{{ui:settings.live.trainingLockPolicy.firstMonster}}**，在野外对第一只命中的怪物计时，适合测试对单技能循环。
