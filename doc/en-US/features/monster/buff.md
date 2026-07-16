# Buff Monitor (Monster)

Corresponds to **Monster Monitor → Buff Monitor** tab.

Configure which buffs to show on your **current main attack target** (which monster updates automatically from in-game target). Search list uses **Boss Buff** config—not the Live Monitor player buff list.

## Buff Search & Selection

Choose how to add before searching:

| Mode | Meaning |
|------|------|
| **Search add self-only** | Only buffs **your character** applied to the monster |
| **Search add global** | Show buff on monster regardless of who applied it |

Search by keyword, pick from the result grid; buffs already on the other list show status (e.g. “currently global”).

## Self-Only

- Track only buffs you apply to the monster.
- **Monitor all buffs applied by this character**: Lists all your buffs on the monster—useful to match in-game names then trim the list; individual selections below can be ignored when this is on.
- Selected buffs show as icon chips—click to remove.

## Global Monitor

- Show when present on the monster—**any** applier (Boss mechanics, raid debuffs, etc.).
- Selected buffs removable by click.

A buff belongs to either self-only or global monitoring. Choosing the other mode moves it there. Removing it from monitoring also clears its **priority**, **alert**, and **voice broadcast** config.

## Buff Priority

When many monster buffs compete for overlay space, set **display order**—buffs higher in the list show first.

Add buffs to self-only or global first, then search-add to the priority list; move up/down or remove.

## Buff Countdown Alerts

Per **monitored monster buff**:

- Highlight when remaining time **≤ set seconds** (color, optional blink)
- Only for buffs in self-only or global lists

## Buff Voice Broadcast

Use the standalone **Buff Voice Broadcast** section to search monitored buffs and configure gain, expiring, and loss broadcasts. Each entry is labeled Global or Self-applied.

- **Self-applied** tracks only instances whose caster is your character; matching buffs from teammates do not trigger or extend your cue.
- **Global** tracks aggregate presence: the first instance counts as gained, the last instance disappearing counts as lost, and expiry uses the last instance's timer.
- With monitor-all self-applied enabled, the full buff dictionary is searchable, but each voice binding remains opt-in.

## Display Names

Set **overlay aliases** for monitored buffs (left column = game default). Editable entries appear after buffs are on a monitor list.

## Text Panel Style (Monster Buff Area)

Adjust monster buff area text and progress bar appearance:

- Row spacing, column spacing, font size
- Name color, value color, bar color and opacity

Teammate buff and threat styling: [Teammate Buffs](./teammate.md), [Threat List](./hate.md).
