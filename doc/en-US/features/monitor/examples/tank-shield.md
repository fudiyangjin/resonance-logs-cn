# How much more can the tank take

Related page: [HP/Shield Area](../shield.md)

**Scenario**: You are the tank. Before the Boss's big attack you want to know whether your HP plus shields will hold. Your shields come from several sources, and you want to see what is left of each.

## Step 1: Choose what to show

Open **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.shieldDetail}}** and turn on:

- **{{ui:skillMonitor.shieldDetail.showHpBar}}**: your current HP;
- **{{ui:skillMonitor.shieldDetail.showTotalShieldBar}}**: the total of all shields;
- **{{ui:skillMonitor.shieldDetail.showShieldEntries}}**: one row per shield source.

## Step 2: Colors and width

Set **{{ui:skillMonitor.shieldDetail.hpColor}}**, **{{ui:skillMonitor.shieldDetail.shieldColor}}** and **{{ui:skillMonitor.shieldDetail.healShieldColor}}** to three colors that are easy to tell apart, and make the bars about as wide as the skill CD area.

## Step 3: Turn on the HP/Shield Area

1. Turn on the **HP/Shield Area** in **{{ui:skillMonitor.tabs.overlay}}** (off by default).
2. Click **{{ui:skillMonitor.layout.editOverlayLayout}}** at the top of the page and drag it to the lower middle of the screen, near your character.

## Result

In combat, the total shield and every shield layer sit under your HP bar; one glance before the big attack tells you whether to use a defensive first.

> [!TIP]
> Shield Knight's vertical shield bar during "Radiant Shield" lives in the resource sections and works well together with this area; see [Keep an eye on class resources with resource sections](./resource-bar.md).
