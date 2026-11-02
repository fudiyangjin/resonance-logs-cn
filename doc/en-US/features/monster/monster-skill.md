# Monster Skills

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.monsterSkill}}** watches skills cast by nearby monsters: when any monster casts a skill on your list, its name appears in the **Monster Skills** area of the monster overlay and disappears after the configured number of seconds.

Typical uses: trash-mob skills without a DBM warning, dangerous casts by elites, key moves of field bosses.

## How it works

The game tells the client which skill every entity in view is casting, and the app checks that against your list:

- **Source**: any nearby monster, including adds summoned by a boss; players and their summons never trigger it;
- **Display**: one row per skill, name only by default (a cast has no duration of its own); with **{{ui:monsterMonitor.monsterSkill.countdown}}** ticked, the row also shows the remaining seconds and a progress bar;
- **Lifetime**: the row disappears after **{{ui:monsterMonitor.monsterSkill.displaySeconds}}** seconds (with a countdown, when it reaches zero); a recast in the meantime restarts the timer;
- **Order**: rows follow the list order, so they never jump around;
- If the caster dies or leaves view, the row still stays until its time is up; changing scenes clears everything.

## Compared with Boss DBM

| | Boss DBM | Monster Skills |
| --- | --- | --- |
| Triggered by | Mechanics the server flags with a warning | Any monster skill |
| Setup | None | Add the skills you want to watch |
| Shows | Skill name + countdown + progress bar | Skill name, optional countdown + progress bar |

Both can be on at the same time. For mechanics that already have a DBM warning, [Boss DBM](./boss-dbm.md) is enough.

## Adding skills

Search by skill name, alias or ID under **{{ui:monsterMonitor.monsterSkill.searchTitle}}** and click a result to add it:

- Results are ranked by match quality: an exact ID first, then aliases, ID prefixes and names;
- When there are many results (for example after typing a single digit), the first 50 are shown; click **Show more** at the bottom to load more;
- A skill missing from the game data can be added by typing its full ID;
- Boss skill IDs are shown on the skill markers of the [history](../dps/history.md) timeline.

Each skill is listed once, up to 32 skills. In the **{{ui:monsterMonitor.monsterSkill.listTitle}}** you can:

| Action | Description |
| --- | --- |
| **{{ui:monsterMonitor.monsterSkill.label}}** | Name shown on the panel; empty uses the in-game name |
| **{{ui:monsterMonitor.monsterSkill.displaySeconds}}** | 5 seconds by default, 0.5–60 seconds allowed |
| **{{ui:monsterMonitor.monsterSkill.countdown}}** | Off by default; when on, the display time becomes a countdown with remaining seconds and a progress bar |
| Move up / Move down / Remove | Reorder the panel or remove the entry |

With **{{ui:monsterMonitor.monsterSkill.monitorAll}}** on, skills that are not on your list show their name only, never a countdown.

### Counting down to the next skill

Some bosses cast skill B a fixed number of seconds after skill A. Add A to the list, set its alias to something about B (for example "B incoming"), enter the gap as **{{ui:monsterMonitor.monsterSkill.displaySeconds}}** and tick **{{ui:monsterMonitor.monsterSkill.countdown}}**: as soon as A is cast, the row counts down from the gap and reaches zero when B comes out.

## Voice broadcast

Each skill can have an **On trigger** cue that plays as soon as a nearby monster casts it.

- One cast is announced once;
- Removing the entry also removes its voice binding;
- With **{{ui:monsterMonitor.enabled}}** off the overlay shows nothing, but voice cues still play.

## Enabling the panel

Turn on the **Monster Skills** area in **{{ui:monsterMonitor.tabs.overlay}}** (off by default), then use **{{ui:monsterMonitor.actions.editLayout}}** to drag it into place. Without live data, edit mode previews the first skills on your list.

The panel style covers row gap, column gap, font size, name color, value color, progress bar color, progress bar opacity, text shadow and background.
