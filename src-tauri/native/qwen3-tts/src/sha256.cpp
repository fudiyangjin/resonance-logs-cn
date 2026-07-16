#include "sha256.h"

#include <cstdio>
#include <cstring>
#include <vector>

namespace qwen3_tts {

namespace {

struct sha256_ctx {
    uint32_t state[8];
    uint64_t bitlen = 0;
    uint8_t buffer[64];
    size_t buffer_len = 0;
};

constexpr uint32_t K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
};

inline uint32_t rotr(uint32_t x, uint32_t n) {
    return (x >> n) | (x << (32 - n));
}

void sha256_init(sha256_ctx & ctx) {
    ctx.state[0] = 0x6a09e667;
    ctx.state[1] = 0xbb67ae85;
    ctx.state[2] = 0x3c6ef372;
    ctx.state[3] = 0xa54ff53a;
    ctx.state[4] = 0x510e527f;
    ctx.state[5] = 0x9b05688c;
    ctx.state[6] = 0x1f83d9ab;
    ctx.state[7] = 0x5be0cd19;
    ctx.bitlen = 0;
    ctx.buffer_len = 0;
}

void sha256_transform(sha256_ctx & ctx, const uint8_t block[64]) {
    uint32_t w[64];
    for (int i = 0; i < 16; ++i) {
        w[i] = (uint32_t(block[i * 4]) << 24) | (uint32_t(block[i * 4 + 1]) << 16) |
               (uint32_t(block[i * 4 + 2]) << 8) | uint32_t(block[i * 4 + 3]);
    }
    for (int i = 16; i < 64; ++i) {
        uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
        uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }

    uint32_t a = ctx.state[0], b = ctx.state[1], c = ctx.state[2], d = ctx.state[3];
    uint32_t e = ctx.state[4], f = ctx.state[5], g = ctx.state[6], h = ctx.state[7];

    for (int i = 0; i < 64; ++i) {
        uint32_t s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        uint32_t ch = (e & f) ^ (~e & g);
        uint32_t temp1 = h + s1 + ch + K[i] + w[i];
        uint32_t s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
        uint32_t temp2 = s0 + maj;

        h = g;
        g = f;
        f = e;
        e = d + temp1;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2;
    }

    ctx.state[0] += a; ctx.state[1] += b; ctx.state[2] += c; ctx.state[3] += d;
    ctx.state[4] += e; ctx.state[5] += f; ctx.state[6] += g; ctx.state[7] += h;
}

void sha256_update(sha256_ctx & ctx, const uint8_t * data, size_t len) {
    ctx.bitlen += uint64_t(len) * 8;
    size_t offset = 0;
    if (ctx.buffer_len > 0) {
        size_t need = 64 - ctx.buffer_len;
        size_t take = need < len ? need : len;
        memcpy(ctx.buffer + ctx.buffer_len, data, take);
        ctx.buffer_len += take;
        offset += take;
        if (ctx.buffer_len == 64) {
            sha256_transform(ctx, ctx.buffer);
            ctx.buffer_len = 0;
        }
    }
    while (offset + 64 <= len) {
        sha256_transform(ctx, data + offset);
        offset += 64;
    }
    if (offset < len) {
        size_t remain = len - offset;
        memcpy(ctx.buffer, data + offset, remain);
        ctx.buffer_len = remain;
    }
}

sha256_digest sha256_final(sha256_ctx & ctx) {
    // Total message length in bits must be captured before padding is
    // appended (padding bytes are not part of the hashed message length).
    const uint64_t bitlen = ctx.bitlen;

    // Append the mandatory 0x80 terminator bit.
    ctx.buffer[ctx.buffer_len++] = 0x80;
    if (ctx.buffer_len == 64) {
        sha256_transform(ctx, ctx.buffer);
        ctx.buffer_len = 0;
    }

    // Zero-pad until exactly 56 bytes are used, leaving 8 bytes for the
    // 64-bit big-endian length field.
    while (ctx.buffer_len != 56) {
        ctx.buffer[ctx.buffer_len++] = 0x00;
        if (ctx.buffer_len == 64) {
            sha256_transform(ctx, ctx.buffer);
            ctx.buffer_len = 0;
        }
    }

    for (int i = 0; i < 8; ++i) {
        ctx.buffer[56 + i] = uint8_t(bitlen >> (56 - i * 8));
    }
    sha256_transform(ctx, ctx.buffer);
    ctx.buffer_len = 0;

    sha256_digest digest;
    for (int i = 0; i < 8; ++i) {
        digest[i * 4] = uint8_t(ctx.state[i] >> 24);
        digest[i * 4 + 1] = uint8_t(ctx.state[i] >> 16);
        digest[i * 4 + 2] = uint8_t(ctx.state[i] >> 8);
        digest[i * 4 + 3] = uint8_t(ctx.state[i]);
    }
    return digest;
}

} // namespace

sha256_digest sha256_buffer(const void * data, size_t size) {
    sha256_ctx ctx;
    sha256_init(ctx);
    sha256_update(ctx, static_cast<const uint8_t *>(data), size);
    return sha256_final(ctx);
}

bool sha256_file(const std::string & path, sha256_digest & out_digest) {
    FILE * f = fopen(path.c_str(), "rb");
    if (!f) {
        out_digest.fill(0);
        return false;
    }

    sha256_ctx ctx;
    sha256_init(ctx);

    std::vector<uint8_t> buf(1 << 20); // 1 MiB chunks
    size_t n;
    while ((n = fread(buf.data(), 1, buf.size(), f)) > 0) {
        sha256_update(ctx, buf.data(), n);
    }
    bool ok = !ferror(f);
    fclose(f);

    if (!ok) {
        out_digest.fill(0);
        return false;
    }

    out_digest = sha256_final(ctx);
    return true;
}

std::string sha256_to_hex(const sha256_digest & digest) {
    static const char hex_chars[] = "0123456789abcdef";
    std::string out;
    out.resize(64);
    for (size_t i = 0; i < digest.size(); ++i) {
        out[i * 2] = hex_chars[digest[i] >> 4];
        out[i * 2 + 1] = hex_chars[digest[i] & 0x0f];
    }
    return out;
}

} // namespace qwen3_tts
