# Track Flamehorn's Absolute Luck with a preset counter

Related page: [Custom Monitor](../custom-panel.md)

**Scenario**: You play the Flamehorn specialization and want to see, all at once in the overlay, "how many more casts until Absolute Luck triggers", "the internal cooldown of Absolute Luck", and the Absolute Luck Buff itself.

This information does not fully show up as Buffs, so it needs counters. The app includes a **Flamehorn - Passive** preset, so you do not have to write the rule yourself.

## Step 1: Create a manual zone

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}} → {{ui:skillMonitor.customPanel.new}}**, and name it "Flamehorn".

## Step 2: Add the two counter slots

In **{{ui:skillMonitor.customPanel.counter.title}}**, find **Flamehorn - Passive** and add these in turn:

| Slot | Meaning |
| --- | --- |
| **Slot 1** | Counts completed skill casts and shows how many more are needed to trigger Absolute Luck |
| **Slot 2** | Absolute Luck's cooldown: about 15 seconds normally, about 5 seconds while a specific active Buff is in effect |

![Flamehorn - Passive preset settings](../../../../shared/img/monitor/buff_6.png)

## Step 3: Put the Luck Buff in the same area

In the same monitor area, use **{{ui:skillMonitor.customPanel.addBuff}}**, search for **Absolute Luck** and add it. With the three pieces of information side by side, you can read the rhythm at a glance.

## Result

![Flamehorn - Passive in the overlay](../../../../shared/img/monitor/buff_5.png)

## Other presets

The same approach works for the other built-in presets, for example:

- **N20-Tina ATK Down Cooldown**, **N20-Healing Bot Cooldown**: track the internal cooldowns of N20 module effects;
- S4 set effects such as **Vanguard S4 - Auto Dragon Cannon** and **Ray S4 - Frost Infusion 4-Piece**;
- **Transcendence Trigger Count**, **Fantasia Impact Stacks - 30 - Frost Mage**, and so on.

For the full list, see [Built-in preset counters](../custom-panel.md#built-in-preset-counters) above. Any counter can use **{{ui:skillMonitor.customPanel.counter.voiceConfigure}}** to give a voice reminder when it reaches its target.
