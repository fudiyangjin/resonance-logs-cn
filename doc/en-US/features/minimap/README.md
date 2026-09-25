# Dungeon Mechanics

In supported dungeons, **{{ui:routes.tools.minimap}}** shows a top-down minimap and a mechanic callout feed over the game: who is targeted, where to stand, and how many seconds until the next mechanic, all at a glance.

![Cursed Tomb mechanics minimap](../../../shared/img/minimap/s3_minimap_1.png)

## What it helps you with

- **Positioning**: The minimap draws you, your teammates, the Boss, and mechanic-related points and zones (safe zones, danger sectors, tethers).
- **Callouts**: Teammates targeted by a mechanic are colored accordingly, and the callout feed lists the targets and countdowns at the same time.
- **Audio alerts**: Bind voice to mechanic warnings so you know it's your turn without watching the screen.

When you enter a supported dungeon, the app automatically loads the matching mechanic parser for that scene; in other scenes the overlay shows no mechanic content. For the supported dungeons and the mechanics each one shows, see [Supported dungeons](./dungeons.md).

## Turning on the overlay

1. Open **{{ui:routes.tools.minimap}} → {{ui:minimap.tabs.minimap}}**.
2. Turn on **{{ui:minimap.settings.enabled.label}}**, or click **{{ui:minimap.actions.toggleOverlay}}** at the top of the page; both are the same switch.
3. Click **{{ui:minimap.actions.editLayout}}**, drag and resize the two panels, then click **{{ui:minimap.edit.done}}**.

The overlay consists of two panels, which can be toggled separately in **{{ui:minimap.overlay.title}}**:

| Panel | Content |
| --- | --- |
| **{{ui:minimap.panels.map}}** | Top-down minimap: players, Boss, markers and mechanic zones |
| **{{ui:minimap.panels.info}}** | Text list: names of active mechanics, targets and remaining time |

## Display options

| Option | Effect |
| --- | --- |
| **{{ui:minimap.settings.autoHideInDailyScenes.label}}** | Hides automatically when you return to the main city or other daily scenes, and restores when you leave |
| **{{ui:minimap.settings.hideNormalTeammates.label}}** | Normally shows only you; a teammate appears automatically as soon as they are targeted or colored by a mechanic. The cleanest view |
| **{{ui:minimap.settings.hideAllTeammates.label}}** | Never shows teammates, not even when targeted; only you remain. Takes precedence over the previous option |
| **{{ui:minimap.settings.showBoss.label}}** | Marks the Boss position on the map; off by default |
| **{{ui:minimap.settings.showMarkers.label}}** | Shows party markers 1–6 (colored numbers); off by default |

> [!TIP]
> The first time you run a dungeon, show all teammates first; once you know the mechanics, turn on **{{ui:minimap.settings.hideNormalTeammates.label}}** to see only the points relevant to you.

## Making yourself easier to find

When a mechanic targets you, your dot changes color and can easily get lost among your teammates. You can combine:

- **{{ui:minimap.settings.localRing.title}}**: turn on **{{ui:minimap.settings.localRing.enabled.label}}** to draw an outline ring around your dot; its color and line width are adjustable.
- **{{ui:minimap.settings.localFacing.label}}**: draws a small arrow on your marker pointing in the direction you are facing, making it easy to judge your facing.
- **{{ui:minimap.settings.sizes.title}}**: make **{{ui:minimap.settings.sizes.local}}** a bit larger than your teammates.

## Colors and death style

- **{{ui:minimap.settings.colors.title}}**: sets the colors of **{{ui:minimap.settings.colors.local}}**, **{{ui:minimap.settings.colors.teammate}}**, **{{ui:minimap.settings.colors.boss}}** and **{{ui:minimap.settings.colors.marker1}}**–6 when no mechanic coloring applies. Mechanic targeting always uses dedicated high-contrast colors and is not affected by these.
- **{{ui:minimap.settings.deadStyle.title}}**: how you or a teammate are shown after dying; you can switch to an × marker and set its color and opacity. The death style overrides mechanic targeting colors.

## Mechanic voice announcements

**{{ui:minimap.settings.voiceCues.title}}** lists the mechanics in the current dungeon that can be announced. Once expanded, they are configured the same way as Buff and Boss mechanic announcements: choose an event, write the text, generate the voice. If the current map has no announceable mechanics yet, this list is empty. For general voice settings, see [Voice announcements](../voice/README.md).

## How it differs from Boss DBM

| | Dungeon Mechanics | [Monster Monitor · Boss DBM](../monster/boss-dbm.md) |
| --- | --- | --- |
| Question it answers | Where to stand, who is targeted | When the Boss uses which skill |
| What it shows | Minimap + callout feed | Skill name + countdown |
| Where it works | Supported dungeons only | Any fight with Boss skill events |

Both can be on at the same time; place them in different parts of the screen so they complement each other.

## Examples

### Example: Minimap setup before a raid's first clear

**Scenario**: Your group is running "Forgotten Dreamwilds" for the first time, with lots of mechanics and frequent callouts. You want the minimap to show only what's relevant to you, to find yourself instantly when targeted, and to get voice alerts.

#### Step 1: Turn on and place the overlay

1. **{{ui:routes.tools.minimap}} → {{ui:minimap.tabs.minimap}}**, turn on **{{ui:minimap.settings.enabled.label}}**.
2. **{{ui:minimap.actions.editLayout}}**: place **{{ui:minimap.panels.map}}** on one side of the screen where it doesn't cover your character, and **{{ui:minimap.panels.info}}** below it. Click **{{ui:minimap.edit.done}}** when finished.

#### Step 2: Reduce clutter

- Turn on **{{ui:minimap.settings.hideNormalTeammates.label}}**: teammates who aren't targeted are hidden.
- Turn on **{{ui:minimap.settings.autoHideInDailyScenes.label}}**: hides automatically when you return to town.
- If your group uses markers for calls, turn on **{{ui:minimap.settings.showMarkers.label}}**.

#### Step 3: Make yourself stand out

1. Turn on **{{ui:minimap.settings.localRing.enabled.label}}**, pick a **{{ui:minimap.settings.localRing.color}}** that clearly differs from the mechanic colors (such as white), and make the line a bit thicker.
2. Turn on **{{ui:minimap.settings.localFacing.label}}**.
3. In **{{ui:minimap.settings.sizes.title}}**, increase **{{ui:minimap.settings.sizes.local}}**.

#### Step 4: Voice alerts when targeted

1. Enter the dungeon (or just expand **{{ui:minimap.settings.voiceCues.title}}**) and find the mechanics you want alerts for, such as **{{ui:minimap.s3Raid.shareGroup}}** and **{{ui:minimap.s3Raid.killMark.group}}**.
2. Write short text for each mechanic, for example "Stack" or "Go to corner".
3. Go to **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** and click **{{ui:voice.bindings.generateMissing}}**.

> [!TIP]
> The shorter the text, the faster the announcement. Several mechanics may happen at once, so set the deadliest ones to high priority. See [Priority and queue](../voice/playback.md#priority-and-queue).

#### Step 5: Pair it with Boss DBM

In [Monster Monitor](../monster/README.md), turn on the Boss DBM area and place it near the top center of the screen. The minimap tells you where to stand, and Boss DBM tells you how many seconds are left. See [Example: Give a Boss skill an alias and add a voice warning](../monster/boss-dbm.md#example-give-a-boss-skill-an-alias-and-add-a-voice-warning).
