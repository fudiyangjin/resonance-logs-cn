# Updates, tray and config recovery

## Auto update

When a new version is available, an **{{ui:updater.available}}** button appears at the bottom of the left sidebar; hover over it to see the new version number.

1. Click **{{ui:updater.available}}**. The app downloads the update silently in the background and shows the download progress on the button. You can keep using the app normally, including running dungeons.
2. When the download finishes, the app verifies and installs it, then restarts automatically.
3. If it fails partway, the button changes to **{{ui:updater.retry}}**; click it to try again.

Updating keeps all your loadouts, themes, voice and history. You can also download the installer from the [download page](https://github.com/fudiyangjin/resonance-logs-cn/releases/latest) at any time and install over the existing version; this doesn't lose data either, as long as you **don't delete the user settings folder**.

> [!TIP]
> Updating restarts the app, so it's best to click it between fights rather than in the middle of a Boss fight.

## System tray

By default, clicking the main window's close button only hides it to the tray in the bottom-right corner, and the overlays, statistics and voice keep working. Right-click the tray icon:

| Menu item | Effect |
| --- | --- |
| **Show Settings** | Reopens the main window |
| **Show Live Meter** | Shows the live DPS window |
| **Reset All Windows** | Restores all windows to their default position and size; use it when a window has gone off-screen |
| **Disable Clickthrough** | Turns off click-through on the DPS window so it can be dragged again |
| **Quit** | Fully quits the app |

If you want the close button to quit the app, turn on **{{ui:appSettings.behavior.exitOnClose}}** in **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}}**.

## Config recovery

If the monitor configuration file gets corrupted (for example due to a power loss while it was being written), the app automatically restores a usable state on startup and shows **{{ui:monitoring.recovery.noticeTitle}}**:

- The unreadable original configuration is kept in the recovery folder shown in the notice; it is not deleted.
- Other app settings are not affected.

If automatic recovery fails, **{{ui:monitoring.recovery.errorTitle}}** is shown. First click **{{ui:monitoring.recovery.reload}}**; if that still doesn't work, click **{{ui:monitoring.recovery.openLogs}}**, then use **{{ui:settings.debug.createDiagnosticsBundle}}** in **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.diagnostics}}** and attach it to your report.

> [!TIP]
> Regularly [exporting your loadouts](./loadouts.md#import-and-export) is the simplest way to back up. When you reinstall your system or change computers, just import them again.
