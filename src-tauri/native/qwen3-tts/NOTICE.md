# Third-party notices

This repository (a fork of [predict-woo/qwen3-tts.cpp](https://github.com/predict-woo/qwen3-tts.cpp))
is used by `resonance-logs-cn` as the batch/voice-cloning sidecar for its
offline voice broadcast feature. It is distributed as a compiled
executable (`qwen3-tts-sidecar.exe`), not as linked/embedded source, but
the following notices apply to what is built and to the models it loads
at runtime.

## qwen3-tts.cpp — MIT

Upstream does not (as of this writing) ship a `LICENSE` file, but the
repository owner has explicitly and publicly confirmed MIT licensing:

- Issue [#4 "What license is this project under?"](https://github.com/predict-woo/qwen3-tts.cpp/issues/4):
  > "It's under MIT, you can use it" — @predict-woo, 2026-02-20
- Issue [#16 "License"](https://github.com/predict-woo/qwen3-tts.cpp/issues/16):
  the same MIT confirmation is reiterated.

See `LICENSE` in this fork for the resulting MIT grant text and
provenance note. If upstream later publishes a formal `LICENSE` file,
re-check for any wording differences before the next release.

## GGML — MIT

Vendored directly from https://github.com/ggml-org/ggml at the commit recorded
in `UPSTREAM.md` and statically linked into `qwen3-tts-sidecar.exe`. GGML is
MIT-licensed; see `ggml/LICENSE` for the authoritative text and copyright
holders.

## Qwen3-TTS model weights — Apache-2.0

The GGUF model files consumed by this sidecar are converted from
[Qwen/Qwen3-TTS-12Hz-0.6B-Base](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base)
(Apache License 2.0). Model weights are downloaded separately by the
host application's model manager (never bundled in this source tree or
in the application installer/updater) — see
`resonance-logs-cn/src-tauri/src/voice/model_manager.rs` and its model
manifest for the download/attribution flow presented to end users.

## Distribution checklist before a public release

- [ ] Re-check upstream `qwen3-tts.cpp` for a formal `LICENSE` file and
      reconcile with the note above if one has appeared.
- [ ] Confirm the pinned GGML submodule commit's `LICENSE` file is
      present and unchanged from MIT.
- [ ] Ship this `NOTICE.md` (or an equivalent third-party notices
      screen) alongside the application so end users can see the model
      weights are Apache-2.0 and separately downloaded, not part of the
      MIT-licensed application code.
