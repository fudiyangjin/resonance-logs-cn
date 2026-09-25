# 血量护盾区

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.shieldDetail}}** 用横条显示你当前的 HP 与护盾吸收量，适合坦克和依赖护盾的职业判断还能扛多少。

## 显示项

| 选项 | 内容 |
| --- | --- |
| **{{ui:skillMonitor.shieldDetail.showHpBar}}** | 当前生命值 |
| **{{ui:skillMonitor.shieldDetail.showTotalShieldBar}}** | 所有护盾的合计 |
| **{{ui:skillMonitor.shieldDetail.showShieldEntries}}** | 每一个护盾来源单独一行 |

## 条形样式

可以分别设置 **{{ui:skillMonitor.shieldDetail.hpColor}}**、**{{ui:skillMonitor.shieldDetail.shieldColor}}**、**{{ui:skillMonitor.shieldDetail.healShieldColor}}**（治疗溢出转化的护盾），以及条宽。

浮窗中是否显示这一区域，由 [启用窗口](./overlay.md) 中的 **血量护盾区** 控制。
