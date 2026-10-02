# Warn about a Boss's big attack with your own sound effect

Related page: [Voices and phrases](../voices.md)

**Scenario**: your group has agreed that when the Boss uses a certain big attack, everyone hears an alarm rather than a TTS line. You have a 2-second alarm sound effect, `alarm.mp3`, and want it to play at the highest priority while the big attack is being cast.

## Step 1: Import the sound effect

1. Open **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}**.
2. Enter "Big attack alarm" in **{{ui:voice.phrases.namePlaceholder}}**.
3. Click **{{ui:voice.phrases.import.newButton}}** and choose `alarm.mp3`.
4. "Big attack alarm" appears in the list with the status **{{ui:voice.phrases.status.imported}}**. Click **{{ui:voice.phrases.tryPlay}}** to check that it sounds right.

Importing audio does not require installing the voice model.

## Step 2: Reference it in Boss DBM

1. Open **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.bossDbm}}**.
2. In **{{ui:monsterMonitor.bossDbm.voice.title}}**, add this skill and choose the event **{{ui:voice.binding.event.onCast}}**.
3. For the text source, choose **{{ui:voice.binding.source.phrase}}**, click **{{ui:voice.binding.pickPhrase}}** and pick "Big attack alarm".
4. Set **{{ui:voice.binding.priority}}** to **{{ui:voice.binding.priority.urgent}}**.

## Step 3: Allow interruption

In **{{ui:voice.tabs.overview}} → {{ui:voice.overview.queuePolicy}}**, turn on **{{ui:voice.overview.queue.interrupt}}**. That way the alarm sounds immediately even if something else is being announced.

## Sharing with teammates

When you [export](../../app/examples/share-loadout.md) the loadout to teammates, the announcement bindings go with it, but the audio files do not. Have your teammates import the same `alarm.mp3` into their phrase library too: an imported phrase's ID is determined by the audio content, so the same file gets the same ID and the binding matches up automatically.

> [!TIP]
> Keep sound effects to about 1–3 seconds. An overly long sound effect holds up the queue and delays the announcements behind it.
