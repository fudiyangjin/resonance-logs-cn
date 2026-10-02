# Entity Duration

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.entityDuration}}** times **entities on the field** such as summons and ground devices: the countdown starts when the entity appears and the row is removed when it disappears. Rows are shown in the **Entity Duration Area** of the monster overlay.

Typical uses: persistent summons such as the Scythe Cart, and ground zones that need to be recast.

> [!NOTE]
> This feature replaces the former "Duration Skills" in Live Monitor. A Scythe Cart selected in an old profile is migrated automatically into a "self only" entry.

## How it works

These skills spawn a separate entity on the field, which carries an **entity ID** (monster template ID) and a **caster**. The app watches for the entity appearing and disappearing:

- When recasting the skill makes the old entity disappear and a new one spawn, the old row is removed and a new row starts timing;
- Entities disappear when you change maps, and their rows are removed along with them;
- With **{{ui:monsterMonitor.entityDuration.merge}}** checked, one caster's entities with the same ID share a single row: it counts down the one with the least time left, moves on to the next when that one ends, and is removed once all of them have ended or disappeared.

## Presets

**{{ui:monsterMonitor.entityDuration.presetsTitle}}** currently includes the built-in **Scythe Cart** (ID 179903, 35 seconds, self only, merged); click it to add.

## Adding manually

| Field | Description |
| --- | --- |
| **{{ui:monsterMonitor.entityDuration.monsterId}}** | Entity ID, a positive integer |
| **{{ui:monsterMonitor.entityDuration.label}}** | Name shown on the panel; the in-game name is used when left empty |
| **{{ui:monsterMonitor.entityDuration.durationSeconds}}** | Countdown length; when left empty, `∞` is shown until the entity disappears |
| **{{ui:monsterMonitor.entityDuration.scope}}** | **{{ui:monsterMonitor.entityDuration.scope.self}}**: only shows the ones you cast; **{{ui:monsterMonitor.entityDuration.scope.any}}**: shows everyone's, with the name becoming "name-caster" |
| **{{ui:monsterMonitor.entityDuration.merge}}** | Check it when one cast spawns several entities with the same ID: each caster's entities share one row showing the one with the least time left. With **{{ui:monsterMonitor.entityDuration.scope.any}}**, every caster gets their own row |

Only one entry is kept per entity ID, up to 32 entries. You can edit, reorder, delete them or toggle merging in **{{ui:monsterMonitor.entityDuration.listTitle}}**.

## Voice announcements

Three events can be configured: **on appear / x seconds left / on disappear**:

- "x seconds left" requires the entry to have a duration;
- With merging on, "x seconds left" follows the countdown on the overlay: entities that appear together are announced once, and an entity that takes over the row later is announced again only if it still has more than x seconds left;
- If the entity disappears early, only "disappear" is announced;
- After you change the duration, entities already on the field restart timing with the new length;
- Voice bindings are stored per entity ID, so they keep working when you change the caster scope; deleting the entry deletes them too;
- With **{{ui:monsterMonitor.enabled}}** off, the overlay no longer shows entities, but their voice announcements keep working.

## Examples

- [Show the Scythe Cart's remaining time](./examples/scythe-cart.md)