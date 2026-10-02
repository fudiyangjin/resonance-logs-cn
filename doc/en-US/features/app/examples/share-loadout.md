# Share a loadout with teammates

Related page: [Loadouts](../loadouts.md)

**Scenario**: you spent an evening setting up Lifebind skill CDs, a factor area and Boss announcements, and another Lifebind player in your group wants to use them too.

## Your side: export

1. Open **{{ui:routes.tools.loadouts}}**.
2. Click the download icon (**{{ui:loadout.page.exportButton}}**) on the right of the loadout you want to share, choose where to save it, and you get a `.json` file.
3. Send the file to your teammate through a chat app.

If your announcements use [sound effects you imported](../../voice/voices.md#method-4-import-existing-audio), send the original sound effect files along with it.

## Your teammate's side: import

1. Open **{{ui:routes.tools.loadouts}}**, click **{{ui:loadout.page.importButton}}** and choose the received file.
2. A loadout with the same name appears in the list; click **{{ui:loadout.page.activate}}**. Importing never overwrites existing loadouts and doesn't switch automatically.
3. If there are sound effect files, import the same files with **{{ui:voice.phrases.import.newButton}}** in **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}**, and the bindings match up automatically.
4. In **{{ui:voice.tabs.bindings}}**, click **{{ui:voice.bindings.generateMissing}}** to generate the voice on your own computer.
5. Enter the game, and click **Edit Layout** once each in [Live Monitor](../../monitor/README.md) and [Monster Monitor](../../monster/README.md) to adjust the overlay positions for your own resolution.

> [!NOTE]
> The loadout's linked spec is imported along with it. If your teammate has **{{ui:loadout.autoSwitch.toggle}}** turned on, this loadout is used automatically when they switch to that spec.
