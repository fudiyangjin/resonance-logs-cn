# Windows static build (qwen3-tts-sidecar)

Goal: produce `qwen3-tts-sidecar.exe` that runs on a clean Windows 10/11
machine with **no additional runtime installs** (no VC++ Redistributable,
no Python, no CUDA/Vulkan SDK). This is the binary that
`resonance-logs-cn` bundles as a Tauri `externalBin`; it is not meant to
be built or shipped alongside the shared library / Nim FFI targets.

## 1. Prerequisites

- Visual Studio 2022 Build Tools (MSVC v143+), "Desktop development with
  C++" workload.
- CMake 3.14+ and Ninja (or the VS generator) on `PATH`.
- The vendored Qwen and GGML source tree under `src-tauri/native/qwen3-tts`.

Open a **x64 Native Tools Command Prompt for VS 2022** (or run
`vcvars64.bat`) before running any of the commands below, so `cl.exe`
resolves correctly for both GGML and this project.

## 2. Build the pinned superbuild

From the parent `resonance-logs-cn` repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-voice-sidecar.ps1 -Configuration Release
```

The script configures one CMake graph containing the pinned Qwen and GGML
sources, builds the sidecar and model-free tests, runs CTest, validates
`--probe`, checks runtime DLL dependencies, and copies the verified executable
to Tauri's target-triple `externalBin` path.

`GGML_NATIVE=OFF` prevents the build machine's detected CPU features from
leaking into the artifact. Windows v1 deliberately fixes the supported CPU
baseline at AVX2/FMA/F16C/BMI2 for usable inference performance. CPUs without
AVX2 are not supported by this release target.

`-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded` statically links the CRT
(`/MT` instead of `/MD`) so `msvcp140.dll`/`vcruntime140.dll` do not need
to be present on the target machine. This **must** match the setting
used for qwen3-tts.cpp itself below, or linking will fail with CRT
mismatch errors (LNK2038).

`QWEN3_TTS_STATIC_CRT` (see top-level `CMakeLists.txt`) sets
`CMAKE_MSVC_RUNTIME_LIBRARY` to the static CRT to match GGML. It is off
by default so local/dev builds keep the faster dynamic-CRT link.

Only the `qwen3-tts-sidecar` target is needed for distribution; the
shared library (`qwen3tts_shared`), CLI (`qwen3-tts-cli`), and test
executables are unaffected by (and don't require) the static-CRT option.

## 3. Verify the result has no unexpected runtime dependencies

```bat
dumpbin /dependents ..\..\binaries\qwen3-tts-sidecar-x86_64-pc-windows-msvc.exe
```

Expected: only standard Windows system DLLs (`kernel32.dll`,
`user32.dll`, `advapi32.dll`, `psapi.dll`, etc.). If `msvcp140.dll`,
`vcruntime140.dll`, or `concrt140.dll` show up, the static-CRT option was
not applied consistently to both GGML and qwen3-tts.cpp — rebuild both
from a clean `build`/`ggml/build` directory.

Run the packaged executable on a VM/container without Visual Studio or
the VC++ Redistributable installed to confirm it launches; this is the
gate before treating a build as release-ready (see the parent repo's
release checklist for the full clean-machine verification pass).

## 4. Smoke-testing the batch protocol without real models

`qwen3-tts-sidecar` always loads real GGUF models (there is no mock
mode), so a true end-to-end smoke test requires the converted model
files described in the main `README.md`. The protocol-only pieces
(Q3SP serialization, job JSON parsing, output validation) are covered by
`test_voice_profile`, `test_json_lite`, and `test_audio_validate`, which
build and run without any model files — run those first when iterating
on the sidecar in a sandboxed/CI environment that lacks the multi-GB
model artifacts.
