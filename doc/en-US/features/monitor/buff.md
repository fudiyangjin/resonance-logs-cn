# Buff Monitor

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buff}}** monitors the Buffs **on yourself**: duration and stacks, alerts when they are about to end, and voice reminders when they are gained or lost.

> [!TIP]
> Want to watch Debuffs on the boss instead (for example, a vulnerability you applied)? That belongs to [Monster Monitor · Buff Monitor](../monster/buff.md).

## Adding Buffs

Type a **name or ID** in the search box and click a result to add it to **{{ui:skillMonitor.buff.selectedTitle}}**. Results are paginated when there are many; even if an ID is not in the built-in table, you can still add it directly by ID.

Not sure what a Buff is called? Turn on **{{ui:skillMonitor.buff.all.title}}** first, and the overlay will show every Buff you currently have. Once you find the one you want, add it precisely, then turn "Monitor All" off.

> [!NOTE]
> A Buff shows wherever you set it up: the same Buff can sit here, in [Custom Monitor](./custom-panel.md) and in [Buff Coverage](./buff-coverage.md) at the same time, and each area shows it on its own. **{{ui:skillMonitor.buff.all.title}}** only shows Buffs that no other enabled area already shows, so Buffs the season factor / node zone may use never leak into it.

### Category quick watch

**{{ui:skillMonitor.buff.category.title}}** lets you watch all **Food** or **Alchemy** Buffs at once, which is handy for checking whether you have eaten and taken potions before entering a dungeon.

## Display modes

Choose one of the two in **{{ui:skillMonitor.buff.display.title}}**:

| Mode | Characteristics |
| --- | --- |
| **{{ui:skillMonitor.buff.display.individual}}** | Each Buff gets its own icon that can be moved and resized separately |
| **{{ui:skillMonitor.buff.display.grouped}}** | Several Buffs go into one group and are laid out together in rows and columns |

![Individual mode](../../../shared/img/monitor/buff_2.png)

![Grouped mode](../../../shared/img/monitor/buff_1.png)

### Grouped mode

In **{{ui:skillMonitor.buff.group.title}}**:

- **{{ui:skillMonitor.buff.group.new}}** / **{{ui:skillMonitor.buff.group.delete}}**; pick Buffs for each group separately, or set it to **{{ui:skillMonitor.buff.group.monitorAll}}**;
- Add or remove the Food and Alchemy categories for a group in one click;
- Each group can set icon size, rows and columns, spacing, and whether to show the name, remaining time and stacks;
- **{{ui:skillMonitor.buff.group.previewTitle}}** lets you check the result first.

### Buffs without icons

Buffs without an icon are shown as a line of text plus a progress bar. You can choose **{{ui:skillMonitor.buff.display.modernText}}** or **{{ui:skillMonitor.buff.display.classicText}}**, and limit how many are shown at most.

### Buffs that change with stacks

Some Buffs change their icon automatically with the stack count. For example, Wind Knight's "Chasing Step" shows a single icon at 1 stack and a double icon at 2 stacks, with no extra setup needed.

## Names and icons

| Setting | What it does | Scope |
| --- | --- | --- |
| **{{ui:skillMonitor.buff.alias.title}}** | Gives an alias to a Buff with an unclear name, for example showing "[热枕]" as "Life Fluctuation" | Global, does not change with profiles |
| **{{ui:skillMonitor.buff.icon.title}}** | Picks a custom image as the Buff's icon | Global |

Buff aliases are also used as the display names of Buff effects in the [factor zone](./custom-panel.md#factor-zone).

Buffs that come from a Fantasy are shown as "Name | Tier n" when the Fantasy's tier can be detected.

## Composite buffs

Some effects only count when several Buffs are active at once. Create a composite in **{{ui:skillMonitor.buff.composite.title}}**: enter a name, search for and add 2–8 member Buffs, set **{{ui:skillMonitor.buff.composite.condition}}**, and optionally pick one member's icon (without one, it shows as text).

- **{{ui:skillMonitor.buff.composite.condition}}** requires every member by default; you can lower it to at least k members at once (k can be 1, meaning any one of them);
- A composite lasts until fewer members than required remain. With every member required, the remaining time is that of the member ending first; for example, with at least 3 of 5 and four members left at 10, 8, 6 and 4 seconds, the composite has 6 seconds left;
- Stacks: with every member required, the lowest member stack count; with at least k, the number of members currently active;
- Once saved, a composite can be searched and added like any Buff on this page, in [Custom Monitor](./custom-panel.md), [Buff Coverage](./buff-coverage.md), countdown alerts and voice announcements; search results mark it as "Composite buff";
- Watching a composite does not change how its member Buffs display;
- Like aliases, composites are a global setting and are not exported with profiles. When an imported profile refers to a composite this install does not have, those references are removed automatically; deleting a composite also removes its references from every profile.

## Priority

- **{{ui:skillMonitor.buff.priority.globalTitle}}**: display order in individual mode;
- **{{ui:skillMonitor.buff.priority.groupTitle}}**: order within each group in grouped mode.

## Countdown alerts

**{{ui:skillMonitor.buff.alert.title}}** sets a threshold for a Buff: when the remaining time is ≤ the set number of seconds, it is highlighted in the chosen color, optionally **flashing**. Good for watching boosts that are about to drop.

## Voice announcements

In the **{{ui:skillMonitor.buff.voice.title}}** section, search for a monitored Buff and add a rule. You can choose three events, **on gain / x seconds left / on expiry**, and the text can be generated automatically, written yourself, or taken from the phrase library. See [Voice](../voice/README.md#binding-announcements-on-feature-pages) for details.

![Buff voice announcement settings](../../../shared/img/voice/voice_1.png)

## Common Buff reference

You can type the search names in the table below directly into the search box:

| Type | Fantasy | Search name | Buff ID |
| --- | --- | --- | --- |
| Boost | Bandit Chief | Fiery Battle Will (Bandit Chief) | 2110065 |
| Boost | Tata | Heart of Flames (Tata) | 2110061 |
| Boost | Tina | Lower CD | 2110034 |
| Boost | Basilisk | Highland Blood (Basilisk) | 2110125 |
| Boost | Catagriff | Mechanical Power (Catagriff) | 2110140 |
| Fantasy CD | Catagriff | Mechanical Failure (Catagriff CD) | 2110049 |
| Fantasy CD | Tina | Time Stasis (Tina CD) | 2110056 |
| Fantasy CD | Tata | Exhausted: Flame Devour (Tata CD) | 2110055 |
| Fantasy CD | Revive type | Weakened: Wish Sealed (Revive CD) | 2110057 |
| Fantasy CD | Basilisk | Element Stasis (Basilisk CD) | 2110050 |

For vulnerabilities and damage boosts placed on monsters (such as Venom Vulnerability (Poison Hive) and Enchantment (Lorola)), see [Monster Monitor · Buff Monitor](../monster/buff.md#common-debuff-reference).

## Examples

- [Voice reminder when Tina's CD is ready](./examples/tina-cd.md)
- [Track the 3-stack "Attribute Symphony" buff with composite buffs](./examples/attribute-symphony.md)