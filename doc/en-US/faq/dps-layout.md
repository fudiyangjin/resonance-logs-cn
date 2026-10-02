# FAQ · DPS & Layout

Related guides: [DPS Meter](../features/dps/README.md) · [History](../features/dps/history.md) · [Themes & Appearance](../features/dps/themes.md) · [Display Settings](../features/dps/settings.md)

## Data

### What's the difference between DPS and true DPS?

- **DPS**: total damage ÷ total combat duration.
- **True DPS (TDPS)**: total damage ÷ active combat time, excluding gaps such as long pauses in attacking or running around.

To see the active time, turn on **{{ui:themes.header.showActiveTimer}}** in **{{ui:routes.dps.themes}} → {{ui:themes.tabs.live}} → {{ui:themes.header.title}}**.

### When is the data cleared automatically?

See [When combat is split and when it is reset](../features/dps/README.md#when-fights-are-split-and-reset). To clear it manually, click the reset button in the title bar or press the [shortcut](../features/app/README.md#shortcuts).

### Is history cleaned up automatically?

The default is 200 non-favorite entries, configurable from 1 to 2000 in App Settings. Older records are deleted by time on the next launch. Add important records to your favorites; see [History](../features/dps/history.md#history-list).

## Appearance

### How do I make the DPS window transparent?

Go to **{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}} → {{ui:themes.tabs.general}}**, expand **{{ui:themes.section.customColorTheme}}**, and lower the opacity of **Background (Live)**.

![Background opacity](../../shared/img/faq/faq_2.png)

For the full walkthrough, see [Example: A transparent, minimal DPS window](../features/dps/examples/transparent-window.md).

### The title bar is too crowded — how do I slim it down?

In **{{ui:themes.tabs.live}} → {{ui:themes.header.title}}**, turn off the items and buttons you don't need, or switch to the free layout to spread them over multiple rows. See [Title bar settings](../features/dps/themes.md#header-settings).

### How do I change which columns the tables show?

- Live window: **{{ui:routes.dps.settings}} → {{ui:settings.tabs.live}}**.
- History details: **{{ui:routes.dps.settings}} → {{ui:settings.tabs.history}}**.

The two column settings are independent. Every column can be toggled, reordered and given a custom header. See [Display Settings](../features/dps/settings.md).

### I can't click the window after enabling click-through?

Use the **{{ui:settings.shortcuts.toggleClickthrough}}** shortcut, or right-click the tray icon and choose **Disable Clickthrough**.

### The main window's colors don't match the DPS window?

They're configured separately: the DPS window in [Themes & Appearance](../features/dps/themes.md), and the main window in [App Settings · Appearance](../features/app/README.md#appearance).
