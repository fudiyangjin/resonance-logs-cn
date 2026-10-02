# Find the best Intellect + Crit combination for a DPS class

Related page: [Module Calculator](../README.md)

**Scenario**: you play a DPS class and have more than 600 modules in your bag. You only care about two damage attributes, want both of them to reach at least 16 points in a 4-module combination, and on top of that want as much power as possible.

The example below uses "Intellect Boost" and "Crit Focus"; in practice, replace them with the attributes your class needs.

## Step 1: Refresh the data

After changing zones once, open **{{ui:routes.tools.moduleCalc}}**, click **{{ui:moduleCalc.refresh}}**, and check that the module count in **{{ui:moduleCalc.dataStatus.title}}** matches your bag.

## Step 2: Narrow the range

1. **Exclude modules with total value below**: drag it to around 8 and watch the "After Total Filter" count drop noticeably.
2. **Target attributes**: select Intellect Boost and Crit Focus so that only modules carrying these two attributes are calculated.
3. **{{ui:moduleCalc.filters.excludeAttributes}}**: exclude attributes you clearly won't use (for example Healing Boost and Armor).

## Step 3: Set minimum requirements

In **{{ui:moduleCalc.filters.minRequirements}}**:

1. In the first row, open the dropdown (it shows "{{ui:moduleCalc.filters.selectAttribute}}" by default), choose Intellect Boost, and enter 16 in the box next to it.
2. Click **{{ui:moduleCalc.filters.add}}** and add another entry: Crit Focus ≥ 16.

## Step 4: Calculate and compare

1. Set **{{ui:moduleCalc.settings.moduleCount}}** to 4 modules and click **{{ui:moduleCalc.start}}**.
2. In the results, click **{{ui:moduleCalc.results.viewDetail}}** and compare the top few builds: when the scores are close, prefer the build whose third attribute is also high.

## What if there are no results

If you see **{{ui:moduleCalc.error.noSolutions}}**, no combination can satisfy all the conditions at once. Try the following in order:

- Lower the minimum requirements from 16 to 12;
- Lower or clear "Exclude modules with total value below";
- Clear the target attributes and keep only the minimum requirements.

> [!TIP]
> Once you've found a build you like, note down each module's attributes and equip them accordingly in the game.
