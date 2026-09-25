# Entity Duration

**{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.entityDuration}}** times **entities on the field** such as summons and ground devices: the countdown starts when the entity appears and the row is removed when it disappears. Rows are shown in the **Entity Duration Area** of the monster overlay.

Typical uses: persistent summons such as the Scythe Cart, and ground zones that need to be recast.

> [!NOTE]
> This feature replaces the former "Duration Skills" in Live Monitor. A Scythe Cart selected in an old profile is migrated automatically into a "self only" entry.

## How it works

These skills spawn a separate entity on the field, which carries an **entity ID** (monster template ID) and a **caster**. The app watches for the entity appearing and disappearing:

- When recasting the skill makes the old entity disappear and a new one spawn, the old row is removed and a new row starts timing;
- Entities disappear when you change maps, and their rows are removed along with them.

## Presets

**{{ui:monsterMonitor.entityDuration.presetsTitle}}** currently includes the built-in **Scythe Cart** (ID 179903, 35 seconds, self only); click it to add.

## Adding manually

| Field | Description |
| --- | --- |
| **{{ui:monsterMonitor.entityDuration.monsterId}}** | Entity ID, a positive integer |
| **{{ui:monsterMonitor.entityDuration.label}}** | Name shown on the panel; the in-game name is used when left empty |
| **{{ui:monsterMonitor.entityDuration.durationSeconds}}** | Countdown length; when left empty, `∞` is shown until the entity disappears |
| **{{ui:monsterMonitor.entityDuration.scope}}** | **{{ui:monsterMonitor.entityDuration.scope.self}}**: only shows the ones you cast; **{{ui:monsterMonitor.entityDuration.scope.any}}**: shows everyone's, with the name becoming "name-caster" |

Only one entry is kept per entity ID, up to 32 entries. You can edit, reorder or delete them in **{{ui:monsterMonitor.entityDuration.listTitle}}**.

## Voice announcements

Three events can be configured: **on appear / x seconds left / on disappear**:

- "x seconds left" requires the entry to have a duration;
- If the entity disappears early, only "disappear" is announced;
- After you change the duration, entities already on the field restart timing with the new length;
- Voice bindings are stored per "entity ID + caster scope", so changing the scope means configuring them again.

## Examples

### Example: Show the Scythe Cart's remaining time

**Scenario**: You need to recast your Scythe Cart before it expires, so you want the overlay to show how long your own Scythe Cart has left and remind you when 5 seconds remain.

#### Step 1: Add the preset

1. Open **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.entityDuration}}**.
2. In **{{ui:monsterMonitor.entityDuration.presetsTitle}}**, click **Scythe Cart** (ID 179903, 35 seconds, self only).

#### Step 2: Configure the reminder

In the voice announcements, check **x seconds left** for the Scythe Cart, enter 5 seconds, and set the text to "Scythe Cart ending".

#### Step 3: Check the display

1. In **{{ui:monsterMonitor.tabs.overlay}}**, make sure **Entity Duration Area** is shown.
2. Use **{{ui:monsterMonitor.actions.editLayout}}** to adjust its position.
3. Cast the Scythe Cart once; "Scythe Cart" and a countdown appear in the Entity Duration Area.

#### Watching teammates' Scythe Carts

If you also want to see teammates' Scythe Carts, adding the same ID again manually won't work (only one entry is kept per ID). Instead, change the existing entry's **{{ui:monsterMonitor.entityDuration.scope}}** to **{{ui:monsterMonitor.entityDuration.scope.any}}**, and each row will be shown as "Scythe Cart-caster". After changing the scope, the voice has to be configured again.

#### Other entities

For summons or ground devices without a preset, just enter the entity ID and duration in **{{ui:monsterMonitor.entityDuration.manualTitle}}**. If you don't know how long it lasts, leave the duration empty; it shows `∞` until the entity disappears.
