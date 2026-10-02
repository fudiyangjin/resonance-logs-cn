# Review your team's boost coverage

Related page: [Buff Coverage](../buff-coverage.md)

**Scenario**: You are a support whose job is to keep damage-boost Buffs on the party, and you want to know how high your boost coverage was during this boss fight and where it dropped.

## Step 1: Add the Buffs to track

1. Open **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buffCoverage}}**.
2. In **{{ui:skillMonitor.buffCoverage.list.title}}**, search for the boosts you are responsible for, such as "Fiery Battle Will (Bandit Chief)" and "Highland Blood (Basilisk)", and add them one by one.

## Step 2: Decide whether to show it in the overlay

- To watch your own coverage live during combat: turn on **{{ui:skillMonitor.buffCoverage.entry.showInLive}}** for the entry, and enable **Buff Coverage Area** in [Enable Window](.././overlay.md).
- To review only afterwards: leave it off; tracking still happens.

![Live coverage](../../../../shared/img/changelog/v0.2.3_1.png)

## Step 3: Check history after the fight

1. Open **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** and click into this fight.
2. **{{ui:history.buffCoverage.title}}** lists each Buff's coverage and trigger count. Coverage is calculated over **active combat time**, so gaps such as boss invulnerability and phase transitions do not drag the number down.

![Coverage summary](../../../../shared/img/changelog/v0.2.3_3.png)

3. Expand **{{ui:history.timeline.buff.title}}** and choose the player to view; each colored block is a period when the Buff was active. Compare it with the DPS curve above to see whether your boosts lined up with the burst windows.

![Buff coverage timeline](../../../../shared/img/changelog/v0.2.3_2.png)

> [!NOTE]
> Only Buffs already added to the watch list are recorded. Newly added Buffs are tracked starting from the next fight.
