# FAQ · Installation & Packet Capture

## Data capture

### No data / packets not captured?

Work through these in order:

1. Make sure the game is running and you've actually dealt damage.
2. Open **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.network}}** and check the capture method.
3. With **Npcap**: make sure Npcap is installed, and in **{{ui:settings.network.device}}** select the adapter that actually carries the game traffic — not a virtual adapter.
4. With **WinDivert**: make sure the app is running as administrator, and check whether a firewall or antivirus is blocking it (see the next question).
5. **Fully quit** the app (right-click the tray icon → **Quit**) and restart it. Changes to the capture method or adapter only take effect after a restart.
6. Turn off any VPN, proxy or other capture tool that might conflict, then try again.
7. If you opened the app while the game was already running, change zones once.

If it still doesn't work, use **{{ui:settings.debug.createDiagnosticsBundle}}** in **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.diagnostics}}** and attach the bundle to your report.

### WinDivert or Npcap?

| Method | Description |
| --- | --- |
| **WinDivert** | Built-in driver, no extra installation; requires administrator privileges and may be falsely flagged by antivirus software |
| **Npcap** | Requires installing [Npcap](https://npcap.com/) separately and selecting the correct adapter |

Try WinDivert first; switch to Npcap if it's blocked by security software or you need to pick a specific adapter. See [Getting Started](../getting-started/README.md#3-set-up-packet-capture) for the full steps.

### WinDivert is blocked by a firewall or antivirus?

WinDivert loads a network driver, and some security software treats this as risky behavior. The symptom is that no data ever shows up after launching the app.

1. Allow the app through Windows Firewall, or temporarily turn off the firewall to confirm whether it's the cause.
2. Check your antivirus quarantine and make sure `WinDivert.dll`, `WinDivert64.sys` and the app's install directory haven't been quarantined.
3. If you use Huorong (火绒), go to **Protection Center → Virus Protection → Trust Zone** (防护中心 → 病毒防护 → 信任区) and add the app's install directory to the trust list; if WinDivert files are already quarantined, restore them first and then add the trust entry.
4. Fully quit the app and restart it.
5. If it keeps getting quarantined, switch to Npcap.

![WinDivert blocked by Huorong](../../shared/img/faq/faq_1.png)

### Skill CDs, attributes or Buffs are incomplete?

The game only pushes data that **changes**. If you open the app while the game is already running, the app can't get the full state. **Change zones once** (teleport, enter/leave a dungeon, or switch channels) to fix it.

## Installation & configuration

### Will I lose my settings after upgrading?

No. Both in-app [automatic updates](../features/app/update.md#auto-update) and installing over the existing version keep all your loadouts, themes, voices and history, as long as you **don't delete the user settings directory**.

### How do I share my configuration with someone else?

In **{{ui:routes.tools.loadouts}}**, use **{{ui:loadout.page.exportButton}}** and send the resulting JSON file to the other person; they import it with **{{ui:loadout.page.importButton}}**. See [Example: Share a loadout with your teammates](../features/app/examples/share-loadout.md).

Appearance, shortcut and packet capture settings are local to your machine and are not shared with a loadout.

### Where are the log files?

**{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.diagnostics}} → {{ui:settings.debug.openLogs}}**.

### The app is still running after I click the close button?

By default the close button only hides the app to the system tray. Right-click the tray icon and choose **Quit** to fully exit. To make the close button quit directly, turn on **{{ui:appSettings.behavior.exitOnClose}}** in **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}}**.

### An overlay has moved off-screen?

Right-click the tray icon and choose **Reset All Windows**; all windows return to their default position and size.

### A message says the monitor config was automatically recovered?

When a monitor config file is corrupted, the app recovers it automatically and keeps the original file. See [Config recovery](../features/app/update.md#config-recovery) for details.

### Problems after upgrading from 0.0.2 / 0.0.3?

Only applies if you're upgrading from a very early version: close the app, delete `resonance-logs-cn.db` in the `%LOCALAPPDATA%\resonance-logs-cn` directory, then restart the app.
