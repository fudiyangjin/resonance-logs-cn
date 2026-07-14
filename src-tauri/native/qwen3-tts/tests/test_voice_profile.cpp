#include "voice_profile.h"
#include "test_require.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>

using namespace qwen3_tts;

static std::string temp_path(const char * name) {
#ifdef _WIN32
    const char * tmp_dir = getenv("TEMP");
#else
    const char * tmp_dir = getenv("TMPDIR");
#endif
    std::string dir = tmp_dir ? tmp_dir : ".";
    return dir + "/" + name;
}

int main() {
    printf("=== Voice Profile (Q3SP) Test ===\n\n");

    const std::string path = temp_path("qwen3tts_test_profile.q3sp");
    std::remove(path.c_str());

    // Test 1: round-trip save/load preserves all fields.
    printf("Test 1: Round-trip save/load\n");
    VoiceProfile original;
    original.embedding_dim = 8;
    original.embedding = {0.1f, -0.2f, 0.3f, 0.0f, 1.5f, -1.5f, 0.001f, -0.001f};
    original.model_sha256.fill(0xAB);
    original.ref_audio_sha256.fill(0xCD);

    std::string err;
    REQUIRE(voice_profile_save(path, original, err));

    VoiceProfile loaded;
    REQUIRE(voice_profile_load(path, loaded, err));
    REQUIRE(loaded.embedding_dim == original.embedding_dim);
    REQUIRE(loaded.embedding.size() == original.embedding.size());
    for (size_t i = 0; i < original.embedding.size(); ++i) {
        REQUIRE(loaded.embedding[i] == original.embedding[i]);
    }
    REQUIRE(loaded.model_sha256 == original.model_sha256);
    REQUIRE(loaded.ref_audio_sha256 == original.ref_audio_sha256);
    printf("  PASS\n\n");

    // Test 2: hidden-size validation.
    printf("Test 2: hidden size validation\n");
    REQUIRE(voice_profile_matches_hidden_size(loaded, 8));
    REQUIRE(!voice_profile_matches_hidden_size(loaded, 1024));
    REQUIRE(voice_profile_matches_model(loaded, 8, original.model_sha256));
    sha256_digest other_model{};
    other_model.fill(0xEF);
    REQUIRE(!voice_profile_matches_model(loaded, 8, other_model));
    printf("  PASS\n\n");

    // Test 3: corrupted file is rejected via checksum.
    printf("Test 3: corrupted profile is rejected\n");
    {
        FILE * f = fopen(path.c_str(), "r+b");
        REQUIRE(f != nullptr);
        fseek(f, 20, SEEK_SET);
        uint8_t garbage = 0xFF;
        fwrite(&garbage, 1, 1, f);
        fclose(f);
    }
    VoiceProfile corrupted;
    std::string load_err;
    REQUIRE(!voice_profile_load(path, corrupted, load_err));
    REQUIRE(!load_err.empty());
    printf("  PASS (rejected: %s)\n\n", load_err.c_str());

    // Test 4: missing file surfaces a clear error, not a crash.
    printf("Test 4: missing file is rejected\n");
    std::string missing_err;
    VoiceProfile missing;
    REQUIRE(!voice_profile_load(temp_path("qwen3tts_test_profile_missing.q3sp"), missing, missing_err));
    printf("  PASS\n\n");

    std::remove(path.c_str());

    printf("=== All voice profile tests passed! ===\n");
    return 0;
}
