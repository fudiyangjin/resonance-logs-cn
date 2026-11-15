# Eye-catching damage numbers for your ultimate

Related page: [Skill Damage Display](../README.md)

**Scenario**: When you land your ultimate, you want a big golden number above your character with the ultimate's icon. Damage from other skills should stay hidden so the screen doesn't get cluttered.

## Step 1: Turn it on and create a skill group

1. Open **{{ui:routes.tools.skillDamage}}** in the sidebar and turn on **{{ui:skillDamage.enabled}}**.
2. Click **{{ui:skillDamage.addGroup}}** and enter "Ultimate" as the **{{ui:skillDamage.groupName}}**.

## Step 2: Add the ultimate's damage

1. Type the ultimate's name in the search box at the bottom of the group settings and click the result to add it.
2. If several results share the name, first turn on the "ID" column of the DPS skill details ([Display Settings](../../dps/settings.md)), use the ultimate once, note its damage ID, then search by ID.
3. If the ultimate deals damage in several parts, add all of them and turn on **{{ui:skillDamage.groupMerge}}**: the parts from one batch are added up into one number shown under the group name "Ultimate".

## Step 3: Adjust the style

1. Keep **{{ui:skillDamage.displayMode}}** at **{{ui:skillDamage.mergeMode}}**.
2. Set **{{ui:skillDamage.labelMode}}** to **{{ui:skillDamage.nameIcon}}** and find the ultimate's icon by class in **{{ui:skillDamage.iconPresets}}**.
3. Raise **{{ui:skillDamage.fontSize}}** to about 40. In **{{ui:skillDamage.numberStyle}}**, make the **{{ui:skillDamage.fill}}** a golden gradient and add a dark **{{ui:skillDamage.outline}}** so it stays readable in bright scenes.
4. Set **{{ui:skillDamage.format}}** to **{{ui:skillDamage.western}}** so big numbers are easier to read.
5. Click **{{ui:skillDamage.test}}** to preview it.

## Step 4: Place it

Click **{{ui:skillDamage.actions.editLayout}}** at the top of the page, drag the "Ultimate" group's area above your character and drag a corner to resize it. Leave edit mode when you are done.

## Result

When you land the ultimate, a golden damage number with its icon pops up above your character.

![Skill damage numbers in game](../../../../shared/img/changelog/v0.2.9_1.png)

> [!TIP]
> To see your other skills as well, create another skill group with a smaller font on the other side. Each group's area and style are independent.
