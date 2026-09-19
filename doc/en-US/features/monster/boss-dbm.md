# Boss DBM (Monster Monitor)

Corresponds to **Monster Monitor → Boss DBM** tab.

Shows **Boss mechanic warning bars** on the monster overlay: skill name plus remaining countdown, similar to a DBM addon timer bar.

## What It Does

- Data comes from in-game **Boss DBM scene events** (`SyncSceneEvents`), parsed and pushed to the monster overlay.
- Skill names resolve via the built-in **DBM table** (`DbmTable.json`); unknown entries show as `#skillEffectId`.
- Multiple active mechanics sort by trigger time; each row includes a progress bar for remaining time.
- **No manual skill list**: bars appear when the Boss fires DBM-tagged mechanics and disappear when they end.

> Boss DBM complements [Buff Monitor](./buff.md): buffs for specific debuffs/stacks; DBM for unified Boss cast countdown bars.

## Enable the Panel

1. Turn on **Enable Monster Monitor** at the page top.
2. Under **Enable Window**, set **Boss DBM Area** to show.
3. Use top bar **Toggle Monster Overlay** to show the in-game window.

**Boss DBM** is off by default to avoid overlapping buff/threat areas.

## Styling

On the **Boss DBM** tab, adjust styles for the **Boss DBM area** (separate from monster buff styling):

| Setting | Description |
|----|------|
| Row gap | Vertical spacing between warning bars |
| Column gap | Horizontal spacing between name and timer |
| Font size | Text size |
| Name / value colors | Skill name and countdown colors |
| Progress color / opacity | Remaining-time bar appearance |

## Layout Editing

With **Edit Monster Layout** on the top bar:

- Drag the **Boss DBM area** to reposition
- Drag the corner handle to scale
- A **mechanic preview** placeholder appears when no live mechanics exist, for pre-placement

Use **Reset Position** / **Reset Size** in edit mode when available.

## FAQ

**No Boss DBM bars?**

1. Confirm **Boss DBM area** is set to show.
2. Confirm **Enable Monster Monitor** and **Toggle Monster Overlay** are on.
3. The current Boss must emit DBM events; some dummies or skills without DBM tags show nothing.
4. If you started the app mid-fight, **change zone** once to resync (same as live monitor).

**Use with dungeon mechanics overlay?**

Yes—Boss DBM uses the monster overlay; dungeon mechanics use a separate window. See [Dungeon Mechanics overview](../minimap/README.md).
