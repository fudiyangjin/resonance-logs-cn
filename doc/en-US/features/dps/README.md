# DPS Meter

**{{ui:routes.tools.dps}}** parses the game's network data to track each party member's damage, healing, and damage taken in real time, and automatically saves every fight to history so you can review it afterwards.

## What you can use it for

- See the party's **DPS / HPS / damage taken per second** rankings and skill shares live during combat;
- Use **training dummy mode** at the training ground to test your output over a fixed duration;
- After the fight, review the second-by-second damage curve, Buff coverage, and causes of death in **History**;
- In challenge dungeons, use **Challenge Watch** to flag who got hit by a mechanic they shouldn't have;
- Freely adjust the window's colors, size, columns, and header so it fits your screen.

## Live DPS window

![Live DPS window](../../../shared/img/dps/dps_1.png)

The tabs at the bottom of the window switch between four views:

| Tab | Content |
| --- | --- |
| **{{ui:live.tabs.dps}}** | Damage ranking; click a player to expand their skill breakdown |
| **{{ui:live.tabs.heal}}** | Healing ranking and skill breakdown |
| **{{ui:live.tabs.tanked}}** | Damage taken ranking |
| **{{ui:live.tabs.death}}** | Death log; replay the damage taken before each death |

By default the header shows the combat timer, encounter name, total damage, total DPS, Boss HP, and the **Reset / Pause / Training Dummy / Settings / Minimize** buttons. You can add, remove, and rearrange all of these in [Themes · Header Settings](./themes.md#header-settings).

### Why a skill has multiple entries

The DPS skill list aggregates damage the same way the game client does: one skill may consist of several damage sources (e.g. the main hit plus follow-up damage). Expanding the skill shows these sub-entries.

![Multiple entries after expanding a skill](../../../shared/img/dps/dps_2.png)

### DPS vs. True DPS

| Metric | Calculation |
| --- | --- |
| **DPS** | Total damage ÷ total combat duration |
| **True DPS (TDPS)** | Total damage ÷ active combat time (excluding long gaps such as pausing your attacks or running around) |

Combat duration is counted up to the **last hit**. Enable "Show Active Combat Time" in the header settings to see both durations at once.

## When fights are split and reset

You don't need to press Reset manually. The app automatically splits fights and saves them to history according to these rules:

| Situation | Behavior |
| --- | --- |
| **Zone change** | If the current fight has data, it is saved as a history entry; the live window keeps the old numbers and only clears them the **next time you deal damage** |
| **Master dungeon** | Trash and Boss are automatically split into two entries |
| **Raid** | One entry per Boss |
| **Wipe** | Automatically resets; a new segment starts the next time you attack the Boss |

> [!NOTE]
> The live window doesn't clear immediately after a zone change so that the numbers don't suddenly vanish. You can click **Reset** in the header at any time to start a new segment manually.

## Page structure

| Page | Content | Examples |
| --- | --- | --- |
| [History](./history.md) | History list, details, timeline, Buff coverage, death replay | [Find DPS gaps with the timeline](./examples/timeline-gaps.md) |
| [Challenge Watch](./challenge.md) | Flag party members hit by "forbidden damage" | [See who got hit by the Drone Cannon](./examples/challenge-hits.md) |
| [Themes & Appearance](./themes.md) | Colors, size, compact mode, tables, header | [A transparent, minimal DPS window](./examples/transparent-window.md) · [Custom header layout and death replay](./examples/header-death.md) |
| [Display Settings](./settings.md) | Names, columns, abbreviations, refresh rate, training dummy duration | [Customize displayed columns](./examples/table-columns.md) |

The live window's own example is at the end of this page: [Test a 3-minute rotation with training dummy mode](./examples/dummy-rotation.md).

## Examples

- [Test a 3-minute rotation with training dummy mode](./examples/dummy-rotation.md)