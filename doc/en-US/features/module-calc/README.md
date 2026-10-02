# Module Calculator

As modules pile up in your bag, picking the best 4 or 5 by hand becomes hard to work out. **{{ui:routes.tools.moduleCalc}}** reads all of your modules, enumerates every combination, and lists the top few builds by power score.

## Preparing data

Module data comes from the full character data sent by the game, so you don't need to enter anything by hand:

1. After starting the app, log in to the game, or **change zones once** so the game sends your character data again.
2. Open **{{ui:routes.tools.moduleCalc}}** and click **{{ui:moduleCalc.refresh}}**.
3. If **{{ui:moduleCalc.dataStatus.title}}** shows a module count, the data was read successfully.

After you get new modules or dismantle some, just change zones once and refresh.

## Calculating the best combination

1. In **{{ui:moduleCalc.settings.title}}**, choose the **{{ui:moduleCalc.settings.moduleCount}}**: 4 modules or 5 modules, matching the number of slots you can currently equip.
2. Set filters as needed (see below). You can also leave everything unset; the calculator then searches all modules for the highest-power combination.
3. Click **{{ui:moduleCalc.start}}** and wait for the progress bar to finish.
4. **Results** lists the builds by **{{ui:moduleCalc.results.score}}** from high to low. Click **{{ui:moduleCalc.results.viewDetail}}** to see each module's quality, attributes and total attribute value.

### How the score is calculated

A build's score corresponds to the power that the module combination provides, and depends mainly on two things:

- **The level of each attribute**: values of the same attribute across the combination are added together, and reaching 1 / 4 / 8 / 12 / 16 / 20 points raises it to levels 1–6 respectively. Higher levels give more power, and special attributes (those with the 极- prefix in the Chinese client, such as DMG Stack) give more than basic attributes.
- **Total attribute value**: the sum of all attribute values.

So stacking a few attributes up to a high threshold (for example 16 or 20) is usually better than spreading points across many attributes.

## Filter settings

| Setting | Effect | When to use it |
| --- | --- | --- |
| **Exclude modules with total value below** | Modules whose total attribute value is below the set value are left out of the calculation | When you have many modules and the calculation is slow, to weed out obvious junk first |
| **Target attributes** | Only modules that carry the selected attributes are calculated | When you only want certain attributes; also recommended to narrow the range first if you have more than 1000 modules |
| **{{ui:moduleCalc.filters.excludeAttributes}}** | Modules that carry the selected attributes are left out of the calculation | When some attributes are completely useless for your class |
| **{{ui:moduleCalc.filters.minRequirements}}** | The build's combined value of an attribute must reach the set value | When you need an attribute to reach at least a certain level, for example a combined total ≥ 16 |

**{{ui:moduleCalc.dataStatus.title}}** shows both the total number of modules and the number left after the total-value filter, which you can use as a guide while adjusting.

> [!TIP]
> Minimum attribute requirements are more precise than target attributes: target attributes only guarantee that "the module carries this attribute", while minimum attribute requirements guarantee that "the whole build adds up to enough". You can use both together.

## GPU acceleration

With many modules and 5 modules selected, the number of combinations becomes huge. **{{ui:moduleCalc.settings.gpuAcceleration}}** shows whether **{{ui:moduleCalc.settings.cuda}}** and **{{ui:moduleCalc.settings.opencl}}** are **{{ui:moduleCalc.settings.available}}**:

- NVIDIA graphics cards can usually use CUDA; other graphics cards can use OpenCL.
- If neither is available, the CPU is used automatically. The results are the same, just slower.

## Examples

- [Find the best Intellect + Crit combination for a DPS class](./examples/intellect-crit.md)
## FAQ

For problems such as data failing to load or no builds being found, see [FAQ · Module Calculator](../../faq/module-calc.md).
