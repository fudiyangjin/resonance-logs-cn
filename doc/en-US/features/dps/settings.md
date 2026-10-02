# Display Settings

**{{ui:routes.tools.dps}} → {{ui:routes.dps.settings}}** determines "what data" the DPS window shows: names, columns, number formatting, refresh rate, and training dummy rules. It has two tabs, **{{ui:settings.tabs.live}}** and **{{ui:settings.tabs.history}}**, which don't affect each other.

> [!NOTE]
> These settings are stored in the **DPS settings profile**, and are switched and exported along with the [loadout](../app/loadouts.md). App-level settings such as packet capture, shortcuts, and logs have moved to [App Settings](../app/README.md).

## Live

### General settings

| Setting | Description |
| --- | --- |
| **{{ui:settings.common.name.your}}** / **{{ui:settings.common.name.others}}** | Show the name, class, Name - Class, Name - Spec, or hide it (commonly used when recording videos) |
| **Ability Score / Season Strength** | Whether to show your and others' scores next to names |
| **Scale to Top** | Whether bar length is relative to the top performer or to the total |
| **Shorten values** | Whether DPS / TPS / Ability Score are abbreviated |
| **{{ui:settings.common.abbreviationStyle}}** | {{ui:settings.common.abbreviationStyle.western}} or {{ui:settings.common.abbreviationStyle.cn}} |
| **{{ui:settings.common.decimalPlaces}}** | 1–4 digits |
| **{{ui:settings.live.fantasyCastIcons}}** | Show recently cast Fantasy icons next to player names |
| **{{ui:settings.live.refreshRate}}** | 50–2000 ms; lower is smoother but uses more CPU |

### Columns

**{{ui:settings.common.columns.dpsPlayers}}**, **{{ui:settings.common.columns.dpsSkills}}**, healing, damage taken, and **{{ui:settings.common.columns.deathReplay}}** each have their own column configuration:

- Toggles control whether a column is shown;
- Arrows change the column order;
- You can enter a **custom header**; leave it empty to use the default column name.

Death replay columns are shared between Live and History.

### Training dummy

| Setting | Description |
| --- | --- |
| **{{ui:settings.live.trainingWindow}}** | Timing starts when you hit the dummy and the round ends when time is up; default 3:03 (183 seconds) |
| **{{ui:settings.live.trainingLockPolicy}}** | **{{ui:settings.live.trainingLockPolicy.eliteDummies}}**: only the elite dummies at the training ground count; **{{ui:settings.live.trainingLockPolicy.firstMonster}}**: locks onto the next monster you (including your summons) hit, suitable for testing in the open world or in dungeons |

For the training dummy workflow, see [Example: Test a 3-minute rotation with training dummy mode](./examples/dummy-rotation.md).

## History

The History tab has general settings and column settings with the same structure as Live; they only take effect when you open history details. There are also timeline-related settings:

| Setting | Description |
| --- | --- |
| **{{ui:settings.history.timeline.laneH}}** | Height of each lane |
| **{{ui:settings.history.timeline.curveH}}** | Height of the DPS curve area |
| **{{ui:settings.history.timeline.instantWindow}}** | How many recent seconds the instant DPS curve averages over |
| **{{ui:settings.history.fantasyCastIcons}}** | Show the 2 Fantasies most recently cast during the whole fight next to player names |

## Examples

- [Customize displayed columns in tables](./examples/table-columns.md)