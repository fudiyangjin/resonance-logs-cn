# Voice Announcements

Corresponds to **Voice** in the toolbox. Clone or fine-tune a voice offline, maintain fixed phrases, and play **pre-generated** audio when buffs or mechanics trigger (playback does not reload the model).

Usage splits into two parts:

1. **General configuration flow**: enable events and pick text on buff / mechanic pages — decides *when* and *what* to announce.
2. **Generating announcement audio**: pick a voice source (zero-shot cloning / fine-tuning) and synthesize the text into local audio.

## General Configuration Flow

### Prerequisites

1. Open **Voice → Model & Voices**, download/install the voice model (or manually import a converted model).
2. Open **Overview & Playback**, enable **Enable voice announcements**, then adjust volume, queue policy, and generation backend (Auto / CPU / Vulkan).

### Configure announcements on the Buff page

Using the most common entry, **Live Monitor → Buff Monitor**: expand the **Voice** section under a monitored buff and add rules for it.

![Configuring announcements on the buff page](../../../shared/img/voice/voice_1.png)

1. Click **Search monitored buffs and add a voice announcement** to add the buff to the list.
2. Enable trigger events: **On gain** / **N seconds remaining** / **On expire**.
3. Pick a text source per event:
   - **Auto**: default line from the buff name + event type (previewable)
   - **Custom text**: hand-written announcement, e.g. "Tina's cooldown is over"; fantasy-related buffs can also use a tier placeholder (see below)
   - **Phrase library**: reuse an existing phrase
4. Use **Preview** to verify; if it reports pending audio, the line hasn't been synthesized yet — see "Generating Announcement Audio" below.

> The top-right corner shows how many announcements are configured in the section; use **Remove announcement** to delete one.

### Fantasy tier in custom text

Some fantasy-applied buffs come from a resonance fantasy with remodel **tiers 0–5**. To include the tier in the announcement, put a placeholder in the **On gain / On expire** custom text ("N seconds remaining" is not supported):

| Placeholder | Notes |
|-------------|--------|
| `${remodelLevel}` | Preferred in English docs |
| `${阶数}` | Same meaning (Chinese form) |

Example: custom text `Tina Tier ${remodelLevel} active` → at tier 5 plays as `Tina Tier 5 active`.

Notes:

- Only **Buff Monitor** and **Monster Buff Monitor** **On gain / On expire** support this. Counters, Boss DBM, dungeon mechanics, and "N seconds remaining" do not expand tiers.
- When configured, the app generates **one phrase per tier 0–5** plus a fallback with the placeholder stripped (used when the tier cannot be resolved). Phrases are created on demand — not pre-built for every buff.
- **Preview** expands the placeholder with tier 5 as an example; live playback picks the variant matching the resolved fantasy tier, or the fallback if unknown.
- After editing custom text, check **Bindings Overview** and **Generate missing audio**.

Overlay buff names can also show as `Name | Tier n` when the source fantasy tier is known (independent of voice settings).

### Other configuration routes

All voice rules are configured inline on feature pages, not created in Bindings Overview:

| Where | Typical events |
|----------|----------|
| Live Monitor → Buff Monitor | Gained / Lost / N seconds remaining |
| Live Monitor → Custom Monitor (counters) | Reached target |
| Monster Monitor → Buff Monitor | Gained / Lost / N seconds remaining |
| Monster Monitor → Boss DBM | On cast / trigger |
| Dungeon Mechanics → Mechanic voice cues | Supported mechanic warnings per map |

### Bindings Overview

**Voice → Bindings Overview** is a read-only summary of everything above (grouped by Buff Monitor, monster buffs, counters, boss mechanics, dungeon mechanics):

- For **Pending** items, install a model and select a voice first, then **Generate missing audio**.
- Use "Go to …" links to edit bindings on the original page.

## Generating Announcement Audio

Once text is configured, it must be synthesized into audio. There are two voice sources: **zero-shot cloning** (quick and easy) and **fine-tuning** (higher quality ceiling).

### Method 1: Zero-shot voice cloning

In **Phrase Library → Batch generate**, choose **Clone voice** — no training needed, a single reference clip is enough:

![Batch generation with cloned voice](../../../shared/img/voice/voice_2.png)

1. Choose **Use existing voice** (reuse a saved voice profile), or **Create new voice**:
   - Enter a name and pick a reference audio file (WAV);
   - Optionally keep the reference file.
2. Select the phrases to generate (Select all supported), then **Start generation** — audio takes effect immediately.

**Reference audio tips**: use a **5–10 second clean vocal clip** of the character — single speaker, clear, no background music, no reverb. The cleaner the reference, the closer the clone.

Phrase status meanings:

- **Ready**: playable
- **Stale**: voice or text changed; regenerate required
- **Pending**: no valid audio yet

> First generation may be slow; once done, triggers only play local audio without reloading the model.

### Method 2: Fine-tuned voice (advanced)

Zero-shot cloning relies on a few seconds of reference audio, so similarity and stability are limited. For higher fidelity, **fine-tune** a dedicated model on the target character's speech, then reference the exported folder as a **Fine-tuned voice** on the **Model & Voices** page.

Rough pipeline:

1. **Get source material**: download Bilibili videos with [bilibilidownloadtool](https://github.com/NANblogink/bilibilidownloadtool).
2. **Extract audio**: convert to lossless PCM WAV with FFmpeg (keep the original sample rate; don't compress to MP3 first).
3. **Separate vocals**: use [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) to strip background music and export the `Vocals` stem, then listen through the result.
4. **Build the dataset**: split on silence, resample to 24 kHz, transcribe with ASR, and proofread the text manually.
5. **Train**: generate audio codes and a speaker embedding, then fine-tune Qwen3-TTS 0.6B CustomVoice (running in Docker is recommended; prebuilt image `ghcr.io/mozi1924/qwen3-tts-easyfinetuning`).
6. **Export and deploy**: export a GGUF deploy folder and reference it in-app as a fine-tuned voice.

Data and environment requirements:

- Only use voice data you own or are authorized to use, and keep one dataset to a single target speaker.
- Aim for **10–30 minutes** of clean speech; less data works, but similarity and stability suffer.
- Training wants an NVIDIA GPU (≥ 16 GB VRAM); on Windows, WSL2 + Docker Desktop is recommended.

Fine-tuned results (Japanese voice):

- Tina cooldown reminder: <audio controls src="../../../shared/audio/voice/ja_01_tina_cd.wav"></audio> [ja_01_tina_cd.wav](../../../shared/audio/voice/ja_01_tina_cd.wav)
- N20 healing reminder: <audio controls src="../../../shared/audio/voice/ja_02_n20_healbot.wav"></audio> [ja_02_n20_healbot.wav](../../../shared/audio/voice/ja_02_n20_healbot.wav)

If a fine-tuned voice's path goes missing or its files change, use **Relocate** and **Integrity check** on the **Model & Voices** page.

## Playback & Queue

- With **Enable voice announcements** off, no rule plays audio.
- Queue policies:
  - **Drop low priority when full**: avoid backlog during busy moments
  - **Higher priority can interrupt**: critical mechanics can preempt playback
- **Stop playback** is always available.

## Relation to Loadouts

Loadouts include live-monitor and monster-monitor settings; voice bindings are stored with those profiles. After switching or importing a loadout, check Bindings Overview that audio is still **Ready** (regeneration may be needed on another machine).

## FAQ

| Symptom | Suggestion |
|------|----------|
| Preview fails | Confirm the model is installed and the phrase/binding has generated audio |
| Backend shows unavailable | Install Vulkan runtime, then **Refresh**; or switch to CPU / Auto |
| Fine-tuned voice unavailable | Relocate the deploy folder and run integrity check |
| No mechanic cues listed | Current map has no voice cues wired yet |
| Operation busy | Wait for download/generation to finish, or cancel and retry |
| Used `${remodelLevel}` but no tier is spoken | Confirm the event is On gain / On expire with custom text; generate tier variants in Bindings Overview; some fantasy buffs are applied by the player rather than the summon entity, so the tier may not resolve yet and the fallback line is used |

See `docs/VOICE_MODEL_MANIFEST.md` for manifest / release details (developers).
