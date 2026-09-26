# Boss DBM

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.bossDbm}}** automatically pops up a **warning bar** (skill name + countdown + progress bar) in the monster overlay when the Boss uses a mechanic skill, much like a DBM addon.

## Turning it on

1. Make sure **{{ui:monsterMonitor.enabled}}** is on.
2. In **{{ui:monsterMonitor.tabs.overlay}}**, turn on **Boss DBM Area** (off by default).
3. Click **{{ui:monsterMonitor.actions.editLayout}}** and drag the warning area to a prominent spot near the top center of the screen. Placeholder bars are shown in edit mode, so you can position it outside of combat.

You **don't** need to add the skills to watch manually: bars appear automatically when the Boss uses a DBM-tagged mechanic and disappear when it ends. When several are active at once, they are sorted by time.

## Skill aliases

Default skill names come from game data; entries that are not in the table show as `#skillEffectId`. In **{{ui:monsterMonitor.bossDbm.alias.title}}**, search for a Boss skill and enter whatever your party calls it, for example renaming a cast to "Stack" or "Dodge circles".

## Voice announcements

In **{{ui:monsterMonitor.bossDbm.voice.title}}**, set an **on trigger** announcement for a skill so you hear an alert as soon as the Boss starts casting.

Deleting an entry from the alias list also deletes its voice announcement. If you clear an alias and leave the field, the default name comes back; the entry and its announcement are kept.

## Style

The Boss DBM area has its own style: row spacing, column spacing, font size, name / value colors, progress bar color and opacity.

## Boss DBM and other features

| Feature | What it shows |
| --- | --- |
| **Boss DBM** | Unified countdown bars for Boss skills, in any fight with DBM events |
| [Target Buffs](./buff.md) | Duration and stacks of a specific Buff on the target |
| [Dungeon Mechanics](../minimap/README.md) | Positioning map and callout feed for supported dungeons |

All three can be on at the same time.

## Examples

### Example: Give a Boss skill an alias and add a voice warning

**Scenario**: A Boss's ultimate has a very long name, and everyone in your party just calls it "Stack". You want the overlay to show "Stack" when the Boss casts it, and a voice to call it out.

#### Step 1: Turn on the Boss DBM area

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.overlay}}**, turn on **Boss DBM Area**.
2. **{{ui:monsterMonitor.actions.editLayout}}**, drag the warning area to the top center of the screen.

#### Step 2: Set the skill alias

1. Open **{{ui:monsterMonitor.tabs.bossDbm}}** and search for the skill in **{{ui:monsterMonitor.bossDbm.alias.title}}**.
2. Enter "Stack" as the display name.

If the search finds nothing, fight the Boss once first: for entries shown as `#number` in the overlay, the number is the skill effect ID, which you can search for.

#### Step 3: Configure the voice

1. In **{{ui:monsterMonitor.bossDbm.voice.title}}**, add the skill and choose the **on trigger** event.
2. Choose custom text and enter "Stack, move in".
3. Go to **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** and click **{{ui:voice.bindings.generateMissing}}**.
4. Ultimate warnings matter, so set this announcement's priority to **High** so it isn't blocked by ordinary announcements. See [Playback and priority](../voice/playback.md#priority-and-queue).

#### Result

When the Boss starts casting, "Stack" and a countdown appear in the warning area, and you hear the voice alert at the same time.

> [!TIP]
> If this dungeon is on the supported list in [Dungeon Mechanics](../minimap/dungeons.md), you can also turn on the mechanics minimap: Boss DBM tells you "when", the minimap tells you "where to stand".
