# Avoid pulling aggro as DPS

Related page: [Threat List](../hate.md)

**Scenario**: You are DPS, and your opening burst often pulls the Boss off the tank. You want to see your place on the threat list at all times and hold back when you get too close to the tank.

## Step 1: Turn on the Hate List Area

1. **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.overlay}}**, turn on the **Hate List Area** (off by default).
2. Click **{{ui:monsterMonitor.actions.editLayout}}** and drag the threat list near the Boss HP bar, so you don't have to look far away from the Boss.

## Step 2: Adjust the display

Open **{{ui:monsterMonitor.tabs.hate}}**:

1. Set **{{ui:monsterMonitor.hate.maxDisplay}}** to 5; in a 5-player dungeon the top few are enough;
2. In **{{ui:monsterMonitor.hate.styleTitle}}**, raise the font size and give the progress bars a color that stands out.

## Result

In combat you see the threat ranking and everyone's threat value. When your bar is about to catch up with the tank's, pause your burst or use a threat-reducing skill.

> [!TIP]
> Tanks can use it to check that they hold aggro. When pulling several monsters at once, combine it with the tank mode of the [Battle Roster](../roster.md) to see which monsters are not on you.
