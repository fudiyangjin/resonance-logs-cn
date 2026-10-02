# 为输出职业找智力 + 暴击的最优组合

对应页面：[模组计算](../README.md)

**场景**：你是输出职业，背包里有 600 多个模组。你只关心两个输出属性，希望它们在 4 模组组合中都至少达到 16 点，在此基础上战力越高越好。

下面用「智力加持」和「暴击专注」举例，实际请换成你职业需要的属性。

## 第 1 步：刷新数据

切换一次场景后，打开 **{{ui:routes.tools.moduleCalc}}**，点击 **{{ui:moduleCalc.refresh}}**，确认 **{{ui:moduleCalc.dataStatus.title}}** 中的模组数量和背包一致。

## 第 2 步：缩小范围

1. **排除总值低的模组**：拖到 8 左右，观察「总值筛选后」的数量明显下降。
2. **目标属性**：选中智力加持和暴击专注，只计算带这两种属性的模组。
3. **{{ui:moduleCalc.filters.excludeAttributes}}**：把明显用不上的属性（例如特攻治疗加持、抵御物理）排除掉。

## 第 3 步：设置最小要求

在 **{{ui:moduleCalc.filters.minRequirements}}** 中：

1. 在第一行的下拉框（默认显示「{{ui:moduleCalc.filters.selectAttribute}}」）中选智力加持，右侧数值填 16。
2. 点 **{{ui:moduleCalc.filters.add}}**，再加一条暴击专注 ≥ 16。

## 第 4 步：计算并对比

1. **{{ui:moduleCalc.settings.moduleCount}}** 选 4 模组，点 **{{ui:moduleCalc.start}}**。
2. 在结果中点 **{{ui:moduleCalc.results.viewDetail}}**，对比前几名方案：得分接近时，优先选择第三个属性也较高的方案。

## 没有结果怎么办

提示 **{{ui:moduleCalc.error.noSolutions}}**，说明没有任何组合能同时满足条件。依次尝试：

- 把最小要求从 16 降到 12；
- 调低或取消「排除总值低的模组」；
- 取消目标属性，只保留最小要求。

> [!TIP]
> 找到满意的方案后，记下每个模组的属性，回到游戏中照着装备即可。
