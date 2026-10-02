# Minimap setup before a raid's first clear

Related page: [Dungeon Mechanics](../README.md)

**Scenario**: Your group is running "Forgotten Dreamwilds" for the first time, with lots of mechanics and frequent callouts. You want the minimap to show only what's relevant to you, to find yourself instantly when targeted, and to get voice alerts.

## Step 1: Turn on and place the overlay

1. **{{ui:routes.tools.minimap}} → {{ui:minimap.tabs.minimap}}**, turn on **{{ui:minimap.settings.enabled.label}}**.
2. **{{ui:minimap.actions.editLayout}}**: place **{{ui:minimap.panels.map}}** on one side of the screen where it doesn't cover your character, and **{{ui:minimap.panels.info}}** below it. Click **{{ui:minimap.edit.done}}** when finished.

## Step 2: Reduce clutter

- Turn on **{{ui:minimap.settings.hideNormalTeammates.label}}**: teammates who aren't targeted are hidden.
- Turn on **{{ui:minimap.settings.autoHideInDailyScenes.label}}**: hides automatically when you return to town.
- If your group uses markers for calls, turn on **{{ui:minimap.settings.showMarkers.label}}**.

## Step 3: Make yourself stand out

1. Turn on **{{ui:minimap.settings.localRing.enabled.label}}**, pick a **{{ui:minimap.settings.localRing.color}}** that clearly differs from the mechanic colors (such as white), and make the line a bit thicker.
2. Turn on **{{ui:minimap.settings.localFacing.label}}**.
3. In **{{ui:minimap.settings.sizes.title}}**, increase **{{ui:minimap.settings.sizes.local}}**.

## Step 4: Voice alerts when targeted

1. Enter the dungeon (or just expand **{{ui:minimap.settings.voiceCues.title}}**) and find the mechanics you want alerts for, such as **{{ui:minimap.s3Raid.shareGroup}}** and **{{ui:minimap.s3Raid.killMark.group}}**.
2. Write short text for each mechanic, for example "Stack" or "Go to corner".
3. Go to **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** and click **{{ui:voice.bindings.generateMissing}}**.

> [!TIP]
> The shorter the text, the faster the announcement. Several mechanics may happen at once, so set the deadliest ones to high priority. See [Priority and queue](../../voice/playback.md#priority-and-queue).

## Step 5: Pair it with Boss DBM

In [Monster Monitor](../../monster/README.md), turn on the Boss DBM area and place it near the top center of the screen. The minimap tells you where to stand, and Boss DBM tells you how many seconds are left. See [Example: Give a Boss skill an alias and add a voice warning](../../monster/examples/boss-alias.md).
