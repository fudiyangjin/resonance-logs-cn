# Check your attributes during burst

Related page: [Character Panel](../panel-attr.md)

**Scenario**: You stack a lot of buffs for your burst window and want to see how high your {{ui:game.panelAttr.11710}}, {{ui:game.panelAttr.11930}} and {{ui:game.panelAttr.11780}} go, to make sure the buffs landed. The other attributes don't matter to you.

## Step 1: Enable only the attributes you need

1. Open **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.panelAttr}}**.
2. Among the enabled attributes, tick only {{ui:game.panelAttr.11710}}, {{ui:game.panelAttr.11930}} and {{ui:game.panelAttr.11780}}.

## Step 2: Colors and order

1. In **{{ui:skillMonitor.panelAttr.displayColor}}**, give {{ui:game.panelAttr.11930}}, the one you care about most, a color that stands out.
2. In **{{ui:skillMonitor.panelAttr.rowOrder}}**, move {{ui:game.panelAttr.11930}} to the top.
3. In **{{ui:skillMonitor.panelAttr.textStyle}}**, raise the font size and tighten the line spacing.

## Step 3: Turn on the Character Attribute Area

1. In **{{ui:skillMonitor.tabs.overlay}}**, make sure the **Character Attribute Area** is on (it is by default).
2. Click **{{ui:skillMonitor.layout.editOverlayLayout}}** at the top of the page and drag the area next to your skill CDs.

## Result

When you burst, the values in the attribute area rise in real time; a buff that didn't land is obvious at a glance.

> [!NOTE]
> If attributes are missing or clearly lag behind, change scenes once to resync them completely.
