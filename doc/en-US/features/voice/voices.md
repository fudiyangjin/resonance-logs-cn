# Voices and phrases

Once your announcement text is configured, you need to generate matching audio before it can play. This page covers the four sources of voices and how to manage the **{{ui:voice.tabs.phrases}}**.

| Method | Preparation | Result | Best for |
| --- | --- | --- | --- |
| [Preset voice](#method-1-preset-voice) | None | Standard, stable | Everyone, works out of the box |
| [Cloned voice](#method-2-cloned-voice) | A 5–10 second clean vocal clip | Close to the reference audio | Anyone who wants a particular character's voice |
| [Fine-tuned voice](#method-3-fine-tuned-voice-advanced) | 10–30 minutes of speech + GPU training | Highest fidelity | Experienced, advanced users |
| [Imported audio](#method-4-import-existing-audio) | Existing audio files | Exactly the original audio | Sound effects, recordings, or not wanting TTS |

Before generating audio, install the voice model in **{{ui:voice.tabs.model}}**. Importing audio does not require the model.

## Method 1: Preset voice

In **{{ui:voice.tabs.phrases}} → {{ui:voice.phrases.generate.title}}**, choose **{{ui:voice.phrases.generate.presetSource}}** (selected by default), tick the phrases and click **{{ui:voice.phrases.generate.start}}**. Clicking **{{ui:voice.bindings.generateMissing}}** in the announcement overview also uses the preset voice by default.

- The preset voice is chosen automatically from the **current UI language** (简体中文 / English / 日本語), regardless of what language the phrase itself is written in.
- If you switch the UI language and generate again, the preset voice for the new language is used automatically.

## Method 2: Cloned voice

All you need is one reference clip; no training required.

![Batch generation with a cloned voice](../../../shared/img/voice/voice_2.png)

1. In **{{ui:voice.phrases.generate.title}}**, choose **{{ui:voice.phrases.generate.cloneSource}}**.
2. Choose **{{ui:voice.phrases.generate.useExisting}}**, or **{{ui:voice.phrases.generate.createNew}}**: fill in **{{ui:voice.phrases.generate.newProfileName}}** and click **{{ui:voice.phrases.generate.pickReference}}**. You can tick **{{ui:voice.phrases.generate.keepReference}}**.
3. Tick the phrases to generate (you can use **{{ui:voice.phrases.generate.selectAll}}**) and click **{{ui:voice.phrases.generate.start}}**.

> [!TIP]
> For the reference audio, pick **5–10 seconds of the character's clean (dry) voice**: only one person speaking, clear, with no background music or reverb. The cleaner the reference audio, the closer the clone.

Saved voices appear in **{{ui:voice.tabs.model}} → {{ui:voice.model.profiles.title}}**, so next time you can simply select them.

## Method 3: Fine-tuned voice (advanced)

Cloning relies on only a few seconds of reference audio, so its similarity and stability are limited. For higher fidelity, you can **fine-tune** a dedicated model on the target character's speech data, export it, and reference it in the app.

Rough pipeline:

1. **Get source material**: Bilibili videos can be downloaded with [bilibilidownloadtool](https://github.com/NANblogink/bilibilidownloadtool).
2. **Extract audio**: convert to lossless PCM WAV with FFmpeg, keeping the original sample rate. Don't compress to MP3 first.
3. **Separate vocals**: use [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) to remove background sound, export the `Vocals` dry track, and listen through the whole thing to check it.
4. **Build the dataset**: split on silence, resample to 24kHz, transcribe with ASR, then proofread the text by hand.
5. **Train**: generate discrete audio codes and a speaker embedding, then fine-tune Qwen3-TTS 0.6B CustomVoice. Running it in Docker is recommended; the prebuilt image is `ghcr.io/mozi1924/qwen3-tts-easyfinetuning`.
6. **Export**: export a GGUF deployment folder, then click **{{ui:voice.model.finetuned.import}}** in **{{ui:voice.tabs.model}} → {{ui:voice.model.finetuned.title}}**. After that, choose **{{ui:voice.phrases.generate.finetunedSource}}** in batch generation.

Data and environment requirements:

- Only use voice data that you own or are authorized to use, and keep each dataset to a single speaker.
- Aim for **10–30 minutes** of clean, usable speech. Training works with less data, but similarity and stability will be worse.
- Training is best done on an NVIDIA GPU with ≥ 16GB of VRAM; on Windows, WSL2 + Docker Desktop is recommended.

Fine-tuning results (Japanese voice):

- Tina CD finished reminder: <audio controls src="../../../shared/audio/voice/ja_01_tina_cd.wav"></audio>
- N20 healing reminder: <audio controls src="../../../shared/audio/voice/ja_02_n20_healbot.wav"></audio>

If the deployment folder is moved or its files change, the fine-tuned voice shows **{{ui:voice.model.finetuned.missing}}** or **{{ui:voice.model.finetuned.modified}}**. Use **{{ui:voice.model.finetuned.relink}}** to point it to the new location, and **{{ui:voice.model.finetuned.verify}}** to confirm it is complete. **{{ui:voice.model.finetuned.remove}}** only removes the reference; it does not delete the external files.

## Method 4: Import existing audio

If you don't want to use TTS, or want to use a sound effect, you can import audio files directly:

1. In **{{ui:voice.tabs.phrases}}**, fill in **{{ui:voice.phrases.namePlaceholder}}** and click **{{ui:voice.phrases.import.newButton}}**.
2. Choose a wav / mp3 / flac / ogg / m4a file no larger than 50 MiB and 0.2–30 seconds long.
3. For an existing phrase, you can also click **{{ui:voice.phrases.import.rowButton}}** on its row to replace its current audio with a file.

Imported audio is converted to mono 24kHz, shows the status **{{ui:voice.phrases.status.imported}}**, and is excluded from voice generation. Choose **{{ui:voice.binding.source.phrase}}** on a feature page to use it.

> [!NOTE]
> The ID of an imported phrase is determined by the audio content. The same audio imported on another computer gets the same ID, so when you share a loadout, the other person just imports the same file and the bindings match up automatically.

## Managing the phrase library

Each phrase in the **{{ui:voice.tabs.phrases}}** has a status:

| Status | Meaning |
| --- | --- |
| **{{ui:voice.phrases.status.ready}}** | Ready to play |
| **{{ui:voice.phrases.status.stale}}** | The voice or text was changed, so the old audio is out of date |
| **{{ui:voice.phrases.status.pending}}** | No audio yet |
| **{{ui:voice.phrases.status.imported}}** | Comes from an imported file |

You can also **{{ui:voice.phrases.add}}** by hand to write frequently used lines, then reuse them on several feature pages by referencing them from the phrase library.

Deleting announcements or changing their text leaves behind auto-generated phrases that nothing uses anymore. Click **Clean up unreferenced phrases** to delete them all at once. The cleanup checks every loadout (not just the current one) and only deletes auto-generated phrases that no loadout references; phrases you created by hand are never deleted.

## Examples

### Example: Warn about a Boss's big attack with your own sound effect

**Scenario**: your group has agreed that when the Boss uses a certain big attack, everyone hears an alarm rather than a TTS line. You have a 2-second alarm sound effect, `alarm.mp3`, and want it to play at the highest priority while the big attack is being cast.

#### Step 1: Import the sound effect

1. Open **{{ui:routes.tools.voice}} → {{ui:voice.tabs.phrases}}**.
2. Enter "Big attack alarm" in **{{ui:voice.phrases.namePlaceholder}}**.
3. Click **{{ui:voice.phrases.import.newButton}}** and choose `alarm.mp3`.
4. "Big attack alarm" appears in the list with the status **{{ui:voice.phrases.status.imported}}**. Click **{{ui:voice.phrases.tryPlay}}** to check that it sounds right.

Importing audio does not require installing the voice model.

#### Step 2: Reference it in Boss DBM

1. Open **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.bossDbm}}**.
2. In **{{ui:monsterMonitor.bossDbm.voice.title}}**, add this skill and choose the event **{{ui:voice.binding.event.onCast}}**.
3. For the text source, choose **{{ui:voice.binding.source.phrase}}**, click **{{ui:voice.binding.pickPhrase}}** and pick "Big attack alarm".
4. Set **{{ui:voice.binding.priority}}** to **{{ui:voice.binding.priority.urgent}}**.

#### Step 3: Allow interruption

In **{{ui:voice.tabs.overview}} → {{ui:voice.overview.queuePolicy}}**, turn on **{{ui:voice.overview.queue.interrupt}}**. That way the alarm sounds immediately even if something else is being announced.

#### Sharing with teammates

When you [export](../app/loadouts.md#example-share-a-loadout-with-teammates) the loadout to teammates, the announcement bindings go with it, but the audio files do not. Have your teammates import the same `alarm.mp3` into their phrase library too: an imported phrase's ID is determined by the audio content, so the same file gets the same ID and the binding matches up automatically.

> [!TIP]
> Keep sound effects to about 1–3 seconds. An overly long sound effect holds up the queue and delays the announcements behind it.
