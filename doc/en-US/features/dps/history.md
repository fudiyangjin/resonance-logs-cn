# History

**{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}** stores every automatically split fight so you can open and review it at any time.

![History](../../../shared/img/dps/dps_3.png)

## History list

- **Filter**: filter by **{{ui:history.list.filters.favorite}}**, Boss, player, or encounter; click **{{ui:history.list.filters.favoriteOnly}}** to show only favorites.
- **Bulk delete**: select several entries and click **{{ui:history.list.actions.delete}}**. Deletion cannot be undone.
- **Pagination**: set the number of rows per page at the bottom.

> [!NOTE]
> The default is **200 non-favorite records**. You can change it to 1–2000 in App Settings. Older records are automatically cleaned up by time on the next launch. **Add to favorites** to keep important records from being cleaned up.

## Fight details

Click any entry to open its details. There are four tabs at the top: **{{ui:history.detail.tabs.damage}}**, **{{ui:history.detail.tabs.tanked}}**, **{{ui:history.detail.tabs.healing}}**, **{{ui:history.detail.tabs.death}}**.

Actions in the top-right corner:

| Button | Purpose |
| --- | --- |
| **{{ui:history.detail.actions.addFavorite}}** | Favorite this fight so you can filter for it quickly in the list |
| **Edit note** | Add a note to identify this fight in the history list |
| **Open on website** | View this fight on resonance-logs.com |
| **Delete** | Delete this record |

Click a player to see their skill breakdown (including max / min / average damage), plus a split by **Damage target / Healing target / Damage source**, e.g. to check whether your damage went into the Boss or into adds.

## Timeline

The **{{ui:history.timeline.title}}** on the details page lays out the whole fight over time:

- **Curves**: **{{ui:history.timeline.series.instant}}** shows the moment-to-moment ups and downs of output, and **{{ui:history.timeline.series.average}}** shows the overall trend; you can choose which teammates' curves to display.
- **Lanes**: the **{{ui:history.timeline.lanes.boss}}** lane shows Boss skills, and the **{{ui:history.timeline.lanes.team}}** lane shows teammates' key skills and Fantasy casts.

![History timeline](../../../shared/img/changelog/v0.2.1_2.png)

Controls: **drag** to select a time range · **Shift + drag** to pan · **scroll wheel** to zoom · **double-click** to reset · drag the bottom edge to adjust the height.

After you select a time range, the damage stats on the page are **recalculated for the selection only**; click **{{ui:history.timeline.selection.zoomToRange}}** to zoom in on it.

## Buff coverage

If you have configured a watch list in [Buff Coverage](../monitor/buff-coverage.md), the history details additionally show:

- **{{ui:history.timeline.buff.title}}** timeline: when each Buff was active and for how long;
- **{{ui:history.buffCoverage.title}}**: coverage and trigger counts calculated over active combat time.

![Buff coverage timeline](../../../shared/img/changelog/v0.2.3_2.png)

![Buff coverage summary](../../../shared/img/changelog/v0.2.3_3.png)

> [!NOTE]
> Coverage data has been recorded since v0.2.3; older history records don't include it.

For the full workflow from setting up the list to reviewing a fight, see [Example: Review your team's boost coverage](../monitor/examples/buff-coverage.md).

## History page display settings

Lane height, curve height, the instant DPS window, and the history table columns are all set under **{{ui:routes.dps.settings}} → {{ui:settings.tabs.history}}**; see [Display Settings](./settings.md#history).

## Examples

- [Find DPS gaps with the timeline](./examples/timeline-gaps.md)