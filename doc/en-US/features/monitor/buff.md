# Buff Monitor

Corresponds to **Live Monitor → Buff Monitor**.

## Standalone Mode / Grouped Mode

- **Standalone mode**: Each buff displays separately with its own icon size and position

![Standalone mode](../../../shared/img/monitor/buff_2.png)

- **Grouped mode**: Multiple buffs in one group with unified layout

![Grouped mode](../../../shared/img/monitor/buff_1.png)

## Special Buffs

Some buffs change display by **stack count** (e.g. different icons at 1 vs 2 stacks)—these are **special buffs**. Add them like normal buffs; the overlay switches icons by stack automatically.

**Usage:**

1. Under **Live Monitor → Buff Monitor**, add the target buff (search by name)
2. If configured as a special buff, icons update with stacks—no extra setup

**Currently supported special buffs:**

| Class | Buff Name | Effect |
|------|-----------|----------|
| Qinglan Knight | Pursuit Footwork | 1 stack: single icon; 2 stacks: dual-icon combo for stack distinction |

## Buff Aliases

Some in-game buff names are unclear. Set aliases under **Buff Monitor → Buff Alias Settings**:

- Search original name (e.g. `[热枕]`)
- Set display name (e.g. “Life Fluctuation”)

Aliases apply **globally** and do not change when switching profiles.

## How do I find buffs to monitor?

If names are unclear, in **grouped mode** enable **Monitor All** on a group; when the overlay lists all buffs, match effects to names, then add exact buffs to your list.

## Category Quick Listen

- **Food**: Monitor all food buffs at once
- **Alchemy**: Monitor all alchemy buffs at once

Use under **Buff Monitor → Category Quick Listen**, or shortcut buttons in grouped mode.

## Buff Priority

- **Global buff priority**: In standalone mode, controls display order in the global list.
- **Within-group priority**: In grouped mode, each group has its own priority order.

## Buff Countdown Alerts

For monitored buffs, set **remaining time alerts**: highlight color (optional blink) when below N seconds—useful for buffs about to expire.

## Monitor All Buffs (Standalone Mode)

In standalone mode, **Monitor All Buffs** shows every buff currently received (good for name discovery); similar to grouped **Group · Monitor All** but different layout logic.

## Buff Group Management (Grouped Mode)

- **Create / delete groups**, select buffs per group or enable **Monitor All**.
- Groups can quickly **add Food / Alchemy** categories or **remove** added categories.
- Per group: **icon size, rows, columns, spacing**, show name, remaining time, stacks.

## Buffs Without Icons

Buffs without icons show as a **single-row progress bar**; choose **new no-icon style** or **legacy no-icon style**, and limit **max display count**. Adjust name/value/bar colors under buff display mode settings.
