#include "audio_validate.h"

#include <cmath>

namespace qwen3_tts {

audio_validate_result validate_synthesized_audio(const std::vector<float> & samples,
                                                   int32_t sample_rate,
                                                   const audio_validate_params & params) {
    audio_validate_result result;

    if (sample_rate != params.expected_sample_rate) {
        result.error_msg = "Unexpected sample rate " + std::to_string(sample_rate) +
                            " (expected " + std::to_string(params.expected_sample_rate) + ")";
        return result;
    }

    if (samples.empty()) {
        result.error_msg = "Synthesized audio is empty";
        return result;
    }

    double sum_sq = 0.0;
    for (float s : samples) {
        if (!std::isfinite(s)) {
            result.error_msg = "Synthesized audio contains non-finite samples (NaN/Inf)";
            return result;
        }
        sum_sq += double(s) * double(s);
    }

    result.duration_sec = double(samples.size()) / double(sample_rate);
    result.rms = float(std::sqrt(sum_sq / double(samples.size())));

    if (result.duration_sec < params.min_duration_sec) {
        result.error_msg = "Synthesized audio too short (" + std::to_string(result.duration_sec) +
                            "s < " + std::to_string(params.min_duration_sec) + "s)";
        return result;
    }
    if (result.duration_sec > params.max_duration_sec) {
        result.error_msg = "Synthesized audio too long (" + std::to_string(result.duration_sec) +
                            "s > " + std::to_string(params.max_duration_sec) + "s)";
        return result;
    }
    if (result.rms < params.min_rms) {
        result.error_msg = "Synthesized audio is effectively silent (rms=" + std::to_string(result.rms) + ")";
        return result;
    }

    result.ok = true;
    return result;
}

} // namespace qwen3_tts
