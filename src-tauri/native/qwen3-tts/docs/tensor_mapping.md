# Qwen3-TTS Tensor Mapping Documentation

This document describes the tensor name mapping from HuggingFace format to GGML/GGUF format
for the Qwen3-TTS model conversion.

## Model Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Qwen3-TTS-12Hz-0.6B-Base                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────┐    │
│  │ Speaker Encoder │    │              Talker (Main TTS)              │    │
│  │   (ECAPA-TDNN)  │    │  ┌─────────────────────────────────────┐    │    │
│  │                 │    │  │     28-Layer Transformer            │    │    │
│  │  Audio → 1024d  │───▶│  │  (Qwen3-style with RoPE/GQA)       │    │    │
│  │  speaker embed  │    │  │                                     │    │    │
│  └─────────────────┘    │  │  Hidden: 1024, Heads: 16, KV: 8    │    │    │
│                         │  │  Intermediate: 3072                 │    │    │
│                         │  └─────────────────────────────────────┘    │    │
│                         │                    │                        │    │
│                         │                    ▼                        │    │
│                         │  ┌─────────────────────────────────────┐    │    │
│                         │  │         Code Predictor              │    │    │
│                         │  │    (5-Layer Delay Transformer)      │    │    │
│                         │  │                                     │    │    │
│                         │  │  16 codebook embeddings/heads       │    │    │
│                         │  │  Vocab: 2048 per codebook           │    │    │
│                         │  └─────────────────────────────────────┘    │    │
│                         └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      Qwen3-TTS-Tokenizer-12Hz                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────┐    ┌─────────────────────────────┐    │
│  │         Encoder                 │    │         Decoder             │    │
│  │    (Audio → Codes)              │    │    (Codes → Audio)          │    │
│  │                                 │    │                             │    │
│  │  Conv1D + 8-layer Transformer   │    │  8-layer Transformer        │    │
│  │  + RVQ (32 quantizers)          │    │  + Upsampling ConvNet       │    │
│  │                                 │    │                             │    │
│  │  16 valid quantizers output     │    │  Upsample: 8×5×4×3 = 480   │    │
│  │  Codebook: 2048 entries         │    │  Vocoder output             │    │
│  └─────────────────────────────────┘    └─────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Architecture Parameters

### TTS Base Model (Talker)
| Parameter | Value |
|-----------|-------|
| Hidden Size | 1024 |
| Intermediate Size | 3072 |
| Num Hidden Layers | 28 |
| Num Attention Heads | 16 |
| Num KV Heads | 8 (GQA) |
| Head Dim | 128 |
| Vocab Size (codec) | 3072 |
| Num Code Groups | 16 |
| RMS Norm Eps | 1e-06 |
| RoPE Theta | 1000000 |
| Activation | SiLU |

### Code Predictor (Delay Pattern)
| Parameter | Value |
|-----------|-------|
| Hidden Size | 1024 |
| Intermediate Size | 3072 |
| Num Hidden Layers | 5 |
| Num Attention Heads | 16 |
| Num KV Heads | 8 |
| Vocab Size | 2048 |
| Num Code Groups | 16 |

### Tokenizer Encoder
| Parameter | Value |
|-----------|-------|
| Frame Rate | 12.5 Hz |
| Hidden Size | 512 |
| Num Hidden Layers | 8 |
| Num Attention Heads | 8 |
| Codebook Size | 2048 |
| Num Quantizers | 32 (16 valid) |
| Sample Rate | 24000 Hz |

### Tokenizer Decoder (Vocoder)
| Parameter | Value |
|-----------|-------|
| Latent Dim | 1024 |
| Decoder Dim | 1536 |
| Hidden Size | 512 |
| Num Hidden Layers | 8 |
| Num Attention Heads | 16 |
| Codebook Size | 2048 |
| Upsample Rates | [8, 5, 4, 3] |

## HuggingFace → GGML Tensor Name Mapping

### Speaker Encoder (ECAPA-TDNN)
```
HuggingFace Name                                    → GGML Name
─────────────────────────────────────────────────────────────────────────────
speaker_encoder.blocks.0.conv.weight                → spk_enc.conv0.weight
speaker_encoder.blocks.0.conv.bias                  → spk_enc.conv0.bias
speaker_encoder.blocks.{n}.res2net_block.blocks.{m}.conv.weight
                                                    → spk_enc.blk.{n}.res2net.{m}.weight
speaker_encoder.blocks.{n}.se_block.conv1.weight    → spk_enc.blk.{n}.se.conv1.weight
speaker_encoder.blocks.{n}.se_block.conv2.weight    → spk_enc.blk.{n}.se.conv2.weight
speaker_encoder.blocks.{n}.tdnn1.conv.weight        → spk_enc.blk.{n}.tdnn1.weight
speaker_encoder.blocks.{n}.tdnn2.conv.weight        → spk_enc.blk.{n}.tdnn2.weight
speaker_encoder.asp.conv.weight                     → spk_enc.asp.conv.weight
speaker_encoder.asp.tdnn.conv.weight                → spk_enc.asp.tdnn.weight
speaker_encoder.mfa.conv.weight                     → spk_enc.mfa.weight
speaker_encoder.fc.weight                           → spk_enc.fc.weight
```

### Talker (Main TTS Transformer)
```
HuggingFace Name                                    → GGML Name
─────────────────────────────────────────────────────────────────────────────
talker.model.codec_embedding.weight                 → talker.codec_embd.weight
talker.codec_head.weight                            → talker.codec_head.weight
talker.model.norm.weight                            → talker.output_norm.weight

# Per-layer tensors (28 layers)
talker.model.layers.{n}.input_layernorm.weight      → talker.blk.{n}.attn_norm.weight
talker.model.layers.{n}.self_attn.q_proj.weight     → talker.blk.{n}.attn_q.weight
talker.model.layers.{n}.self_attn.k_proj.weight     → talker.blk.{n}.attn_k.weight
talker.model.layers.{n}.self_attn.v_proj.weight     → talker.blk.{n}.attn_v.weight
talker.model.layers.{n}.self_attn.o_proj.weight     → talker.blk.{n}.attn_output.weight
talker.model.layers.{n}.self_attn.q_norm.weight     → talker.blk.{n}.attn_q_norm.weight
talker.model.layers.{n}.self_attn.k_norm.weight     → talker.blk.{n}.attn_k_norm.weight
talker.model.layers.{n}.post_attention_layernorm.weight → talker.blk.{n}.ffn_norm.weight
talker.model.layers.{n}.mlp.gate_proj.weight        → talker.blk.{n}.ffn_gate.weight
talker.model.layers.{n}.mlp.up_proj.weight          → talker.blk.{n}.ffn_up.weight
talker.model.layers.{n}.mlp.down_proj.weight        → talker.blk.{n}.ffn_down.weight
```

### Code Predictor (Delay Pattern Transformer)
```
HuggingFace Name                                    → GGML Name
─────────────────────────────────────────────────────────────────────────────
# 16 codebook embeddings (indices 0-14, skipping first codebook)
talker.code_predictor.model.codec_embedding.{c}.weight
                                                    → code_pred.codec_embd.{c}.weight

# 16 LM heads for each codebook
talker.code_predictor.lm_head.{c}.weight            → code_pred.lm_head.{c}.weight

talker.code_predictor.model.norm.weight             → code_pred.output_norm.weight

# Per-layer tensors (5 layers)
talker.code_predictor.model.layers.{n}.input_layernorm.weight
                                                    → code_pred.blk.{n}.attn_norm.weight
talker.code_predictor.model.layers.{n}.self_attn.q_proj.weight
                                                    → code_pred.blk.{n}.attn_q.weight
talker.code_predictor.model.layers.{n}.self_attn.k_proj.weight
                                                    → code_pred.blk.{n}.attn_k.weight
talker.code_predictor.model.layers.{n}.self_attn.v_proj.weight
                                                    → code_pred.blk.{n}.attn_v.weight
talker.code_predictor.model.layers.{n}.self_attn.o_proj.weight
                                                    → code_pred.blk.{n}.attn_output.weight
talker.code_predictor.model.layers.{n}.self_attn.q_norm.weight
                                                    → code_pred.blk.{n}.attn_q_norm.weight
talker.code_predictor.model.layers.{n}.self_attn.k_norm.weight
                                                    → code_pred.blk.{n}.attn_k_norm.weight
talker.code_predictor.model.layers.{n}.post_attention_layernorm.weight
                                                    → code_pred.blk.{n}.ffn_norm.weight
talker.code_predictor.model.layers.{n}.mlp.gate_proj.weight
                                                    → code_pred.blk.{n}.ffn_gate.weight
talker.code_predictor.model.layers.{n}.mlp.up_proj.weight
                                                    → code_pred.blk.{n}.ffn_up.weight
talker.code_predictor.model.layers.{n}.mlp.down_proj.weight
                                                    → code_pred.blk.{n}.ffn_down.weight
```

### Tokenizer Encoder (Audio → Codes)
```
HuggingFace Name                                    → GGML Name
─────────────────────────────────────────────────────────────────────────────
encoder.conv.conv.weight                            → tok_enc.conv.weight
encoder.conv.conv.bias                              → tok_enc.conv.bias

# Encoder transformer layers
encoder.layers.{n}.self_attn.q_proj.weight          → tok_enc.blk.{n}.attn_q.weight
encoder.layers.{n}.self_attn.k_proj.weight          → tok_enc.blk.{n}.attn_k.weight
encoder.layers.{n}.self_attn.v_proj.weight          → tok_enc.blk.{n}.attn_v.weight
encoder.layers.{n}.self_attn.o_proj.weight          → tok_enc.blk.{n}.attn_output.weight
encoder.layers.{n}.input_layernorm.weight           → tok_enc.blk.{n}.attn_norm.weight
encoder.layers.{n}.post_attention_layernorm.weight  → tok_enc.blk.{n}.ffn_norm.weight
encoder.layers.{n}.mlp.fc1.weight                   → tok_enc.blk.{n}.ffn_up.weight
encoder.layers.{n}.mlp.fc2.weight                   → tok_enc.blk.{n}.ffn_down.weight

# RVQ codebooks (16 valid quantizers)
encoder.quantizer.layers.{q}.codebook               → tok_enc.vq.{q}.codebook
```

### Tokenizer Decoder (Codes → Audio / Vocoder)
```
HuggingFace Name                                    → GGML Name
─────────────────────────────────────────────────────────────────────────────
# Codebook embeddings
decoder.codebook_semantic.weight                    → tok_dec.codebook_semantic.weight
decoder.codebook.{c}.weight                         → tok_dec.codebook.{c}.weight

# Decoder transformer layers
decoder.layers.{n}.self_attn.q_proj.weight          → tok_dec.blk.{n}.attn_q.weight
decoder.layers.{n}.self_attn.k_proj.weight          → tok_dec.blk.{n}.attn_k.weight
decoder.layers.{n}.self_attn.v_proj.weight          → tok_dec.blk.{n}.attn_v.weight
decoder.layers.{n}.self_attn.o_proj.weight          → tok_dec.blk.{n}.attn_output.weight
decoder.layers.{n}.input_layernorm.weight           → tok_dec.blk.{n}.attn_norm.weight
decoder.layers.{n}.post_attention_layernorm.weight  → tok_dec.blk.{n}.ffn_norm.weight
decoder.layers.{n}.mlp.fc1.weight                   → tok_dec.blk.{n}.ffn_up.weight
decoder.layers.{n}.mlp.fc2.weight                   → tok_dec.blk.{n}.ffn_down.weight

# Upsampling ConvNet (vocoder)
decoder.upsample.{n}.conv.weight                    → tok_dec.upsample.{n}.weight
decoder.upsample.{n}.conv.bias                      → tok_dec.upsample.{n}.bias
decoder.conv_out.weight                             → tok_dec.conv_out.weight
decoder.conv_out.bias                               → tok_dec.conv_out.bias
```

## Tensor Count Summary

| Component | Tensor Count |
|-----------|-------------|
| TTS Base Main Model | 478 |
| TTS Base Speech Tokenizer | 1082 |
| Standalone Tokenizer | 1082 |

## Special Tokens (Codec IDs)

| Token | ID |
|-------|-----|
| codec_pad_id | 2148 |
| codec_bos_id | 2149 |
| codec_eos_token_id | 2150 |
| codec_think_id | 2154 |
| codec_nothink_id | 2155 |
| codec_think_bos_id | 2156 |
| codec_think_eos_id | 2157 |

### Language IDs
| Language | ID |
|----------|-----|
| english | 2050 |
| german | 2053 |
| spanish | 2054 |
| chinese | 2055 |
| japanese | 2058 |
| french | 2061 |
| korean | 2064 |
| russian | 2069 |
| italian | 2070 |
| portuguese | 2071 |

## RoPE Configuration

The Talker uses M-RoPE (Multi-dimensional RoPE) with interleaved positions:
- `mrope_section`: [24, 20, 20] - dimensions for time, frequency, and other
- `rope_theta`: 1000000
- `interleaved`: true

## Notes for GGUF Conversion

1. **Grouped Query Attention (GQA)**: Both Talker and Code Predictor use GQA with 16 attention heads and 8 KV heads (ratio 2:1).

2. **Q/K Norms**: Qwen3-style models apply RMSNorm to Q and K projections before attention.

3. **16 Codebooks**: The model uses 16 parallel codebooks for audio codes. Each codebook has:
   - Separate embedding layer (2048 × 1024)
   - Separate LM head (2048 × 1024)

4. **Delay Pattern**: The Code Predictor implements a delay pattern for parallel codebook prediction.

5. **Speaker Encoder**: ECAPA-TDNN architecture with Res2Net blocks and SE (Squeeze-Excitation) modules.

6. **Tokenizer**: The tokenizer uses RVQ (Residual Vector Quantization) with 32 quantizers, but only 16 are valid for output.
