# Buff Coverage

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buffCoverage}}** tracks the **coverage** (active time ÷ active combat time) and **trigger count** of selected Buffs during combat. You can watch it live and also review it in history.

![Live coverage](../../../shared/img/changelog/v0.2.3_1.png)

## Adding watched Buffs

Search for Buffs in **{{ui:skillMonitor.buffCoverage.list.title}}** and add them. There is a limit on how many you can add, and the page shows "added / limit".

You can also add a [composite buff](./buff.md#composite-buffs): its coverage counts the time its condition holds (all, or at least k, members active at once), both live and in history (teammates included).

Each entry has a **{{ui:skillMonitor.buffCoverage.entry.showInLive}}** switch:

- **On**: your own coverage is shown in the Buff coverage area of the live monitor overlay. While that area is shown, **{{ui:skillMonitor.buff.all.title}}** no longer repeats this Buff; if you selected it explicitly in Buff Monitor, it still shows there;
- **Off**: not shown in the overlay, but still tracked for teammates and history.

## Overlay style

**{{ui:skillMonitor.buffCoverage.style.title}}** controls whether each row shows the **state dot**, **name**, **remaining time**, **coverage %**, **trigger count** and **countdown bar**, and sets the colors of the name, values and progress bar.

## Viewing in history

After a fight, open its details page in [History](../dps/history.md#buff-coverage) to see the coverage timeline and coverage summary of these Buffs for each party member.

![Coverage summary](../../../shared/img/changelog/v0.2.3_3.png)

## Examples

- [Review your team's boost coverage](./examples/buff-coverage.md)