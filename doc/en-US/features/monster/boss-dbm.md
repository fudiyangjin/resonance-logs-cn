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

- [Give a Boss skill an alias and add a voice warning](./examples/boss-alias.md)