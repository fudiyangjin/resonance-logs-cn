# Find DPS gaps with the timeline

Related page: [History](../history.md)

**Scenario**: You just finished a Boss fight and your DPS was lower than usual. You want to find out which part of the fight your output dropped in, and why.

## Step 1: Open the fight

1. Go to **{{ui:routes.tools.dps}} → {{ui:routes.dps.history}}**.
2. Use the "Boss" filter to find this Boss, then open the entry you just played.

## Step 2: Look at the instant DPS curve

In the **{{ui:history.timeline.title}}**, switch the curve to **{{ui:history.timeline.series.instant}}**, and in the curve selection check only yourself and one or two teammates for reference.

- The whole curve is low → a rotation or build problem;
- A section suddenly drops close to 0 → there was a gap during that time.

![History timeline](../../../../shared/img/changelog/v0.2.1_2.png)

## Step 3: Select the gap

1. **Drag** on the curve to select the section where output dropped.
2. The page's damage stats are recalculated **for that section only**, so you can see which skills you used during that time and whom they hit.
3. Click **{{ui:history.timeline.selection.zoomToRange}}** to zoom in and compare with the **{{ui:history.timeline.lanes.boss}}** lane above: common causes are a Boss phase transition / invulnerability, or you dodging a mechanic.

## Step 4: Check whether a buff dropped

If you have configured [Buff Coverage](../../monitor/buff-coverage.md), click **{{ui:history.timeline.buff.title}}** in the timeline header to expand it (it shows you by default) and check whether your burst Buff happened to be missing during the gap.

![Buff coverage timeline](../../../../shared/img/changelog/v0.2.3_2.png)

## Step 5: If you went down

Switch to **{{ui:history.detail.tabs.death}}** to see every hit you took in the seconds before death, and figure out which mechanic caused it.

> [!TIP]
> For long-term comparison, **{{ui:history.detail.actions.addFavorite}}** your best-performing fight, and compare the curve for the same phase against it in later reviews.
