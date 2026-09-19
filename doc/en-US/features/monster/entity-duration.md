# Entity Duration

Corresponds to the **Monster Monitor → Entity Duration** tab.

Times summons, ground devices and similar objects by the **appearance / disappearance of their in-game entity**, shown as text rows (label + countdown + progress bar) in the **Entity Duration Area** of the **monster overlay**. Typical use: the Stormblade **Scythe Cart**.

> This replaces the former **Duration Skills** section of Live Monitor. A Scythe Cart selected in an older profile is migrated automatically into a "self only" entry.

## How it works

- The game spawns a dedicated entity for these skills; the entity carries a **monster template id** (Scythe Cart = `179901`) and its **caster**.
- The timer starts when the entity **appears** nearby and the row is removed when it **disappears** (destroyed, expired, zone change). It does not depend on skill cooldown packets or on recording the cast time.
- Recasting a skill that destroys the old entity and spawns a new one removes the old row and starts a fresh one.
- Data is only pushed to the overlay while the **Monster Monitor master switch** is on.

## Presets

Built-in presets are listed on the page (currently **Scythe Cart**: id 179901, 35 s, self only). Click to add; the button is disabled once that id exists.

## Manual entry

Fill in the fields and click **Add**:

| Field | Description |
|------|------|
| **Entity ID** | Positive integer monster template id; invalid values show an error |
| **Label** | Name shown on the panel; falls back to the monster table name when empty |
| **Duration (s)** | Countdown length; **leave empty for no countdown**, the row shows `∞` until the entity disappears |
| **Caster scope** | **Self only**: entities you cast; **Anyone**: everyone's entities, labelled `<label>-<caster>` |

One entry per entity id, up to 32 entries.

## Entry list

Edit label, seconds (clear to switch to `∞`) and scope inline; move entries up / down or remove them.

## Styling

The **Style** block matches the custom panel: row gap, column gap, font size, name / value / progress colours and opacity, text shadow, background.

## Overlay

- Enable the **Entity Duration Area** in [Enable Overlay](./overlay.md) (on by default).
- **Edit Monster Layout** in the top bar lets you drag and resize the area; placeholder rows are shown while editing.
- The panel is not rendered when no entity matches.
