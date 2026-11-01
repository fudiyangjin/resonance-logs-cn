#include "generation_budget.h"
#include "test_require.h"

#include <cstdio>

using namespace qwen3_tts;

int main() {
    printf("=== Generation Budget Test ===\n\n");

    printf("Test 1: spoken units skip ASCII spaces and punctuation\n");
    {
        REQUIRE(count_spoken_units("") == 0);
        REQUIRE(count_spoken_units(" ,.!?") == 0);
        REQUIRE(count_spoken_units("123") == 3);
        REQUIRE(count_spoken_units("Buff up!") == 6);
        REQUIRE(count_spoken_units("\xE4\xB8\x80") == 1);  // U+4E00
        REQUIRE(count_spoken_units("\xE6\x8A\x80\xE8\x83\xBD\xE8\xBF\x98\xE6\x9C\x89"
                                   "5\xE7\xA7\x92") == 6);  // "ji neng hai you 5 miao"
    }
    printf("  PASS\n\n");

    printf("Test 2: budget is 2 s plus 1 s per unit at 12.5 frames/s\n");
    {
        REQUIRE(audio_token_budget("", 30.0) == 25);                // 2 s
        REQUIRE(audio_token_budget("\xE4\xB8\x80", 30.0) == 38);    // 3 s, U+4E00
        REQUIRE(audio_token_budget("123", 30.0) == 63);             // 5 s
    }
    printf("  PASS\n\n");

    printf("Test 3: budget never exceeds the duration limit\n");
    {
        const std::string long_text(200, 'a');
        REQUIRE(audio_token_budget(long_text, 30.0) == 375);
        REQUIRE(audio_token_budget(long_text, 10.0) == 125);
        REQUIRE(audio_token_budget("123", 0.0) == 1);
    }
    printf("  PASS\n\n");

    printf("All generation budget tests passed.\n");
    return 0;
}
