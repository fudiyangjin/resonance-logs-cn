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

**{{ui:monsterMonitor.entityDuration.presetsTitle}}** currently includes the following built-in entries; click one to add it:

| Preset | ID | Duration | {{ui:monsterMonitor.entityDuration.scope}} | {{ui:monsterMonitor.entityDuration.merge}} |
| --- | --- | --- | --- | --- |
| **Scythe Cart** | 179903 | 35 seconds | {{ui:monsterMonitor.entityDuration.scope.self}} | Yes |
| **Fafala Duty** (zone) | 55 | 10 seconds | {{ui:monsterMonitor.entityDuration.scope.any}} | No |
| **Fafala Imagine** (zone) | 53 | 15 seconds | {{ui:monsterMonitor.entityDuration.scope.any}} | No |

## Adding manually

| Field | Description |
| --- | --- |
| **{{ui:monsterMonitor.entityDuration.monsterId}}** | Entity ID, a positive integer |
| **{{ui:monsterMonitor.entityDuration.label}}** | Name shown on the panel; the in-game name is used when left empty |
| **{{ui:monsterMonitor.entityDuration.durationSeconds}}** | Countdown length; when left empty, `∞` is shown until the entity disappears |
| **{{ui:monsterMonitor.entityDuration.scope}}** | **{{ui:monsterMonitor.entityDuration.scope.self}}**: only shows the ones you cast; **{{ui:monsterMonitor.entityDuration.scope.any}}**: shows everyone's, with the name becoming "name-caster" |
| **{{ui:monsterMonitor.entityDuration.merge}}** | Check it when one cast spawns several entities with the same ID: each caster's entities share one row showing the one with the least time left. With **{{ui:monsterMonitor.entityDuration.scope.any}}**, every caster gets their own row |

Only one entry is kept per entity ID, up to 32 entries. You can edit, reorder, delete them or toggle merging in **{{ui:monsterMonitor.entityDuration.listTitle}}**.

## Debugging: show your own entities

If you don't know the ID of a summon or zone, turn on **{{ui:monsterMonitor.entityDuration.monitorAll}}** at the top of the page and cast the skill once. After the list entries, the Entity Duration Area shows the entities you created that are not on the list:

- They are shown as `name#ID`, or just `#ID` when there is no name; `×count` is appended when several entities with the same ID are present, in which case the entry should have **{{ui:monsterMonitor.entityDuration.merge}}** checked;
- On the right is how many seconds the entity has been present (e.g. `+12s`), counting until it disappears, so you can read off its duration;
- Once you add the ID to the list, the row turns into a countdown right away, timed from when the entity actually appeared.

Notes:

- Only entities you create are shown; entities the game reports no caster for do not appear;
- Entities already on the field when you turn the switch on are timed from that moment;
- Requires **{{ui:monsterMonitor.enabled}}** and the Entity Duration Area shown in **{{ui:monsterMonitor.tabs.overlay}}**;
- The switch is saved with the profile and included in loadout exports; turn it off once your entries are set up.

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