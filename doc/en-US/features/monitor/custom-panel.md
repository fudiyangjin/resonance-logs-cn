# Custom Monitor

Corresponds to **Live Monitor → Custom Monitor** tab.

Create multiple **text monitor zones** showing buffs or counters as progress bars in the overlay. Each buff or counter slot is **globally unique** across all zones (cannot duplicate in multiple zones).

![Custom panel example](../../../shared/img/monitor/buff_3.png)

## Standard Custom Zones vs Factor Zones

| Type | How to create | Purpose |
|------|----------|------|
| **Standard custom zone** | **New Monitor Area** | Manually add buffs, preset/custom counters, free combination |
| **Factor zone** | **New Factor Area** | Auto-show **season progression factor** progress for the current character—no manual Sources/Slots setup |

### Factor Zone (New Factor Area)

After **New Factor Area**, the app generates overlay entries from the character’s equipped factor paths, typically including (depends on loadout):

- **True Factor A / B energy** (counter progress)
- **True Factor A / B buff effects** (linked buff duration, etc.)

**Sync & changes:**

- After **zone change**, a full data sync runs; when you **switch factor paths** or **change equipped factors** in-game, the factor zone updates without recreating the zone.
- Factor zones **cannot** manually “Add Buff / Counter” like standard zones; entries are maintained automatically.

**Display names:**

- **Factor energy counters**: With the factor zone selected, search slots in **Factor Display Names** (name / description) and set custom names; saved per slot template and kept across profile switches.
- **Factor buff effects**: Rename under [Buff Monitor → Buff Alias Settings](./buff.md#buff-aliases) (aliases are global).

Factor zones support **Monitor Area Name**, **style** (row spacing, font, colors, etc.) like standard zones, and the custom monitor zone toggle in [Enable Overlay](./overlay.md).

## Standard Custom Zones

### Zones & Style

- Each standard zone is an **independent text area** in the overlay—drag and resize separately (see [Enable Overlay](./overlay.md) · **Edit Overlay Layout**).
- **Monitor Area Name** and **Current Monitor Area Style** (row spacing, font size, name–value spacing, name/value/bar colors and opacity) are saved per zone.

### Counters

State machines linked to buffs and damage types for special triggers not maintained as buffs, for example:

- Fantasy Impact counter
- Transcend trigger counter

Configure via **Add Counter** with a standard zone selected. Counter slots are globally unique; preset and custom rules are listed together.

### Add Buff

Adds only to the **current** standard zone’s text area; pick from the buff search grid (buffs used in other zones cannot be added again).

### Current Zone Entries

Added buffs / counters can have display names adjusted (counters), reordered (move up/down), or removed.

## Custom Counter Rules

Besides built-in presets, write **custom counter rules**: specify game events as **Sources** to advance the count, and **Slots (effect positions)** to show progress or state on the panel. Entry: **Live Monitor → Custom Monitor → Custom Counter Rules**.

**Typical flow:**

1. **New Rule**, select or add **Sources** (multiple allowed).
2. In **Slots**, choose slots to bind on the custom panel (multiple allowed), matching rule logic.
3. Enter a **Rule Name** and save.
4. In a standard zone, **Add Counter** and select the Slot for the saved rule; put related **buff tracking** and **counters** in the **same overlay area** for at-a-glance comparison.

## Advanced Examples

### Crimson Flow (Dual-Axe Factor)

Example using dual-axe factor sources for counting and specific slots for factor energy and trigger progress.

**1. Configure Sources & Slots and save**

- Click **New Rule**.
- **Sources**: select **Dual-Axe X9**, **Dual-Axe X8** (count sources).

![Crimson flow rule: Sources Dual-Axe X9, X8](../../../shared/img/monitor/buff_7.png)

- **Slots**: select **Dual-Axe X4**, **Dual-Axe X5**, enter rule name, save.

![Crimson flow rule: Slots Dual-Axe X4, X5 and save](../../../shared/img/monitor/buff_8.png)

**2. Layout: factor trigger buff and energy counter in one zone**

In overlay or custom panel layout, place **factor trigger buffs** and **factor energy counters** in the **same display area** to see trigger status and energy/progress together.

![Factor trigger buff and energy counter in same zone](../../../shared/img/monitor/buff_10.png)

**3. Overlay result**

Overall display after setup:

![Crimson flow custom rule monitor example](../../../shared/img/monitor/buff_9.png)

### Preset Monitor: Flame Horn – Passive

Built-in **Flame Horn – Passive** preset for observing passive and “Absolute Luck” state without configuring counters and slots from scratch.

**Rule highlights:**

- **Slot 1 (damage specialization counter)**: Counts completed casts; shows “casts until threshold” for **Absolute Luck** trigger opportunities.
- **Slot 2 (Absolute Luck CD)**: Cooldown progress linked to passive buff; **steady ~15 s**, ~**5 s** when active buff conditions apply (e.g. after using active skill).

**Recommended usage:**

1. In **Custom Counter Rules**, use or save **Flame Horn – Passive**, then **Add Counter** in a custom panel for **Slot 1** and **Slot 2**.
2. Also add **Flame Horn – Passive – Luck** (Absolute Luck buff) in [Buff Monitor](./buff.md) and place both counters in the **same display area** to see buff, count, and CD together.

Overlay example:

![Flame Horn passive preset monitor display](../../../shared/img/monitor/buff_5.png)

Typical settings in **Custom Panel / Counter Rules**:

![Flame Horn passive preset settings](../../../shared/img/monitor/buff_6.png)
