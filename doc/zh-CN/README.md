# Resonance Logs CN 使用文档

Resonance Logs CN 是《星痕共鸣》的战斗辅助工具：统计伤害与治疗、监控技能 CD 和 Buff、预警 Boss 机制、用语音提醒关键时机，并帮你计算模组搭配。

> [!TIP]
> 第一次使用？从 [快速入门](./getting-started/README.md) 开始。跟着 [例：第一次打本前的准备](./getting-started/examples/first-dungeon.md) 走一遍，10 分钟就能上手。

## 开始使用

| 文档 | 你能了解到 |
| --- | --- |
| [快速入门](./getting-started/README.md) | 安装、设置抓包方式、确认有数据 |
| [界面导览](./getting-started/interface.md) | 主窗口各页面和浮窗分别做什么 |

## 我想……

| 场景 | 看这里 |
| --- | --- |
| 看队伍里每个人打了多少伤害 | [DPS 检测](./features/dps/README.md) |
| 打桩测一轮固定时长的输出 | [例：用打桩模式测一轮 3 分钟输出](./features/dps/examples/dummy-rotation.md) |
| 战斗结束后复盘输出空窗 | [例：用时间轴找出输出空窗](./features/dps/examples/timeline-gaps.md) |
| 在屏幕上看自己的技能 CD 和 Buff | [实时监控](./features/monitor/README.md) |
| 在屏幕上看自己技能打出的伤害数字 | [技能伤害显示](./features/skill-damage/README.md) |
| 自动显示因子能量与赛季节点 | [例：自动显示因子能量与赛季节点](./features/monitor/examples/factor-energy.md) |
| 盯住 Boss 身上的易伤、看 Boss 读条 | [怪物监控](./features/monster/README.md) |
| 看队友的大招、减伤什么时候转好 | [队友 CD](./features/monster/teammate-cd.md) |
| 团本里看机制站位 | [副本机制](./features/minimap/README.md) |
| 技能转好、Boss 放大招时听到语音 | [语音播报](./features/voice/README.md) |
| 从一堆模组里找出最优组合 | [模组计算](./features/module-calc/README.md) |
| 换职业时自动切换整套配置 | [例：切专精时自动换方案](./features/app/examples/spec-loadout.md) |

## 功能文档

### DPS 检测

| 文档 | 说明 | 例 |
| --- | --- | --- |
| [DPS 检测](./features/dps/README.md) | 实时统计、打桩模式、战斗切分与重置 | [打桩测输出](./features/dps/examples/dummy-rotation.md) |
| [历史记录](./features/dps/history.md) | 历史列表、技能明细、时间轴 | [时间轴复盘](./features/dps/examples/timeline-gaps.md) · [实时窗口看覆盖率](./features/dps/examples/live-buff-coverage.md) |
| [挑战监控](./features/dps/challenge.md) | 挑战本的受击与失误统计 | [挑战本受击](./features/dps/examples/challenge-hits.md) |
| [主题与外观](./features/dps/themes.md) | 配色、透明度、标题栏、紧凑模式 | [极简透明窗口](./features/dps/examples/transparent-window.md) · [自由布局与死亡回放](./features/dps/examples/header-death.md) · [推荐样式](./features/dps/examples/recommended-style.md) |
| [显示设置](./features/dps/settings.md) | 实时和历史表格的列设置 | [修改展示列](./features/dps/examples/table-columns.md) |

### 实时监控

| 文档 | 说明 | 例 |
| --- | --- | --- |
| [实时监控](./features/monitor/README.md) | 功能总览与使用流程 | — |
| [技能 CD](./features/monitor/skill-cd.md) | 选择要监控的技能 | [技能分区摆放](./features/monitor/examples/skill-cd-regions.md) |
| [Buff 监控](./features/monitor/buff.md) | 精确监控、分类快捷监听、别名 | [蒂娜 CD 语音提醒](./features/monitor/examples/tina-cd.md) · [组合 Buff 监控](./features/monitor/examples/attribute-symphony.md) · [最急成员](./features/monitor/examples/symphony-most-urgent.md) |
| [Buff 覆盖率](./features/monitor/buff-coverage.md) | 统计增益在战斗中的覆盖时间 | [覆盖率复盘](./features/monitor/examples/buff-coverage.md) · [实时窗口看覆盖率](./features/dps/examples/live-buff-coverage.md) |
| [角色面板](./features/monitor/panel-attr.md) | 实时显示属性 | [爆发期看属性](./features/monitor/examples/burst-attributes.md) |
| [血量护盾区](./features/monitor/shield.md) | 自身血量与护盾 | [坦克看护盾](./features/monitor/examples/tank-shield.md) |
| [自定义监控](./features/monitor/custom-panel.md) | 普通区、因子配置区、赛季节点区、计数器 | [因子区](./features/monitor/examples/factor-energy.md) · [预设计数器](./features/monitor/examples/preset-counter.md) |
| [启用窗口与布局](./features/monitor/overlay.md) | 浮窗区域开关与布局编辑 | [资源分区与愈合三花](./features/monitor/examples/resource-bar.md) |

### 怪物监控

| 文档 | 说明 | 例 |
| --- | --- | --- |
| [怪物监控](./features/monster/README.md) | 功能总览，与实时监控的区别 | — |
| [目标 Buff](./features/monster/buff.md) | 目标身上的 Buff 与告警 | [盯易伤](./features/monster/examples/vulnerability.md) · [罗罗拉增伤](./features/monster/examples/lorola.md) |
| [队友 Buff](./features/monster/teammate.md) | 队友身上的 Buff | [确认全队增益](./features/monster/examples/team-buffs.md) |
| [队友 CD](./features/monster/teammate-cd.md) | 队友共享过来的技能冷却 | [队伍栏旁看减伤](./features/monster/examples/teammate-cd-slots.md) |
| [韧性、生命与队友幻想](./features/monster/status.md) | 目标状态条 | [卡破防爆发](./features/monster/examples/break-burst.md) |
| [仇恨列表](./features/monster/hate.md) | 目标的仇恨排行 | [避免 OT](./features/monster/examples/avoid-ot.md) |
| [战斗名单](./features/monster/roster.md) | 所有交战怪物的血量、坦克视角、屏蔽机制怪 | [看清全场血量](./features/monster/examples/roster-pull.md) |
| [Boss DBM](./features/monster/boss-dbm.md) | Boss 技能预警条 | [Boss 技能语音预警](./features/monster/examples/boss-alias.md) |
| [实体持续](./features/monster/entity-duration.md) | 召唤物等实体的存在时间 | [镰车剩余时间](./features/monster/examples/scythe-cart.md) |
| [怪物技能](./features/monster/monster-skill.md) | 附近怪物释放指定技能时显示 | [精英怪读条提醒](./features/monster/examples/elite-cast-warning.md) |
| [启用窗口](./features/monster/overlay.md) | 怪物浮窗各区域开关 | [按职责摆遮罩](./features/monster/examples/tank-overlay.md) |

### 技能伤害显示

| 文档 | 说明 | 例 |
| --- | --- | --- |
| [技能伤害显示](./features/skill-damage/README.md) | 在游戏层上显示自己指定技能的伤害数字 | [大招伤害数字](./features/skill-damage/examples/burst-numbers.md) · [寒冰射线总伤害](./features/skill-damage/examples/frost-ray-total.md) |

### 副本机制

| 文档 | 说明 | 例 |
| --- | --- | --- |
| [副本机制](./features/minimap/README.md) | 小地图浮窗、显示选项、机制语音 | [团本开荒前的小地图设置](./features/minimap/examples/raid-setup.md) |
| [已支持副本](./features/minimap/dungeons.md) | 各副本的机制说明 | — |

### 语音播报

| 文档 | 说明 | 例 |
| --- | --- | --- |
| [语音播报](./features/voice/README.md) | 快速开始、在功能页绑定播报 | [Buff 语音播报生成](./features/voice/examples/buff-voice.md) |
| [音色与短句](./features/voice/voices.md) | 预置、克隆、微调音色，导入音频，HTTP 语音服务 | [自定义音效](./features/voice/examples/custom-sfx.md) · [音色克隆与音频导入](./features/voice/examples/clone-import.md) · [Fish Audio 在线音色](./features/voice/examples/http-fish-audio.md) |
| [播放与提醒](./features/voice/playback.md) | 音量、优先级、占位符、匹配提醒 | [匹配成功提醒](./features/voice/examples/match-found.md) |

### 模组计算

| 文档 | 说明 | 例 |
| --- | --- | --- |
| [模组计算](./features/module-calc/README.md) | 读取模组、计算最优组合、筛选 | [找智力 + 暴击的最优组合](./features/module-calc/examples/intellect-crit.md) |

### 应用与方案

| 文档 | 说明 | 例 |
| --- | --- | --- |
| [应用设置](./features/app/README.md) | 通用、外观、网络、快捷键、诊断 | [战斗中用快捷键](./features/app/examples/combat-shortcuts.md) |
| [监控方案](./features/app/loadouts.md) | 方案管理、按专精切换、导入导出 | [切专精换方案](./features/app/examples/spec-loadout.md) · [分享方案](./features/app/examples/share-loadout.md) |
| [更新、托盘与配置恢复](./features/app/update.md) | 自动更新、托盘菜单、配置恢复 | — |

## 常见问题与更新

| 文档 | 说明 |
| --- | --- |
| [常见问题](./faq.md) | 按功能分类的问题解答 |
| [版本更新](./changelog/README.md) | 各版本的更新说明 |
