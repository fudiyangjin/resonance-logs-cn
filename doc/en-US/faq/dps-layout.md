# FAQ · DPS & Layout

**Detailed guides**: [DPS Overview](../features/dps/README.md) · [Themes](../features/dps/themes.md) · [History](../features/dps/history.md) · [Settings](../features/dps/settings.md)

## DPS

### What is the difference between DPS and true DPS?

- **DPS**: Total damage ÷ total combat duration
- **True DPS (TDPS)**: Total damage ÷ global **active combat time** (excludes long idle gaps such as downtime or running)

### Are history records cleaned up automatically?

When history exceeds 200 entries, the next app launch automatically removes older records by time and resets the sequence.

---

## Layout & Appearance (where to change things)

### How do I make the Live window “transparent”?

Use **Background (Live)** under theme colors:

1. Open **DPS Meter → Themes → General** (first tab).
2. Expand **Theme Colors → Custom Color Theme**.
3. Find **Background (Live)** and lower the color **opacity**.

![Background opacity](../../shared/img/faq/faq_2.png)

---

### Custom colors

- **Full-page palette (including Live window)**: Still under **Themes → General → Theme Colors**. Adjust main window background, **Live window background**, text, buttons, borders, **table text**, **K/M/% suffix colors**, tooltips, and more—each supports opacity.
- **Class / specialization bar colors**: Same page, **Class & Specialization Colors**, for coloring table rows by class/spec.
- **Table row highlights**: **Themes → General → Player Table Settings / Skill Table Settings**—row height, font, headers, **row highlight opacity**, **skill row highlight opacity**, etc. (controls how solid the colored bars look).
- You can also start from a theme preset and tweak from there.

![Theme color presets](../../shared/img/faq/faq_3.png)

---

### Title bar (top strip of the Live window)

Path: **DPS Meter → Themes → Live → Title Bar Settings**.

Adjust for example: **overall window padding**, **title bar padding**; whether to show **combat timer**, **active combat time**, **scene name**, **total damage / total DPS**, **Boss HP**; **Reset / Pause / Boss only / Settings / Minimize** buttons; and **footer DPS · Healing · Damage taken** tabs with **font size**. Turn off what you do not need for a cleaner bar.

On the same page, **Live Window Display Settings** includes **click-through mode**: when enabled, the mouse passes through the Live window to the game behind it.

![Title bar settings](../../shared/img/faq/faq_4.png)

---

### Which fields (columns) appear in Live?

Path: **DPS Meter → Settings → Live**.

- **General**: Display your name / others as name, class, or combined; ability score / season strength; whether bars are relative to **session top**; abbreviate DPS/HPS, etc.
- **DPS (Player) columns / DPS (Skill) columns / Healing (Player) / … / Damage taken …**: Use toggles in each section to show or hide **columns in the Live table**.
- In the same area, **Move up / Move down** adjusts **column order** (Live window only).

---

### Which fields (columns) appear in history details?

Path: **DPS Meter → Settings → History**.

Same structure as Live: **General** (name, score, bar baseline, abbreviation style, etc.) plus **DPS (Player) / DPS (Skill detail) / Healing / Damage taken …** toggles for columns when you open a history entry. Live and history column settings are **independent**—trim each to taste.
