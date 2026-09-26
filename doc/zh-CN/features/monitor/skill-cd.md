# 技能 CD

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.skillCd}}** 把你选中的技能以图标形式显示在浮窗中，并实时显示剩余冷却。

## 选择技能

1. 在 **{{ui:skillMonitor.skillCd.class.title}}** 中选择职业，下方会列出该职业的技能。
2. 在 **{{ui:skillMonitor.skillCd.skills.title}}** 中勾选要监控的技能，最多 **10** 个（浮窗中约 2 行 × 5 列）。
3. **{{ui:skillMonitor.skillCd.resonance.title}}** 不会自动列出，需要在搜索框中按名称搜索添加。
4. **{{ui:skillMonitor.skillCd.preview.title}}** 按勾选顺序展示浮窗中的排列效果。

## 技能变换

部分技能在特定 Buff 下会变成另一种形态，CD 图标和名称会自动跟着切换。例如青岚骑士的「飞鸟投」在特定 Buff 下显示为「极·岚切」，冰法的「寒冰风暴」在免读条 Buff 下显示为「免读条的寒冰风暴」。

![技能变换](../../../shared/img/monitor/cd_1.png)

## 语音播报

在 **{{ui:skillMonitor.skillCd.voice.title}}** 区块中，可以为已监控的技能配置三种事件：

| 事件 | 时机 |
| --- | --- |
| **释放时** | 技能进入冷却 |
| **就绪时** | 冷却结束 |
| **就绪前 x 秒** | 冷却即将结束，提前准备 |

充能类技能**每恢复一层**都算冷却结束，「就绪时」和「就绪前 x 秒」对每一层都会播报。播报的前提是已经在 [语音播报](../voice/README.md) 中安装模型并开启。取消监控某个技能时，它的语音播报设置会一起删除（只影响当前方案）。

> [!NOTE]
> 以前在这里配置的「持续时间技能」（如镰车）已迁移到 [怪物监控 · 实体持续](../monster/entity-duration.md)，旧方案会自动迁移。
