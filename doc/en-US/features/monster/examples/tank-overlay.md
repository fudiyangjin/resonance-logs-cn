# Set up the monster overlay for your role

Related page: [Enable Window](../overlay.md)

**Scenario**: You are using the Monster Monitor for the first time and only two default areas show up. As a tank, you want threat, stun, the Battle Roster and Boss warnings, laid out where they don't block your view.

## Step 1: Turn on the Monster Monitor

Open **{{ui:routes.tools.monsterMonitor}}**, make sure **{{ui:monsterMonitor.enabled}}** is on, then click **{{ui:monsterMonitor.actions.toggleOverlay}}** at the top of the page to show the monster overlay.

## Step 2: Turn on the areas you need

In **{{ui:monsterMonitor.tabs.overlay}}**, turn on the areas for your role:

| Role | Suggested areas |
| --- | --- |
| Tank | **Hate List Area**, **Battle Roster**, **Stun Bar Area**, **Boss DBM Area** |
| DPS | **Monster Buff Area**, **Stun Bar Area**, **HP Bar Area**, **Boss DBM Area** |
| Support | **Teammate Buff Area**, **Teammate CD Area**, **Boss DBM Area** |

Turn off what you don't need; the less on screen, the clearer it is. A green dot on a tab means its area is showing on the overlay.

## Step 3: Place them

1. Click **{{ui:monsterMonitor.actions.editLayout}}**; areas without live data show a placeholder preview.
2. Put the threat list and the roster on one side, and the stun bar and Boss warnings at the top center; drag corners to resize.
3. If things get messy, **Reset position** and **Reset size** bring back the defaults.

## Result

In dungeons every area shows in a fixed place, and the threat, roster and warnings a tank needs are all within view.

> [!TIP]
> These switches are saved in the current loadout's monster monitor profile. Keep one set in your tank loadout and another in your DPS loadout, and the overlay switches along with the loadout; see [Loadouts](../../app/loadouts.md).
