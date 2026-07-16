#pragma once

// Minimal, dependency-free SHA-256 implementation used to fingerprint
// model files and reference audio for the voice sidecar (Q3SP profiles,
// batch job validation). Not intended for cryptographic security use
// cases beyond content-identity checks.

#include <array>
#include <cstdint>
#include <string>

namespace qwen3_tts {

using sha256_digest = std::array<uint8_t, 32>;

// Hash an in-memory buffer.
sha256_digest sha256_buffer(const void * data, size_t size);

// Hash a file on disk. Returns false (digest left zeroed) if the file
// cannot be opened.
bool sha256_file(const std::string & path, sha256_digest & out_digest);

// Lowercase hex encoding, e.g. "9f86d081...".
std::string sha256_to_hex(const sha256_digest & digest);

} // namespace qwen3_tts
