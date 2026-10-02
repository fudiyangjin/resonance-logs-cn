# 蒂娜 CD 转好时语音提醒

对应页面：[Buff 监控](../buff.md)

**场景**：你负责在队伍里交蒂娜，希望浮窗显示蒂娜的冷却，并且在 CD 结束时听到一句「蒂娜 CD 好了」，不用一直盯着看。

## 第 1 步：监控蒂娜 CD Buff

施放蒂娜后，你身上会留下一个表示冷却的 Buff。

1. 打开 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buff}}**。
2. 搜索 **蒂娜CD**（ID 2110056），加入已选 Buff。
3. 同时可以加入 **冷却缩减**（ID 2110034），看蒂娜给的增益是否还在。

## 第 2 步：给它起个好认的名字（可选）

在 **{{ui:skillMonitor.buff.alias.title}}** 中搜索「蒂娜CD」，设置别名为「蒂娜」。

## 第 3 步：快结束时高亮

在 **{{ui:skillMonitor.buff.alert.title}}** 中为它添加告警：剩余 ≤ 5 秒时高亮为绿色并闪烁，提醒你准备交。

## 第 4 步：失效时语音提醒

1. 先确认 [语音播报](../../voice/README.md) 已安装模型并 **{{ui:voice.overview.enabled}}**。
2. 回到 **{{ui:skillMonitor.tabs.buff}}**，展开 **{{ui:skillMonitor.buff.voice.title}}**，搜索并添加「蒂娜CD」。
3. 勾选 **失效时播报**，文案选 **自定义文本**，输入「蒂娜 CD 好了」。
4. 点 **试听**；提示待生成时，到 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** 点击 **{{ui:voice.bindings.generateMissing}}**。

![Buff 语音播报配置](../../../../shared/img/voice/voice_1.png)

用日语微调音色生成的效果示例：

<audio controls src="../../../../shared/audio/voice/ja_01_tina_cd.wav"></audio>

> [!TIP]
> 想让播报带上蒂娜阶数？把文案写成「蒂娜${阶数}好了」，播报时会自动替换为「蒂娜5阶好了」，见 [语音播报 · 幻想阶数](../../voice/playback.md#幻想阶数占位符)。
