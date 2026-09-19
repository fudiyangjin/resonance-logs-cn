# FAQ · Monster Monitor

**Detailed guides**: [Monster Monitor Overview](../features/monster/README.md) · [Buff Monitor](../features/monster/buff.md) · [Teammate Buffs](../features/monster/teammate.md) · [Threat List](../features/monster/hate.md) · [Boss DBM](../features/monster/boss-dbm.md) · [Enable Overlay](../features/monster/overlay.md)

## How are monster buffs different from live monitor buffs?

- **Live monitor**: **Your** buffs, skill CD, etc., on the **game overlay**.
- **Monster monitor**: Buffs on **your current main attack target**, teammate buffs on that target, and the threat list, on the **monster overlay**.

The two configs are independent—use monster monitor when tracking boss mechanics.

## Which monster’s buffs does the overlay show?

It follows your character’s **main attack target** automatically—no config file or monster template ID needed.

- When you switch to another target, monster buff and threat areas update accordingly.
- Legacy `ExtraBuffMonitoredMonsters.json` is **deprecated**; adding or removing that file has no effect.

## Why do I see no buffs on dummies / trash mobs?

Common causes:

1. **Dummy is not your attack target**: You must damage or select the dummy you want; the overlay only shows data for your current target.
2. **Monster monitor not enabled**: Confirm **Enable Monster Monitor** at the top and **Toggle Monster Overlay** to show the window.
3. **Buffs not configured**: On the **Buff Monitor** tab, add buffs to **Self only** or **Global**, or enable **Monitor all buffs applied by this character** to discover names first.
4. **Target is dead**: Buffs and threat stop updating when the monster dies—switch target or wait for the next one.

On training dummies, behavior matches Boss fights as long as the dummy is locked as your attack target.

## What is Boss DBM? How is it different from buff monitor?

**Boss DBM** shows Boss mechanic warning bars (skill name + countdown) on the monster overlay from in-game Boss DBM events—**no manual buff list needed**. See [Boss DBM](../features/monster/boss-dbm.md).

- **Buff monitor**: Track specific buff duration/stacks; add entries to the monitor list first.
- **Boss DBM**: Automatic timer bars for Boss casts/phases.

## Why are there no Boss DBM bars?

1. **Boss DBM area not enabled**: Set **Boss DBM area** to show on the **Enable Window** tab (off by default).
2. **Monster monitor or overlay off**: Confirm **Enable Monster Monitor** and **Toggle Monster Overlay**.
3. **No DBM events**: Not every Boss skill emits DBM; the area stays hidden when empty (edit mode shows a preview placeholder).
