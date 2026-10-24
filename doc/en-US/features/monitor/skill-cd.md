# Skill CD

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.skillCd}}** shows the skills you pick as icons in the overlay, with their remaining cooldown in real time.

## Choosing skills

1. Pick a class in **{{ui:skillMonitor.skillCd.class.title}}**; that class's skills are listed below.
2. In **{{ui:skillMonitor.skillCd.skills.title}}**, pick skills by tab: class skills are listed directly; **{{ui:skillMonitor.skillCd.resonance.title}}** are found by searching their name, and the ones you already picked are listed while the search box is empty; **{{ui:skillMonitor.skillCd.duty.title}}** are grouped into attack, survival, support and encyclopedia. Unyielding Spirit supports two charges.
3. You can monitor up to **10** skills across all areas. Class, fantasy and role skills share this limit.

## Splitting skills into areas

In **{{ui:skillMonitor.skillCd.preview.title}}** you can split skills into several areas, for example class skills in one area and fantasy and role skills in another. Each area is moved and scaled on its own in the overlay, and all areas share the Skill CD Area visibility switch.

- Click an area tab to make it current; newly added skills go into the current area. Areas can be renamed; the defaults are "Area 1", "Area 2" and so on.
- A skill can be in only one area. The number in a skill tile's corner shows which area it is in; clicking the tile moves it to the current area.
- Deleting an area stops monitoring its skills (you are asked to confirm when it has skills). At least one area is always kept.

## Arranging skills

- Each area starts as 2 rows × 5 columns; each dimension can be set from **1 to 10**.
- **{{ui:skillMonitor.skillCd.layout.gap}}** sets the space between the area's icons: 2 px by default, from 0 to 24 px. The area's overall size is scaled in overlay edit mode.
- Select an empty cell before adding a skill to place it there. Otherwise, the first empty cell is used. Increase rows or columns when the grid is full.
- Drag to an empty cell to move, or onto another skill to swap. Removing a skill leaves its cell empty without moving other skills. Clicking a preview cell only selects it.
- Resizing preserves coordinates. A smaller grid is rejected if any skill would fall outside it. **{{ui:skillMonitor.skillCd.layout.compact}}** packs skills in their current reading order and shrinks the grid, removing intentional gaps.
- Use Enter / Space to select, Alt + arrow keys to move or swap, Delete to remove, and Esc to cancel. Dropping outside the grid leaves the layout unchanged.

The normal overlay shows only configured skills and trims unused rows at the bottom and columns on the right. Leading and internal gaps are preserved. Two adjacent skills show just two icons; an area without skills is hidden. Overlay edit mode shows each area's entire grid for moving or scaling that area; individual cells are arranged on the settings page.

Skill icons sit on a dark plate tinted with the in-game skill button's element colour (red, grey, blue, gold or green), so they stay readable over bright scenes. Teammate CDs use the same plate.

Layouts are saved, copied, exported and imported with the loadout. An older loadout's skill bar becomes "Area 1" with its position and scale unchanged. Clearing skills or switching class keeps every area and its grid dimensions.

## Skill transforms

Some skills turn into another form under certain Buffs, and the CD icon and name switch along with them automatically. For example, Wind Knight's "Falcon Toss" shows as "Azure Sever" under a specific Buff, and Frost Mage's "Blizzard" shows as "Instant Blizzard" under the no-cast-time Buff.

![Skill transforms](../../../shared/img/monitor/cd_1.png)

## Voice announcements

In the **{{ui:skillMonitor.skillCd.voice.title}}** section, you can set up three events for any skill of the current class, any fantasy skill or any role skill. The skill doesn't need to be in the cooldown monitor above, since the game already shows its skill bar: click it under the **{{ui:skillMonitor.skillCd.voice.classSkills}}**, **{{ui:skillMonitor.skillCd.resonance.title}}** or **{{ui:skillMonitor.skillCd.duty.title}}** tab, and it joins the announcement list once you turn an event on. The tabs mark only skills with announcements, regardless of the cooldown monitor's selection.

| Event | When |
| --- | --- |
| **On cast** | The skill goes on cooldown |
| **When ready** | The cooldown ends |
| **x seconds before ready** | The cooldown is about to end, so you can get ready |

For charge-based skills, **every charge that comes back** counts as the cooldown ending, so "When ready" and "x seconds before ready" play for each charge. Announcements require a model to be installed and enabled in [Voice](../voice/README.md).

Voice announcements and the cooldown monitor are independent: monitoring or un-monitoring a skill leaves its announcements alone, and **{{ui:skillMonitor.common.remove}}** deletes them when you no longer need them. Switching class in **{{ui:skillMonitor.skillCd.class.title}}** clears the current profile's skill announcements; other profiles are unaffected.

> [!NOTE]
> "Duration skills" (such as Scythe Cart) that used to be configured here have moved to [Monster Monitor · Entity Duration](../monster/entity-duration.md). Old profiles are migrated automatically.
