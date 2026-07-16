#pragma once

#include "ggml.h"
#include "ggml-backend.h"
#include "gguf.h"

#include <string>
#include <map>
#include <vector>
#include <memory>

namespace qwen3_tts {

enum class BackendKind {
    Cpu,
    Vulkan,
};

struct BackendDeviceInfo {
    std::string backend;
    std::string name;
    enum ggml_backend_dev_type type;
};

// Selects the exact backend used by all subsequently-created model components.
// This must be called before loading a model.
bool configure_backend(BackendKind kind, std::string & device_name, std::string & error_msg);
std::vector<BackendDeviceInfo> enumerate_backend_devices();
const char * backend_kind_name(BackendKind kind);

// Generic GGUF model loader class
// This is a simplified loader that can be extended for specific model types
class GGUFLoader {
public:
    GGUFLoader();
    ~GGUFLoader();
    
    // Open GGUF file and parse metadata
    bool open(const std::string & path);
    
    // Close file and free resources
    void close();
    
    // Get error message if operation failed
    const std::string & get_error() const { return error_msg_; }
    
    // Get number of tensors in file
    int64_t get_n_tensors() const;
    
    // Get tensor name by index
    const char * get_tensor_name(int64_t idx) const;
    
    // Get tensor type by index
    enum ggml_type get_tensor_type(int64_t idx) const;
    
    // Get tensor offset by index
    size_t get_tensor_offset(int64_t idx) const;
    
    // Get tensor size by index
    size_t get_tensor_size(int64_t idx) const;
    
    // Get metadata value (returns -1 if not found)
    int32_t get_u32(const char * key, int32_t default_val = 0) const;
    float get_f32(const char * key, float default_val = 0.0f) const;
    std::string get_string(const char * key, const char * default_val = "") const;
    
    // Get data offset (start of tensor data in file)
    size_t get_data_offset() const;
    
    // Get GGUF context (for advanced usage)
    struct gguf_context * get_ctx() const { return ctx_; }
    
    // Get metadata context
    struct ggml_context * get_meta_ctx() const { return meta_ctx_; }
    
protected:
    struct gguf_context * ctx_ = nullptr;
    struct ggml_context * meta_ctx_ = nullptr;
    std::string error_msg_;
    std::string file_path_;
};

// Helper function to allocate and load tensor data from GGUF file
bool load_tensor_data_from_file(
    const std::string & path,
    struct gguf_context * ctx,
    struct ggml_context * model_ctx,
    const std::map<std::string, struct ggml_tensor *> & tensors,
    ggml_backend_buffer_t & buffer,
    std::string & error_msg,
    enum ggml_backend_dev_type preferred_backend_type = GGML_BACKEND_DEVICE_TYPE_CPU
);

// Helper to initialize the backend selected by configure_backend().
ggml_backend_t init_preferred_backend(const char * component_name, std::string * error_msg);
void release_preferred_backend(ggml_backend_t backend);

// Applies a sensible CPU thread count to a CPU-type ggml_backend_t. Every
// component that creates its own CPU backend directly (instead of going
// through init_preferred_backend) should call this right after creation;
// otherwise ggml defaults to GGML_DEFAULT_N_THREADS (4), which badly
// under-uses machines with more cores. A no-op for non-CPU backends.
void apply_default_cpu_threads(ggml_backend_t backend);

// Helper function to free model resources
void free_ggml_resources(struct ggml_context * ctx, ggml_backend_buffer_t buffer);

} // namespace qwen3_tts
