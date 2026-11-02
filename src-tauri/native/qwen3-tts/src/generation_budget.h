#pragma once

// Bounds how many codec frames the sidecar lets one item generate.
//
// Short texts ("123", a single character) sometimes never sample the
// end-of-speech token, and the transformer then runs until its frame cap.
// The upstream default cap (4096 frames, about 5.5 minutes of audio) costs
// minutes of generation and a vocoder graph of tens of gigabytes before
// output validation can reject the clip. Sizing the cap from the text makes
// such a run end after a few seconds of audio instead.

#include <cstdint>
#include <string>

namespace qwen3_tts {

// Codec frames per second of audio for the Qwen3-TTS 12Hz speech tokenizer
// (24 kHz output, 1920 samples per frame).
constexpr double kCodecFramesPerSecond = 12.5;

// Letters, digits and ideographs: UTF-8 code points other than ASCII
// whitespace, punctuation and control characters.
size_t count_spoken_units(const std::string & text);

// Frame cap for `text`: 2 s plus 1 s per spoken unit, never above
// `max_duration_sec`. Real speech runs several times faster than one unit
// per second, so a phrase that ends normally always fits.
int32_t audio_token_budget(const std::string & text, double max_duration_sec);

} // namespace qwen3_tts
