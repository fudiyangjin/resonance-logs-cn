# Loadouts

A **loadout** bundles together all the configuration you've prepared for a class: skill CDs, buffs, custom panels, monster monitoring, DPS window settings, and their voice bindings. When you change class, switch the loadout once and all the overlays switch with it.

## What a loadout is made of

| Profile | Contents |
| --- | --- |
| **{{ui:loadout.page.skillProfileLabel}}** | Skill CDs, buffs, custom panels and the attribute panel of the [Live Monitor](../monitor/README.md), plus their voice |
| **{{ui:loadout.page.monsterProfileLabel}}** | Buffs, Boss DBM and entity timers of the [Monster Monitor](../monster/README.md), plus their voice |
| **{{ui:loadout.page.liveProfileLabel}}** | Columns, name display, refresh rate and so on for the [DPS window](../dps/settings.md) |

Profiles can be shared between loadouts. For example, two DPS classes may use different skill monitoring but the same monster monitoring: just select the same **{{ui:loadout.page.monsterProfileLabel}}** in both loadouts, and a change in one place takes effect in both.

Appearance, shortcuts, packet capture and other settings in [App Settings](./README.md) are not part of a loadout and don't change when you switch loadouts.

## Managing loadouts

Open **{{ui:routes.tools.loadouts}}**, or click **{{ui:loadout.sidebar.manage}}** next to **{{ui:loadout.sidebar.label}}** in the left sidebar:

- **{{ui:loadout.page.new}}**: create a new, empty loadout.
- **{{ui:loadout.page.activate}}**: switch to this loadout. You can also switch directly from **{{ui:loadout.sidebar.label}}** in the left sidebar.
- **{{ui:loadout.page.rename}}** / **{{ui:loadout.page.duplicate}}** / **{{ui:loadout.page.delete}}**: at least one loadout must remain.
- Change the three profile dropdowns to decide which profiles this loadout uses.

## Preset loadouts

**{{ui:loadout.page.presetsTitle}}** offers ready-made loadouts for some specs (such as Shield, Recovery, Block, Earthfort, Smite, Lifebind, Vanguard and Concerto). Clicking one creates a new loadout that you can modify from there without affecting any other loadout. The **{{ui:loadout.firstRun.title}}** dialog shown on first launch offers these same presets.

## Auto-switching by spec

1. Set **{{ui:loadout.page.linkedSpecLabel}}** for each loadout, for example link the "Lifebind" loadout to the Lifebind spec.
2. Turn on **{{ui:loadout.autoSwitch.toggle}}**.

After that, when you change spec in the game, the app automatically switches to the linked loadout. **{{ui:loadout.autoSwitch.detected}}** shows the current spec the app has detected; if it shows **{{ui:loadout.autoSwitch.unknown}}**, change zones once. For the full steps, see [Example: Switch loadouts automatically when changing spec](#example-switch-loadouts-automatically-when-changing-spec).

## Import and export

- **{{ui:loadout.page.exportButton}}**: the download icon on the right of each loadout saves the whole loadout (including its three profiles and voice bindings) as a JSON file.
- **{{ui:loadout.page.importButton}}**: choose a JSON file someone shared with you to import it as a new loadout. It does not overwrite your existing loadouts.

> [!NOTE]
> What gets exported is the configuration; it does not include generated voice audio or imported sound effect files. After importing, the other person just clicks **{{ui:voice.bindings.generateMissing}}** in **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** to regenerate them.

For the sharing workflow, see [Example: Share a loadout with teammates](#example-share-a-loadout-with-teammates).

## Examples

### Example: Switch loadouts automatically when changing spec

**Scenario**: your character usually plays Lifebind and occasionally switches to Smite. After you change spec in the game, you want the skill CDs, buffs and DPS window settings to switch to the matching set automatically, instead of going back to the main window to switch by hand every time.

#### Step 1: Prepare two loadouts

1. Open **{{ui:routes.tools.loadouts}}**.
2. In **{{ui:loadout.page.presetsTitle}}**, click "Lifebind" and "Smite" to create one loadout each. If you already have your own loadouts, just use those.

#### Step 2: Link the specs

In each loadout's **{{ui:loadout.page.linkedSpecLabel}}** dropdown, choose the matching spec:

| Loadout | {{ui:loadout.page.linkedSpecLabel}} |
| --- | --- |
| Lifebind | Lifebind |
| Smite | Smite |
| Other loadouts you don't want to auto-switch | {{ui:loadout.page.linkedSpecNone}} |

#### Step 3: Turn on auto-switching

Turn on **{{ui:loadout.autoSwitch.toggle}}** at the top of the page. **{{ui:loadout.autoSwitch.detected}}** next to it shows your current spec in the game.

#### Step 4: Verify

Switch to Smite in the game. The app shows a message that it has automatically switched to "Smite", **{{ui:loadout.sidebar.label}}** in the left sidebar changes too, and the overlay contents update accordingly.

> [!TIP]
> If both loadouts share the same monster monitoring, select the same **{{ui:loadout.page.monsterProfileLabel}}** in both, and from then on you only need to maintain one copy.

If **{{ui:loadout.autoSwitch.detected}}** shows **{{ui:loadout.autoSwitch.unknown}}**, the app hasn't received spec information yet; change zones once.

### Example: Share a loadout with teammates

**Scenario**: you spent an evening setting up Lifebind skill CDs, a factor area and Boss announcements, and another Lifebind player in your group wants to use them too.

#### Your side: export

1. Open **{{ui:routes.tools.loadouts}}**.
2. Click the download icon (**{{ui:loadout.page.exportButton}}**) on the right of the loadout you want to share, choose where to save it, and you get a `.json` file.
3. Send the file to your teammate through a chat app.

If your announcements use [sound effects you imported](../voice/voices.md#method-4-import-existing-audio), send the original sound effect files along with it.

#### Your teammate's side: import

1. Open **{{ui:routes.tools.loadouts}}**, click **{{ui:loadout.page.importButton}}** and choose the received file.
2. A loadout with the same name appears in the list; click **{{ui:loadout.page.activate}}**. Importing never overwrites existing loadouts and doesn't switch automatically.
3. If there are sound effect files, import the same files with **{{ui:voice.phrases.import.newButton}}** in **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}**, and the bindings match up automatically.
4. In **{{ui:voice.tabs.bindings}}**, click **{{ui:voice.bindings.generateMissing}}** to generate the voice on your own computer.
5. Enter the game, and click **Edit Layout** once each in [Live Monitor](../monitor/README.md) and [Monster Monitor](../monster/README.md) to adjust the overlay positions for your own resolution.

> [!NOTE]
> The loadout's linked spec is imported along with it. If your teammate has **{{ui:loadout.autoSwitch.toggle}}** turned on, this loadout is used automatically when they switch to that spec.
