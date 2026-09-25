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
| **{{ui:monsterMonitor.alert.title}}** | Highlights when the remaining time is ≤ the set number of seconds, optionally blinking |
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

### Example: Watch the vulnerability you applied and get alerted before it drops

**Scenario**: You bring Poison Hive and are responsible for keeping "Venom Vulnerability (Poison Hive)" on the Boss. You want to see its remaining time in the overlay, get a highlight when it is about to end, and hear a voice reminder to reapply it when it drops.

#### Step 1: Add it as self-applied

1. Open **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.buff}}**.
2. Choose **{{ui:monsterMonitor.buffSearch.self}}**, search for **Venom Vulnerability (Poison Hive)** (ID 2110099) and add it.

Self-applied is the right choice because you only care about your own instance; if two people in the party bring Poison Hive, with global you couldn't tell whose it is.

#### Step 2: Set an alert

In **{{ui:monsterMonitor.alert.title}}**, add an alert for "Venom Vulnerability (Poison Hive)": highlight in red when ≤ 3 seconds remain, with blinking on.

#### Step 3: Voice reminder on expiry

In **{{ui:monsterMonitor.buffVoice.title}}**, add "Venom Vulnerability (Poison Hive)", check **on expiry**, and set the text to "Reapply vulnerability". Make sure [Voice announcements](../voice/README.md) are on and the audio has been generated.

#### Step 4: Open the overlay and position it

1. Make sure **{{ui:monsterMonitor.enabled}}** is on, then click **{{ui:monsterMonitor.actions.toggleOverlay}}**.
2. **{{ui:monsterMonitor.actions.editLayout}}**, drag the monster Buff area near the Boss HP bar.

#### Check it

Apply Poison Hive to a dummy in the training ground once. The dummy must be your **current attack target**, otherwise the overlay won't show its Buffs.

> [!TIP]
> Not sure what your Debuff is called? Turn on **{{ui:monsterMonitor.buffGroups.self.monitorAll}}** first, hit a dummy and see what shows up in the overlay, then add exactly that.
