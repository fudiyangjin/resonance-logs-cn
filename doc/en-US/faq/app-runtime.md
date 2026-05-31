# FAQ · App Runtime

## Install & Run

### How do I keep my settings? Will they be lost after an upgrade?

**Do not delete the user settings directory** when installing a new version—your settings will be preserved. If this update has no structural frontend changes, settings remain compatible automatically.

### First launch on 0.0.7 prompts to clean the database?

If you previously used 0.0.2 or 0.0.3, you must manually clean the old database when upgrading to 0.0.7 for the first time, or you may encounter issues:

1. Close the app
2. Delete `resonance-logs-cn.db` under `%LOCALAPPDATA%\resonance-logs-cn`
3. Restart the app

## Other

### Where are log files?

In **DPS Meter → Settings → Debug**, use **Open Logs** to open the log directory.

### How do I share my configured settings with someone else?

User config is stored under `%APPDATA%\com.resonance-logs-cn`. Zip that folder and send it to the other person; they extract it to the same path (with the app closed).

### How do I switch overlay windows?

In **DPS Meter → Settings → Shortcuts**, set a shortcut for **Toggle Overlay Window**.

## Packet Capture

### What do I need for packet capture? {#packet-capture}

The app now uses **Npcap** only for capture. Install [Npcap](https://npcap.com/) first, then go to **DPS Meter → Settings → Network** and select the correct network adapter.

See [Getting Started](../getting-started.md) for the full steps.

### No data / capture not working? {#no-data--capture-not-working}

1. Confirm the game is running
2. Confirm Npcap is installed and the correct interface is selected under **Network**
3. **Fully quit and restart the app** (required after changing the adapter)
4. Disable conflicting VPN, proxy, or other capture tools and try again
