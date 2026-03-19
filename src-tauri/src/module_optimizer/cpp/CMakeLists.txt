cmake_minimum_required(VERSION 3.18)

project(module_optimizer_cuda LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Allow local overrides while keeping the current architecture defaults.
if(NOT DEFINED CMAKE_CUDA_ARCHITECTURES)
    set(CMAKE_CUDA_ARCHITECTURES "75;86;89;120")
endif()

if(NOT DEFINED CCCL_ROOT)
    message(FATAL_ERROR "CCCL_ROOT must be provided to build module_optimizer_cuda")
endif()

set(CCCL_CUB_DIR "${CCCL_ROOT}/cub")
set(CCCL_THRUST_DIR "${CCCL_ROOT}/thrust")
set(CCCL_LIBCUDACXX_INCLUDE_DIR "${CCCL_ROOT}/libcudacxx/include")

foreach(required_dir
    "${CCCL_CUB_DIR}"
    "${CCCL_THRUST_DIR}"
    "${CCCL_LIBCUDACXX_INCLUDE_DIR}"
)
    if(NOT EXISTS "${required_dir}")
        message(FATAL_ERROR "Missing CCCL directory: ${required_dir}")
    endif()
endforeach()

add_library(module_optimizer_cuda STATIC
    module_optimizer_cuda.cu
)

target_include_directories(module_optimizer_cuda PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    "${CCCL_CUB_DIR}"
    "${CCCL_THRUST_DIR}"
    "${CCCL_LIBCUDACXX_INCLUDE_DIR}"
)

target_compile_options(module_optimizer_cuda PRIVATE
    $<$<COMPILE_LANGUAGE:CUDA>:--use_fast_math>
)

if(MSVC)
    set_property(TARGET module_optimizer_cuda PROPERTY
        MSVC_RUNTIME_LIBRARY "MultiThreadedDLL"
    )

    target_compile_options(module_optimizer_cuda PRIVATE
        $<$<COMPILE_LANGUAGE:CUDA>:-Xcompiler=/utf-8,/EHsc,/MD,/O2,/bigobj,/Zc:preprocessor>
    )
endif()

install(TARGETS module_optimizer_cuda
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
)
