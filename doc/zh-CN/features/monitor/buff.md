# Buff 监控

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buff}}** 监控**你自己身上**的 Buff：持续时间、层数，快结束时告警，生效或失效时语音提醒。

> [!TIP]
> 想看的是 Boss 身上的 Debuff（例如你挂上的易伤）？那属于 [怪物监控 · Buff 监控](../monster/buff.md)。

## 添加 Buff

在搜索框中输入 **名称或 ID**，点击结果加入 **{{ui:skillMonitor.buff.selectedTitle}}**。结果较多时会分页显示；即使某个 ID 不在内置表中，也可以直接按 ID 添加。

不确定 Buff 叫什么？先开启 **{{ui:skillMonitor.buff.all.title}}**，浮窗会显示你当前获得的所有 Buff；找到目标后再精确添加，最后关闭「监控全部」。

> [!NOTE]
> 在哪里设置就在哪里显示：同一个 Buff 可以同时放在这里、[自定义监控](./custom-panel.md) 和 [Buff 覆盖率](./buff-coverage.md)，各区域互不影响。**{{ui:skillMonitor.buff.all.title}}** 只显示其他已开启区域没有显示的 Buff，赛季因子 / 节点区可能用到的 Buff 也不会混进来。

### 分类快捷监听

**{{ui:skillMonitor.buff.category.title}}** 可以一次性监听所有 **食物** 或 **炼金** Buff，出本前检查吃没吃药很方便。

## 显示模式

在 **{{ui:skillMonitor.buff.display.title}}** 中二选一：

| 模式 | 特点 |
| --- | --- |
| **{{ui:skillMonitor.buff.display.individual}}** | 每个 Buff 单独一个图标，可分别拖动位置、调整大小 |
| **{{ui:skillMonitor.buff.display.grouped}}** | 多个 Buff 归入一组，统一按行列排列 |

![独立模式](../../../shared/img/monitor/buff_2.png)

![分组模式](../../../shared/img/monitor/buff_1.png)

### 分组模式

在 **{{ui:skillMonitor.buff.group.title}}** 中：

- **{{ui:skillMonitor.buff.group.new}}** / **{{ui:skillMonitor.buff.group.delete}}**，每组单独选择 Buff，或设为 **{{ui:skillMonitor.buff.group.monitorAll}}**；
- 一键为分组添加或移除食物、炼金分类；
- 每组可设置图标大小、行列数、间距，以及是否显示名称、剩余时间、层数；
- **{{ui:skillMonitor.buff.group.previewTitle}}** 可以先看效果。

### 无图标 Buff

没有图标的 Buff 以一行文字 + 进度条显示，可选 **{{ui:skillMonitor.buff.display.modernText}}** 或 **{{ui:skillMonitor.buff.display.classicText}}**，并限制最多显示几条。

### 按层数变化的 Buff

部分 Buff 的图标会随层数自动变化，例如青岚骑士的「追击身法」1 层显示单图标、2 层显示双图标，无需额外配置。

## 名称与图标

| 设置 | 作用 | 生效范围 |
| --- | --- | --- |
| **{{ui:skillMonitor.buff.alias.title}}** | 给名称不直观的 Buff 起别名，例如把「[热枕]」显示为「生命波动」 | 全局，不随方案切换 |
| **{{ui:skillMonitor.buff.icon.title}}** | 为 Buff 选择自定义图片作为图标 | 全局 |

Buff 别名同时用于 [因子区](./custom-panel.md#因子配置区) 中 Buff 效果的显示名。

来源为幻想的 Buff，在能识别幻想阶数时会显示为「名称 | n阶」。

## 组合 Buff

有些效果要几个 Buff 同时存在才算触发。在 **{{ui:skillMonitor.buff.composite.title}}** 中新建组合：填写名称，搜索并加入 2~8 个成员 Buff，设置 **{{ui:skillMonitor.buff.composite.condition}}**，还可以选一个成员的图标（不选则以文字显示）。

- **{{ui:skillMonitor.buff.composite.condition}}** 默认要求全部成员同时存在，也可以改为至少 k 个同时存在（k 可以是 1，即任意一个）；
- 组合持续到同时存在的成员少于所需数量为止。要求全部时，剩余时间就是最先结束的成员；例如 5 选 3、当前 4 个成员分别剩 10、8、6、4 秒时，组合剩 6 秒；
- 层数：要求全部时取成员中最小的层数；设置了至少 k 个时显示当前存在的成员数；
- 保存后，组合可以像普通 Buff 一样在本页、[自定义监控](./custom-panel.md)、[Buff 覆盖率](./buff-coverage.md)、倒计时告警和语音播报中搜索添加，搜索结果会标注「组合 Buff」；
- 监听组合不影响成员 Buff 自己的显示；
- 组合和别名一样是全局设置，不随方案导出。导入的方案如果引用了本机没有的组合，这些引用会被自动移除；删除组合时，也会从所有方案中移除对它的引用。

## 优先级

- **{{ui:skillMonitor.buff.priority.globalTitle}}**：独立模式下的显示先后；
- **{{ui:skillMonitor.buff.priority.groupTitle}}**：分组模式下每组内部的顺序。

## 倒计时告警

**{{ui:skillMonitor.buff.alert.title}}** 为某个 Buff 设置阈值：剩余时间 ≤ 设定秒数时用指定颜色高亮，可选**闪烁**。适合盯快要断掉的增益。

## 语音播报

在 **{{ui:skillMonitor.buff.voice.title}}** 区块中搜索已监控的 Buff 并添加规则，可选 **生效时 / 剩 x 秒 / 失效时** 三种事件，文案可以自动生成、自定义或引用短句库。详见 [语音播报](../voice/README.md#在功能页绑定播报)。

![Buff 语音播报配置](../../../shared/img/voice/voice_1.png)

## 常用 Buff 参考

可以直接在搜索框中输入下表的搜索名：

| 类型 | 幻想 | 搜索名 | Buff ID |
| --- | --- | --- | --- |
| 增益 | 山贼头目 | 山贼增伤 | 2110065 |
| 增益 | 塔塔 | 塔塔免死 | 2110061 |
| 增益 | 蒂娜 | 冷却缩减 | 2110034 |
| 增益 | 巴西利斯克 | 巴西增伤 | 2110125 |
| 增益 | 卡特格里夫 | 卡特增伤 | 2110140 |
| 幻想 CD | 卡特格里夫 | 卡特CD | 2110049 |
| 幻想 CD | 蒂娜 | 蒂娜CD | 2110056 |
| 幻想 CD | 塔塔 | 塔塔CD | 2110055 |
| 幻想 CD | 复活类 | 复活CD | 2110057 |
| 幻想 CD | 巴西利斯克 | 巴西CD | 2110050 |

挂在怪物身上的易伤、增伤（如蜂巢易伤、罗罗拉增伤）见 [怪物监控 · Buff 监控](../monster/buff.md#常用-debuff-参考)。

## 例

### 例：蒂娜 CD 转好时语音提醒

**场景**：你负责在队伍里交蒂娜，希望浮窗显示蒂娜的冷却，并且在 CD 结束时听到一句「蒂娜 CD 好了」，不用一直盯着看。

#### 第 1 步：监控蒂娜 CD Buff

施放蒂娜后，你身上会留下一个表示冷却的 Buff。

1. 打开 **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buff}}**。
2. 搜索 **蒂娜CD**（ID 2110056），加入已选 Buff。
3. 同时可以加入 **冷却缩减**（ID 2110034），看蒂娜给的增益是否还在。

#### 第 2 步：给它起个好认的名字（可选）

在 **{{ui:skillMonitor.buff.alias.title}}** 中搜索「蒂娜CD」，设置别名为「蒂娜」。

#### 第 3 步：快结束时高亮

在 **{{ui:skillMonitor.buff.alert.title}}** 中为它添加告警：剩余 ≤ 5 秒时高亮为绿色并闪烁，提醒你准备交。

#### 第 4 步：失效时语音提醒

1. 先确认 [语音播报](../voice/README.md) 已安装模型并 **{{ui:voice.overview.enabled}}**。
2. 回到 **{{ui:skillMonitor.tabs.buff}}**，展开 **{{ui:skillMonitor.buff.voice.title}}**，搜索并添加「蒂娜CD」。
3. 勾选 **失效时播报**，文案选 **自定义文本**，输入「蒂娜 CD 好了」。
4. 点 **试听**；提示待生成时，到 **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** 点击 **{{ui:voice.bindings.generateMissing}}**。

![Buff 语音播报配置](../../../shared/img/voice/voice_1.png)

用日语微调音色生成的效果示例：

<audio controls src="../../../shared/audio/voice/ja_01_tina_cd.wav"></audio>

> [!TIP]
> 想让播报带上蒂娜阶数？把文案写成「蒂娜${阶数}好了」，播报时会自动替换为「蒂娜5阶好了」，见 [语音播报 · 幻想阶数](../voice/playback.md#幻想阶数占位符)。
