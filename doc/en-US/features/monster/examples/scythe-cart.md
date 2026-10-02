# Show the Scythe Cart's remaining time

Related page: [Entity Duration](../entity-duration.md)

**Scenario**: You need to recast your Scythe Cart before it expires, so you want the overlay to show how long your own Scythe Cart has left and remind you when 5 seconds remain.

## Step 1: Add the preset

1. Open **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.entityDuration}}**.
2. In **{{ui:monsterMonitor.entityDuration.presetsTitle}}**, click **Scythe Cart** (ID 179903, 35 seconds, self only, merged). One cast spawns 2 entities; the preset already has **{{ui:monsterMonitor.entityDuration.merge}}** checked, so the overlay shows a single row.

## Step 2: Configure the reminder

In the voice announcements, check **x seconds left** for the Scythe Cart, enter 5 seconds, and set the text to "Scythe Cart ending".

## Step 3: Check the display

1. In **{{ui:monsterMonitor.tabs.overlay}}**, make sure **Entity Duration Area** is shown.
2. Use **{{ui:monsterMonitor.actions.editLayout}}** to adjust its position.
3. Cast the Scythe Cart once; "Scythe Cart" and a countdown appear in the Entity Duration Area.

## Watching teammates' Scythe Carts

If you also want to see teammates' Scythe Carts, adding the same ID again manually won't work (only one entry is kept per ID). Instead, change the existing entry's **{{ui:monsterMonitor.entityDuration.scope}}** to **{{ui:monsterMonitor.entityDuration.scope.any}}**, and each row will be shown as "Scythe Cart-caster". After changing the scope, the voice has to be configured again.

## Other entities

For summons or ground devices without a preset, just enter the entity ID and duration in **{{ui:monsterMonitor.entityDuration.manualTitle}}**. If you don't know how long it lasts, leave the duration empty; it shows `∞` until the entity disappears.
