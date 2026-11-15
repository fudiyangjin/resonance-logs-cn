# The total damage of one Frost Ray cast

Related page: [Skill Damage Display](../README.md)

**Scenario**: The Frost Mage's Frost Ray is a channeled skill, and each tick is small, so one number per hit only floods the screen. You want a single number that keeps adding up while you channel, with the tick count, and the total of the whole ray once it ends.

## Step 1: Create a skill group

1. Open **{{ui:routes.tools.skillDamage}}** in the sidebar and turn on **{{ui:skillDamage.enabled}}**.
2. Click **{{ui:skillDamage.addGroup}}** and enter "Frost Ray" as the **{{ui:skillDamage.groupName}}**.
3. Search for "Frost Ray" at the bottom of the group settings and add its damage.

## Step 2: Switch to continuous display

1. Set **{{ui:skillDamage.displayMode}}** to **{{ui:skillDamage.continuousMode}}**.
2. Set **{{ui:skillDamage.windowMode}}** to **{{ui:skillDamage.windowCast}}** and **{{ui:skillDamage.windowPreset}}** to **{{ui:skillDamage.castRay}}**. The window opens and closes with your own cast and has no timeout.
3. Set **{{ui:skillDamage.castCloseDelay}}** to about 0.3 seconds: the last ticks may arrive just after the ray ends, so wait a moment before settling.
4. Turn on **{{ui:skillDamage.showComboCount}}**, pick the `1 HIT` format and **{{ui:skillDamage.comboBottom}}**.
5. Set **{{ui:skillDamage.continuousTotalDuration}}** to 3 seconds.

## Step 3: Place it

Click **{{ui:skillDamage.actions.editLayout}}** at the top of the page and drag the group's area next to your character.

## Result

While you channel the ray, a number keeps adding up with the tick count under it. When the ray ends (plus the closing delay), the final total animation plays and the total stays for 3 seconds.

> [!NOTE]
> Which damage is added up depends on the skills in the group. To also count damage from your other skills during the ray, turn on **{{ui:skillDamage.continuousAll}}**; only the ray itself still opens the window.

> [!TIP]
> For skills without a channeling preset, use **{{ui:skillDamage.windowRolling}}** (settles when no new hit arrives for a while) or **{{ui:skillDamage.windowSkills}}** (choose which skills open and close the window).
