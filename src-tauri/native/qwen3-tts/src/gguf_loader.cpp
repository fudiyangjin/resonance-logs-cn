#include "gguf_loader.h"
#include "ggml-cpu.h"

#include <cstdio>
#include <cstring>
#include <fstream>
#include <algorithm>
#include <cctype>
#include <thread>

namespace qwen3_tts {

namespace {
struct shared_backend_state {
    ggml_backend_t backend = nullptr;
    int32_t ref_count = 0;
    ggml_backend_dev_t selected_device = nullptr;
    BackendKind selected_kind = BackendKind::Cpu;
};

shared_backend_state & get_shared_backend_state() {
    static shared_backend_state state;
    return state;
}

std::string lowercase(const char * value) {
    std::string result = value ? value : "";
    std::transform(result.begin(), result.end(), result.begin(),
                   [](unsigned char ch) { return char(std::tolower(ch)); });
    return result;
}

bool backend_matches(ggml_backend_dev_t device, BackendKind kind) {
    if (!device) return false;
    const auto type = ggml_backend_dev_type(device);
    const auto backend = lowercase(ggml_backend_reg_name(ggml_backend_dev_backend_reg(device)));
    switch (kind) {
        case BackendKind::Cpu:
            return type == GGML_BACKEND_DEVICE_TYPE_CPU && backend == "cpu";
        case BackendKind::Vulkan:
            return backend == "vulkan";
    }
    return false;
}

int device_priority(ggml_backend_dev_t device) {
    switch (ggml_backend_dev_type(device)) {
        case GGML_BACKEND_DEVICE_TYPE_GPU: return 0;
        case GGML_BACKEND_DEVICE_TYPE_IGPU: return 1;
        case GGML_BACKEND_DEVICE_TYPE_ACCEL: return 2;
        case GGML_BACKEND_DEVICE_TYPE_CPU: return 3;
    }
    return 4;
}

// Single-batch autoregressive TTS generation has limited parallelism per
// matmul (small n_tokens most of the time), so threads beyond a modest cap
// mostly add scheduling/wake-up overhead rather than throughput. Cap well
// below "use every core" on many-core machines; still a large improvement
// over the hardcoded GGML_DEFAULT_N_THREADS (4).
constexpr unsigned int MAX_CPU_THREADS = 16;

int default_cpu_thread_count() {
    unsigned int detected = std::thread::hardware_concurrency();
    if (detected == 0) {
        return GGML_DEFAULT_N_THREADS;
    }
    return int(std::min(detected, MAX_CPU_THREADS));
}
}

const char * backend_kind_name(BackendKind kind) {
    switch (kind) {
        case BackendKind::Cpu: return "cpu";
        case BackendKind::Vulkan: return "vulkan";
    }
    return "unknown";
}

std::vector<BackendDeviceInfo> enumerate_backend_devices() {
    std::vector<BackendDeviceInfo> devices;
    devices.reserve(ggml_backend_dev_count());
    for (size_t i = 0; i < ggml_backend_dev_count(); ++i) {
        ggml_backend_dev_t device = ggml_backend_dev_get(i);
        ggml_backend_t probe = ggml_backend_dev_init(device, nullptr);
        if (!probe) continue;
        ggml_backend_free(probe);
        ggml_backend_reg_t reg = ggml_backend_dev_backend_reg(device);
        devices.push_back({
            lowercase(ggml_backend_reg_name(reg)),
            ggml_backend_dev_name(device) ? ggml_backend_dev_name(device) : "Unknown",
            ggml_backend_dev_type(device),
        });
    }
    return devices;
}

bool configure_backend(BackendKind kind, std::string & device_name, std::string & error_msg) {
    error_msg.clear();
    device_name.clear();
    auto & shared = get_shared_backend_state();
    if (shared.backend || shared.ref_count != 0) {
        error_msg = "Cannot change backend while model components are active";
        return false;
    }

    ggml_backend_dev_t selected = nullptr;
    int selected_priority = 100;
    for (size_t i = 0; i < ggml_backend_dev_count(); ++i) {
        ggml_backend_dev_t candidate = ggml_backend_dev_get(i);
        if (!backend_matches(candidate, kind)) continue;
        const int priority = device_priority(candidate);
        if (!selected || priority < selected_priority) {
            selected = candidate;
            selected_priority = priority;
        }
    }
    if (!selected) {
        error_msg = std::string("Requested backend is not available: ") + backend_kind_name(kind);
        return false;
    }

    ggml_backend_t test = ggml_backend_dev_init(selected, nullptr);
    if (!test) {
        error_msg = std::string("Failed to initialize backend: ") + backend_kind_name(kind);
        return false;
    }
    ggml_backend_free(test);
    shared.selected_device = selected;
    shared.selected_kind = kind;
    device_name = ggml_backend_dev_name(selected) ? ggml_backend_dev_name(selected) : "Unknown";
    return true;
}

void apply_default_cpu_threads(ggml_backend_t backend) {
    if (!backend) {
        return;
    }
    ggml_backend_dev_t device = ggml_backend_get_device(backend);
    if (device && ggml_backend_dev_type(device) != GGML_BACKEND_DEVICE_TYPE_CPU) {
        return;
    }
    ggml_backend_cpu_set_n_threads(backend, default_cpu_thread_count());
}

GGUFLoader::GGUFLoader() = default;

GGUFLoader::~GGUFLoader() {
    close();
}

ggml_backend_t init_preferred_backend(const char * component_name, std::string * error_msg) {
    if (error_msg) error_msg->clear();

    auto & shared = get_shared_backend_state();
    if (shared.backend) {
        shared.ref_count++;
        apply_default_cpu_threads(shared.backend);
        return shared.backend;
    }

    if (!shared.selected_device) {
        std::string ignored_device;
        std::string selection_error;
        if (!configure_backend(BackendKind::Cpu, ignored_device, selection_error)) {
            if (error_msg) *error_msg = selection_error;
            return nullptr;
        }
    }

    ggml_backend_t backend = ggml_backend_dev_init(shared.selected_device, nullptr);

    if (!backend && error_msg) {
        const char * name = component_name ? component_name : "component";
        *error_msg = "Failed to initialize selected backend for " + std::string(name);
    }

    if (backend) {
        shared.backend = backend;
        shared.ref_count = 1;
        apply_default_cpu_threads(backend);
    }

    return backend;
}

void release_preferred_backend(ggml_backend_t backend) {
    if (!backend) {
        return;
    }

    auto & shared = get_shared_backend_state();
    if (shared.backend == backend) {
        shared.ref_count--;
        if (shared.ref_count <= 0) {
            ggml_backend_free(shared.backend);
            shared.backend = nullptr;
            shared.ref_count = 0;
        }
        return;
    }

    ggml_backend_free(backend);
}

bool GGUFLoader::open(const std::string & path) {
    close();  // Close any previously opened file
    
    file_path_ = path;
    
    struct gguf_init_params params = {
        /*.no_alloc =*/ true,
        /*.ctx      =*/ &meta_ctx_,
    };
    
    ctx_ = gguf_init_from_file(path.c_str(), params);
    if (!ctx_) {
        error_msg_ = "Failed to open GGUF file: " + path;
        return false;
    }
    
    return true;
}

void GGUFLoader::close() {
    if (ctx_) {
        gguf_free(ctx_);
        ctx_ = nullptr;
    }
    if (meta_ctx_) {
        ggml_free(meta_ctx_);
        meta_ctx_ = nullptr;
    }
    file_path_.clear();
}

int64_t GGUFLoader::get_n_tensors() const {
    if (!ctx_) return 0;
    return gguf_get_n_tensors(ctx_);
}

const char * GGUFLoader::get_tensor_name(int64_t idx) const {
    if (!ctx_) return nullptr;
    return gguf_get_tensor_name(ctx_, idx);
}

enum ggml_type GGUFLoader::get_tensor_type(int64_t idx) const {
    if (!ctx_) return GGML_TYPE_F32;
    return gguf_get_tensor_type(ctx_, idx);
}

size_t GGUFLoader::get_tensor_offset(int64_t idx) const {
    if (!ctx_) return 0;
    return gguf_get_tensor_offset(ctx_, idx);
}

size_t GGUFLoader::get_tensor_size(int64_t idx) const {
    if (!ctx_) return 0;
    return gguf_get_tensor_size(ctx_, idx);
}

int32_t GGUFLoader::get_u32(const char * key, int32_t default_val) const {
    if (!ctx_) return default_val;
    int64_t idx = gguf_find_key(ctx_, key);
    if (idx < 0) return default_val;
    return (int32_t)gguf_get_val_u32(ctx_, idx);
}

float GGUFLoader::get_f32(const char * key, float default_val) const {
    if (!ctx_) return default_val;
    int64_t idx = gguf_find_key(ctx_, key);
    if (idx < 0) return default_val;
    return gguf_get_val_f32(ctx_, idx);
}

std::string GGUFLoader::get_string(const char * key, const char * default_val) const {
    if (!ctx_) return default_val ? default_val : "";
    int64_t idx = gguf_find_key(ctx_, key);
    if (idx < 0 || gguf_get_kv_type(ctx_, idx) != GGUF_TYPE_STRING) {
        return default_val ? default_val : "";
    }
    const char * value = gguf_get_val_str(ctx_, idx);
    return value ? value : "";
}

size_t GGUFLoader::get_data_offset() const {
    if (!ctx_) return 0;
    return gguf_get_data_offset(ctx_);
}

bool load_tensor_data_from_file(
    const std::string & path,
    struct gguf_context * ctx,
    struct ggml_context * model_ctx,
    const std::map<std::string, struct ggml_tensor *> & tensors,
    ggml_backend_buffer_t & buffer,
    std::string & error_msg,
    enum ggml_backend_dev_type /* preferred_backend_type */
) {
    ggml_backend_t backend = init_preferred_backend("GGUF tensor loader", &error_msg);
    if (!backend) {
        return false;
    }
    
    // Allocate buffer for all tensors
    buffer = ggml_backend_alloc_ctx_tensors(model_ctx, backend);
    if (!buffer) {
        error_msg = "Failed to allocate tensor buffer";
        release_preferred_backend(backend);
        return false;
    }
    
    // Open file for reading tensor data
    FILE * f = fopen(path.c_str(), "rb");
    if (!f) {
        error_msg = "Failed to open file for reading: " + path;
        release_preferred_backend(backend);
        return false;
    }
    
    const size_t data_offset = gguf_get_data_offset(ctx);
    const int64_t n_tensors = gguf_get_n_tensors(ctx);
    std::vector<uint8_t> read_buf;
    
    for (int64_t i = 0; i < n_tensors; ++i) {
        const char * name = gguf_get_tensor_name(ctx, i);
        size_t offset = gguf_get_tensor_offset(ctx, i);
        
        auto it = tensors.find(name);
        if (it == tensors.end()) {
            continue;  // Skip tensors not in our map
        }
        
        struct ggml_tensor * tensor = it->second;
        size_t nbytes = ggml_nbytes(tensor);
        
        read_buf.resize(nbytes);
        
        if (fseek(f, data_offset + offset, SEEK_SET) != 0) {
            error_msg = "Failed to seek to tensor data: " + std::string(name);
            fclose(f);
            release_preferred_backend(backend);
            return false;
        }
        
        if (fread(read_buf.data(), 1, nbytes, f) != nbytes) {
            error_msg = "Failed to read tensor data: " + std::string(name);
            fclose(f);
            release_preferred_backend(backend);
            return false;
        }
        
        ggml_backend_tensor_set(tensor, read_buf.data(), 0, nbytes);
    }
    
    fclose(f);
    release_preferred_backend(backend);
    
    return true;
}

void free_ggml_resources(struct ggml_context * ctx, ggml_backend_buffer_t buffer) {
    if (buffer) {
        ggml_backend_buffer_free(buffer);
    }
    if (ctx) {
        ggml_free(ctx);
    }
}

} // namespace qwen3_tts
