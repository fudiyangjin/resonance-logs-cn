<#
.SYNOPSIS
    Benchmarks the CPU and Vulkan qwen3-tts-sidecar variants on the same
    text/model and prints a per-stage timing comparison.

.DESCRIPTION
    Builds one or both sidecar variants with QWEN3_TTS_TIMING enabled
    (scripts/build-voice-sidecar.ps1 -Timing), synthesizes the same set of
    phrases with each, and parses the detailed per-frame timing that the
    sidecar prints to stderr (see docs/SIDECAR_PROTOCOL.md and
    src-tauri/native/qwen3-tts/OPTIMIZATION.md for background).

    A synthetic reference clip is used to resolve one speaker embedding via
    `source.mode=profile_new`, which is then reused via
    `source.mode=profile_existing` for every timed item so speaker-encoder
    cost doesn't pollute the generate()/decode() numbers being compared.

    This does not require the app to be running; it drives the sidecar
    executables directly. It requires an already-downloaded model
    directory containing qwen3-tts-0.6b-{q8_0,f16}.gguf and
    qwen3-tts-tokenizer-f16.gguf (see docs/VOICE_MODEL_MANIFEST.md).

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bench-voice-sidecar.ps1 `
        -ModelDir "C:\path\to\voice\models\v1"

.EXAMPLE
    # Reuse already-built -Timing binaries instead of rebuilding.
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bench-voice-sidecar.ps1 `
        -ModelDir "C:\path\to\voice\models\v1" -SkipBuild
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$ModelDir,

    [ValidateSet("Cpu", "Vulkan", "Both")]
    [string]$Variant = "Both",

    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",

    # Reuse previously built -Timing sidecar binaries instead of rebuilding.
    [switch]$SkipBuild,

    # Number of autoregressive audio frames to cap generation at (12 Hz
    # frame rate => 100 frames ~= 8s of audio). Kept small so a bench run
    # is quick; override for longer-utterance comparisons.
    [int]$MaxAudioTokens = 100,

    [string[]]$Texts = @(
        "画面加载完成，可以开始记录战斗数据了。",
        "警告，团队增益还有五秒即将到期，请注意刷新。",
        "本次战斗共造成三十二万点伤害，治疗十一万点，表现优秀。"
    ),

    [string]$OutputDir
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$targetTriple = (rustc -vV | Select-String "^host:").ToString().Split(":")[1].Trim()

if (-not $OutputDir) {
    $OutputDir = Join-Path $repoRoot "src-tauri\target\voice-bench"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Resolve-ModelFile {
    param([string]$Directory, [string[]]$Candidates)
    foreach ($name in $Candidates) {
        $path = Join-Path $Directory $name
        if (Test-Path -LiteralPath $path) {
            return $path
        }
    }
    throw "none of [$($Candidates -join ', ')] found under $Directory"
}

$transformerPath = Resolve-ModelFile -Directory $ModelDir -Candidates @(
    "qwen3-tts-0.6b-q8_0.gguf",
    "qwen3-tts-0.6b-f16.gguf"
)
$tokenizerPath = Resolve-ModelFile -Directory $ModelDir -Candidates @("qwen3-tts-tokenizer-f16.gguf")
Write-Host "transformer: $transformerPath"
Write-Host "tokenizer:   $tokenizerPath"

function New-SyntheticReferenceWav {
    # A short synthetic clip is enough to resolve *a* speaker embedding;
    # bench numbers care about generate()/decode() speed, not clone
    # fidelity, and item timings below reuse this single embedding via
    # source.mode=profile_existing so the (slow, one-time) speaker-encoder
    # pass only ever runs once regardless of how many variants are benched.
    param([string]$Path, [int]$SampleRate = 24000, [double]$DurationSec = 6.0)

    $sampleCount = [int]($SampleRate * $DurationSec)
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create)
    try {
        $writer = New-Object System.IO.BinaryWriter($stream)
        $dataBytes = $sampleCount * 2
        $writer.Write([byte[]][char[]]"RIFF")
        $writer.Write([int32](36 + $dataBytes))
        $writer.Write([byte[]][char[]]"WAVE")
        $writer.Write([byte[]][char[]]"fmt ")
        $writer.Write([int32]16)
        $writer.Write([int16]1)         # PCM
        $writer.Write([int16]1)         # mono
        $writer.Write([int32]$SampleRate)
        $writer.Write([int32]($SampleRate * 2))
        $writer.Write([int16]2)         # block align
        $writer.Write([int16]16)        # bits per sample
        $writer.Write([byte[]][char[]]"data")
        $writer.Write([int32]$dataBytes)

        # A few summed low-frequency tones with slight amplitude jitter
        # roughly stand in for voiced speech-band energy without needing
        # any bundled sample audio.
        $freqs = @(140.0, 260.0, 420.0)
        for ($i = 0; $i -lt $sampleCount; $i++) {
            $t = $i / [double]$SampleRate
            $value = 0.0
            foreach ($f in $freqs) {
                $value += [math]::Sin(2.0 * [math]::PI * $f * $t)
            }
            $envelope = 0.6 + 0.4 * [math]::Sin(2.0 * [math]::PI * 0.5 * $t)
            $sample = [int16]([math]::Max(-32000, [math]::Min(32000, ($value / $freqs.Count) * $envelope * 16000)))
            $writer.Write($sample)
        }
        $writer.Flush()
    } finally {
        $stream.Dispose()
    }
}

function ConvertTo-JsonPathString {
    # json_lite (the sidecar's minimal JSON parser) only unescapes `\\`
    # and `\"`, so a literal path backslash must become exactly two
    # backslash characters in the JSON text. PowerShell's `-replace`
    # treats the pattern as regex but the replacement as a literal
    # string, so the replacement here must itself contain exactly two
    # backslash characters (not four).
    param([string]$Value)
    return ($Value -replace '\\', '\\')
}

function Write-JobFile {
    param(
        [string]$Path,
        [string]$TransformerPath,
        [string]$TokenizerPath,
        [string]$SourceJson,
        [array]$Items
    )
    $itemsJson = ($Items | ForEach-Object {
        '{"id":"' + $_.id + '","text":"' + ($_.text -replace '"', '\"') + '","output_path":"' + (ConvertTo-JsonPathString $_.output_path) + '","language_id":' + $_.language_id + ',"max_audio_tokens":' + $_.max_audio_tokens + '}'
    }) -join ","
    $json = '{"protocol_version":3,"transformer_path":"' + (ConvertTo-JsonPathString $TransformerPath) + '","tokenizer_path":"' + (ConvertTo-JsonPathString $TokenizerPath) + '","source":' + $SourceJson + ',"items":[' + $itemsJson + ']}'
    # json_lite doesn't skip a UTF-8 BOM, and Set-Content/Out-File
    # -Encoding UTF8 on Windows PowerShell 5.1 prepends one, so the
    # sidecar would fail to parse ("Invalid number at offset 0"). Write
    # via .NET directly with a BOM-less UTF8 encoding instead.
    [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-SidecarJob {
    param([string]$ExePath, [string]$Backend, [string]$JobPath, [string]$LogPrefix)
    $stdoutPath = "$LogPrefix.stdout.jsonl"
    $stderrPath = "$LogPrefix.stderr.log"
    $env:QWEN3_TTS_BENCH_TIMING = "1"
    # Route through cmd.exe (like build-voice-sidecar.ps1's probe check) so
    # PowerShell doesn't turn every stderr line the sidecar prints into a
    # terminating ErrorRecord under $ErrorActionPreference = "Stop" -- the
    # sidecar's own exit code (checked below) is what actually indicates
    # success/failure here, not the presence of stderr output.
    $quotedExe = '"' + $ExePath + '"'
    $quotedJob = '"' + $JobPath + '"'
    & $env:ComSpec /d /s /c "$quotedExe --job $quotedJob --backend $Backend 1> `"$stdoutPath`" 2> `"$stderrPath`""
    $exitCode = $LASTEXITCODE
    Remove-Item Env:\QWEN3_TTS_BENCH_TIMING -ErrorAction SilentlyContinue
    if ($exitCode -gt 2) {
        # 0 = all ok, 2 = some items failed (still useful for partial bench data).
        throw "sidecar job failed with exit code $exitCode; see $stderrPath"
    }
    return @{ Stdout = $stdoutPath; Stderr = $stderrPath; ExitCode = $exitCode }
}

function Get-Number {
    param([string]$Text, [string]$Pattern)
    $m = [regex]::Match($Text, $Pattern)
    if ($m.Success) { return [double]$m.Groups[1].Value }
    return $null
}

function Parse-TimingBlocks {
    # Splits stderr on the per-item "=== Detailed Generation Timing ==="
    # marker (src-tauri/native/qwen3-tts/src/tts_transformer.cpp) and the
    # per-item "Timing:" stage summary (src-tauri/native/qwen3-tts/src/qwen3_tts.cpp),
    # both emitted once per synthesized item.
    param([string]$StderrText)

    $frameBlocks = [regex]::Split($StderrText, '(?=\=\=\= Detailed Generation Timing)') |
        Where-Object { $_ -match '\=\=\= Detailed Generation Timing' }
    $stageBlocks = [regex]::Split($StderrText, '(?=\nTiming:\n)') |
        Where-Object { $_ -match '^\s*\nTiming:' -or $_ -match 'Tokenization:' }

    $results = @()
    for ($i = 0; $i -lt $frameBlocks.Count; $i++) {
        $frame = $frameBlocks[$i]
        $talkerSection = ($frame -split 'Code predictor')[0]
        $codePredSection = if ($frame -match '(?s)Code predictor.*?(?=\n\n|\z)') { $Matches[0] } else { "" }

        $entry = [ordered]@{
            NFrames             = Get-Number $frame '\(([0-9]+) frames\)'
            TalkerComputeMsAvg  = Get-Number $talkerSection 'Compute:\s+[0-9.]+ ms\s+\(([0-9.]+) ms/frame\)'
            TalkerDataMsAvg     = Get-Number $talkerSection 'Data I/O:\s+[0-9.]+ ms\s+\(([0-9.]+) ms/frame\)'
            CodePredComputeMsAvg = Get-Number $codePredSection 'Compute:\s+[0-9.]+ ms\s+\(([0-9.]+) ms/frame\)'
            CodePredDataMsAvg   = Get-Number $codePredSection 'Data I/O:\s+[0-9.]+ ms\s+\(([0-9.]+) ms/frame\)'
            EmbedLookupMsAvg    = Get-Number $frame 'Embed lookups:\s+[0-9.]+ ms\s+\(([0-9.]+) ms/frame\)'
            TotalGenerateMs     = Get-Number $frame 'Total generate:\s+([0-9.]+) ms'
            MsPerFrame          = Get-Number $frame 'Throughput:\s+([0-9.]+) ms/frame'
            FramesPerSec        = Get-Number $frame '\(([0-9.]+) frames/s\)'
        }
        if ($i -lt $stageBlocks.Count) {
            $stage = $stageBlocks[$i]
            $entry.LoadReused        = $true
            $entry.TokenizeMs        = Get-Number $stage 'Tokenization:\s+([0-9.]+) ms'
            $entry.SpeakerEncodeMs   = Get-Number $stage 'Speaker encode:\s+([0-9.]+) ms'
            $entry.CodeGenerationMs  = Get-Number $stage 'Code generation:\s+([0-9.]+) ms'
            $entry.VocoderDecodeMs   = Get-Number $stage 'Vocoder decode:\s+([0-9.]+) ms'
            $entry.TotalStageMs      = Get-Number $stage 'Total:\s+([0-9.]+) ms'
            $entry.AudioDurationSec  = Get-Number $stage 'Audio duration:\s+([0-9.]+) s'
            $entry.RTF               = Get-Number $stage 'RTF=([0-9.]+)\)'
        }
        $results += [PSCustomObject]$entry
    }
    return $results
}

function Get-LoadModelElapsedMs {
    param([string]$StdoutPath)
    $lines = Get-Content -LiteralPath $StdoutPath
    foreach ($line in $lines) {
        if ($line -match '"type":"stage".*"stage":"load_model".*"status":"done"') {
            $obj = $line | ConvertFrom-Json
            return $obj.elapsed_ms
        }
    }
    return $null
}

function Get-Device {
    param([string]$StdoutPath)
    $lines = Get-Content -LiteralPath $StdoutPath
    foreach ($line in $lines) {
        if ($line -match '"type":"hello"') {
            $obj = $line | ConvertFrom-Json
            return $obj.device
        }
    }
    return "unknown"
}

function Build-Variant {
    param([string]$VariantName)
    if ($SkipBuild) {
        return
    }
    Write-Host "`n=== Building $VariantName (timing-instrumented) ===" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "build-voice-sidecar.ps1") -Configuration $Configuration -Variant $VariantName -Timing -SkipTests
    if ($LASTEXITCODE -ne 0) {
        throw "failed to build $VariantName timing sidecar"
    }
}

function Get-VariantExe {
    param([string]$VariantName)
    $variantLower = $VariantName.ToLowerInvariant()
    # Must match the short, repo-independent root build-voice-sidecar.ps1
    # -Timing uses (see the comment there for why).
    $buildDir = "C:\qtts-bench-build\q3-$variantLower-$($Configuration.ToLowerInvariant())"
    $exe = Join-Path $buildDir "qwen3-tts-sidecar.exe"
    if (-not (Test-Path -LiteralPath $exe)) {
        throw "expected timing build at $exe -- run without -SkipBuild first"
    }
    return $exe
}

$variantsToRun = if ($Variant -eq "Both") { @("Cpu", "Vulkan") } else { @($Variant) }

foreach ($v in $variantsToRun) {
    Build-Variant -VariantName $v
}

$refWavPath = Join-Path $OutputDir "bench_reference.wav"
New-SyntheticReferenceWav -Path $refWavPath
Write-Host "reference clip: $refWavPath"

$profilePath = Join-Path $OutputDir "bench_profile.q3sp"
$firstVariant = $variantsToRun[0]
$firstExe = Get-VariantExe -VariantName $firstVariant

Write-Host "`n=== Resolving shared speaker embedding via $firstVariant (profile_new) ===" -ForegroundColor Cyan
$profileItems = @(@{
    id = "warmup"
    text = $Texts[0]
    output_path = (Join-Path $OutputDir "warmup.wav")
    language_id = 2055
    max_audio_tokens = $MaxAudioTokens
})
$profileJobPath = Join-Path $OutputDir "job_profile_new.json"
$profileSource = '{"mode":"profile_new","reference_wav_path":"' + (ConvertTo-JsonPathString $refWavPath) + '","save_q3sp_path":"' + (ConvertTo-JsonPathString $profilePath) + '"}'
Write-JobFile -Path $profileJobPath -TransformerPath $transformerPath -TokenizerPath $tokenizerPath -SourceJson $profileSource -Items $profileItems
Invoke-SidecarJob -ExePath $firstExe -Backend $firstVariant.ToLowerInvariant() -JobPath $profileJobPath -LogPrefix (Join-Path $OutputDir "profile_new_$firstVariant") | Out-Null
if (-not (Test-Path -LiteralPath $profilePath)) {
    throw "profile_new run did not produce $profilePath -- check $OutputDir\profile_new_$firstVariant.stderr.log"
}

$allResults = @{}

foreach ($v in $variantsToRun) {
    Write-Host "`n=== Benchmarking $v (profile_existing, $($Texts.Count) items) ===" -ForegroundColor Cyan
    $exe = Get-VariantExe -VariantName $v
    $items = @()
    for ($i = 0; $i -lt $Texts.Count; $i++) {
        $items += @{
            id = "item$i"
            text = $Texts[$i]
            output_path = (Join-Path $OutputDir "$($v.ToLowerInvariant())_item$i.wav")
            language_id = 2055
            max_audio_tokens = $MaxAudioTokens
        }
    }
    $jobPath = Join-Path $OutputDir "job_bench_$v.json"
    $source = '{"mode":"profile_existing","existing_q3sp_path":"' + (ConvertTo-JsonPathString $profilePath) + '"}'
    Write-JobFile -Path $jobPath -TransformerPath $transformerPath -TokenizerPath $tokenizerPath -SourceJson $source -Items $items

    $logPrefix = Join-Path $OutputDir "bench_$v"
    $run = Invoke-SidecarJob -ExePath $exe -Backend $v.ToLowerInvariant() -JobPath $jobPath -LogPrefix $logPrefix
    $stderrText = Get-Content -LiteralPath $run.Stderr -Raw
    $loadMs = Get-LoadModelElapsedMs -StdoutPath $run.Stdout
    $device = Get-Device -StdoutPath $run.Stdout
    $items = Parse-TimingBlocks -StderrText $stderrText

    $allResults[$v] = @{
        Device = $device
        LoadMs = $loadMs
        Items = $items
    }
}

Write-Host "`n=== Results ===" -ForegroundColor Green
foreach ($v in $variantsToRun) {
    $r = $allResults[$v]
    Write-Host "`n--- $v ($($r.Device)) ---"
    Write-Host ("  Model load:        {0,8} ms" -f $r.LoadMs)
    if ($r.Items.Count -eq 0) {
        Write-Host "  (no per-item timing parsed -- check bench_$v.stderr.log)"
        continue
    }
    $avgMsPerFrame = ($r.Items | Where-Object { $_.MsPerFrame } | ForEach-Object { $_.MsPerFrame } | Measure-Object -Average).Average
    $avgFramesPerSec = ($r.Items | Where-Object { $_.FramesPerSec } | ForEach-Object { $_.FramesPerSec } | Measure-Object -Average).Average
    $avgTalkerCompute = ($r.Items | Where-Object { $_.TalkerComputeMsAvg } | ForEach-Object { $_.TalkerComputeMsAvg } | Measure-Object -Average).Average
    $avgCodePredCompute = ($r.Items | Where-Object { $_.CodePredComputeMsAvg } | ForEach-Object { $_.CodePredComputeMsAvg } | Measure-Object -Average).Average
    $avgEmbed = ($r.Items | Where-Object { $_.EmbedLookupMsAvg } | ForEach-Object { $_.EmbedLookupMsAvg } | Measure-Object -Average).Average
    $avgVocoder = ($r.Items | Where-Object { $_.VocoderDecodeMs } | ForEach-Object { $_.VocoderDecodeMs } | Measure-Object -Average).Average
    $avgRtf = ($r.Items | Where-Object { $_.RTF } | ForEach-Object { $_.RTF } | Measure-Object -Average).Average

    Write-Host ("  Generate ms/frame: {0,8:N2}   ({1:N1} frames/s)" -f $avgMsPerFrame, $avgFramesPerSec)
    Write-Host ("    Talker compute:  {0,8:N2} ms/frame" -f $avgTalkerCompute)
    Write-Host ("    Code-pred comp:  {0,8:N2} ms/frame" -f $avgCodePredCompute)
    Write-Host ("    Embed lookups:   {0,8:N2} ms/frame" -f $avgEmbed)
    Write-Host ("  Vocoder decode:    {0,8:N2} ms/item" -f $avgVocoder)
    Write-Host ("  RTF (generate+decode, <1.0 = faster than real-time): {0:N3}" -f $avgRtf)
}

if ($allResults.ContainsKey("Cpu") -and $allResults.ContainsKey("Vulkan")) {
    $cpuMs = ($allResults["Cpu"].Items | Where-Object { $_.MsPerFrame } | ForEach-Object { $_.MsPerFrame } | Measure-Object -Average).Average
    $vulkanMs = ($allResults["Vulkan"].Items | Where-Object { $_.MsPerFrame } | ForEach-Object { $_.MsPerFrame } | Measure-Object -Average).Average
    if ($cpuMs -and $vulkanMs) {
        $speedup = $cpuMs / $vulkanMs
        Write-Host "`nVulkan vs CPU generate speed: $([math]::Round($speedup, 2))x (>1.0 = Vulkan faster)" -ForegroundColor Yellow
    }
}

Write-Host "`nRaw logs kept under: $OutputDir"
