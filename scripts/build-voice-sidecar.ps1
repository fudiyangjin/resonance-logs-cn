<#
.SYNOPSIS
    Builds and verifies the vendored qwen3-tts sidecar.

.DESCRIPTION
    Configures one CMake graph containing the pinned Qwen and GGML sources,
    runs model-free native tests, verifies the sidecar probe, and copies the
    release artifact to Tauri's target-triple externalBin path.
#>
param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [ValidateSet("Cpu", "Vulkan")]
    [string]$Variant = "Cpu",
    [switch]$SkipTests,
    # Enables QWEN3_TTS_TIMING, which makes the sidecar print a detailed
    # per-frame timing breakdown (prefill/talker/code-predictor/embedding)
    # to stderr for every synthesized item. Off by default: it adds a
    # small amount of instrumentation overhead and log noise that
    # production/dev builds don't need. Turn it on for
    # scripts/bench-voice-sidecar.ps1 runs.
    [switch]$Timing
)

$ErrorActionPreference = "Stop"

function Import-MsvcEnvironment {
    if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
        return
    }

    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path -LiteralPath $vswhere)) {
        throw "Visual Studio Build Tools were not found (missing vswhere.exe)"
    }
    $installationPath = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
    if (-not $installationPath) {
        throw "Visual Studio C++ x64 build tools are not installed"
    }
    $vsDevCmd = Join-Path $installationPath "Common7\Tools\VsDevCmd.bat"
    $environment = & $env:ComSpec /s /c "`"$vsDevCmd`" -arch=x64 -host_arch=x64 >nul && set"
    if ($LASTEXITCODE -ne 0) {
        throw "failed to initialize the MSVC build environment"
    }
    foreach ($line in $environment) {
        $separator = $line.IndexOf('=')
        if ($separator -gt 0) {
            $name = $line.Substring(0, $separator)
            $value = $line.Substring($separator + 1)
            Set-Item -Path "Env:$name" -Value $value
        }
    }
    if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
        throw "MSVC environment initialized but cl.exe is still unavailable"
    }
}

Import-MsvcEnvironment

$variantName = $Variant.ToLowerInvariant()
if ($Variant -eq "Vulkan" -and -not (Get-Command glslc.exe -ErrorAction SilentlyContinue)) {
    throw "Vulkan variant requires the Vulkan SDK and glslc.exe"
}
$repoRoot = Split-Path $PSScriptRoot -Parent
$sourceDir = Join-Path $repoRoot "src-tauri\native\qwen3-tts"
$targetTriple = (rustc -vV | Select-String "^host:").ToString().Split(":")[1].Trim()
if ($targetTriple -ne "x86_64-pc-windows-msvc") {
    throw "voice sidecar only supports x86_64-pc-windows-msvc (host: $targetTriple)"
}
# GGML's Vulkan shader generator creates deeply nested sub-builds
# (vulkan-shaders-gen's own CMake TryCompile scratch dirs nest ~6 levels
# below this one). Building under the repo path already leaves little
# headroom below Windows' ~260 char MAX_PATH, and appending "-timing"
# pushes Vulkan+Timing configs over the edge (cl.exe fails with a cryptic
# C1083 "cannot open compiler generated file" instead of a path-length
# error). Timing builds are dev-only (scripts/bench-voice-sidecar.ps1), so
# give them a short, repo-independent root instead of trying to shave
# characters off a suffix.
$buildDir = if ($Timing) {
    "C:\qtts-bench-build\q3-$variantName-$($Configuration.ToLowerInvariant())"
} else {
    Join-Path $repoRoot "src-tauri\target\native\q3-$variantName-$($Configuration.ToLowerInvariant())"
}
$destinationDir = Join-Path $repoRoot "src-tauri\binaries"
$destinationExe = Join-Path $destinationDir "qwen3-tts-sidecar-$variantName-$targetTriple.exe"

if (-not (Test-Path -LiteralPath (Join-Path $sourceDir "CMakeLists.txt"))) {
    throw "vendored qwen3-tts source is missing: $sourceDir"
}

New-Item -ItemType Directory -Force -Path $buildDir, $destinationDir | Out-Null

$cmakeArgs = @(
    "-S", $sourceDir,
    "-B", $buildDir,
    "-G", "Ninja",
    "-DCMAKE_BUILD_TYPE=$Configuration",
    "-DQWEN3_TTS_STATIC_CRT=ON",
    "-DQWEN3_TTS_VARIANT=$variantName",
    "-DQWEN3_TTS_TIMING=$(if ($Timing) { 'ON' } else { 'OFF' })",
    "-DGGML_NATIVE=OFF",
    "-DGGML_OPENMP=OFF",
    "-DBUILD_SHARED_LIBS=OFF"
)
& cmake @cmakeArgs
if ($LASTEXITCODE -ne 0) {
    throw "CMake configure failed with exit code $LASTEXITCODE"
}

& cmake --build $buildDir --config $Configuration --target qwen3-tts-sidecar test_voice_profile test_audio_validate test_json_lite -j
if ($LASTEXITCODE -ne 0) {
    throw "native build failed with exit code $LASTEXITCODE"
}

if (-not $SkipTests) {
    & ctest --test-dir $buildDir -C $Configuration --output-on-failure -R "^(voice_profile_test|audio_validate_test|json_lite_test|sidecar_probe_test|sidecar_protocol_rejection_test)$"
    if ($LASTEXITCODE -ne 0) {
        throw "native tests failed with exit code $LASTEXITCODE"
    }
}

$builtExe = Join-Path $buildDir "qwen3-tts-sidecar.exe"
if (-not (Test-Path -LiteralPath $builtExe)) {
    throw "expected sidecar output is missing: $builtExe"
}

$probeText = (& $env:ComSpec /d /s /c "`"$builtExe`" --probe 2>nul" | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "sidecar probe failed with exit code $LASTEXITCODE"
}
$probe = $probeText | ConvertFrom-Json
if ($probe.engine -ne "qwen3-tts-sidecar" -or
    $probe.protocolVersion -ne 3 -or
    $probe.stub -ne $false -or
    $probe.buildType -ne $Configuration -or
    $probe.variant -ne $variantName -or
    -not ($probe.compiledBackends -contains "cpu") -or
    ($Variant -eq "Vulkan" -and -not ($probe.compiledBackends -contains "vulkan"))) {
    throw "sidecar probe rejected: $probeText"
}

if ($Timing) {
    # Timing builds are for scripts/bench-voice-sidecar.ps1 only — never
    # overwrite the externalBin artifact the app actually ships/runs with
    # instrumentation overhead and extra stderr noise.
    Write-Host "sidecar (timing build, not copied to externalBin): $builtExe"
    Write-Host "probe:   $probeText"
} else {
    Copy-Item -LiteralPath $builtExe -Destination $destinationExe -Force
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destinationExe).Hash.ToLowerInvariant()
    Write-Host "sidecar: $destinationExe"
    Write-Host "sha256:  $hash"
    Write-Host "probe:   $probeText"

    $dumpbin = Get-Command dumpbin -ErrorAction SilentlyContinue
    if ($dumpbin) {
        $dependencies = & $dumpbin.Source /dependents $destinationExe 2>$null | Select-String "\.dll" | ForEach-Object { $_.Line.Trim() }
        $forbidden = $dependencies | Where-Object { $_ -match "^(vcomp|vcruntime|msvcp).*\.dll$" }
        if ($forbidden) {
            throw "sidecar has forbidden redistributable dependencies: $($forbidden -join ', ')"
        }
        Write-Host "runtime dependencies: $($dependencies -join ', ')"
    }
}
