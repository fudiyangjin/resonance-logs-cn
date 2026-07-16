# Qwen3-TTS sidecar protocol v3

The desktop application invokes a one-shot sidecar. Each batch explicitly names
the Transformer and shared speech tokenizer, so Base and CustomVoice models do
not need fixed file names and are never loaded for the same task.

## Probe and inspection

`--probe` prints one JSON object with `protocolVersion: 3`, backend inventory,
build information, and supported languages.

`--inspect-model <transformer.gguf>` parses only GGUF metadata and the tensor
directory. It does not allocate model weights or synthesize audio. A successful
CustomVoice inspection returns:

```json
{
  "architecture": "qwen3-tts",
  "model_type": "custom_voice",
  "speaker_name": "madoka",
  "speaker_token_id": 3000,
  "tokenizer_abi": "qwen3-tts-tokenizer-12hz-v1",
  "tensor_count": 402
}
```

## Batch job

Run `--job <job.json> --backend <cpu|vulkan>`. The job uses snake_case:

```json
{
  "protocol_version": 3,
  "transformer_path": "C:/models/transformer.gguf",
  "tokenizer_path": "C:/models/qwen3-tts-tokenizer-f16.gguf",
  "source": {
    "mode": "speaker_token",
    "speaker_token_id": 3000
  },
  "items": [
    {
      "id": "asset-1",
      "text": "Hello",
      "output_path": "C:/output/asset-1.wav",
      "language_id": 2050
    }
  ]
}
```

`source.mode` is one of:

- `profile_new`: requires `reference_wav_path` and `save_q3sp_path`.
- `profile_existing`: requires `existing_q3sp_path`.
- `speaker_token`: requires a non-negative `speaker_token_id`.

The sidecar emits JSON Lines. The first batch event is `hello`; later events are
`stage`, `item`, `batch`, or `fatal`. The host rejects any handshake whose
protocol version or engine does not match.
