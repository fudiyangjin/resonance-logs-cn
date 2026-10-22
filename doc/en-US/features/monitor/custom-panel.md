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
> To see when factors or nodes trigger, **just create a factor zone**. You do not need to set up any counter yourself.

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
- **{{ui:skillMonitor.customPanel.counter.title}}**: choose a slot from the preset counters or [your own counters](#custom-counters);
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

### Custom counters

When the presets are not enough, click **{{ui:skillMonitor.customPanel.counterEditor.new}}** in **{{ui:skillMonitor.customPanel.counter.title}}** to define your own counter with a form. It takes exactly the same settings as the built-in presets; the quickest start is **{{ui:skillMonitor.customPanel.counterEditor.copyFromPreset}}**, then adjust.

A counter has two parts:

- **{{ui:skillMonitor.customPanel.counterEditor.sources}}**: which events increase the count. When any source fires, its increment is added to every slot. A counter can also have no source (for example a cooldown driven only by a buff).
- **{{ui:skillMonitor.customPanel.counterEditor.slots}}**: the rows shown on the panel, each with its own target, reset rules and cooldown.

Once saved, the counter is listed together with the presets and can be added to monitor areas and given voice broadcasts the same way; use ✎ to edit and 🗑 to delete. If something is missing, saving jumps to the field that needs attention.

Skills, damages and Buffs can be searched by name; for anything the name tables do not list, type its ID and press Enter. Rarely needed settings sit under **{{ui:skillMonitor.customPanel.counterEditor.advanced}}** in each source and slot.

> [!NOTE]
> The old "Custom counter rules" (assembled by ticking factor templates) are replaced by the factor zone. After updating, those rules are deleted automatically, together with their monitor area entries and voice broadcasts.

#### Counting sources

| Type | Adds when |
| --- | --- |
| Skill cast / Skill cast completed | One of the chosen skills is cast (or finishes casting) |
| Timer while skill lasts | At each interval while the chosen skill lasts |
| Skill hit | Every hit of the chosen damages; Advanced adds "Count once every N hits" and the hit type (crit, block, lucky hit, …) |
| Skill hit (multi-target counts once) | Hits on several targets at once count only for the most-hit target |
| Hit on self | The chosen damages hit yourself (e.g. self-heals) |
| Any hit / Damage taken | You land any hit / you take damage (damage taken can be limited to chosen damages) |
| Buff gained | You gain the chosen Buff |
| Buff stacks spent | The chosen Buff loses the given number of stacks |
| Timer while buff lasts | At each interval while the chosen Buff is present |
| Distance moved during buff | Each given distance moved while the chosen Buff is present |
| Combat resource spent | Each given amount of the combat resource spent |

#### Slots

| Setting | Meaning |
| --- | --- |
| Target | Leave empty for no target. With a target you can pick the display (count, count/target, remaining, percent) and "Restart from 0 after reaching the target" |
| Linked buff | Pick a Buff and choose what happens to the count when it is gained / changes / is removed; it can be on yourself or on any teammate |
| Cooldown | Started by "Pause counting", "Reset and pause" or "Reset and start cooldown"; the panel shows its progress, and "When cooldown ends" decides what happens next |
| Advanced | Linked buff source config ID, another cooldown while a condition buff is present, cooldown on dungeon start, actions when chosen damages hit or passive skills trigger, target or cooldown scaled down by an attribute |

Available actions:

| Action | Effect |
| --- | --- |
| Nothing | The count is unchanged |
| Reset | The count goes back to 0 |
| Pause counting | Stops adding; with a cooldown set, also starts it |
| Resume counting | Adds again |
| Reset and count | Back to 0 and keeps adding |
| Reset and pause | Back to 0 and stops adding; with a cooldown set, also starts it |
| Reset and start cooldown (keep counting) | Back to 0 and starts the cooldown, still adding during it |

This is a feature for advanced users; most users can simply use the presets or a factor zone.

## Monitor area style

Each monitor area can set its own **{{ui:skillMonitor.customPanel.style.title}}**: row spacing, font size, spacing between name and value, and the colors and opacity of the name / value / progress bar.

## Examples

- [Automatically show factor energy and season nodes](./examples/factor-energy.md)
- [Track Flamehorn's Absolute Luck with a preset counter](./examples/preset-counter.md)