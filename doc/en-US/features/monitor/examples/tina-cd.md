# Voice reminder when Tina's CD is ready

Related page: [Buff Monitor](../buff.md)

**Scenario**: You are the one who uses Tina for the party. You want the overlay to show Tina's cooldown and to hear "Tina CD is ready" when the CD ends, so you do not have to keep watching it.

## Step 1: Monitor the Tina CD Buff

After you use Tina, a Buff representing the cooldown stays on you.

1. Open **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.buff}}**.
2. Search for **Time Stasis (Tina CD)** (ID 2110056) and add it to the selected Buffs.
3. You can also add **Lower CD** (ID 2110034) to see whether the boost from Tina is still active.

## Step 2: Give it a recognizable name (optional)

In **{{ui:skillMonitor.buff.alias.title}}**, search for "Time Stasis (Tina CD)" and set its alias to "Tina".

## Step 3: Highlight it when it is about to end

In **{{ui:skillMonitor.buff.alert.title}}**, add an alert for it: highlight in green and flash when ≤ 5 seconds remain, reminding you to get ready to use it.

## Step 4: Voice reminder on expiry

1. First make sure a model is installed in [Voice](../../voice/README.md) and **{{ui:voice.overview.enabled}}** is on.
2. Go back to **{{ui:skillMonitor.tabs.buff}}**, expand **{{ui:skillMonitor.buff.voice.title}}**, then search for and add "Time Stasis (Tina CD)".
3. Check **Broadcast on expiry**, choose **Custom text** for the text, and enter "Tina CD is ready".
4. Click **Preview**; if it says the audio is waiting to be generated, go to **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** and click **{{ui:voice.bindings.generateMissing}}**.

![Buff voice announcement settings](../../../../shared/img/voice/voice_1.png)

Sample generated with a fine-tuned Japanese voice:

<audio controls src="../../../../shared/audio/voice/ja_01_tina_cd.wav"></audio>

> [!TIP]
> Want the announcement to include Tina's tier? Put `${remodelLevel}` (or `${阶数}`) in the text, e.g. "Tina ${remodelLevel} ready"; when announced, the placeholder is automatically replaced with the Fantasy's current tier (e.g. tier 5). See [Voice · Fantasy tier placeholder](../../voice/playback.md#fantasy-tier-placeholder).
