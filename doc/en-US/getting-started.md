# Getting Started

Follow these steps to see your first combat data. This guide applies to the current release; see the [App Runtime FAQ](./faq/app-runtime.md) for older-version migrations.

## 1. Download and install

Install the latest Resonance Logs CN release for Windows x64. Keep your user settings directory when upgrading. Choose the language matching your game client in **DPS Meter → Settings → Language**.

## 2. Choose a capture method

Open **DPS Meter → Settings → Network**. Choose one of the two supported methods.

| Method | Preparation | When to use |
| --- | --- | --- |
| WinDivert | Built-in driver; run the app as administrator | No separate Npcap installation |
| Npcap | Install [Npcap](https://npcap.com/) and select an adapter | Capture on a specific adapter, or when WinDivert is unavailable |

## 3. Configure capture

**WinDivert**: select this method and run the app as administrator. If the driver is blocked, consult the [capture troubleshooting guide](./faq/app-runtime.md).

**Npcap**: under **Network Device**, choose the real Ethernet or Wi-Fi adapter carrying game traffic. Avoid Loopback, VirtualBox and VMware adapters. If using a VPN or proxy, check which adapter actually carries the traffic.

## 4. Fully quit and restart

> **Important**: changing the capture method or network adapter requires a full restart. Closing the main window may only hide it to the system tray; exit from the tray before restarting.

## 5. Verify combat data

1. Start the game and enter an area where you can fight.
2. Open the **DPS Meter** live window and attack a target.
3. Confirm that your character and damage appear. If you started the app mid-session, change zone once to synchronize state.

## 6. Troubleshoot missing data

Check that the game is running, the correct capture method is selected, the driver or adapter is configured, and the app has restarted. See the [App Runtime FAQ](./faq/app-runtime.md) for the full checklist.
