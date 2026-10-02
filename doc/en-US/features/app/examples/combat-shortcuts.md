# Adjust overlays in combat with shortcuts

Related page: [App Settings](../README.md)

**Scenario**: you play the game full-screen and don't want to switch back to the main window just to move an overlay or clear data. You want one key to reset the statistics before hitting a training dummy, one key to enter layout editing when an overlay blocks your view, and one key to collapse all windows when taking a screenshot.

## Step 1: Bind the shortcuts

Open **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.shortcuts}}**, click an item and press the key combination. Recommended:

| Action | Recommended keys |
| --- | --- |
| **{{ui:settings.shortcuts.resetEncounter}}** | `Ctrl+Shift+R` |
| **{{ui:settings.shortcuts.toggleClickthrough}}** | `Ctrl+Shift+C` |
| **{{ui:settings.shortcuts.toggleOverlayEdit}}** | `Ctrl+Shift+E` |
| **{{ui:settings.shortcuts.toggleMinimizeAll}}** | `Ctrl+Shift+H` |

If you bind the wrong key, just **right-click** the item to clear it.

## Step 2: Use them in the game

- **Before hitting a training dummy**: press `Ctrl+Shift+R` to clear the previous data.
- **Moving the DPS window**: press `Ctrl+Shift+C` to turn off click-through, drag it to the new position, then press again to restore click-through.
- **Moving the monitor overlays**: press `Ctrl+Shift+E` to enter layout editing, drag and resize each area, then press again to exit.
- **Taking a screenshot or tabbing out of the game**: press `Ctrl+Shift+H` to collapse the DPS window and all overlays, and press again to bring them back.

> [!WARNING]
> Don't bind keys the game already uses. `Ctrl+\` is the game's built-in hide-UI key; binding it here causes a conflict.

## If you can't find an overlay

If an overlay has been dragged off-screen or its size looks wrong, right-click the system tray icon and choose **Reset All Windows**. All windows return to their default positions; see [System tray](.././update.md#system-tray).
