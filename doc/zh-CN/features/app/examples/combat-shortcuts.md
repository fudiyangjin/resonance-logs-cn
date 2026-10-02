# 用快捷键在战斗中调整浮窗

对应页面：[应用设置](../README.md)

**场景**：你全屏玩游戏，不想为了挪浮窗或清空数据切回主窗口。你希望打木桩前一键重置统计，发现浮窗挡视线时一键进入编辑布局，截图时一键收起所有窗口。

## 第 1 步：绑定快捷键

打开 **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.shortcuts}}**，点击某一项后按下组合键。推荐：

| 操作 | 推荐按键 |
| --- | --- |
| **{{ui:settings.shortcuts.resetEncounter}}** | `Ctrl+Shift+R` |
| **{{ui:settings.shortcuts.toggleClickthrough}}** | `Ctrl+Shift+C` |
| **{{ui:settings.shortcuts.toggleOverlayEdit}}** | `Ctrl+Shift+E` |
| **{{ui:settings.shortcuts.toggleMinimizeAll}}** | `Ctrl+Shift+H` |

绑错了**右键**该项即可清除。

## 第 2 步：在游戏中使用

- **打木桩前**：按 `Ctrl+Shift+R` 清空上一次的数据。
- **挪 DPS 窗口**：按 `Ctrl+Shift+C` 关闭点击穿透，拖到新位置后再按一次，恢复穿透。
- **挪监控浮窗**：按 `Ctrl+Shift+E` 进入编辑布局，拖动、缩放各个区域，再按一次退出。
- **截图或切出游戏**：按 `Ctrl+Shift+H` 收起 DPS 窗口和所有遮罩，再按一次弹出。

> [!WARNING]
> 不要绑定游戏已经使用的按键。`Ctrl+\` 是游戏自带的隐藏 UI 键，绑定后会互相冲突。

## 如果浮窗找不到了

浮窗被拖出屏幕或者尺寸异常时，右键系统托盘图标选择 **Reset All Windows**，所有窗口会回到默认位置，见 [系统托盘](.././update.md#系统托盘)。
