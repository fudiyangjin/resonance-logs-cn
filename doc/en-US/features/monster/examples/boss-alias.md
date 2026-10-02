# Give a Boss skill an alias and add a voice warning

Related page: [Boss DBM](../boss-dbm.md)

**Scenario**: A Boss's ultimate has a very long name, and everyone in your party just calls it "Stack". You want the overlay to show "Stack" when the Boss casts it, and a voice to call it out.

## Step 1: Turn on the Boss DBM area

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.overlay}}**, turn on **Boss DBM Area**.
2. **{{ui:monsterMonitor.actions.editLayout}}**, drag the warning area to the top center of the screen.

## Step 2: Set the skill alias

1. Open **{{ui:monsterMonitor.tabs.bossDbm}}** and search for the skill in **{{ui:monsterMonitor.bossDbm.alias.title}}**.
2. Enter "Stack" as the display name.

If the search finds nothing, fight the Boss once first: for entries shown as `#number` in the overlay, the number is the skill effect ID, which you can search for.

## Step 3: Configure the voice

1. In **{{ui:monsterMonitor.bossDbm.voice.title}}**, add the skill and choose the **on trigger** event.
2. Choose custom text and enter "Stack, move in".
3. Go to **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** and click **{{ui:voice.bindings.generateMissing}}**.
4. Ultimate warnings matter, so set this announcement's priority to **High** so it isn't blocked by ordinary announcements. See [Playback and priority](../../voice/playback.md#priority-and-queue).

## Result

When the Boss starts casting, "Stack" and a countdown appear in the warning area, and you hear the voice alert at the same time.

> [!TIP]
> If this dungeon is on the supported list in [Dungeon Mechanics](../../minimap/dungeons.md), you can also turn on the mechanics minimap: Boss DBM tells you "when", the minimap tells you "where to stand".
