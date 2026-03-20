#include "resonance-logs-cn/src/module_optimizer/bridge.rs.h"
#include "module_optimizer.h"
#include <mutex>
#include <unordered_set>
#include <unordered_map>

#ifdef USE_CUDA
extern "C" int TestCuda();
extern "C" void ResetCudaDevice();
#endif

#ifdef USE_OPENCL
extern "C" int TestOpenCL();
#endif

namespace module_optimizer_ffi {

namespace {

std::mutex g_progress_contexts_mutex;
std::unordered_map<std::uint64_t, std::shared_ptr<ProgressContext>> g_progress_contexts;
std::atomic<std::uint64_t> g_next_progress_handle{1};

std::shared_ptr<ProgressContext> get_progress_context(::std::uint64_t handle) {
    if (handle == 0) {
        return nullptr;
    }

    std::lock_guard<std::mutex> lock(g_progress_contexts_mutex);
    const auto it = g_progress_contexts.find(handle);
    if (it == g_progress_contexts.end()) {
        return nullptr;
    }
    return it->second;
}

} // namespace

static std::vector<ModuleInfo> convert_modules(::rust::Vec<ModuleInfoFfi> const& ffi_modules) {
    std::vector<ModuleInfo> modules;
    modules.reserve(ffi_modules.size());
    
    for (const auto& ffi_mod : ffi_modules) {
        std::vector<ModulePart> parts;
        parts.reserve(ffi_mod.parts.size());
        
        for (const auto& ffi_part : ffi_mod.parts) {
            parts.emplace_back(ffi_part.id, std::string(ffi_part.name), ffi_part.value);
        }
        
        modules.emplace_back(
            std::string(ffi_mod.name),
            ffi_mod.config_id,
            ffi_mod.uuid,
            ffi_mod.quality,
            parts
        );
    }
    
    return modules;
}

static ::rust::Vec<ModuleSolutionFfi> convert_solutions(const std::vector<ModuleSolution>& solutions) {
    ::rust::Vec<ModuleSolutionFfi> result;
    
    for (const auto& sol : solutions) {
        ModuleSolutionFfi ffi_sol;
        ffi_sol.score = sol.score;
        
        for (const auto& mod : sol.modules) {
            ModuleInfoFfi ffi_mod;
            ffi_mod.name = ::rust::String(mod.name);
            ffi_mod.config_id = mod.config_id;
            ffi_mod.uuid = mod.uuid;
            ffi_mod.quality = mod.quality;
            
            for (const auto& part : mod.parts) {
                ModulePartFfi ffi_part;
                ffi_part.id = part.id;
                ffi_part.name = ::rust::String(part.name);
                ffi_part.value = part.value;
                ffi_mod.parts.push_back(ffi_part);
            }
            
            ffi_sol.modules.push_back(ffi_mod);
        }
        
        for (const auto& [name, value] : sol.attr_breakdown) {
            AttrBreakdownEntry entry;
            entry.name = ::rust::String(name);
            entry.value = value;
            ffi_sol.attr_breakdown.push_back(entry);
        }
        
        result.push_back(ffi_sol);
    }
    
    return result;
}

static std::unordered_set<int> to_set(::rust::Vec<::std::int32_t> const& vec) {
    std::unordered_set<int> result;
    for (const auto& v : vec) {
        result.insert(v);
    }
    return result;
}

static std::unordered_map<int, int> to_map(
    ::rust::Vec<::std::int32_t> const& ids, 
    ::rust::Vec<::std::int32_t> const& values) {
    std::unordered_map<int, int> result;
    for (size_t i = 0; i < ids.size() && i < values.size(); ++i) {
        result[ids[i]] = values[i];
    }
    return result;
}

::std::int32_t test_cuda_ffi() {
#ifdef USE_CUDA
    return ::TestCuda();
#else
    return 0;
#endif
}

::std::int32_t test_opencl_ffi() {
#ifdef USE_OPENCL
    return ::TestOpenCL();
#else
    return 0;
#endif
}

GpuSupportInfo check_gpu_support_ffi() {
    static GpuSupportInfo cached_info{};
    static std::once_flag flag;

    std::call_once(flag, [] {
        cached_info.cuda_available = test_cuda_ffi() == 1;
#ifdef USE_CUDA
        ResetCudaDevice();
#endif
        cached_info.opencl_available = test_opencl_ffi() == 1;
    });

    return cached_info;
}

::std::uint64_t create_progress_context_ffi() {
    const auto handle = g_next_progress_handle.fetch_add(1, std::memory_order_relaxed);
    auto progress = std::make_shared<ProgressContext>();
    progress->reset();

    std::lock_guard<std::mutex> lock(g_progress_contexts_mutex);
    g_progress_contexts.emplace(handle, std::move(progress));
    return handle;
}

void destroy_progress_context_ffi(::std::uint64_t handle) {
    if (handle == 0) {
        return;
    }

    std::lock_guard<std::mutex> lock(g_progress_contexts_mutex);
    g_progress_contexts.erase(handle);
}

ProgressInfoFfi get_progress_context_ffi(::std::uint64_t handle) {
    ProgressInfoFfi info;
    const auto progress = get_progress_context(handle);
    if (progress != nullptr) {
        const auto snapshot = progress->snapshot();
        info.processed = snapshot.first;
        info.total = snapshot.second;
    } else {
        info.processed = 0;
        info.total = 0;
    }
    return info;
}

::rust::Vec<ModuleSolutionFfi> strategy_enumeration_cpu_ffi(
    ::rust::Vec<ModuleInfoFfi> const& modules,
    ::rust::Vec<::std::int32_t> const& target_attributes,
    ::rust::Vec<::std::int32_t> const& exclude_attributes,
    ::rust::Vec<::std::int32_t> const& min_attr_ids,
    ::rust::Vec<::std::int32_t> const& min_attr_values,
    ::std::int32_t max_solutions,
    ::std::int32_t max_workers,
    ::std::int32_t combination_size,
    ::std::uint64_t progress_handle) {
    
    auto cpp_modules = convert_modules(modules);
    auto progress = get_progress_context(progress_handle);
    auto result = ModuleOptimizerCpp::StrategyEnumeration(
        cpp_modules,
        to_set(target_attributes),
        to_set(exclude_attributes),
        to_map(min_attr_ids, min_attr_values),
        max_solutions,
        max_workers,
        combination_size,
        progress
    );
    
    return convert_solutions(result);
}

::rust::Vec<ModuleSolutionFfi> strategy_enumeration_gpu_ffi(
    ::rust::Vec<ModuleInfoFfi> const& modules,
    ::rust::Vec<::std::int32_t> const& target_attributes,
    ::rust::Vec<::std::int32_t> const& exclude_attributes,
    ::rust::Vec<::std::int32_t> const& min_attr_ids,
    ::rust::Vec<::std::int32_t> const& min_attr_values,
    ::std::int32_t max_solutions,
    ::std::int32_t max_workers,
    ::std::int32_t combination_size,
    ::std::uint64_t progress_handle) {
    
    auto cpp_modules = convert_modules(modules);
    auto progress = get_progress_context(progress_handle);
    auto result = ModuleOptimizerCpp::StrategyEnumerationGPU(
        cpp_modules,
        to_set(target_attributes),
        to_set(exclude_attributes),
        to_map(min_attr_ids, min_attr_values),
        max_solutions,
        max_workers,
        combination_size,
        progress
    );
    
    return convert_solutions(result);
}

::rust::Vec<ModuleSolutionFfi> strategy_beam_search_ffi(
    ::rust::Vec<ModuleInfoFfi> const& modules,
    ::rust::Vec<::std::int32_t> const& target_attributes,
    ::rust::Vec<::std::int32_t> const& exclude_attributes,
    ::rust::Vec<::std::int32_t> const& min_attr_ids,
    ::rust::Vec<::std::int32_t> const& min_attr_values,
    ::std::int32_t max_solutions,
    ::std::int32_t beam_width,
    ::std::int32_t expand_per_state,
    ::std::int32_t combination_size,
    ::std::int32_t max_workers,
    ::std::uint64_t progress_handle) {
    
    auto cpp_modules = convert_modules(modules);
    auto progress = get_progress_context(progress_handle);
    auto result = ModuleOptimizerCpp::StrategyBeamSearch(
        cpp_modules,
        to_set(target_attributes),
        to_set(exclude_attributes),
        to_map(min_attr_ids, min_attr_values),
        max_solutions,
        beam_width,
        expand_per_state,
        combination_size,
        max_workers,
        progress
    );
    
    return convert_solutions(result);
}

ProgressInfoFfi get_progress_ffi() {
    auto p = ModuleOptimizerCpp::GetProgress();
    ProgressInfoFfi info;
    info.processed = p.first;
    info.total = p.second;
    return info;
}

void reset_progress_ffi() {
    ModuleOptimizerCpp::ResetProgress();
}

}
