#pragma once

// Q3SP: a small binary container for a persisted speaker embedding
// ("voice profile") so the sidecar can synthesize with a previously
// extracted timbre without re-running the speaker encoder or keeping the
// original reference audio around.
//
// File layout (all integers little-endian):
//   [0..4)   magic              "Q3SP"
//   [4..8)   version            uint32, currently 2
//   [8..12)  embedding_dim      uint32 (e.g. 1024)
//   [12..44) model_sha256       32 bytes, SHA-256 of the transformer GGUF
//                               used to extract this embedding
//   [44..76) ref_audio_sha256   32 bytes, SHA-256 of the reference WAV
//                               (all-zero if the reference was discarded
//                               or is unknown)
//   [76..80) engine_compat      uint32, sidecar embedding ABI version
//   [80..80+4*dim) payload      float32[embedding_dim], the speaker
//                               embedding itself
//   [last 4)  crc32             uint32 CRC-32 (IEEE 802.3) of every byte
//                               above, used to detect truncation/corruption

#include "sha256.h"

#include <cstdint>
#include <string>
#include <vector>

namespace qwen3_tts {

constexpr char Q3SP_MAGIC[4] = {'Q', '3', 'S', 'P'};
constexpr uint32_t Q3SP_VERSION = 2;
constexpr uint32_t Q3SP_ENGINE_COMPAT_VERSION = 1;

struct VoiceProfile {
    uint32_t version = Q3SP_VERSION;
    uint32_t embedding_dim = 0;
    sha256_digest model_sha256{};
    sha256_digest ref_audio_sha256{};
    uint32_t engine_compat_version = Q3SP_ENGINE_COMPAT_VERSION;
    std::vector<float> embedding;
};

// Serializes `profile` to `path`. Writes to a temporary sibling file and
// renames into place so a crash never leaves a half-written profile.
// Returns false and sets `error_out` on failure.
bool voice_profile_save(const std::string & path, const VoiceProfile & profile, std::string & error_out);

// Reads and validates a Q3SP file (magic, version, CRC, embedding_dim
// bounds). Returns false and sets `error_out` on any failure, including
// checksum mismatch.
bool voice_profile_load(const std::string & path, VoiceProfile & profile, std::string & error_out);

// Convenience: true if `profile.embedding_dim` matches the model's actual
// hidden size, guarding against loading a profile extracted with a
// different/incompatible model.
bool voice_profile_matches_hidden_size(const VoiceProfile & profile, int32_t hidden_size);

// Requires both the embedding shape and exact transformer fingerprint to
// match. Equal hidden sizes alone do not make embeddings interchangeable.
bool voice_profile_matches_model(const VoiceProfile & profile, int32_t hidden_size,
                                 const sha256_digest & model_sha256);

} // namespace qwen3_tts
