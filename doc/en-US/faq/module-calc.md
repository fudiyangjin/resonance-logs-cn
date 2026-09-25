# FAQ · Module Calculator

## After clicking refresh, it says fetching modules failed, or the module count is 0?

Modules come from the full character data sent by the game, and the app needs to have received it at least once:

1. Make sure packet capture is working and the DPS window shows data; see [No data / packets not captured?](./app-runtime.md#no-data--packets-not-captured).
2. **Change zones once** in the game (teleport, enter/leave a dungeon, or switch channels).
3. Go back to **{{ui:routes.tools.moduleCalc}}** and click **{{ui:moduleCalc.refresh}}** again.

## The module count doesn't match my inventory?

What's shown is the most recently received character data. After obtaining or dismantling modules, change zones once and then refresh.

## It says "{{ui:moduleCalc.error.noSolutions}}"?

The filters are too strict and no combination can satisfy them. Loosen them one at a time: lower the minimum attribute requirements, lower the total-value exclusion threshold, and reduce the target attributes or excluded attributes.

## It says at least 4 (or 5) modules are required?

Fewer modules are taking part in the calculation than the number of modules you've selected. Usually too many modules have been filtered out; check the "After Total Filter" count in **{{ui:moduleCalc.dataStatus.title}}**.

## Calculation is slow?

- Narrow the range first with **Exclude modules with low total value** and **Target attributes** — this is especially effective when you have more than 1000 modules.
- Make sure CUDA or OpenCL shows as **{{ui:moduleCalc.settings.available}}** in **{{ui:moduleCalc.settings.gpuAcceleration}}**.
- There are far more 5-module combinations than 4-module ones, so they also take much longer.

## GPU acceleration shows as unavailable?

Update your graphics driver. NVIDIA cards use CUDA; other cards use OpenCL. When it's unavailable, the CPU is used automatically, with the same results.
