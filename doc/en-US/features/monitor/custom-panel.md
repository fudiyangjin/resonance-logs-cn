# Custom Monitor

**{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.customPanel}}** lets you create several **text monitor areas** in the overlay. Each area is a separate list that can be dragged, resized and styled on its own.

![Custom monitor areas](../../../shared/img/monitor/buff_3.png)

## Three kinds of monitor areas

| Type | How to create | Content | Needs setup? |
| --- | --- | --- | --- |
| **{{ui:skillMonitor.customPanel.kind.factor}}** | **{{ui:skillMonitor.customPanel.newFactor}}** (S3 and earlier seasons) | Energy and Buff effects of your currently equipped factors | No, generated automatically |
| **{{ui:skillMonitor.customPanel.kind.seasonNode}}** | **{{ui:skillMonitor.customPanel.newFactor}}** (from S4) | Buff effects of activated season nodes | No, generated automatically |
| **{{ui:skillMonitor.customPanel.kind.manual}}** | **{{ui:skillMonitor.customPanel.new}}** | Buffs and counters you pick by hand | Yes |

When you click **{{ui:skillMonitor.customPanel.newFactor}}**, the app decides which kind to create based on the current season: from S4 it creates a season node zone; in earlier seasons it creates a factor zone.

> [!IMPORTANT]
> To see when factors or nodes trigger, **just create a factor zone**. You no longer need to combine Sources and Slots by hand with "Custom counter rules" as in older versions.

## Factor zone

Once created, the app generates entries automatically from the factors you currently have equipped. Common ones are:

- **True Factor A / B energy**: count progress;
- **True Factor A / B Buff effect**: the Buff duration after the factor triggers.

Entries are maintained entirely by the system:

- They are synced as a whole once when you change maps; after that, when you switch factor paths or change the loaded factors in game, the entries update automatically;
- You **cannot** manually add Buffs or counters to a factor zone.

**Changing display names:**

| Entry | Where to change it |
| --- | --- |
| Count-type entries such as energy | With the factor zone selected, search for the slot (name / description) in **{{ui:skillMonitor.customPanel.factorSlots.title}}** and enter a custom display name. It is saved per slot template and still applies after switching profiles |
| Buff effect entries | [Buff Monitor · Buff Alias Settings](./buff.md#names-and-icons) (global) |

## Season node zone

From S4, **{{ui:skillMonitor.customPanel.newFactor}}** creates a season node zone: it shows the Buff effects of activated nodes, which appear automatically once a node is activated, **with no display names to set up**.

![S4 season node zone](../../../shared/img/changelog/v0.2.1_1.png)

## Manual zone

Click **{{ui:skillMonitor.customPanel.new}}** to create one, then put things in it:

- **{{ui:skillMonitor.customPanel.addBuff}}**: pick from the Buff search; added only to the current monitor area. [Composite buffs](./buff.md#composite-buffs) can be picked too;
- **{{ui:skillMonitor.customPanel.entries.stateOnly}}**: the Buff entry stays on screen and only shows whether it is active, without a timer;
- **{{ui:skillMonitor.customPanel.counter.title}}**: choose a counter slot from the preset rules or your own custom rules;
- **{{ui:skillMonitor.customPanel.hideWhenZero}}**: the counter takes no space while it is 0;
- **{{ui:skillMonitor.customPanel.counter.voiceConfigure}}**: announce when the count reaches its target.

In **{{ui:skillMonitor.customPanel.entries.title}}** you can change display names, reorder entries or remove them.

> [!NOTE]
> The same Buff or counter slot can appear only once across **all** custom monitor areas; items already used by another area are shown as "Already in xxx". Buff Monitor and Buff Coverage are not affected: a Buff placed here still shows there as usual.

### Built-in preset counters

Some triggers do not show up as Buffs and need counting instead (for example "triggers once every few hits" or "internal cooldown"). The app includes the following presets, which you can pick directly when adding a counter:

| Category | Presets |
| --- | --- |
| General / class | Transcendence Trigger Count, Heart of Stone Trigger Count, Frenzied Cleave Combo Count, Bash Pursuit Count, Granite Fury Pursuit Count, Judgment Pursuit Count - Light Shield, Judgment Pursuit Count - Defense Shield |
| Fantasia Impact | Fantasia Impact Stacks - 30 - Frost Mage, Fantasia Impact Stacks - 30 - Beat Performer |
| Specialization passive | Flamehorn - Passive |
| Module / set | N20-Healing Bot Cooldown, N20-Tina ATK Down Cooldown |
| S4 | Vanguard S4 - Auto Dragon Cannon, Vanguard S4 - Extra Phantom Spiral, Ray S4 - Frost Infusion 4-Piece, Verdant S4 - Inspiration X6 Moonlight Solace |

### Custom counter rules

When the presets are not enough, you can build your own in **{{ui:skillMonitor.customPanel.rule.title}}**:

1. **{{ui:skillMonitor.customPanel.rule.new}}**;
2. In **{{ui:skillMonitor.customPanel.rule.sources}}**, choose the event sources that advance the count (multiple allowed);
3. In **{{ui:skillMonitor.customPanel.rule.slots}}**, choose the slots to show on the panel (multiple allowed);
4. Fill in **{{ui:skillMonitor.customPanel.rule.name}}** and save;
5. Go back to a manual zone and use **{{ui:skillMonitor.customPanel.counter.title}}** to select the rule you just saved.

This is a feature for advanced users; most users can simply use the presets or a factor zone.

## Monitor area style

Each monitor area can set its own **{{ui:skillMonitor.customPanel.style.title}}**: row spacing, font size, spacing between name and value, and the colors and opacity of the name / value / progress bar.

## Examples

- [Automatically show factor energy and season nodes](./examples/factor-energy.md)
- [Track Flamehorn's Absolute Luck with a preset counter](./examples/preset-counter.md)