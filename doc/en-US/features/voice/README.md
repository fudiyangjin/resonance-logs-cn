# Voice Announcements

**{{ui:routes.tools.voice}}** can alert you by voice at key moments: Tina's CD is ready, a vulnerability debuff is about to fall off, the Boss is about to use its big attack, a match has been found and needs confirming... so you don't have to keep staring at the overlays.

All voice audio is generated and stored locally, offline. During combat the app only plays audio that has already been generated. It does not run the model, so it has no effect on game performance.

## How it works

Voice announcements take two steps:

1. **Decide when to announce and what to say**: on feature pages such as Buff, Skill CD and Monster Monitor, bind an announcement line to an event.
2. **Turn the text into sound**: choose a voice and generate audio for those lines. You can use the built-in preset voice, clone a character's voice, or import ready-made audio directly. See [Voices and phrases](./voices.md).

## Quick start

1. Open **{{ui:routes.tools.voice}} → {{ui:voice.tabs.model}}** and click **{{ui:voice.model.install}}** to install the voice model. The download source defaults to **{{ui:voice.model.downloadSourceAuto}}**; you normally don't need to change it.
2. In **{{ui:voice.tabs.overview}}**, turn on **{{ui:voice.overview.enabled}}** and adjust the volume.
3. Bind an announcement on a feature page (see below).
4. Go back to **{{ui:voice.tabs.bindings}}** and click **{{ui:voice.bindings.generateMissing}}**. By default this uses the preset voice for your UI language, so no preparation is needed.
5. Click **{{ui:voice.bindings.tryPlay}}** to listen. If it sounds right, you're ready to play.

> [!TIP]
> Leave **{{ui:voice.backend.title}}** at **{{ui:voice.backend.auto}}**. Generation is much faster if your graphics card supports Vulkan. If it shows **{{ui:voice.backend.missing}}**, install the Vulkan runtime and click **{{ui:voice.overview.status.refresh}}**, or switch to CPU.

## Binding announcements on feature pages

Announcement rules are configured in place on each feature page. Taking the most common one, **{{ui:routes.tools.skillMonitor}} → Buff Monitor**, as an example: expand the voice announcement section below the monitored buffs.

![Configuring announcements in the Buff Monitor](../../../shared/img/voice/voice_1.png)

1. Search for a monitored buff and add it to the announcement list.
2. Tick the events: **{{ui:voice.binding.event.gained}}**, **{{ui:voice.binding.event.expiring}}**, **{{ui:voice.binding.event.lost}}**.
3. Choose a text source for each event:
   - **{{ui:voice.binding.source.auto}}**: generated automatically from the name and event, for example "Tina expired".
   - **{{ui:voice.binding.source.custom}}**: write your own, for example "Tina's ready". Fantasy buffs can also include the tier; see [Fantasy tier placeholder](./playback.md#fantasy-tier-placeholder).
   - **{{ui:voice.binding.source.phrase}}**: pick an existing phrase from the phrase library, including audio you imported yourself.
4. Set **{{ui:voice.binding.priority}}** if needed, then click **{{ui:voice.binding.tryPlay}}**. If it shows **{{ui:voice.binding.pendingGeneration}}**, the audio hasn't been generated yet.

Everywhere you can bind announcements:

| Location | Available events | Examples |
| --- | --- | --- |
| [Live Monitor · Buff](../monitor/buff.md) | On gain / x seconds left / On expiry | [Voice reminder when Tina's CD is ready](../monitor/examples/tina-cd.md) |
| [Live Monitor · Skill CD](../monitor/skill-cd.md) | On cast / On ready / x seconds before ready | — |
| [Live Monitor · Custom panel counters](../monitor/custom-panel.md) | On reaching target | — |
| [Monster Monitor · Buff](../monster/buff.md) | On gain / x seconds left / On expiry | [Watch the vulnerability you applied](../monster/examples/vulnerability.md) |
| [Monster Monitor · Boss DBM](../monster/boss-dbm.md) | On trigger | [Give a Boss skill an alias and a voice warning](../monster/examples/boss-alias.md) · [Warn with your own sound effect](./examples/custom-sfx.md) |
| [Monster Monitor · Entity duration](../monster/entity-duration.md) | On appear / x seconds left / On disappear | [Show the Scythe Cart's remaining time](../monster/examples/scythe-cart.md) |
| [Dungeon Mechanics · Mechanic voice announcements](../minimap/README.md#mechanic-voice-announcements) | The mechanics supported for each dungeon | [Minimap setup before a raid's first clear](../minimap/examples/raid-setup.md) |
| [{{ui:voice.tabs.alerts}}](./playback.md#match-alerts) | Match found / Ready check / Dungeon vote | [Hear "match found" while queueing AFK](./examples/match-found.md) |

A few things to note:

- Skill announcements only cover your own character; the skill doesn't need to be in the Skill CD monitor. For skills with multiple charges, "ready" is announced **every time a charge comes back**, and "x seconds before ready" applies to each charge too.
- "x seconds left" and "x seconds before ready": if an update (a cooldown reduction, a shortened buff, a re-triggered mechanic) makes the remaining time jump below x seconds, the announcement plays right away. Nothing is played if it has already ended (the skill is ready, the buff has expired). If the remaining time is already below x seconds when it first appears, nothing is announced.
- The "x seconds left" event for an entity requires a duration to be set for the entry; if the entity disappears early, only "disappear" is announced.
- Entity announcements are stored by entity ID, so changing the scope (Self only / Any) keeps them. Turning off **{{ui:monsterMonitor.enabled}}** only hides the overlay; entity announcements keep working.
- An announcement lives as long as its target: deleting an entity or DBM entry, or removing a buff from the monitor lists deletes its announcement settings too. Skill announcements have their own list, which is cleared when you switch class on the Skill CD page. This only affects the current profile; announcements for the same target in other profiles are untouched.

## Announcement overview

**{{ui:voice.tabs.bindings}}** collects the announcements from every feature page, grouped by source, and shows each one's target, event, text source, priority and status. It is view-only; you cannot create announcements here:

- When the status is **{{ui:voice.bindings.status.pending}}**, click **{{ui:voice.bindings.generateMissing}}**.
- Click "Go to…" to jump to the corresponding feature page and edit it.

> [!NOTE]
> Voice bindings are saved with their respective monitor profiles. After switching or importing a [loadout](../app/loadouts.md), check the announcement overview to make sure everything is **{{ui:voice.bindings.status.ready}}**. On a new computer you usually need to generate once more. When profiles use different text for the same target, each keeps its own audio, so switching back and forth needs no regeneration.

## FAQ

| Symptom | Solution |
| --- | --- |
| Preview says playback failed | Make sure the model is installed and this line already has generated audio |
| Generation acceleration shows as unavailable | Install the Vulkan runtime and click **{{ui:voice.overview.status.refresh}}**, or switch to CPU / Auto |
| Says another voice operation is in progress | Wait for the current download or generation to finish, or cancel it and try again |
| No announceable items on the Dungeon Mechanics page | Mechanic voice has not been added for the current dungeon yet |
| Wrote `${remodelLevel}` but the tier isn't announced | See [Fantasy tier placeholder](./playback.md#fantasy-tier-placeholder) |
| Fine-tuned voice unavailable | See [Method 3: Fine-tuned voice (advanced)](./voices.md#method-3-fine-tuned-voice-advanced) |

## Examples

- [Set up a voice announcement for a buff and generate it](./examples/buff-voice.md)