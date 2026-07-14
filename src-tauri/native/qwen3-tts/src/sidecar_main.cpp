// qwen3-tts-sidecar: a one-shot batch executable.
//
// Invocation: qwen3-tts-sidecar --job <path-to-job.json>
//
// It loads the TTS models exactly once, resolves a single speaker
// embedding (either extracted fresh from a reference WAV, or loaded from
// an existing Q3SP profile), then synthesizes every item in the job with
// that same embedding, validates each result, writes it to disk, and
// exits. There is no long-lived server mode and no in-process
// cancellation: the caller is expected to terminate the process if it
// needs to abort a batch.
//
// Progress and results are reported as JSON Lines (one JSON object per
// line) on stdout so the host process can parse them incrementally.
// Human-readable diagnostics (including everything qwen3_tts itself
// prints) go to stderr.

#include "qwen3_tts.h"
#include "gguf_loader.h"
#include "voice_profile.h"
#include "audio_validate.h"
#include "json_lite.h"
#include "sha256.h"
#include "fs_util.h"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <chrono>
#include <algorithm>
#include <string>
#include <vector>

#ifndef QWEN3_TTS_SOURCE_COMMIT
#define QWEN3_TTS_SOURCE_COMMIT "unknown"
#endif

#ifndef QWEN3_TTS_BUILD_TYPE
#define QWEN3_TTS_BUILD_TYPE "unknown"
#endif

#ifndef QWEN3_TTS_VARIANT
#define QWEN3_TTS_VARIANT "cpu"
#endif

using namespace qwen3_tts;

namespace {

constexpr int32_t SIDECAR_PROTOCOL_VERSION = 3;

const char * device_type_name(enum ggml_backend_dev_type type) {
    switch (type) {
        case GGML_BACKEND_DEVICE_TYPE_CPU: return "cpu";
        case GGML_BACKEND_DEVICE_TYPE_GPU: return "discreteGpu";
        case GGML_BACKEND_DEVICE_TYPE_IGPU: return "integratedGpu";
        case GGML_BACKEND_DEVICE_TYPE_ACCEL: return "accelerator";
    }
    return "unknown";
}

bool parse_backend(const std::string & value, BackendKind & result) {
    if (value == "cpu") result = BackendKind::Cpu;
    else if (value == "vulkan") result = BackendKind::Vulkan;
    else return false;
    return true;
}

int64_t now_ms() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
}

void emit_line(const std::string & json_line) {
    fwrite(json_line.data(), 1, json_line.size(), stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

void emit_fatal(const std::string & error) {
    emit_line("{\"type\":\"fatal\",\"error\":\"" + json_lite::escape(error) + "\"}");
}

void emit_probe() {
    const auto devices = enumerate_backend_devices();
    std::string compiled_backends = std::string("[\"cpu\"") +
                                    (std::string(QWEN3_TTS_VARIANT) == "cpu" ? "" :
                                     std::string(",\"") + QWEN3_TTS_VARIANT + "\"") + "]";
    std::string device_json = "[";
    for (const auto & device : devices) {
        if (device_json.size() > 1) device_json += ",";
        device_json += "{\"backend\":\"" + json_lite::escape(device.backend) +
                       "\",\"name\":\"" + json_lite::escape(device.name) +
                       "\",\"type\":\"" + device_type_name(device.type) + "\"}";
    }
    device_json += "]";
    emit_line("{\"engine\":\"qwen3-tts-sidecar\",\"protocolVersion\":" +
              std::to_string(SIDECAR_PROTOCOL_VERSION) +
              ",\"sourceCommit\":\"" QWEN3_TTS_SOURCE_COMMIT
              "\",\"buildType\":\"" QWEN3_TTS_BUILD_TYPE
              "\",\"variant\":\"" QWEN3_TTS_VARIANT
              "\",\"stub\":false,\"compiledBackends\":" + compiled_backends +
              ",\"devices\":" + device_json +
              ",\"supportedLanguages\":[\"zhCn\",\"enUs\",\"jaJp\"]}");
}

bool inspect_custom_voice_model(const std::string & path, std::string & result, std::string & error) {
    GGUFLoader loader;
    if (!loader.open(path)) {
        error = loader.get_error();
        return false;
    }

    const std::string architecture = loader.get_string("general.architecture");
    const std::string model_type = loader.get_string("qwen3-tts.model_type");
    const std::string tokenizer_abi = loader.get_string("qwen3-tts.tokenizer_abi");
    const std::string speaker_name = loader.get_string("qwen3-tts.speaker.name");
    const int32_t speaker_token_id = loader.get_u32("qwen3-tts.speaker.token_id", -1);
    const int32_t hidden_size = loader.get_u32("qwen3-tts.embedding_length", -1);
    const int32_t codec_vocab_size = loader.get_u32("qwen3-tts.vocab_size", -1);

    if (architecture != "qwen3-tts" || model_type != "custom_voice") {
        error = "GGUF is not a Qwen3-TTS CustomVoice model";
        return false;
    }
    if (tokenizer_abi.empty() || speaker_name.empty() || speaker_token_id < 0) {
        error = "GGUF is missing CustomVoice deployment metadata";
        return false;
    }
    if (hidden_size <= 0 || codec_vocab_size <= 0 || speaker_token_id >= codec_vocab_size) {
        error = "GGUF has invalid embedding or speaker-token dimensions";
        return false;
    }
    if (loader.get_n_tensors() != 402) {
        error = "CustomVoice GGUF must contain exactly 402 transformer tensors";
        return false;
    }

    struct ggml_context * meta = loader.get_meta_ctx();
    struct ggml_tensor * codec = meta ? ggml_get_tensor(meta, "talker.codec_embd.weight") : nullptr;
    struct ggml_tensor * text = meta ? ggml_get_tensor(meta, "talker.text_embd.weight") : nullptr;
    struct ggml_tensor * head = meta ? ggml_get_tensor(meta, "talker.codec_head.weight") : nullptr;
    struct ggml_tensor * norm = meta ? ggml_get_tensor(meta, "talker.output_norm.weight") : nullptr;
    if (!codec || ggml_n_dims(codec) != 2 || codec->ne[0] != hidden_size || codec->ne[1] != codec_vocab_size ||
        !text || ggml_n_dims(text) != 2 || !head || ggml_n_dims(head) != 2 ||
        head->ne[0] != hidden_size || head->ne[1] != codec_vocab_size ||
        !norm || ggml_n_dims(norm) != 1 || norm->ne[0] != hidden_size) {
        error = "CustomVoice GGUF is missing required tensors or has incompatible tensor shapes";
        return false;
    }
    for (int64_t i = 0; i < loader.get_n_tensors(); ++i) {
        const char * name = loader.get_tensor_name(i);
        if (name && strncmp(name, "spk_enc.", 8) == 0) {
            error = "CustomVoice GGUF must not contain a Base speaker encoder";
            return false;
        }
    }

    result = "{\"architecture\":\"" + json_lite::escape(architecture) +
             "\",\"model_type\":\"" + json_lite::escape(model_type) +
             "\",\"speaker_name\":\"" + json_lite::escape(speaker_name) +
             "\",\"speaker_token_id\":" + std::to_string(speaker_token_id) +
             ",\"tokenizer_abi\":\"" + json_lite::escape(tokenizer_abi) +
             "\",\"tensor_count\":" + std::to_string(loader.get_n_tensors()) + "}";
    return true;
}

void emit_hello(const std::string & backend, const std::string & device) {
    emit_line(
        "{\"type\":\"hello\",\"protocol_version\":" +
        std::to_string(SIDECAR_PROTOCOL_VERSION) +
        ",\"engine\":\"qwen3-tts-sidecar\",\"source_commit\":\""
        QWEN3_TTS_SOURCE_COMMIT "\",\"backend\":\"" + json_lite::escape(backend) +
        "\",\"device\":\"" + json_lite::escape(device) + "\"}");
}

void emit_stage(const std::string & stage, const std::string & status, const std::string & extra_json_fields = "") {
    std::string line = "{\"type\":\"stage\",\"stage\":\"" + json_lite::escape(stage) +
                        "\",\"status\":\"" + json_lite::escape(status) + "\"";
    if (!extra_json_fields.empty()) {
        line += "," + extra_json_fields;
    }
    line += "}";
    emit_line(line);
}

void emit_item_ok(const std::string & id, const std::string & output_path,
                   double duration_sec, int32_t sample_rate, int64_t elapsed_ms) {
    char buf[64];
    snprintf(buf, sizeof(buf), "%.3f", duration_sec);
    emit_line("{\"type\":\"item\",\"id\":\"" + json_lite::escape(id) +
              "\",\"status\":\"ok\",\"output_path\":\"" + json_lite::escape(output_path) +
              "\",\"duration_sec\":" + buf +
              ",\"sample_rate\":" + std::to_string(sample_rate) +
              ",\"elapsed_ms\":" + std::to_string(elapsed_ms) + "}");
}

void emit_item_error(const std::string & id, const std::string & error) {
    emit_line("{\"type\":\"item\",\"id\":\"" + json_lite::escape(id) +
              "\",\"status\":\"error\",\"error\":\"" + json_lite::escape(error) + "\"}");
}

void emit_batch_done(int completed, int failed) {
    emit_line("{\"type\":\"batch\",\"status\":\"" + std::string(failed == 0 ? "ok" : "partial") +
              "\",\"completed\":" + std::to_string(completed) +
              ",\"failed\":" + std::to_string(failed) + "}");
}

struct SynthItem {
    std::string id;
    std::string text;
    std::string output_path;
    int32_t language_id = 2050;
    qwen3_tts::tts_params params;
    double min_duration_sec = 0.15;
    double max_duration_sec = 30.0;
};

enum class SourceMode {
    ProfileNew,
    ProfileExisting,
    SpeakerToken,
};

struct SourceSpec {
    SourceMode mode = SourceMode::ProfileExisting;
    std::string existing_q3sp_path;
    std::string reference_wav_path;
    std::string save_q3sp_path;
    int32_t speaker_token_id = -1;
};

struct BatchJob {
    int32_t protocol_version = 0;
    std::string transformer_path;
    std::string tokenizer_path;
    SourceSpec source;
    std::vector<SynthItem> items;
};

bool parse_job(const json_lite::Value & root, BatchJob & job, std::string & error_out) {
    job.protocol_version = int32_t(root.get_number("protocol_version", 0));
    if (job.protocol_version != SIDECAR_PROTOCOL_VERSION) {
        error_out = "job.protocol_version=" + std::to_string(job.protocol_version) +
                    " is incompatible with sidecar protocol " +
                    std::to_string(SIDECAR_PROTOCOL_VERSION);
        return false;
    }
    job.transformer_path = root.get_string("transformer_path");
    job.tokenizer_path = root.get_string("tokenizer_path");
    if (job.transformer_path.empty() || job.tokenizer_path.empty()) {
        error_out = "job.transformer_path and job.tokenizer_path are required";
        return false;
    }

    const json_lite::Value * source_v = root.find("source");
    if (!source_v || !source_v->is_object()) {
        error_out = "job.source is required";
        return false;
    }
    std::string mode = source_v->get_string("mode");
    if (mode == "profile_new") {
        job.source.mode = SourceMode::ProfileNew;
        job.source.reference_wav_path = source_v->get_string("reference_wav_path");
        job.source.save_q3sp_path = source_v->get_string("save_q3sp_path");
        if (job.source.reference_wav_path.empty() || job.source.save_q3sp_path.empty()) {
            error_out = "source.mode=profile_new requires reference_wav_path and save_q3sp_path";
            return false;
        }
    } else if (mode == "profile_existing") {
        job.source.mode = SourceMode::ProfileExisting;
        job.source.existing_q3sp_path = source_v->get_string("existing_q3sp_path");
        if (job.source.existing_q3sp_path.empty()) {
            error_out = "source.mode=profile_existing requires existing_q3sp_path";
            return false;
        }
    } else if (mode == "speaker_token") {
        job.source.mode = SourceMode::SpeakerToken;
        job.source.speaker_token_id = int32_t(source_v->get_number("speaker_token_id", -1));
        if (job.source.speaker_token_id < 0) {
            error_out = "source.mode=speaker_token requires a non-negative speaker_token_id";
            return false;
        }
    } else {
        error_out = "source.mode must be profile_new, profile_existing, or speaker_token";
        return false;
    }

    const json_lite::Value * items_v = root.find("items");
    if (!items_v || !items_v->is_array() || items_v->as_array().empty()) {
        error_out = "job.items must be a non-empty array";
        return false;
    }

    for (const auto & item_v : items_v->as_array()) {
        if (!item_v.is_object()) {
            error_out = "each item in job.items must be an object";
            return false;
        }
        SynthItem item;
        item.id = item_v.get_string("id");
        item.text = item_v.get_string("text");
        item.output_path = item_v.get_string("output_path");
        if (item.id.empty() || item.text.empty() || item.output_path.empty()) {
            error_out = "item.id, item.text and item.output_path are required";
            return false;
        }
        item.language_id = int32_t(item_v.get_number("language_id", 2050));
        item.params.language_id = item.language_id;
        item.params.temperature = float(item_v.get_number("temperature", item.params.temperature));
        item.params.top_p = float(item_v.get_number("top_p", item.params.top_p));
        item.params.top_k = int32_t(item_v.get_number("top_k", item.params.top_k));
        item.params.repetition_penalty = float(item_v.get_number("repetition_penalty", item.params.repetition_penalty));
        item.params.max_audio_tokens = int32_t(item_v.get_number("max_audio_tokens", item.params.max_audio_tokens));
        item.params.print_progress = false;
        // Stage-level timing (tokenize/encode/generate/decode + RTF) is
        // noisy on stderr and normally off. scripts/bench-voice-sidecar.ps1
        // opts in via this env var to get per-stage numbers without
        // changing the protocol or the default (production) behavior.
        item.params.print_timing = std::getenv("QWEN3_TTS_BENCH_TIMING") != nullptr;
        item.min_duration_sec = item_v.get_number("min_duration_sec", 0.15);
        item.max_duration_sec = item_v.get_number("max_duration_sec", 30.0);

        job.items.push_back(std::move(item));
    }

    return true;
}

void print_usage(const char * program) {
    fprintf(stderr, "Usage: %s --probe | --inspect-model <path-to-gguf> | --job <path-to-job.json> --backend <cpu|vulkan>\n", program);
    fprintf(stderr, "\n");
    fprintf(stderr, "Loads the TTS models once, resolves a single speaker embedding,\n");
    fprintf(stderr, "synthesizes every item in the job with that embedding, and exits.\n");
    fprintf(stderr, "Progress/results are streamed as JSON Lines on stdout.\n");
}

} // namespace

int main(int argc, char ** argv) {
    std::string job_path;
    std::string inspect_model_path;
    std::string backend_name;
    bool probe = false;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--probe") {
            probe = true;
        } else if (arg == "--inspect-model") {
            if (++i >= argc) {
                emit_fatal("missing value for --inspect-model");
                return 1;
            }
            inspect_model_path = argv[i];
        } else if (arg == "--job") {
            if (++i >= argc) {
                emit_fatal("missing value for --job");
                return 1;
            }
            job_path = argv[i];
        } else if (arg == "--backend") {
            if (++i >= argc) {
                emit_fatal("missing value for --backend");
                return 1;
            }
            backend_name = argv[i];
        } else if (arg == "-h" || arg == "--help") {
            print_usage(argv[0]);
            return 0;
        } else {
            emit_fatal("unknown argument: " + arg);
            return 1;
        }
    }

    if (probe) {
        if (!job_path.empty() || !backend_name.empty() || !inspect_model_path.empty()) {
            emit_fatal("--probe cannot be combined with other modes");
            return 1;
        }
        emit_probe();
        return 0;
    }

    if (!inspect_model_path.empty()) {
        if (!job_path.empty() || !backend_name.empty()) {
            emit_fatal("--inspect-model cannot be combined with --job or --backend");
            return 1;
        }
        std::string inspection;
        std::string error;
        if (!inspect_custom_voice_model(inspect_model_path, inspection, error)) {
            emit_fatal(error);
            return 1;
        }
        emit_line(inspection);
        return 0;
    }

    if (job_path.empty()) {
        print_usage(argv[0]);
        emit_fatal("--job <path> is required");
        return 1;
    }
    if (backend_name.empty()) {
        emit_fatal("--backend <cpu|vulkan> is required");
        return 1;
    }
    BackendKind backend_kind;
    if (!parse_backend(backend_name, backend_kind)) {
        emit_fatal("unsupported backend: " + backend_name);
        return 1;
    }
    std::string selected_device;
    std::string backend_error;
    if (!configure_backend(backend_kind, selected_device, backend_error)) {
        emit_fatal(backend_error);
        return 1;
    }

    std::string job_text;
    std::string io_error;
    if (!read_file_to_string(job_path, job_text, io_error)) {
        emit_fatal(io_error);
        return 1;
    }

    BatchJob job;
    try {
        json_lite::Value root = json_lite::parse(job_text);
        std::string parse_error;
        if (!parse_job(root, job, parse_error)) {
            emit_fatal("Invalid job file: " + parse_error);
            return 1;
        }
    } catch (const json_lite::ParseError & e) {
        emit_fatal(std::string("Failed to parse job JSON: ") + e.what());
        return 1;
    }

    emit_hello(backend_name, selected_device);

    emit_stage("load_model", "start");
    int64_t t_load_start = now_ms();

    qwen3_tts::Qwen3TTS tts;
    if (!tts.load_models(job.transformer_path, job.tokenizer_path)) {
        emit_fatal("Failed to load models: " + tts.get_error());
        return 1;
    }
    emit_stage("load_model", "done", "\"elapsed_ms\":" + std::to_string(now_ms() - t_load_start));

    // Resolve model fingerprint once; used both to validate an existing
    // Q3SP profile and to stamp a freshly extracted one.
    sha256_digest model_hash{};
    if (!sha256_file(job.transformer_path, model_hash)) {
        emit_fatal("Cannot fingerprint the loaded transformer GGUF");
        return 1;
    }

    std::vector<float> speaker_embedding;
    int32_t hidden_size = 0;

    const bool uses_speaker_token = job.source.mode == SourceMode::SpeakerToken;
    const bool is_new_profile = job.source.mode == SourceMode::ProfileNew;
    const char * source_mode = uses_speaker_token ? "speaker_token" :
                               (is_new_profile ? "profile_new" : "profile_existing");
    emit_stage("source", "start", std::string("\"mode\":\"") + source_mode + "\"");
    int64_t t_profile_start = now_ms();

    sha256_digest ref_audio_hash{};
    bool have_ref_hash = false;

    if (uses_speaker_token) {
        if (job.source.speaker_token_id >= tts.get_codec_vocab_size()) {
            emit_fatal("Speaker token ID is outside the supported codec vocabulary");
            return 1;
        }
        emit_stage("source", "done",
                   "\"speaker_token_id\":" + std::to_string(job.source.speaker_token_id) +
                   ",\"model_sha256\":\"" + sha256_to_hex(model_hash) + "\"" +
                   ",\"elapsed_ms\":" + std::to_string(now_ms() - t_profile_start));
    } else if (is_new_profile) {
        std::vector<float> ref_samples;
        int ref_sample_rate = 0;
        if (!qwen3_tts::load_audio_file(job.source.reference_wav_path, ref_samples, ref_sample_rate)) {
            emit_fatal("Failed to load reference audio: " + job.source.reference_wav_path);
            return 1;
        }
        if (!sha256_file(job.source.reference_wav_path, ref_audio_hash)) {
            ref_audio_hash.fill(0);
        } else {
            have_ref_hash = true;
        }

        std::vector<float> resampled;
        const float * samples_ptr = ref_samples.data();
        int32_t n_samples = int32_t(ref_samples.size());
        if (ref_sample_rate != 24000 && ref_sample_rate > 0) {
            double ratio = double(ref_sample_rate) / 24000.0;
            int out_len = int(double(ref_samples.size()) / ratio);
            resampled.resize(out_len);
            for (int i = 0; i < out_len; ++i) {
                double src_idx = i * ratio;
                int idx0 = int(src_idx);
                int idx1 = idx0 + 1;
                double frac = src_idx - idx0;
                if (idx1 >= (int)ref_samples.size()) {
                    resampled[i] = ref_samples.back();
                } else {
                    resampled[i] = float((1.0 - frac) * ref_samples[idx0] + frac * ref_samples[idx1]);
                }
            }
            samples_ptr = resampled.data();
            n_samples = int32_t(resampled.size());
        }

        if (!tts.extract_speaker_embedding(samples_ptr, n_samples, speaker_embedding)) {
            emit_fatal("Failed to extract speaker embedding: " + tts.get_error());
            return 1;
        }

        VoiceProfile new_profile;
        new_profile.embedding_dim = uint32_t(speaker_embedding.size());
        new_profile.model_sha256 = model_hash;
        new_profile.ref_audio_sha256 = have_ref_hash ? ref_audio_hash : sha256_digest{};
        new_profile.embedding = speaker_embedding;

        std::string save_error;
        if (!voice_profile_save(job.source.save_q3sp_path, new_profile, save_error)) {
            emit_fatal("Failed to save Q3SP profile: " + save_error);
            return 1;
        }

        hidden_size = int32_t(speaker_embedding.size());
        emit_stage("source", "done",
                   "\"embedding_dim\":" + std::to_string(hidden_size) +
                   ",\"model_sha256\":\"" + sha256_to_hex(model_hash) + "\"" +
                   ",\"ref_audio_sha256\":\"" + (have_ref_hash ? sha256_to_hex(ref_audio_hash) : "") + "\"" +
                   ",\"elapsed_ms\":" + std::to_string(now_ms() - t_profile_start));
    } else {
        VoiceProfile loaded_profile;
        std::string load_error;
        if (!voice_profile_load(job.source.existing_q3sp_path, loaded_profile, load_error)) {
            emit_fatal("Failed to load Q3SP profile: " + load_error);
            return 1;
        }
        if (!voice_profile_matches_model(loaded_profile, tts.get_hidden_size(), model_hash)) {
            emit_fatal("Q3SP profile is incompatible with the loaded model fingerprint or hidden size");
            return 1;
        }
        speaker_embedding = loaded_profile.embedding;
        hidden_size = int32_t(speaker_embedding.size());
        emit_stage("source", "done",
                   "\"embedding_dim\":" + std::to_string(hidden_size) +
                   ",\"elapsed_ms\":" + std::to_string(now_ms() - t_profile_start));
    }

    if (!uses_speaker_token && speaker_embedding.empty()) {
        emit_fatal("Resolved speaker embedding is empty");
        return 1;
    }

    int completed = 0;
    int failed = 0;

    for (const auto & item : job.items) {
        emit_line("{\"type\":\"item\",\"id\":\"" + json_lite::escape(item.id) + "\",\"status\":\"start\"}");
        int64_t t_item_start = now_ms();

        qwen3_tts::tts_result result = uses_speaker_token
            ? tts.synthesize_with_speaker_token(item.text, job.source.speaker_token_id, item.params)
            : tts.synthesize_with_embedding(item.text, speaker_embedding.data(),
                                            int32_t(speaker_embedding.size()), item.params);

        if (!result.success) {
            emit_item_error(item.id, result.error_msg);
            ++failed;
            continue;
        }

        audio_validate_params validate_params;
        validate_params.expected_sample_rate = result.sample_rate;
        validate_params.min_duration_sec = item.min_duration_sec;
        validate_params.max_duration_sec = item.max_duration_sec;
        audio_validate_result validation = validate_synthesized_audio(result.audio, result.sample_rate, validate_params);
        if (!validation.ok) {
            emit_item_error(item.id, "Output validation failed: " + validation.error_msg);
            ++failed;
            continue;
        }

        std::string tmp_path = item.output_path + ".tmp";
        if (!qwen3_tts::save_audio_file(tmp_path, result.audio, result.sample_rate)) {
            emit_item_error(item.id, "Failed to write staging WAV: " + tmp_path);
            ++failed;
            continue;
        }
        std::string replace_error;
        if (!atomic_replace_file(tmp_path, item.output_path, replace_error)) {
            std::remove(tmp_path.c_str());
            emit_item_error(item.id, replace_error);
            ++failed;
            continue;
        }

        emit_item_ok(item.id, item.output_path, validation.duration_sec, result.sample_rate, now_ms() - t_item_start);
        ++completed;
    }

    emit_batch_done(completed, failed);
    return failed == 0 ? 0 : 2;
}
