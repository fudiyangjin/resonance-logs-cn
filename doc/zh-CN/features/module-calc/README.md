# 模组计算

背包里的模组越攒越多，手动挑 4 个或 5 个很难算清楚哪套最好。**{{ui:routes.tools.moduleCalc}}** 读取你身上的全部模组，枚举所有组合，按战力评分给出最优的前几套方案。

## 准备数据

模组数据来自游戏下发的完整角色数据，不需要手动录入：

1. 启动应用后登录游戏，或者**切换一次场景**，让游戏重新下发角色数据。
2. 打开 **{{ui:routes.tools.moduleCalc}}**，点击 **{{ui:moduleCalc.refresh}}**。
3. **{{ui:moduleCalc.dataStatus.title}}** 中显示模组数量，说明读取成功。

获得新模组或者分解了模组之后，切一次场景再刷新即可。

## 计算最优组合

1. 在 **{{ui:moduleCalc.settings.title}}** 中选择 **{{ui:moduleCalc.settings.moduleCount}}**：4 模组或 5 模组，与你当前能装备的槽位数一致。
2. 按需设置筛选条件（见下文）。什么都不设也可以，会在所有模组中找战力最高的组合。
3. 点击 **{{ui:moduleCalc.start}}**，等待进度条完成。
4. **计算结果** 中按 **{{ui:moduleCalc.results.score}}** 从高到低列出方案，点 **{{ui:moduleCalc.results.viewDetail}}** 查看每个模组的品质、属性和属性总值。

### 评分怎么算

方案得分对应模组组合带来的战力，主要看两部分：

- **各属性的等级**：组合中同一属性的数值相加，达到 1 / 4 / 8 / 12 / 16 / 20 点时分别升到 1～6 级。等级越高战力越多，名称带「极-」的特殊属性（如极-伤害叠加）比基础属性的收益更高。
- **属性总值**：所有属性的数值总和。

所以通常把少数几个属性堆到高阈值（例如 16 或 20）比把点数平摊到很多属性更划算。

## 筛选设置

| 设置 | 作用 | 什么时候用 |
| --- | --- | --- |
| **排除总值低的模组** | 属性总值低于设定值的模组不参与计算 | 模组很多、计算慢时，先排除明显的垃圾模组 |
| **目标属性** | 只计算带有所选属性的模组 | 你只想要某几种属性；模组超过 1000 个时也建议先用它缩小范围 |
| **{{ui:moduleCalc.filters.excludeAttributes}}** | 带有所选属性的模组不参与计算 | 某些属性对你的职业完全没用 |
| **{{ui:moduleCalc.filters.minRequirements}}** | 方案中某属性的合计值必须达到设定值 | 你需要某个属性至少达到某个等级，例如合计 ≥ 16 |

**{{ui:moduleCalc.dataStatus.title}}** 会同时显示总模组数和按总值筛选后的数量，调节时可以参考。

> [!TIP]
> 最小属性要求比目标属性更精确：目标属性只保证「模组上带这个属性」，最小属性要求保证「整套加起来够数」。两者可以一起用。

## GPU 加速

模组多、选 5 模组时，组合数量会非常大。**{{ui:moduleCalc.settings.gpuAcceleration}}** 会显示 **{{ui:moduleCalc.settings.cuda}}** 和 **{{ui:moduleCalc.settings.opencl}}** 是否 **{{ui:moduleCalc.settings.available}}**：

- NVIDIA 显卡通常可以使用 CUDA；其他显卡可以使用 OpenCL。
- 都不可用时自动使用 CPU 计算，结果相同，只是更慢。

## 例

### 例：为输出职业找智力 + 暴击的最优组合

**场景**：你是输出职业，背包里有 600 多个模组。你只关心两个输出属性，希望它们在 4 模组组合中都至少达到 16 点，在此基础上战力越高越好。

下面用「智力加持」和「暴击专注」举例，实际请换成你职业需要的属性。

#### 第 1 步：刷新数据

切换一次场景后，打开 **{{ui:routes.tools.moduleCalc}}**，点击 **{{ui:moduleCalc.refresh}}**，确认 **{{ui:moduleCalc.dataStatus.title}}** 中的模组数量和背包一致。

#### 第 2 步：缩小范围

1. **排除总值低的模组**：拖到 8 左右，观察「总值筛选后」的数量明显下降。
2. **目标属性**：选中智力加持和暴击专注，只计算带这两种属性的模组。
3. **{{ui:moduleCalc.filters.excludeAttributes}}**：把明显用不上的属性（例如特攻治疗加持、抵御物理）排除掉。

#### 第 3 步：设置最小要求

在 **{{ui:moduleCalc.filters.minRequirements}}** 中：

1. 在第一行的下拉框（默认显示「{{ui:moduleCalc.filters.selectAttribute}}」）中选智力加持，右侧数值填 16。
2. 点 **{{ui:moduleCalc.filters.add}}**，再加一条暴击专注 ≥ 16。

#### 第 4 步：计算并对比

1. **{{ui:moduleCalc.settings.moduleCount}}** 选 4 模组，点 **{{ui:moduleCalc.start}}**。
2. 在结果中点 **{{ui:moduleCalc.results.viewDetail}}**，对比前几名方案：得分接近时，优先选择第三个属性也较高的方案。

#### 没有结果怎么办

提示 **{{ui:moduleCalc.error.noSolutions}}**，说明没有任何组合能同时满足条件。依次尝试：

- 把最小要求从 16 降到 12；
- 调低或取消「排除总值低的模组」；
- 取消目标属性，只保留最小要求。

> [!TIP]
> 找到满意的方案后，记下每个模组的属性，回到游戏中照着装备即可。

## 常见问题

遇到读取失败、没有方案等问题，见 [常见问题 · 模组计算](../../faq/module-calc.md)。
