# Monster Monitor

**{{ui:routes.tools.monsterMonitor}}** uses a separate **monster overlay** to show information about your **current attack target**: the Buffs / Debuffs on it, effects applied by teammates, threat, stun value, HP, plus Boss skill warnings and the remaining time of entities on the field.

## What you can use it for

- Check whether the vulnerability and damage-amp effects you put on the Boss are still up, with a highlight when they are about to expire;
- See whether your teammates' Debuffs are all applied;
- Tanks can check the threat ranking, and DPS can see how much stun value is left before the Boss breaks;
- Pop up a DBM warning bar with a voice alert when the Boss starts casting;
- Show the remaining time of summons and ground devices (such as the Scythe Cart).

## Follows your current target

The overlay switches automatically with your character's **attack target**; you don't need to specify a monster in advance:

- Attack or select another monster and the overlay switches to it;
- When the target dies or is lost, the related content is cleared until you have a new target;
- Training dummies and trash mobs work too, as long as they are your current attack target.

## Top switches and sub-profiles

| Switch | Effect |
| --- | --- |
| **{{ui:monsterMonitor.enabled}}** | Master switch |
| **{{ui:monsterMonitor.autoHideInDailyScenes.label}}** | Automatically hides the overlay in daily scenes |
| **{{ui:monsterMonitor.actions.toggleOverlay}}** | Shows / hides the monster overlay |
| **{{ui:monsterMonitor.actions.editLayout}}** | Drag and resize each area; placeholder previews are shown when there is no live data |

Monster Monitor has its own **configuration sub-profiles** (create, rename, delete), and the main loadout references one of them. See [Loadouts](../app/loadouts.md).

## Page layout

| Tab | Documentation | Examples |
| --- | --- | --- |
| **{{ui:monsterMonitor.tabs.buff}}** | [Target Buffs](./buff.md) | [Watch the vulnerability you applied](./examples/vulnerability.md) · [Monitor Lorola buffs and stacks](./examples/lorola.md) |
| **{{ui:monsterMonitor.tabs.teammate}}** | [Teammate Buffs](./teammate.md) | — |
| **{{ui:monsterMonitor.tabs.teammateCd}}** | [Teammate CD](./teammate-cd.md) | — |
| **{{ui:monsterMonitor.tabs.hate}}** | [Threat List](./hate.md) | — |
| **{{ui:monsterMonitor.tabs.stun}}** / **{{ui:monsterMonitor.tabs.hp}}** / **{{ui:monsterMonitor.tabs.fantasy}}** | [Stun, HP and Teammate Fantasies](./status.md) | — |
| **{{ui:monsterMonitor.tabs.bossDbm}}** | [Boss DBM](./boss-dbm.md) | [Give a Boss skill an alias and a voice warning](./examples/boss-alias.md) |
| **{{ui:monsterMonitor.tabs.entityDuration}}** | [Entity Duration](./entity-duration.md) | [Show the Scythe Cart's remaining time](./examples/scythe-cart.md) |
| **{{ui:monsterMonitor.tabs.overlay}}** | [Enable Window](./overlay.md) | — |

## How it differs from Live Monitor

| | Live Monitor | Monster Monitor |
| --- | --- | --- |
| Who it watches | You | Your current target |
| Typical content | Skill CDs, your own Buffs, factors, stats | Target Debuffs, threat, stun, Boss skills |
| Overlay | Live Monitor overlay | Monster overlay |

Their settings are independent of each other, and both can be on at the same time.
