# Getting Started

Follow this page and in about 5 minutes you'll go from installing the app to seeing your first combat data.

## 1. Install the app

Get the latest Windows x64 installer from the [download page](https://github.com/fudiyangjin/resonance-logs-cn/releases/latest) and install it.

- To upgrade, just install over the existing version. **Do not delete the user settings directory** — your loadouts, themes and history are all kept.
- Later versions can be updated in-app with one click; see [Updates, Tray & Config Recovery](../features/app/update.md).

After the first launch, you can switch the interface language in **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.general}}** (简体中文 / English / 日本語). We recommend matching your game client's language, since Buff and skill names switch along with it.

![main window after first launch, with the left toolbar highlighted](../../shared/img/start/start_1.en-US.png)

## 2. Pick a starter loadout

The first time you open the app, **{{ui:loadout.firstRun.title}}** pops up. If your class spec is in the list (e.g. Radiant Shield, Recovery, Block, Earthfort, Smite, Lifebind, Vanguard, Concerto), just select it to get a complete, ready-made set of skill CD, Buff, Monster Monitor and DPS settings. Otherwise click **{{ui:loadout.firstRun.skip}}** and build your own later in [Loadouts](../features/app/loadouts.md).

![the "Pick a starter loadout" dialog on first launch](../../shared/img/start/start_2.en-US.png)

## 3. Set up packet capture

The app tracks combat by reading the game's network traffic, so you need to choose a capture method first. Open **{{ui:routes.tools.appSettings}} → {{ui:appSettings.tabs.network}}** and pick one:

| Method | Preparation | Best for |
| --- | --- | --- |
| **WinDivert** (try this first) | Nothing extra to install; run the app as administrator | Most users |
| **Npcap** | Install [Npcap](https://npcap.com/) and select your network adapter under **Network Device** | When WinDivert is blocked by security software, or you need to pick a specific adapter |

With Npcap, select the Ethernet or Wi-Fi adapter that actually carries the game traffic — not Loopback, VirtualBox, VMware or other virtual adapters. If you use a game accelerator or VPN, first check which adapter the game traffic actually goes through.

> [!WARNING]
> After changing the capture method or adapter, you must **fully quit and restart** the app for it to take effect. Clicking the main window's close button only hides it to the system tray by default; right-click the tray icon in the bottom-right corner, choose **Quit**, then open the app again.

![App Settings → Network page](../../shared/img/start/start_3.en-US.png)

## 4. Verify your first combat data

1. Launch the game and go somewhere you can fight (for example, the training dummies in the training ground).
2. Deal some damage. The **Live DPS window** appears on screen showing your name and damage.
3. If you opened the app while the game was already running, **change zones once** (teleport, enter/leave a dungeon, or switch channels) so the game resends your full character data.

![Live DPS window](../../shared/img/dps/dps_1.png)

If you see data, everything is ready. If not, work through [No data / packets not captured?](../faq/app-runtime.md#no-data--packets-not-captured) step by step.

> [!TIP]
> The game only pushes data that **changes**. Whenever skill CDs, character attributes or Buffs look incomplete, change zones once — that usually fixes it.

## 5. What's next

| I want to… | Go to |
| --- | --- |
| Understand the DPS window and review a fight | [DPS Meter](../features/dps/README.md) |
| Show my own skill CDs, Buffs and factors on screen | [Live Monitor](../features/monitor/README.md) |
| Watch Debuffs, threat and mechanic countdowns on the Boss | [Monster Monitor](../features/monster/README.md) |
| See positioning and target callouts in dungeons | [Dungeon Mechanics](../features/minimap/README.md) |
| Get voice reminders for key events | [Voice Announcements](../features/voice/README.md) |
| Calculate the best module combination | [Module Calculator](../features/module-calc/README.md) |
| Save / switch / share a complete setup | [Loadouts](../features/app/loadouts.md) |

If you're not familiar with the interface yet, read the [Interface Tour](./interface.md) first, or just follow [Example: Preparing for your first dungeon](#example-preparing-for-your-first-dungeon).

## Examples

### Example: Preparing for your first dungeon

**Scenario**: You've just installed the app and tonight you're running a Master dungeon with your static. You want to see party DPS, your own skill CDs and the Boss's mechanics, and be able to review the run afterwards.

This example assumes you've already completed the [packet capture setup](#3-set-up-packet-capture) above and can see the Live DPS window.

#### Step 1: Apply a preset loadout

1. Open **{{ui:routes.tools.loadouts}}**.
2. In **{{ui:loadout.page.presetsTitle}}**, find your spec (for example "Verdant Oracle · Lifebind") and click to apply it.
3. Once applied, the loadout is automatically linked to that spec; from then on, switching to this spec enables this setup automatically.

If your spec isn't there, no problem — create a blank loadout first and add things manually in the following steps.

#### Step 2: Turn on the skill CD and Buff overlay

1. Open **{{ui:routes.tools.skillMonitor}}** and make sure **{{ui:skillMonitor.main.enabled.label}}** at the top of the page is on.
2. In **{{ui:skillMonitor.tabs.skillCd}}**, tick the few skills you care about most (up to 10).
3. In **{{ui:skillMonitor.tabs.buff}}**, search for and add your own burst Buffs.
4. Click **{{ui:skillMonitor.layout.editOverlayLayout}}**, drag the overlay to a spot near your character where you can see it out of the corner of your eye, then click Done.

See [Skill CD](../features/monitor/skill-cd.md) and [Buff Monitor](../features/monitor/buff.md) for details.

#### Step 3: Turn on the monster overlay and Dungeon Mechanics

1. Open **{{ui:routes.tools.monsterMonitor}}** and turn on **{{ui:monsterMonitor.enabled}}**.
2. In **{{ui:monsterMonitor.tabs.overlay}}**, turn on the **Boss DBM area** (off by default). A warning bar pops up when the Boss starts a cast.
3. If this dungeon is on the [Supported Dungeons](../features/minimap/dungeons.md) list, also go to **{{ui:routes.tools.minimap}}** and turn on **{{ui:minimap.settings.enabled.label}}**.

#### Step 4: Check the DPS window layout

- If screen space is tight, switch to the "Small" size preset in **{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}}**, or turn on [Compact mode](../features/dps/themes.md#compact-mode).
- To make the window transparent, see [Example: A transparent, minimal DPS window](../features/dps/themes.md#example-a-transparent-minimal-dps-window).

#### Step 5: Change zones once before entering

If you opened the app while the game was already running, teleport somewhere before entering the dungeon so skill CDs, attributes and factors get fully synced.

#### After the run

- Each Boss is saved automatically as a history entry; view them in **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}**.
- To find where your damage dropped off, follow [Example: Find damage gaps with the timeline](../features/dps/history.md#example-find-dps-gaps-with-the-timeline).
- If you like this setup, you can [export it and share it with your teammates](../features/app/loadouts.md#example-share-a-loadout-with-teammates).
