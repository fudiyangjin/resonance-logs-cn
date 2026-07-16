# Voice model manifest

Release builds require two environment variables:

- `VOICE_MODEL_MANIFEST_URL`: absolute HTTPS URL of the signed manifest.
- `VOICE_MODEL_MANIFEST_PUBLIC_KEY`: standard Base64 encoding of the raw
  32-byte Ed25519 verifying key.

Debug builds without these variables use a manifest compiled into the
application. It pins revision `11f12ba6add0fc708be86c51b384a76489fe2608` of
`badlogicgames/qwen3-tts-0.6b-q8_0-gguf`, including the exact file sizes and
SHA-256 values. Setting both variables overrides this development default.

The endpoint returns an envelope with this shape:

```json
{
  "manifest": {
    "modelVersion": "qwen3-tts-0.6b-2026-01",
    "minAppVersion": "0.1.9",
    "files": [
      {
        "name": "qwen3-tts-0.6b-q8_0.gguf",
        "url": "https://models.example.invalid/qwen3-tts-0.6b-q8_0.gguf",
        "sizeBytes": 1,
        "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      {
        "name": "qwen3-tts-tokenizer-f16.gguf",
        "url": "https://models.example.invalid/qwen3-tts-tokenizer-f16.gguf",
        "sizeBytes": 1,
        "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
      }
    ]
  },
  "signature": "BASE64_ED25519_SIGNATURE"
}
```

The signature covers the compact UTF-8 JSON serialization of the `manifest`
object in field order: `modelVersion`, `minAppVersion`, `files`; each file uses
`name`, `url`, `sizeBytes`, `sha256`. The application rejects unsigned data,
non-HTTPS URLs, duplicate or path-like names, unexpected sizes, and SHA-256
mismatches. Installation finishes by atomically writing `install.json`; model
status and generation revalidate every receipt file.

Model weights are not bundled with the installer. Keep the Apache-2.0 model
notice and the vendored Qwen/GGML notices with every public distribution.
