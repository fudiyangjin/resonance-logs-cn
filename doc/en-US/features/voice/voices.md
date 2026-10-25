# Voices and phrases

Once your announcement text is configured, you need to generate matching audio before it can play. This page covers the five sources of voices and how to manage the **{{ui:voice.tabs.phrases}}**.

| Method | Preparation | Result | Best for |
| --- | --- | --- | --- |
| [Preset voice](#method-1-preset-voice) | None | Standard, stable | Everyone, works out of the box |
| [Cloned voice](#method-2-cloned-voice) | A 5–10 second clean vocal clip | Close to the reference audio | Anyone who wants a particular character's voice |
| [Fine-tuned voice](#method-3-fine-tuned-voice-advanced) | 10–30 minutes of speech + GPU training | Highest fidelity | Experienced, advanced users |
| [Imported audio](#method-4-import-existing-audio) | Existing audio files | Exactly the original audio | Sound effects, recordings, or not wanting TTS |
| [HTTP voice service](#method-5-http-voice-service) | A TTS you can call over HTTP | Depends on the service | Anyone with a favorite TTS, or who'd rather not run the model locally |

The first three methods need the voice model installed in **{{ui:voice.tabs.model}}**. Imported audio and HTTP voice services do not.

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

## Method 5: HTTP voice service

If you already have a TTS you like (a locally hosted TTS server, an OpenAI-compatible API, Google Cloud TTS, ...), or would rather not run the model on this machine, you can generate audio by calling it over HTTP. Each line is requested once at generation time and saved locally, so **cues play without any network access**, and no voice model is needed.

1. In **{{ui:voice.tabs.model}} → {{ui:voice.http.title}}**, pick a preset and click **{{ui:voice.http.add}}**:
   - **{{ui:voice.http.preset.openaiCompatible}}**: POST `/v1/audio/speech`, an interface many local TTS servers also implement;
   - **{{ui:voice.http.preset.googleCloud}}**: enter your API key; the audio is read from `audioContent` in the JSON response;
   - **{{ui:voice.http.preset.customGet}}**: for a local forwarder you write yourself, where one GET returns the audio file. Any TTS that only has a CLI or SDK can be wrapped this way.
2. Adjust the URL, headers and body to match the service's documentation. These placeholders are available:

   | Placeholder | Replaced with |
   | --- | --- |
   | `{text}` | The phrase text |
   | `{lang}` / `{voice}` | The language code and voice you fill in per phrase language (Chinese / English / Japanese) |
   | `{secret}` | The key |

   Each placeholder is escaped for where it appears (URL encoding, JSON string, XML entities), so a template can simply say `"input": "{text}"`.
3. Click **{{ui:voice.http.form.testButton}}** to hear a line, then **{{ui:voice.http.form.save}}**.
4. In **{{ui:voice.phrases.generate.title}}**, choose **{{ui:voice.phrases.generate.httpSource}}** and the service you added. Generation then works like any other source, and **{{ui:voice.bindings.generateMissing}}** uses it too. You can add several services and switch between them.

> [!NOTE]
> - The service must return wav / mp3 / flac / ogg (vorbis) / m4a. **Opus and headerless raw PCM are not supported**; ask the service for wav or mp3.
> - Remote addresses must use https; plain http is only allowed for this machine (`127.0.0.1`, `localhost`) and LAN IP addresses.
> - With a remote service, phrase text is sent to that service.
> - The key is stored in plain text in the local voice folder and is never included in shared loadouts. Changing the key does not invalidate generated audio; after changing the URL, body or voices, audio generated by that service shows **{{ui:voice.phrases.status.stale}}**.
> - On an authentication failure (such as 401) or when the service is unreachable, batch generation stops immediately; audio that was already generated is kept.

## Managing the phrase library

Each phrase in the **{{ui:voice.tabs.phrases}}** has a status:

| Status | Meaning |
| --- | --- |
| **{{ui:voice.phrases.status.ready}}** | Ready to play |
| **{{ui:voice.phrases.status.stale}}** | The voice or text was changed, so the old audio is out of date |
| **{{ui:voice.phrases.status.pending}}** | No audio yet |
| **{{ui:voice.phrases.status.imported}}** | Comes from an imported file |

You can also **{{ui:voice.phrases.add}}** by hand to write frequently used lines, then reuse them on several feature pages by referencing them from the phrase library.

Auto-generated phrases are told apart by their **text**: if one announcement uses different text in different loadouts, each text keeps its own audio, and announcements with the same text share one. After you change the text, the announcement keeps playing its previous audio until audio for the new text is generated.

Deleting announcements, un-monitoring their targets or changing their text turns the old auto-generated phrases into unreferenced phrases. They are not deleted automatically: if you set up an announcement with the same text again before cleaning up, it reuses the audio that was already generated. Click **Clean up unreferenced phrases** to delete them all at once; the confirmation lists the phrases that will be deleted. The cleanup checks every loadout (not just the current one) and never deletes:

- phrases still used by any loadout, including events that are switched off;
- phrases picked with **{{ui:voice.binding.source.phrase}}** on a feature page;
- old phrases still playing in place of new text whose audio is not generated yet;
- phrases with imported audio (delete those one by one in the list);
- phrases you created by hand, and the bundled prompts.

## Examples

- [Warn about a Boss's big attack with your own sound effect](./examples/custom-sfx.md)
- [Download models, clone voices, and import audio phrases](./examples/clone-import.md)