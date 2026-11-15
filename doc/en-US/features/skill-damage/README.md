# Skill Damage Display

**{{ui:routes.tools.skillDamage}}** shows the damage number of every hit of the skills **you** choose on the game overlay. Give your ultimate or burst skills their own eye-catching font and animation, or add up the damage of a stretch of time into one total.

![Skill damage numbers in game](../../../shared/img/changelog/v0.2.9_1.png)

## Turning it on

1. Open **{{ui:routes.tools.skillDamage}}** in the sidebar and turn on **{{ui:skillDamage.enabled}}** (off by default). The **{{ui:skillDamage.actions.toggleOverlay}}** button at the top of the page is the same switch.
2. Search for skills at the bottom of the skill group settings and add them. The default skill group is empty, so nothing is shown until you add skills; or turn on **{{ui:skillDamage.allSelfDamage}}** to show the damage of all your skills.
3. Click **{{ui:skillDamage.actions.editLayout}}** at the top of the page and drag each skill group's display area into place.

**{{ui:skillDamage.autoHideInDailyScenes.label}}**: hides the numbers in daily scenes such as the main city and brings them back when you leave.

## Profiles

Damage display settings are stored in a damage display profile that follows the [loadout](../app/loadouts.md). **{{ui:skillDamage.profile.title}}** at the top of the page creates, renames and deletes profiles, or switches the profile of the current loadout; you can also pick the **{{ui:loadout.page.damageProfileLabel}}** of each loadout on the **{{ui:routes.tools.loadouts}}** page. An uploaded font is stored only once and shared by all profiles and skill groups.

## Skill groups

A profile can hold several skill groups, each with its own display area, display mode and number style. Use **{{ui:skillDamage.addGroup}}** / **{{ui:skillDamage.deleteGroup}}** to manage them, and **{{ui:skillDamage.groupEnabled}}** to switch one off for a while.

### Adding skills

Search by skill name, alias or damage ID in the search box at the bottom of the group settings, then click a result to add it:

- Damages that share a name but have different IDs can be added separately;
- A damage the tables don't name can be added by typing its full ID;
- Each skill can have an **{{ui:skillDamage.alias}}** that is shown instead of the skill name.

Damage IDs are shown in the "ID" column of the DPS skill details. The column is hidden by default; turn it on in [Display Settings](../dps/settings.md).

**{{ui:skillDamage.allSelfDamage}}**: treats the damage of all your skills as this group's damage, so you don't have to add skills one by one. It works with both display modes.

### Display modes

| Mode | Effect |
| --- | --- |
| **{{ui:skillDamage.mergeMode}}** (default) | Pops up one number per hit |
| **{{ui:skillDamage.continuousMode}}** | Shows a single number that keeps adding up, then plays a final total animation when the window ends |

Options of **{{ui:skillDamage.mergeMode}}**:

- **{{ui:skillDamage.mergeHits}}**: combines multiple hits of the same skill in one batch into a total; when off (default), every hit is shown on its own.
- **{{ui:skillDamage.groupMerge}}**: adds up the damage of all skills in the group from one batch and shows it under the group name.
- **{{ui:skillDamage.maxVisible}}** (8 by default), **{{ui:skillDamage.scrollDirection}}**, **{{ui:skillDamage.animation}}** and **{{ui:skillDamage.duration}}** (2.5 seconds by default).

In **{{ui:skillDamage.continuousMode}}**, the **{{ui:skillDamage.windowMode}}** decides when accumulating starts and when it settles:

| Window rule | Starts | Settles |
| --- | --- | --- |
| **{{ui:skillDamage.windowRolling}}** (default) | A hit from a skill in the group | No new hit within **{{ui:skillDamage.continuousWindow}}** (1.5 seconds by default) |
| **{{ui:skillDamage.windowSkills}}** | An opening skill deals damage; with none chosen, any skill in the group opens it | A closing skill hits, or **{{ui:skillDamage.windowTimeout}}** (15 seconds by default) runs out |
| **{{ui:skillDamage.windowCast}}** | You start casting (Frost Ray and the Verdant Oracle's Infusion for now) | The cast ends, plus **{{ui:skillDamage.castCloseDelay}}** |

- **{{ui:skillDamage.continuousAll}}**: damage from your other skills inside the window also counts toward the total and the combo count, but only hits from skills in the group open or refresh the window.
- **{{ui:skillDamage.continuousAnimation}}** and **{{ui:skillDamage.continuousFinalAnimation}}** are set separately; **{{ui:skillDamage.continuousTotalDuration}}** controls how long the total stays.
- **{{ui:skillDamage.showComboCount}}**: shown as `1 HIT` or `×1`, above, below, left or right of the number.

### Skill label and number style

- **{{ui:skillDamage.labelMode}}**: **{{ui:skillDamage.nameText}}**, **{{ui:skillDamage.nameIcon}}** or **{{ui:skillDamage.nameNone}}**. For an icon, pick a skill or talent icon by class in **{{ui:skillDamage.iconPresets}}** and set the **{{ui:skillDamage.iconBackground}}** and **{{ui:skillDamage.iconOpacity}}**.
- **{{ui:skillDamage.format}}**: **{{ui:skillDamage.integer}}**, **{{ui:skillDamage.grouped}}** (default), **{{ui:skillDamage.cn}}**, **{{ui:skillDamage.western}}**.
- **{{ui:skillDamage.font}}**: a system font, or an uploaded .woff2 / .woff / .ttf / .otf file, plus **{{ui:skillDamage.fontSize}}** and **{{ui:skillDamage.fontWeight}}**.
- **{{ui:skillDamage.numberStyle}}**: italic, **{{ui:skillDamage.fill}}** (solid / gradient), **{{ui:skillDamage.innerGlow}}**, **{{ui:skillDamage.outline}}**, **{{ui:skillDamage.outerGlow}}**, **{{ui:skillDamage.shadow}}**.
- When you are done, click **{{ui:skillDamage.test}}** to preview the current font and animation below.

> [!NOTE]
> Only your own damage is shown. [Excluded targets](../dps/settings.md#excluded-targets) in the DPS settings do not apply here, so damage numbers on a training dummy still show.

## Examples

- [Eye-catching damage numbers for your ultimate](./examples/burst-numbers.md)
- [The total damage of one Frost Ray cast](./examples/frost-ray-total.md)
