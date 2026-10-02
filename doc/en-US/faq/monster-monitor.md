# FAQ · Monster Monitor

Related guides: [Monster Monitor](../features/monster/README.md) · [Target Buffs](../features/monster/buff.md) · [Boss DBM](../features/monster/boss-dbm.md) · [Entity Duration](../features/monster/entity-duration.md) · [Enable Window](../features/monster/overlay.md)

### What's the difference between Monster Monitor and Live Monitor?

- **Live Monitor**: shows **your own** skill CDs, Buffs and attributes.
- **Monster Monitor**: shows Buffs, threat, stun, Boss skill warnings and more on **your current attack target**.

The two are configured independently and use separate overlays.

### Which monster does the overlay show?

Your **current attack target**. It follows automatically when you switch targets; you don't need to specify a monster ID. The old `ExtraBuffMonitoredMonsters.json` is deprecated, and editing it has no effect.

### No Buffs show up on a training dummy or trash mob?

1. The dummy isn't your current attack target: deal damage to it first.
2. Monster Monitor or its overlay isn't on: make sure **{{ui:monsterMonitor.enabled}}** is enabled and you've clicked **{{ui:monsterMonitor.actions.toggleOverlay}}**.
3. You haven't added the Buffs you want to see: add them in **{{ui:monsterMonitor.tabs.buff}}**, or first turn on "monitor all" to look up their names.
4. The target is already dead: its data stops updating, so switch to another target.

### No Boss DBM warnings show up?

1. The **Boss DBM area** is off by default; turn it on in **{{ui:monsterMonitor.tabs.overlay}}**.
2. Make sure both Monster Monitor and its overlay are on.
3. Not every Boss skill has a warning event; when there are no events the area stays hidden (in edit layout mode you can see a placeholder).

### What's the difference between Boss DBM and Buff Monitor?

Boss DBM automatically shows Boss casts and phase skills, with no monitor entries to add. Buff Monitor needs you to add Buffs to a list first and is used to track the duration and stacks of specific Buffs. See [Boss DBM](../features/monster/boss-dbm.md).

### How do I see how much time a summon has left?

Use [Entity Duration](../features/monster/entity-duration.md). Common summons have presets, such as the [Scythe Cart](../features/monster/examples/scythe-cart.md).
