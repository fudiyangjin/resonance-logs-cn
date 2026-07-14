#pragma once

// Guards against handing a broken/silent/garbage take back to the caller.
// The sidecar runs this on every synthesized clip before reporting an
// item as successful; failures are reported as item errors so the batch
// keeps going instead of shipping a bad WAV as if it were fine.

#include <cstdint>
#include <string>
#include <vector>

namespace qwen3_tts {

struct audio_validate_params {
    int32_t expected_sample_rate = 24000;
    double min_duration_sec = 0.15;
    double max_duration_sec = 30.0;
    // RMS below this (on a [-1, 1] scale) is treated as effectively silent.
    float min_rms = 1e-4f;
};

struct audio_validate_result {
    bool ok = false;
    std::string error_msg;
    double duration_sec = 0.0;
    float rms = 0.0f;
};

audio_validate_result validate_synthesized_audio(const std::vector<float> & samples,
                                                  int32_t sample_rate,
                                                  const audio_validate_params & params = audio_validate_params());

} // namespace qwen3_tts
