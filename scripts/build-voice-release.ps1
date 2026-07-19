param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

# Release builds use the signed manifest embedded in the application by default.
# The environment variables remain optional overrides for future hosted manifests.

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
    $tauriCli = Join-Path $repoRoot "node_modules/.bin/tauri.cmd"
    if (-not (Test-Path -LiteralPath $tauriCli)) {
        throw "local Tauri CLI is missing: $tauriCli"
    }
    & $tauriCli build --config src-tauri/tauri.release.conf.json
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri release build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
