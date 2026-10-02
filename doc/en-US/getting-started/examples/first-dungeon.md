# Preparing for your first dungeon

Related page: [Getting Started](../README.md)

**Scenario**: You've just installed the app and tonight you're running a Master dungeon with your static. You want to see party DPS, your own skill CDs and the Boss's mechanics, and be able to review the run afterwards.

This example assumes you've already completed the [packet capture setup](../README.md#3-set-up-packet-capture) above and can see the Live DPS window.

## Step 1: Apply a preset loadout

1. Open **{{ui:routes.tools.loadouts}}**.
2. In **{{ui:loadout.page.presetsTitle}}**, find your spec (for example "Verdant Oracle · Lifebind") and click to apply it.
3. Once applied, the loadout is automatically linked to that spec; from then on, switching to this spec enables this setup automatically.

If your spec isn't there, no problem — create a blank loadout first and add things manually in the following steps.

## Step 2: Turn on the skill CD and Buff overlay

1. Open **{{ui:routes.tools.skillMonitor}}** and make sure **{{ui:skillMonitor.main.enabled.label}}** at the top of the page is on.
2. In **{{ui:skillMonitor.tabs.skillCd}}**, tick the few skills you care about most (up to 10).
3. In **{{ui:skillMonitor.tabs.buff}}**, search for and add your own burst Buffs.
4. Click **{{ui:skillMonitor.layout.editOverlayLayout}}**, drag the overlay to a spot near your character where you can see it out of the corner of your eye, then click Done.

See [Skill CD](../../features/monitor/skill-cd.md) and [Buff Monitor](../../features/monitor/buff.md) for details.

## Step 3: Turn on the monster overlay and Dungeon Mechanics

1. Open **{{ui:routes.tools.monsterMonitor}}** and turn on **{{ui:monsterMonitor.enabled}}**.
2. In **{{ui:monsterMonitor.tabs.overlay}}**, turn on the **Boss DBM area** (off by default). A warning bar pops up when the Boss starts a cast.
3. If this dungeon is on the [Supported Dungeons](../../features/minimap/dungeons.md) list, also go to **{{ui:routes.tools.minimap}}** and turn on **{{ui:minimap.settings.enabled.label}}**.

## Step 4: Check the DPS window layout

- If screen space is tight, switch to the "Small" size preset in **{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}}**, or turn on [Compact mode](../../features/dps/themes.md#compact-mode).
- To make the window transparent, see [Example: A transparent, minimal DPS window](../../features/dps/examples/transparent-window.md).

## Step 5: Change zones once before entering

If you opened the app while the game was already running, teleport somewhere before entering the dungeon so skill CDs, attributes and factors get fully synced.

## After the run

- Each Boss is saved automatically as a history entry; view them in **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}**.
- To find where your damage dropped off, follow [Example: Find damage gaps with the timeline](../../features/dps/examples/timeline-gaps.md).
- If you like this setup, you can [export it and share it with your teammates](../../features/app/examples/share-loadout.md).
