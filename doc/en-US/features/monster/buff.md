# Target Buffs

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.buff}}** configures which Buffs on the target are shown in the monster Buff area.

## Two monitoring modes

Choose how to add a Buff before searching:

| Mode | Shown when | Best for |
| --- | --- | --- |
| **{{ui:monsterMonitor.buffSearch.self}}** | Only Buffs **you** applied to the target | Vulnerability and DoTs you are responsible for keeping up |
| **{{ui:monsterMonitor.buffSearch.global}}** | The target has it, no matter who applied it | The Boss's own mechanic Buffs, Debuffs shared by the whole party |

A Buff can belong to only one of the two; adding it with the other mode moves it automatically.

**{{ui:monsterMonitor.buffGroups.self.monitorAll}}**: when on, the overlay lists every Buff you apply. Handy for finding out the names first and then trimming the list.

## Priority, alerts and display names

| Setting | Effect |
| --- | --- |
| **{{ui:monsterMonitor.priority.title}}** | When space is limited, Buffs higher in the list are shown first |
| **{{ui:monsterMonitor.alert.title}}** | Highlights when the remaining time is ≤ the set number of seconds, optionally blinking; type the seconds directly (0.1–60, in 0.1 s steps) |
| **{{ui:monsterMonitor.alias.title}}** | Sets an alias for a monitored Buff in the overlay |
| **{{ui:monsterMonitor.style.panelTitle}}** | Row / column spacing, font size, name / value / progress bar colors and opacity |

When you remove a Buff from monitoring, its priority, alert and voice settings are cleaned up as well.

## Voice announcements

In **{{ui:monsterMonitor.buffVoice.title}}** you can set **on gain / x seconds left / on expiry** announcements for monitored Buffs. Each entry shows its source scope:

- **{{ui:monsterMonitor.buffVoice.scope.localPlayerSource}}**: judged strictly by the instance you applied; a Buff of the same name applied by a teammate will not trigger or extend your announcement;
- **{{ui:monsterMonitor.buffVoice.scope.anySource}}**: judged by whether the Buff exists at all; when several players apply it, the first instance to appear counts as gained and the last one to disappear counts as expired.

## Common Debuff reference

| Fantasy | Search name | Buff ID | Effect |
| --- | --- | --- | --- |
| Poison Hive | Venom Vulnerability (Poison Hive) | 2110099 | Monster vulnerability |
| Lorola | Enchantment (Lorola) | 2110111 | Monster damage amp |
| Lorola | Enchantment Stacks (Lorola) | 2110135 | Stacking damage amp |

For player-side buffs and fantasy CDs, see [Live Monitor · Buff Monitor](../monitor/buff.md#common-buff-reference).

## Examples

- [Watch the vulnerability you applied and get alerted before it drops](./examples/vulnerability.md)
- [Monitor Lorola fantasy buffs and stacks](./examples/lorola.md)