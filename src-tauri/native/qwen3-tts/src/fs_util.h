#pragma once

// Small filesystem helpers shared by voice_profile and the batch sidecar.
// Kept dependency-free (no <filesystem> requirement) so the sidecar stays
// buildable with older toolchains targeted by the static Windows build.

#include <string>

namespace qwen3_tts {

// Atomically (best-effort) replaces `final_path` with `tmp_path`'s
// contents. On success `tmp_path` no longer exists. Returns false and
// sets `error_out` on failure; caller is responsible for cleaning up
// `tmp_path` in that case.
bool atomic_replace_file(const std::string & tmp_path, const std::string & final_path, std::string & error_out);

// Reads an entire file into a string. Returns false if the file cannot
// be opened or read in full.
bool read_file_to_string(const std::string & path, std::string & out, std::string & error_out);

} // namespace qwen3_tts
