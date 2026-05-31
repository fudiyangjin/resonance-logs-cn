# Getting Started

Follow these steps on first launch. See [App Runtime FAQ](./faq/app-runtime.md#packet-capture) for details.

## 1. Select your language

Open **DPS Meter → Settings → Language** and choose a language that **matches your game client** (English, Japanese, or Chinese). This ensures buff and skill names display correctly.

## 2. Install Npcap

This app uses **Npcap** to capture network traffic on Windows. Install [Npcap](https://npcap.com/) first (Windows 10 or later).

## 3. Select a network adapter

Go to **DPS Meter → Settings → Network** and pick the adapter that carries your game traffic under **Network Device**.

- Prefer your real Ethernet or Wi-Fi adapter
- Avoid Loopback, VirtualBox, VMware, and similar virtual adapters
- Temporarily disable VPN or proxy if capture fails

## 4. Restart the application

> **Important**: After changing the network adapter—or after selecting one for the first time—you **must fully quit and restart the app** before the new adapter takes effect. Saving settings alone is not enough; capture may still use the previous device or show no data.

## 5. Launch the game and verify

1. Restart this app (if you just changed the network adapter)
2. Launch the game and enter a combat-capable scene
3. Open the live window under **DPS Meter** and confirm damage data appears

If you still see no data, see [No data / capture not working?](./faq/app-runtime.md#no-data--capture-not-working).
