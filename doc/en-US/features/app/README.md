# App Settings

**{{ui:routes.tools.appSettings}}** gathers the global settings that aren't tied to any particular feature: language, main window appearance, packet capture, shortcuts and diagnostic tools. These settings are saved on this computer and are **not exported or shared with loadouts**.

| Tab | Contents |
| --- | --- |
| [{{ui:appSettings.tabs.general}}](#general) | UI language, close button behavior |
| [{{ui:appSettings.tabs.appearance}}](#appearance) | Main window colors, background image, fonts |
| [{{ui:appSettings.tabs.network}}](#network) | Capture method and network adapter |
| [{{ui:appSettings.tabs.shortcuts}}](#shortcuts) | Global shortcuts |
| [{{ui:appSettings.tabs.diagnostics}}](#diagnostics) | Logs and the diagnostics bundle |

## General

- **{{ui:appSettings.language.title}}**: 简体中文 / English / 日本語. It's best to match your game client. Buff and skill names switch along with it, and the preset voice is also chosen by the UI language.
- **{{ui:appSettings.behavior.exitOnClose}}**: off by default, so clicking the main window's close button only hides it to the system tray while the overlays and voice keep working. When it is on, the close button quits the app.

## Appearance

These settings only affect the **main window**. The DPS window's colors and layout are set separately in [Themes and appearance](../dps/themes.md).

- **{{ui:themes.presets.colorTitle}}**: choose a preset color scheme, or adjust each color and its opacity in **{{ui:themes.section.customColorTheme}}**.
- **{{ui:themes.background.title}}**: use a PNG / JPG / WebP image as the background, with adjustable **{{ui:themes.background.opacity}}** and **{{ui:themes.background.imageMode}}** (**{{ui:themes.background.imageMode.cover}}** or **{{ui:themes.background.imageMode.contain}}**; with Contain you can also set **{{ui:themes.background.fillColor}}**).
- **{{ui:themes.fonts.title}}**: import .woff2 / .woff / .ttf / .otf fonts to replace the **{{ui:themes.fonts.sansTitle}}** and the **{{ui:themes.fonts.monoTitle}}** separately. When **{{ui:themes.fonts.applyToOverlay}}** is on, the skill, monster and minimap overlays also use the custom sans-serif font.

## Network

Choose a capture method: **WinDivert** (no extra installation needed; try it first) or **Npcap** (requires installing [Npcap](https://npcap.com/) and selecting the network adapter that carries the game traffic in **{{ui:settings.network.device}}**). For details, see [Getting Started · Set up packet capture](../../getting-started/README.md#3-set-up-packet-capture).

> [!WARNING]
> After changing the capture method or network adapter, you must **fully quit** the app (right-click the tray icon → **Quit**) and start it again for the change to take effect.

## Shortcuts

Bind global shortcuts to common actions; they work even while you are in the game. Click an item and press the key combination you want; **right-click** it to clear.

| Action | Purpose |
| --- | --- |
| **{{ui:settings.shortcuts.toggleLiveMeter}}** / **{{ui:settings.shortcuts.showLiveMeter}}** / **{{ui:settings.shortcuts.hideLiveMeter}}** | Show or hide the live DPS window |
| **{{ui:settings.shortcuts.toggleClickthrough}}** / **{{ui:settings.shortcuts.enableClickthrough}}** / **{{ui:settings.shortcuts.disableClickthrough}}** | Toggle whether the DPS window can be clicked with the mouse |
| **{{ui:settings.shortcuts.resetEncounter}}** | Clear the current combat data and start counting again |
| **{{ui:settings.shortcuts.togglePauseEncounter}}** | Pause / resume counting |
| **{{ui:settings.shortcuts.toggleBossHp}}** | Show or hide Boss HP in the DPS window |
| **{{ui:settings.shortcuts.toggleOverlayWindow}}** | Turn the Live Monitor overlay on or off |
| **{{ui:settings.shortcuts.toggleOverlayEdit}}** | Enter / exit the overlay's layout edit mode |
| **{{ui:settings.shortcuts.toggleMinimizeAll}}** | Collapse or restore the DPS window and all overlays in one go; handy when switching screens or taking screenshots |

For recommended bindings, see [Example: Adjust overlays in combat with shortcuts](#example-adjust-overlays-in-combat-with-shortcuts).

> [!TIP]
> Avoid keys that conflict with the game. For example, `Ctrl+\` is the game's built-in hide-UI key, so don't bind it here.

## Diagnostics

- **{{ui:settings.debug.openLogs}}**: opens the folder containing the log files.
- **{{ui:settings.debug.createDiagnosticsBundle}}**: packs the logs and the necessary configuration into a single Zip file. Attaching it when you report a problem greatly speeds up troubleshooting.

## Examples

### Example: Adjust overlays in combat with shortcuts

**Scenario**: you play the game full-screen and don't want to switch back to the main window just to move an overlay or clear data. You want one key to reset the statistics before hitting a training dummy, one key to enter layout editing when an overlay blocks your view, and one key to collapse all windows when taking a screenshot.

#### Step 1: Bind the shortcuts

Open **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.shortcuts}}**, click an item and press the key combination. Recommended:

| Action | Recommended keys |
| --- | --- |
| **{{ui:settings.shortcuts.resetEncounter}}** | `Ctrl+Shift+R` |
| **{{ui:settings.shortcuts.toggleClickthrough}}** | `Ctrl+Shift+C` |
| **{{ui:settings.shortcuts.toggleOverlayEdit}}** | `Ctrl+Shift+E` |
| **{{ui:settings.shortcuts.toggleMinimizeAll}}** | `Ctrl+Shift+H` |

If you bind the wrong key, just **right-click** the item to clear it.

#### Step 2: Use them in the game

- **Before hitting a training dummy**: press `Ctrl+Shift+R` to clear the previous data.
- **Moving the DPS window**: press `Ctrl+Shift+C` to turn off click-through, drag it to the new position, then press again to restore click-through.
- **Moving the monitor overlays**: press `Ctrl+Shift+E` to enter layout editing, drag and resize each area, then press again to exit.
- **Taking a screenshot or tabbing out of the game**: press `Ctrl+Shift+H` to collapse the DPS window and all overlays, and press again to bring them back.

> [!WARNING]
> Don't bind keys the game already uses. `Ctrl+\` is the game's built-in hide-UI key; binding it here causes a conflict.

#### If you can't find an overlay

If an overlay has been dragged off-screen or its size looks wrong, right-click the system tray icon and choose **Reset All Windows**. All windows return to their default positions; see [System tray](./update.md#system-tray).

## Related pages

- [Loadouts](./loadouts.md): save, switch and share complete monitor configurations.
- [Updates, tray and config recovery](./update.md)
