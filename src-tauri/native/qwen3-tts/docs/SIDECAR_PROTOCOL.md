# qwen3-tts-sidecar batch protocol

Protocol version: **1**.

`qwen3-tts-sidecar --probe` prints one JSON object describing the engine,
source commit, build type, protocol version, stub flag, and supported
languages without loading a model. Hosts must probe successfully before
reporting the engine as ready.

`qwen3-tts-sidecar --job <path-to-job.json> --backend <cpu|vulkan|cuda>` is a **one-shot** process:
it loads models once, resolves a single speaker embedding, synthesizes
every item in the job with that embedding, and exits. There is no
long-running server mode, no IPC beyond stdio, and no in-process
cancellation — the host process is expected to kill the process (e.g.
`taskkill` / `Child::kill`) if it needs to abort a batch early. Partial
output written before the kill is left as `.tmp` staging files and
should be discarded by the host.

The job file path is passed as a file (not inline on the command line)
to avoid Windows command-line length/encoding pitfalls with non-ASCII
phrase text.

## Job file (`--job`)

UTF-8 JSON, single object:

```json
{
  "protocol_version": 2,
  "model_dir": "C:/Users/.../voice/models/v1",
  "profile": {
    "mode": "new",
    "reference_wav_path": "C:/Users/.../voice/staging/ref_abc.wav",
    "save_q3sp_path": "C:/Users/.../voice/profiles/abc/speaker.q3sp"
  },
  "items": [
    {
      "id": "phrase_mechanism_arrived",
      "text": "机制来了",
      "language_id": 2055,
      "output_path": "C:/Users/.../voice/staging/phrase_mechanism_arrived_take3.wav",
      "temperature": 0.9,
      "top_k": 50,
      "top_p": 1.0,
      "repetition_penalty": 1.05,
      "max_audio_tokens": 4096,
      "min_duration_sec": 0.15,
      "max_duration_sec": 30.0
    }
  ]
}
```

- `profile.mode`: `"new"` extracts a fresh speaker embedding from
  `reference_wav_path` and writes it to `save_q3sp_path` (Q3SP v2, see
  `src/voice_profile.h`). `"existing"` loads a previously-saved
  `existing_q3sp_path` instead of touching any encoder/reference audio.
  Either way, every item in `items` reuses that **same** embedding —
  this is what gives repeated phrases from one profile a consistent
  timbre.
- `items[].language_id`: per Qwen3-TTS codec convention (2050=en,
  2055=zh, 2058=ja, ...); each phrase can use a different language even
  within one batch/profile.
- `items[].output_path`: sidecar writes here atomically (`.tmp` +
  rename). The host decides whether this is a "staging" path that still
  needs user confirmation before becoming the active asset — the
  sidecar has no concept of staging vs. active.
- Sampling/limits fields are optional; omitted fields fall back to
  `qwen3_tts::tts_params` defaults (temperature 0.9, top_k 50, top_p 1.0,
  repetition_penalty 1.05, max_audio_tokens 4096) and
  `min_duration_sec=0.15` / `max_duration_sec=30.0` for validation.

## stdout: JSON Lines progress/results

One JSON object per line, flushed immediately after each event:

| `type`    | Fields                                                                 | Meaning                                              |
|-----------|-------------------------------------------------------------------------|-------------------------------------------------------|
| `hello`   | `protocol_version`, `engine`, `source_commit`, `backend`, `device`       | Required first event before model loading             |
| `stage`   | `stage`, `status` (`start`/`done`), plus stage-specific fields          | `load_model` then `profile` lifecycle events          |
| `item`    | `id`, `status` (`start`/`ok`/`error`), plus below                       | Per-phrase progress                                   |
| `batch`   | `status` (`ok`/`partial`), `completed`, `failed`                        | Always the last line before exit                      |
| `fatal`   | `error`                                                                 | Unrecoverable error before/instead of any batch result |

`item` fields by status:
- `start`: no extra fields.
- `ok`: `output_path`, `duration_sec`, `sample_rate`, `elapsed_ms`.
- `error`: `error` (human-readable message).

A `fatal` line means the process is about to exit non-zero with **no**
`batch` line following (e.g. bad job file, model load failure, profile
load/extraction failure, or profile/model dimension mismatch). An `item`
with `status: "error"` does *not* stop the batch — remaining items still
run — and is reflected in the final `batch.failed` count instead.

## Exit codes

- `0`: all items succeeded (`batch.status == "ok"`).
- `1`: fatal error, no items were attempted or the job file itself was
  invalid.
- `2`: batch ran but at least one item failed (`batch.status ==
  "partial"`); check the per-item `error` fields on stdout.

## stderr

Human-readable diagnostic/timing/memory logs from the underlying
`qwen3_tts` pipeline (model load progress, per-stage timing, memory
snapshots). Safe to log for troubleshooting but not meant to be parsed.

## Safety notes for the host process

- Only invoke the sidecar with paths inside the application's own
  managed voice directory (models, profiles, staging). The sidecar does
  not sandbox itself — access control is the host's responsibility.
- Verify `model_dir` contains SHA-256-checked GGUF files before
  invoking; the sidecar does not re-validate model integrity beyond
  being able to load them.
- Never run two sidecar batches concurrently against the same models —
  there is no locking; the host must serialize generation jobs.
