#include "voice_profile.h"
#include "fs_util.h"

#include <cstdio>
#include <cstring>

namespace qwen3_tts {

namespace {

constexpr size_t HEADER_SIZE = 4 + 4 + 4 + 32 + 32 + 4; // magic..flags
constexpr size_t CRC_SIZE = 4;
constexpr uint32_t MAX_EMBEDDING_DIM = 1 << 16; // sanity bound, real models use ~1024

uint32_t crc32_ieee(const uint8_t * data, size_t len) {
    static uint32_t table[256];
    static bool table_ready = false;
    if (!table_ready) {
        for (uint32_t i = 0; i < 256; ++i) {
            uint32_t c = i;
            for (int k = 0; k < 8; ++k) {
                c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
            }
            table[i] = c;
        }
        table_ready = true;
    }

    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; ++i) {
        crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
    }
    return crc ^ 0xFFFFFFFFu;
}

void append_u32(std::vector<uint8_t> & buf, uint32_t v) {
    buf.push_back(uint8_t(v));
    buf.push_back(uint8_t(v >> 8));
    buf.push_back(uint8_t(v >> 16));
    buf.push_back(uint8_t(v >> 24));
}

uint32_t read_u32(const uint8_t * p) {
    return uint32_t(p[0]) | (uint32_t(p[1]) << 8) | (uint32_t(p[2]) << 16) | (uint32_t(p[3]) << 24);
}

} // namespace

bool voice_profile_save(const std::string & path, const VoiceProfile & profile, std::string & error_out) {
    if (profile.embedding.empty() || profile.embedding.size() > MAX_EMBEDDING_DIM) {
        error_out = "Invalid embedding size for Q3SP profile";
        return false;
    }
    if (profile.version != Q3SP_VERSION ||
        profile.engine_compat_version != Q3SP_ENGINE_COMPAT_VERSION) {
        error_out = "Unsupported Q3SP profile or engine compatibility version";
        return false;
    }

    std::vector<uint8_t> buf;
    buf.reserve(HEADER_SIZE + profile.embedding.size() * 4 + CRC_SIZE);

    buf.insert(buf.end(), Q3SP_MAGIC, Q3SP_MAGIC + 4);
    append_u32(buf, profile.version);
    append_u32(buf, uint32_t(profile.embedding.size()));
    buf.insert(buf.end(), profile.model_sha256.begin(), profile.model_sha256.end());
    buf.insert(buf.end(), profile.ref_audio_sha256.begin(), profile.ref_audio_sha256.end());
    append_u32(buf, profile.engine_compat_version);

    const uint8_t * embd_bytes = reinterpret_cast<const uint8_t *>(profile.embedding.data());
    buf.insert(buf.end(), embd_bytes, embd_bytes + profile.embedding.size() * sizeof(float));

    uint32_t crc = crc32_ieee(buf.data(), buf.size());
    append_u32(buf, crc);

    std::string tmp_path = path + ".tmp";
    FILE * f = fopen(tmp_path.c_str(), "wb");
    if (!f) {
        error_out = "Failed to create staging file: " + tmp_path;
        return false;
    }
    size_t written = fwrite(buf.data(), 1, buf.size(), f);
    bool flush_ok = fflush(f) == 0;
    fclose(f);

    if (written != buf.size() || !flush_ok) {
        std::remove(tmp_path.c_str());
        error_out = "Failed to write Q3SP payload";
        return false;
    }

    if (!atomic_replace_file(tmp_path, path, error_out)) {
        std::remove(tmp_path.c_str());
        return false;
    }

    return true;
}

bool voice_profile_load(const std::string & path, VoiceProfile & profile, std::string & error_out) {
    FILE * f = fopen(path.c_str(), "rb");
    if (!f) {
        error_out = "Cannot open Q3SP profile: " + path;
        return false;
    }

    std::vector<uint8_t> buf;
    {
        uint8_t chunk[1 << 16];
        size_t n;
        while ((n = fread(chunk, 1, sizeof(chunk), f)) > 0) {
            buf.insert(buf.end(), chunk, chunk + n);
        }
    }
    bool read_ok = !ferror(f);
    fclose(f);

    if (!read_ok) {
        error_out = "I/O error reading Q3SP profile: " + path;
        return false;
    }

    if (buf.size() < HEADER_SIZE + CRC_SIZE) {
        error_out = "Q3SP profile too small/truncated: " + path;
        return false;
    }

    if (memcmp(buf.data(), Q3SP_MAGIC, 4) != 0) {
        error_out = "Not a Q3SP profile (bad magic): " + path;
        return false;
    }

    uint32_t version = read_u32(buf.data() + 4);
    uint32_t dim = read_u32(buf.data() + 8);

    if (version != Q3SP_VERSION) {
        error_out = "Unsupported Q3SP version " + std::to_string(version) + " in: " + path;
        return false;
    }
    if (dim == 0 || dim > MAX_EMBEDDING_DIM) {
        error_out = "Q3SP profile has invalid embedding_dim=" + std::to_string(dim);
        return false;
    }

    size_t expected_size = HEADER_SIZE + size_t(dim) * 4 + CRC_SIZE;
    if (buf.size() != expected_size) {
        error_out = "Q3SP profile size mismatch (expected " + std::to_string(expected_size) +
                    " bytes, found " + std::to_string(buf.size()) + "): " + path;
        return false;
    }

    uint32_t stored_crc = read_u32(buf.data() + buf.size() - 4);
    uint32_t actual_crc = crc32_ieee(buf.data(), buf.size() - 4);
    if (stored_crc != actual_crc) {
        error_out = "Q3SP profile failed checksum validation (corrupted?): " + path;
        return false;
    }

    profile.version = version;
    profile.embedding_dim = dim;
    memcpy(profile.model_sha256.data(), buf.data() + 12, 32);
    memcpy(profile.ref_audio_sha256.data(), buf.data() + 44, 32);
    profile.engine_compat_version = read_u32(buf.data() + 76);
    if (profile.engine_compat_version != Q3SP_ENGINE_COMPAT_VERSION) {
        error_out = "Q3SP engine compatibility version " +
                    std::to_string(profile.engine_compat_version) + " is unsupported";
        return false;
    }

    profile.embedding.resize(dim);
    memcpy(profile.embedding.data(), buf.data() + HEADER_SIZE, size_t(dim) * 4);

    return true;
}

bool voice_profile_matches_hidden_size(const VoiceProfile & profile, int32_t hidden_size) {
    return hidden_size > 0 &&
           profile.engine_compat_version == Q3SP_ENGINE_COMPAT_VERSION &&
           profile.embedding_dim == uint32_t(hidden_size);
}

bool voice_profile_matches_model(const VoiceProfile & profile, int32_t hidden_size,
                                 const sha256_digest & model_sha256) {
    return voice_profile_matches_hidden_size(profile, hidden_size) &&
           profile.model_sha256 == model_sha256;
}

} // namespace qwen3_tts
