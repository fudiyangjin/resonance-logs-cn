#include "generation_budget.h"

#include <algorithm>
#include <cmath>

namespace qwen3_tts {

namespace {

constexpr double kBudgetBaseSec = 2.0;
constexpr double kBudgetSecPerUnit = 1.0;

bool is_spoken_ascii(unsigned char byte) {
    return (byte >= '0' && byte <= '9') || (byte >= 'A' && byte <= 'Z') ||
           (byte >= 'a' && byte <= 'z');
}

} // namespace

size_t count_spoken_units(const std::string & text) {
    size_t units = 0;
    for (unsigned char byte : text) {
        if (byte < 0x80) {
            units += is_spoken_ascii(byte) ? 1 : 0;
        } else if ((byte & 0xC0) != 0x80) {
            // Lead byte of a multi-byte code point; continuation bytes skip.
            ++units;
        }
    }
    return units;
}

int32_t audio_token_budget(const std::string & text, double max_duration_sec) {
    const double wanted_sec = kBudgetBaseSec + kBudgetSecPerUnit * double(count_spoken_units(text));
    const double seconds = std::max(0.0, std::min(max_duration_sec, wanted_sec));
    return std::max<int32_t>(1, int32_t(std::ceil(seconds * kCodecFramesPerSecond)));
}

} // namespace qwen3_tts
