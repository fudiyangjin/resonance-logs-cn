cmake_minimum_required(VERSION 3.15)
# CMP0091 (new in 3.15) makes `CMAKE_MSVC_RUNTIME_LIBRARY` actually control
# the MSVC runtime (/MT vs /MD) instead of being silently ignored. Without
# this, `QWEN3_TTS_STATIC_CRT` below has no effect and the final link of
# qwen3-tts-sidecar fails with LNK2038 (CRT mismatch) against a statically
# built GGML.
if(POLICY CMP0091)
    cmake_policy(SET CMP0091 NEW)
endif()

project(qwen3-tts-ggml VERSION 0.1.0 LANGUAGES CXX)

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Static libs are linked into the qwen3tts shared lib (C API), so they must be PIC
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Compiler flags
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -Wpedantic")
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -O3")
    set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} -g -O0")
elseif(MSVC)
    # Do not rely on mutable CMake cache defaults for release semantics.
    # /EHsc is required by the JSON protocol parser and STL code, while
    # /DNDEBUG makes the Release test build exercise disabled assertions.
    add_compile_options(
        "$<$<COMPILE_LANGUAGE:CXX>:/EHsc>"
        "$<$<AND:$<COMPILE_LANGUAGE:CXX>,$<CONFIG:Release>>:/O2>"
        "$<$<AND:$<COMPILE_LANGUAGE:CXX>,$<CONFIG:Release>>:/DNDEBUG>"
    )
endif()

# Timing instrumentation option
option(QWEN3_TTS_TIMING "Enable detailed timing instrumentation" OFF)
if(QWEN3_TTS_TIMING)
    add_compile_definitions(QWEN3_TTS_TIMING)
endif()

# CoreML code predictor bridge (macOS only)
option(QWEN3_TTS_COREML "Enable CoreML code predictor bridge on macOS" ON)
if(APPLE AND QWEN3_TTS_COREML)
    enable_language(OBJCXX)
endif()

if(WIN32)
    add_compile_definitions(_USE_MATH_DEFINES NOMINMAX)
endif()

# Static Windows sidecar builds: link the MSVC CRT statically so the
# distributed qwen3-tts-sidecar.exe does not require the VC++
# Redistributable on a clean machine. Off by default (dev builds keep the
# faster-to-link dynamic CRT); enable explicitly for release packaging.
# GGML itself must be configured to match (same CMAKE_MSVC_RUNTIME_LIBRARY,
# and GGML_NATIVE=OFF so the resulting binary uses the fixed AVX2 v1
# baseline rather than the feature set of the machine that built it) — see
# docs/WINDOWS_BUILD.md.
option(QWEN3_TTS_STATIC_CRT "Statically link the MSVC runtime (Windows only)" OFF)
if(WIN32 AND QWEN3_TTS_STATIC_CRT)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

set(QWEN3_TTS_VARIANT "cpu" CACHE STRING "Sidecar backend variant: cpu or vulkan")
set_property(CACHE QWEN3_TTS_VARIANT PROPERTY STRINGS cpu vulkan)
if(NOT QWEN3_TTS_VARIANT MATCHES "^(cpu|vulkan)$")
    message(FATAL_ERROR "Unsupported QWEN3_TTS_VARIANT=${QWEN3_TTS_VARIANT}")
endif()

# Find threads
find_package(Threads REQUIRED)

# Build the pinned GGML source in this tree as part of the same CMake graph.
set(GGML_DIR "${CMAKE_CURRENT_SOURCE_DIR}/ggml")
set(GGML_BUILD_DIR "${CMAKE_CURRENT_BINARY_DIR}/ggml")
set(QWEN3_TTS_SOURCE_COMMIT "b9763a1af4e6f9de2ffabda0613e398727ab318e")
set(QWEN3_TTS_GGML_COMMIT "3af5f5760e19a96427f5f7a93b79cbdf3d4b265b")
set(GGML_BUILD_COMMIT "${QWEN3_TTS_GGML_COMMIT}")
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_SSE42 ON CACHE BOOL "" FORCE)
set(GGML_AVX ON CACHE BOOL "" FORCE)
set(GGML_AVX2 ON CACHE BOOL "" FORCE)
set(GGML_BMI2 ON CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
if(QWEN3_TTS_VARIANT STREQUAL "cpu")
    set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
    set(GGML_CUDA OFF CACHE BOOL "" FORCE)
elseif(QWEN3_TTS_VARIANT STREQUAL "vulkan")
    set(GGML_VULKAN ON CACHE BOOL "" FORCE)
    set(GGML_CUDA OFF CACHE BOOL "" FORCE)
endif()
add_subdirectory(${GGML_DIR} ${GGML_BUILD_DIR} EXCLUDE_FROM_ALL)

# Detect Metal backend availability
if(APPLE AND EXISTS "${GGML_BUILD_DIR}/src/ggml-metal/libggml-metal.dylib")
    set(GGML_HAS_METAL ON)
    message(STATUS "GGML Metal backend found — GPU acceleration enabled")
else()
    set(GGML_HAS_METAL OFF)
endif()

# Text tokenizer library
add_library(text_tokenizer STATIC
    src/text_tokenizer.cpp
    src/gguf_loader.cpp
)
target_include_directories(text_tokenizer PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${GGML_DIR}/include
)
target_link_libraries(text_tokenizer PUBLIC
    ggml
    ggml-base
    ggml-cpu
    Threads::Threads
)
if(GGML_HAS_METAL)
    target_link_libraries(text_tokenizer PUBLIC ggml-metal "-framework Metal" "-framework MetalKit")
endif()

# TTS Transformer library (GGML-based + optional CoreML bridge)
set(TTS_TRANSFORMER_SOURCES
    src/gguf_loader.cpp
    src/tts_transformer.cpp
)
if(APPLE AND QWEN3_TTS_COREML)
    list(APPEND TTS_TRANSFORMER_SOURCES src/coreml_code_predictor.mm)
    set_source_files_properties(src/coreml_code_predictor.mm PROPERTIES COMPILE_FLAGS "-fobjc-arc")
else()
    list(APPEND TTS_TRANSFORMER_SOURCES src/coreml_code_predictor_stub.cpp)
endif()

add_library(tts_transformer STATIC
    ${TTS_TRANSFORMER_SOURCES}
)
target_include_directories(tts_transformer PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${GGML_DIR}/include
)
target_link_libraries(tts_transformer PUBLIC
    ggml
    ggml-base
    ggml-cpu
    Threads::Threads
)
if(GGML_HAS_METAL)
    target_link_libraries(tts_transformer PUBLIC ggml-metal "-framework Metal" "-framework MetalKit")
endif()
if(APPLE AND QWEN3_TTS_COREML)
    target_link_libraries(tts_transformer PUBLIC
        "-framework Foundation"
        "-framework CoreML"
    )
endif()

# Audio tokenizer encoder library (GGML-based)
add_library(audio_tokenizer_encoder STATIC
    src/audio_tokenizer_encoder.cpp
    src/gguf_loader.cpp
)
target_include_directories(audio_tokenizer_encoder PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${GGML_DIR}/include
)
target_link_libraries(audio_tokenizer_encoder PUBLIC
    ggml
    ggml-base
    ggml-cpu
    Threads::Threads
)
if(GGML_HAS_METAL)
    target_link_libraries(audio_tokenizer_encoder PUBLIC ggml-metal "-framework Metal" "-framework MetalKit")
endif()

# Audio tokenizer decoder library (GGML-based)
add_library(audio_tokenizer_decoder STATIC
    src/audio_tokenizer_decoder.cpp
    src/gguf_loader.cpp
)
target_include_directories(audio_tokenizer_decoder PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${GGML_DIR}/include
)
target_link_libraries(audio_tokenizer_decoder PUBLIC
    ggml
    ggml-base
    ggml-cpu
    Threads::Threads
)
if(GGML_HAS_METAL)
    target_link_libraries(audio_tokenizer_decoder PUBLIC ggml-metal "-framework Metal" "-framework MetalKit")
endif()

# Qwen3 TTS library (full pipeline)
add_library(qwen3_tts STATIC
    src/qwen3_tts.cpp
)
target_include_directories(qwen3_tts PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${GGML_DIR}/include
)
target_link_libraries(qwen3_tts PUBLIC
    text_tokenizer
    tts_transformer
    audio_tokenizer_encoder
    audio_tokenizer_decoder
    Threads::Threads
)
if(WIN32)
    target_link_libraries(qwen3_tts PUBLIC psapi)
endif()

# Shared library with C API (for Nim FFI)
add_library(qwen3tts_shared SHARED
    src/qwen3tts_c_api.cpp
)
set_target_properties(qwen3tts_shared PROPERTIES
    OUTPUT_NAME "qwen3tts"
    VERSION ${PROJECT_VERSION}
    SOVERSION 0
)
target_include_directories(qwen3tts_shared PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)
target_link_libraries(qwen3tts_shared PRIVATE
    qwen3_tts
)

# CLI executable
add_executable(qwen3-tts-cli
    src/main.cpp
)
target_link_libraries(qwen3-tts-cli PRIVATE
    qwen3_tts
)

# Voice profile / batch-sidecar support library: Q3SP speaker profile
# serialization, output validation, minimal JSON parsing for the batch
# job protocol, and small filesystem/hash helpers. Deliberately has no
# GGML dependency of its own so it can be unit-tested without a model.
add_library(voice_profile STATIC
    src/sha256.cpp
    src/fs_util.cpp
    src/voice_profile.cpp
    src/audio_validate.cpp
)
target_include_directories(voice_profile PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# qwen3-tts-sidecar: one-shot batch executable. Loads models once,
# resolves a single speaker embedding (new extraction or existing Q3SP
# profile), synthesizes every item in --job <file>, and exits. See
# src/sidecar_main.cpp for the JSONL progress/result protocol.
add_executable(qwen3-tts-sidecar
    src/sidecar_main.cpp
)
target_link_libraries(qwen3-tts-sidecar PRIVATE
    qwen3_tts
    voice_profile
)
target_compile_definitions(qwen3-tts-sidecar PRIVATE
    QWEN3_TTS_SOURCE_COMMIT="${QWEN3_TTS_SOURCE_COMMIT}"
    QWEN3_TTS_BUILD_TYPE="$<CONFIG>"
    QWEN3_TTS_VARIANT="${QWEN3_TTS_VARIANT}"
)

# Test executable for tokenizer
add_executable(test_tokenizer
    tests/test_tokenizer.cpp
)
target_link_libraries(test_tokenizer PRIVATE
    text_tokenizer
    Threads::Threads
)

# Test executable for audio encoder
add_executable(test_encoder
    tests/test_encoder.cpp
)
target_link_libraries(test_encoder PRIVATE
    audio_tokenizer_encoder
    Threads::Threads
)

# Test executable for transformer
add_executable(test_transformer
    tests/test_transformer.cpp
)
target_link_libraries(test_transformer PRIVATE
    tts_transformer
    Threads::Threads
)

# Test executable for audio decoder
add_executable(test_decoder
    tests/test_decoder.cpp
)
target_link_libraries(test_decoder PRIVATE
    audio_tokenizer_decoder
    Threads::Threads
)

# Test executable for the Q3SP voice profile format (no model required)
add_executable(test_voice_profile
    tests/test_voice_profile.cpp
)
target_link_libraries(test_voice_profile PRIVATE
    voice_profile
)

# Test executable for synthesized-audio output validation (no model required)
add_executable(test_audio_validate
    tests/test_audio_validate.cpp
)
target_link_libraries(test_audio_validate PRIVATE
    voice_profile
)

# Test executable for the sidecar's minimal JSON job parser (no model required)
add_executable(test_json_lite
    tests/test_json_lite.cpp
)
target_link_libraries(test_json_lite PRIVATE
    voice_profile
)

# Install targets
install(TARGETS text_tokenizer tts_transformer audio_tokenizer_encoder audio_tokenizer_decoder qwen3_tts qwen3tts_shared qwen3-tts-cli qwen3-tts-sidecar voice_profile
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
    RUNTIME DESTINATION bin
)
install(FILES
    src/gguf_loader.h
    src/text_tokenizer.h
    src/tts_transformer.h
    src/coreml_code_predictor.h
    src/audio_tokenizer_encoder.h
    src/audio_tokenizer_decoder.h
    src/qwen3_tts.h
    src/qwen3tts_c_api.h
    src/voice_profile.h
    src/audio_validate.h
    src/json_lite.h
    src/sha256.h
    src/fs_util.h
    DESTINATION include
)

# CTest support
enable_testing()
add_test(NAME tokenizer_test
    COMMAND test_tokenizer
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
)
add_test(NAME encoder_test
    COMMAND test_encoder --tokenizer models/qwen3-tts-0.6b-f16.gguf --audio clone.wav --reference reference/ref_audio_embedding.bin
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
)
add_test(NAME transformer_test
    COMMAND test_transformer
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
)
add_test(NAME decoder_test
    COMMAND test_decoder
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
)
add_test(NAME voice_profile_test
    COMMAND test_voice_profile
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
)
add_test(NAME audio_validate_test
    COMMAND test_audio_validate
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
)
add_test(NAME json_lite_test
    COMMAND test_json_lite
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
)
add_test(NAME sidecar_probe_test
    COMMAND qwen3-tts-sidecar --probe
)
add_test(NAME sidecar_protocol_rejection_test
    COMMAND qwen3-tts-sidecar --job ${CMAKE_CURRENT_SOURCE_DIR}/tests/invalid_protocol_job.json --backend cpu
)
set_tests_properties(sidecar_protocol_rejection_test PROPERTIES
    WILL_FAIL TRUE
)
