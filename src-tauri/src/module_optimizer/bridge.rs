#[cxx::bridge(namespace = "module_optimizer_ffi")]
pub mod ffi {
    #[derive(Clone, Debug)]
    pub struct ModulePartFfi {
        pub id: i32,
        pub name: String,
        pub value: i32,
    }

    #[derive(Clone, Debug)]
    pub struct ModuleInfoFfi {
        pub name: String,
        pub config_id: i32,
        pub uuid: i32,
        pub quality: i32,
        pub parts: Vec<ModulePartFfi>,
    }

    #[derive(Clone, Debug)]
    pub struct AttrBreakdownEntry {
        pub name: String,
        pub value: i32,
    }

    #[derive(Clone, Debug)]
    pub struct ModuleSolutionFfi {
        pub modules: Vec<ModuleInfoFfi>,
        pub score: i32,
        pub attr_breakdown: Vec<AttrBreakdownEntry>,
    }

    #[derive(Clone, Debug)]
    pub struct GpuSupportInfo {
        pub cuda_available: bool,
        pub opencl_available: bool,
    }

    #[derive(Clone, Debug)]
    pub struct ProgressInfoFfi {
        pub processed: u64,
        pub total: u64,
    }

    unsafe extern "C++" {
        include!("resonance-logs-cn/src/module_optimizer/cpp/ffi_bridge.h");

        fn test_cuda_ffi() -> i32;

        fn test_opencl_ffi() -> i32;

        fn check_gpu_support_ffi() -> GpuSupportInfo;

        fn get_progress_ffi() -> ProgressInfoFfi;

        fn reset_progress_ffi();

        fn create_progress_context_ffi() -> u64;

        fn destroy_progress_context_ffi(handle: u64);

        fn get_progress_context_ffi(handle: u64) -> ProgressInfoFfi;

        fn strategy_enumeration_cpu_ffi(
            modules: &Vec<ModuleInfoFfi>,
            target_attributes: &Vec<i32>,
            exclude_attributes: &Vec<i32>,
            min_attr_ids: &Vec<i32>,
            min_attr_values: &Vec<i32>,
            max_solutions: i32,
            max_workers: i32,
            combination_size: i32,
            progress_handle: u64,
        ) -> Vec<ModuleSolutionFfi>;

        fn strategy_enumeration_gpu_ffi(
            modules: &Vec<ModuleInfoFfi>,
            target_attributes: &Vec<i32>,
            exclude_attributes: &Vec<i32>,
            min_attr_ids: &Vec<i32>,
            min_attr_values: &Vec<i32>,
            max_solutions: i32,
            max_workers: i32,
            combination_size: i32,
            progress_handle: u64,
        ) -> Vec<ModuleSolutionFfi>;

        fn strategy_beam_search_ffi(
            modules: &Vec<ModuleInfoFfi>,
            target_attributes: &Vec<i32>,
            exclude_attributes: &Vec<i32>,
            min_attr_ids: &Vec<i32>,
            min_attr_values: &Vec<i32>,
            max_solutions: i32,
            beam_width: i32,
            expand_per_state: i32,
            combination_size: i32,
            max_workers: i32,
            progress_handle: u64,
        ) -> Vec<ModuleSolutionFfi>;
    }
}
