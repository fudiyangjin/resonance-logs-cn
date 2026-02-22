# Changelog v0.0.4

## Logs

**buff 相关**

- 支持 buff 分组展示, 监听所有 buff , buff 优先级排序
- 移除天赋关联 buff 的逻辑, 手动拼接 buff_name 进行连接(若监听天赋类 buff, 需要重新设置)
- 区分用户选择和默认监听项, 避免多余展示, 仅展示用户选择的
- 重置不清理 buff 相关设置, 避免 buff 显示的中断和无法继续显示

**dps 相关**

- 重构多处, 简化处理
- 重构 sqlite 整体操作逻辑, 由于修改删除了多个表, 需要清理 `%LOCALAPPDATA%\resonance-logs-cn` 目录下的 `resonance-logs-cn.db` 再重新启动应用
- 增加解析副本信息相关包, 基于目标的转换和团灭 buff 进行主要重置. 在相同场景时, 会延迟重置(道中清完小怪->到达 boss 后,攻击 boss 后自动重置; 大师本团灭->下一次攻击 boss 后自动重置)
- 历史数据增加展示每个目标的 dps 分布. 治疗单角色除展示治疗技能分布外额外展示对队友的治疗量分布
- 进一步展示每个技能的伤害 id 组成
- 修复前端隐藏名称, 显示职业专精等功能
- 修复字体设置

## 注意

- 如果之前使用过 0.0.2/0.0.3 第一次使用 0.0.4 需要清理 `%LOCALAPPDATA%\resonance-logs-cn` 目录下的 `resonance-logs-cn.db` 再重新启动应用
- 若监听天赋类 buff, 需要重新设置

## 特别感谢

- 感谢 YozoraHoshi 提供的 `RecountTable.json` 翻译版本
- 感谢 nekoyama32767 提供的监听所有 buff 接口

## 群号

1084866292
