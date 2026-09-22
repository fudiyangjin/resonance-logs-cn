param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

if (-not $env:PUBLIC_SITE_URL) {
    throw "Set PUBLIC_SITE_URL before the release build (see docs/updater-release.md)"
}

# Voice model manifests remain independent of the application updater manifests.

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

    $metadataJson = & cargo metadata --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw "Failed to resolve Cargo target directory" }
    $targetDirectory = ($metadataJson | ConvertFrom-Json).target_directory
    $appConfig = Get-Content -LiteralPath (Join-Path $repoRoot "src-tauri/tauri.conf.json") -Raw | ConvertFrom-Json
    $installerName = "$($appConfig.productName)_$($appConfig.version)_x64-setup.exe"
    $installer = Get-Item -LiteralPath (Join-Path $targetDirectory "release/bundle/nsis/$installerName")
    if ($installer.VersionInfo.ProductVersion -ne $appConfig.version) {
        throw "NSIS installer version does not match application version"
    }
    $manifestDirectory = Join-Path $targetDirectory "release/bundle/updater"
    & node (Join-Path $PSScriptRoot "generate-update-manifests.mjs") $installer.FullName $manifestDirectory
    if ($LASTEXITCODE -ne 0) { throw "Update manifest generation or signature verification failed" }
    Write-Host "Upload the signed NSIS installer to the configured GitHub repository and domestic release source first, then publish the three manifests from $manifestDirectory"
} finally {
    Pop-Location
}
