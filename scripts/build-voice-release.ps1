param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

foreach ($name in @(
    "VOICE_MODEL_MANIFEST_URL",
    "VOICE_MODEL_MANIFEST_PUBLIC_KEY"
)) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$name must be configured before creating a release installer"
    }
}

& (Join-Path $PSScriptRoot "build-voice-sidecar.ps1") -Configuration Release -Variant Cpu
if ($LASTEXITCODE -ne 0) {
    throw "CPU voice sidecar release gate failed"
}
& (Join-Path $PSScriptRoot "build-voice-sidecar.ps1") -Configuration Release -Variant Vulkan
if ($LASTEXITCODE -ne 0) {
    throw "Vulkan voice sidecar release gate failed"
}

Push-Location $repoRoot
try {
    & npm exec tauri build -- --config src-tauri/tauri.release.conf.json
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri release build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
