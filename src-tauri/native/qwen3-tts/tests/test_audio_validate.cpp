#ifndef _USE_MATH_DEFINES
// MSVC's <cmath> only exposes M_PI when this is defined before the very
// first standard header is included (transitively too); other compilers
// ignore it.
#define _USE_MATH_DEFINES
#endif

#include "audio_validate.h"
#include "test_require.h"

#include <cmath>
#include <cstdio>
#include <limits>
#include <vector>

using namespace qwen3_tts;

static std::vector<float> make_tone(double seconds, int sample_rate, float amplitude) {
    std::vector<float> samples(size_t(seconds * sample_rate));
    for (size_t i = 0; i < samples.size(); ++i) {
        samples[i] = amplitude * float(std::sin(2.0 * M_PI * 220.0 * i / sample_rate));
    }
    return samples;
}

int main() {
    printf("=== Audio Validate Test ===\n\n");

    printf("Test 1: healthy clip passes\n");
    {
        auto samples = make_tone(1.0, 24000, 0.5f);
        auto result = validate_synthesized_audio(samples, 24000);
        REQUIRE(result.ok);
        REQUIRE(std::fabs(result.duration_sec - 1.0) < 1e-6);
    }
    printf("  PASS\n\n");

    printf("Test 2: wrong sample rate is rejected\n");
    {
        auto samples = make_tone(1.0, 16000, 0.5f);
        auto result = validate_synthesized_audio(samples, 16000);
        REQUIRE(!result.ok);
    }
    printf("  PASS\n\n");

    printf("Test 3: empty audio is rejected\n");
    {
        std::vector<float> empty;
        auto result = validate_synthesized_audio(empty, 24000);
        REQUIRE(!result.ok);
    }
    printf("  PASS\n\n");

    printf("Test 4: non-finite samples are rejected\n");
    {
        auto samples = make_tone(1.0, 24000, 0.5f);
        samples[100] = std::numeric_limits<float>::quiet_NaN();
        auto result = validate_synthesized_audio(samples, 24000);
        REQUIRE(!result.ok);
    }
    printf("  PASS\n\n");

    printf("Test 5: too-short clip is rejected\n");
    {
        auto samples = make_tone(0.01, 24000, 0.5f);
        auto result = validate_synthesized_audio(samples, 24000);
        REQUIRE(!result.ok);
    }
    printf("  PASS\n\n");

    printf("Test 6: silent clip is rejected\n");
    {
        std::vector<float> silence(24000, 0.0f);
        auto result = validate_synthesized_audio(silence, 24000);
        REQUIRE(!result.ok);
    }
    printf("  PASS\n\n");

    printf("=== All audio validate tests passed! ===\n");
    return 0;
}
