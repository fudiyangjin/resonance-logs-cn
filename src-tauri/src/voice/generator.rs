//! Sidecar probing and one-shot batch process orchestration.

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use log::warn;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Runtime};
use tokio_util::sync::CancellationToken;

use super::error::{VoiceError, VoiceResult};
use super::models::{
    EngineBackend, EngineProbe, FineTunedModelInspection, SIDECAR_PROTOCOL_VERSION, SidecarEvent,
    SidecarJob, VoiceGenerationProgress, VoiceLanguage,
};

pub const VOICE_GENERATION_PROGRESS_EVENT: &str = "voice-generation-progress";
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Default)]
pub struct ProfileExtractionMeta {
    pub embedding_dim: u32,
    pub model_sha256: String,
    pub ref_audio_sha256: String,
}

#[derive(Debug)]
pub struct ItemResult {
    pub id: String,
    pub ok: bool,
    pub output_path: Option<String>,
    pub duration_sec: Option<f64>,
    pub sample_rate: Option<i32>,
    pub error: Option<String>,
}

#[derive(Debug, Default)]
pub struct GenerationOutcome {
    pub completed: u32,
    pub failed: u32,
    pub profile_meta: Option<ProfileExtractionMeta>,
    pub item_results: Vec<ItemResult>,
}

pub trait SidecarRunner: Send + Sync {
    fn probe(&self, sidecar_path: &Path) -> VoiceResult<EngineProbe>;

    fn inspect_model(
        &self,
        sidecar_path: &Path,
        model_path: &Path,
    ) -> VoiceResult<FineTunedModelInspection>;

    fn run_batch(
        &self,
        app_handle: &AppHandle,
        sidecar_path: &Path,
        backend: EngineBackend,
        job: &SidecarJob,
        job_file_path: &Path,
        cancel: &CancellationToken,
        pid_slot: &Arc<Mutex<Option<u32>>>,
    ) -> VoiceResult<GenerationOutcome>;
}

#[derive(Debug, Default)]
pub struct ProcessSidecarRunner;

impl SidecarRunner for ProcessSidecarRunner {
    fn probe(&self, sidecar_path: &Path) -> VoiceResult<EngineProbe> {
        probe_sidecar(sidecar_path)
    }

    fn inspect_model(
        &self,
        sidecar_path: &Path,
        model_path: &Path,
    ) -> VoiceResult<FineTunedModelInspection> {
        inspect_fine_tuned_model(sidecar_path, model_path)
    }

    fn run_batch(
        &self,
        app_handle: &AppHandle,
        sidecar_path: &Path,
        backend: EngineBackend,
        job: &SidecarJob,
        job_file_path: &Path,
        cancel: &CancellationToken,
        pid_slot: &Arc<Mutex<Option<u32>>>,
    ) -> VoiceResult<GenerationOutcome> {
        run_batch_job(
            app_handle,
            sidecar_path,
            backend,
            job,
            job_file_path,
            cancel,
            pid_slot,
        )
    }
}

pub fn inspect_fine_tuned_model(
    sidecar_path: &Path,
    model_path: &Path,
) -> VoiceResult<FineTunedModelInspection> {
    let mut command = Command::new(sidecar_path);
    command
        .arg("--inspect-model")
        .arg(model_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_window(&mut command);
    let output = command.output().map_err(|error| {
        VoiceError::Process(format!("failed to inspect fine-tuned GGUF: {error}"))
    })?;
    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let details = if stdout.trim().is_empty() {
            stderr.trim()
        } else {
            stdout.trim()
        };
        return Err(VoiceError::Incompatible(details.to_string()));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| VoiceError::json("parse fine-tuned GGUF inspection", error))
}

pub fn probe_sidecar(sidecar_path: &Path) -> VoiceResult<EngineProbe> {
    let mut command = Command::new(sidecar_path);
    command
        .arg("--probe")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_window(&mut command);
    execute_probe_command(command, PROBE_TIMEOUT)
}

fn execute_probe_command(mut command: Command, timeout: Duration) -> VoiceResult<EngineProbe> {
    let mut child = command
        .spawn()
        .map_err(|error| VoiceError::Process(format!("failed to start sidecar probe: {error}")))?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(VoiceError::Process("sidecar probe timed out".to_string()));
            }
            Err(error) => {
                return Err(VoiceError::Process(format!(
                    "failed to wait for sidecar probe: {error}"
                )));
            }
        }
    }
    let output = child.wait_with_output().map_err(|error| {
        VoiceError::Process(format!("failed to collect sidecar probe output: {error}"))
    })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let details = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        return Err(VoiceError::Process(format!(
            "sidecar probe exited with {}: {}",
            output.status, details
        )));
    }
    let probe: EngineProbe = serde_json::from_slice(&output.stdout)
        .map_err(|error| VoiceError::json("parse sidecar probe response", error))?;
    validate_probe(&probe)?;
    Ok(probe)
}

fn validate_probe(probe: &EngineProbe) -> VoiceResult<()> {
    if probe.stub {
        return Err(VoiceError::Incompatible(
            "placeholder sidecar cannot provide TTS".to_string(),
        ));
    }
    if probe.engine != "qwen3-tts-sidecar" {
        return Err(VoiceError::Incompatible(format!(
            "unexpected sidecar engine: {}",
            probe.engine
        )));
    }
    if probe.protocol_version != SIDECAR_PROTOCOL_VERSION {
        return Err(VoiceError::Incompatible(format!(
            "sidecar protocol {} is incompatible with host protocol {SIDECAR_PROTOCOL_VERSION}",
            probe.protocol_version
        )));
    }
    for language in [
        VoiceLanguage::ZhCn,
        VoiceLanguage::EnUs,
        VoiceLanguage::JaJp,
    ] {
        if !probe.supported_languages.contains(&language) {
            return Err(VoiceError::Incompatible(format!(
                "sidecar does not support required language {language:?}"
            )));
        }
    }
    Ok(())
}

pub fn run_batch_job(
    app_handle: &AppHandle,
    sidecar_path: &Path,
    backend: EngineBackend,
    job: &SidecarJob,
    job_file_path: &Path,
    cancel: &CancellationToken,
    pid_slot: &Arc<Mutex<Option<u32>>>,
) -> VoiceResult<GenerationOutcome> {
    let job_json = serde_json::to_vec_pretty(job)
        .map_err(|error| VoiceError::json("serialize sidecar job", error))?;
    std::fs::write(job_file_path, &job_json).map_err(|error| {
        VoiceError::io(
            format!("write sidecar job {}", job_file_path.display()),
            error,
        )
    })?;

    let mut command = Command::new(sidecar_path);
    command
        .arg("--job")
        .arg(job_file_path)
        .arg("--backend")
        .arg(backend.as_str())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_window(&mut command);
    let mut child = command.spawn().map_err(|error| {
        VoiceError::Process(format!(
            "failed to start sidecar {}: {error}",
            sidecar_path.display()
        ))
    })?;
    *pid_slot.lock() = Some(child.id());
    let _pid_guard = PidSlotGuard {
        slot: Arc::clone(pid_slot),
    };
    drive_child(app_handle, &mut child, cancel, backend)
}

fn drive_child<R: Runtime>(
    app_handle: &AppHandle<R>,
    child: &mut Child,
    cancel: &CancellationToken,
    backend: EngineBackend,
) -> VoiceResult<GenerationOutcome> {
    drive_child_with_progress(child, cancel, backend, |progress| {
        emit_progress(app_handle, progress);
    })
}

fn drive_child_with_progress<F>(
    child: &mut Child,
    cancel: &CancellationToken,
    expected_backend: EngineBackend,
    mut emit: F,
) -> VoiceResult<GenerationOutcome>
where
    F: FnMut(VoiceGenerationProgress),
{
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| VoiceError::Process("sidecar stdout was not piped".to_string()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| VoiceError::Process("sidecar stderr was not piped".to_string()))?;
    let stderr_thread = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            warn!(target: "app::voice::sidecar", "{line}");
        }
    });

    let mut outcome = GenerationOutcome::default();
    let mut handshake_complete = false;
    for line in BufReader::new(stdout).lines() {
        if cancel.is_cancelled() {
            let _ = child.kill();
            break;
        }
        let line = line.map_err(|error| {
            VoiceError::Process(format!("failed to read sidecar output: {error}"))
        })?;
        if line.trim().is_empty() {
            continue;
        }
        let event: SidecarEvent = serde_json::from_str(&line).map_err(|error| {
            VoiceError::Process(format!("invalid sidecar JSONL event ({error}): {line}"))
        })?;
        match event {
            SidecarEvent::Hello {
                protocol_version,
                engine,
                source_commit: _,
                backend,
                device,
            } if !handshake_complete => {
                if protocol_version != SIDECAR_PROTOCOL_VERSION || engine != "qwen3-tts-sidecar" {
                    let _ = child.kill();
                    return Err(VoiceError::Incompatible(format!(
                        "sidecar batch handshake is incompatible: engine={engine}, protocol={protocol_version}"
                    )));
                }
                if backend != expected_backend || device.trim().is_empty() {
                    let _ = child.kill();
                    return Err(VoiceError::Incompatible(format!(
                        "sidecar selected backend/device does not match request: requested={}, actual={}, device={device}",
                        expected_backend.as_str(),
                        backend.as_str()
                    )));
                }
                handshake_complete = true;
            }
            SidecarEvent::Hello { .. } => {
                let _ = child.kill();
                return Err(VoiceError::Process(
                    "sidecar emitted a duplicate handshake".to_string(),
                ));
            }
            _other if !handshake_complete => {
                let _ = child.kill();
                return Err(VoiceError::Incompatible(
                    "sidecar omitted the required batch handshake".to_string(),
                ));
            }
            other => handle_event(&mut outcome, other, &mut emit),
        }
    }

    let _ = stderr_thread.join();
    let status = child
        .wait()
        .map_err(|error| VoiceError::Process(format!("failed to wait for sidecar: {error}")))?;
    if cancel.is_cancelled() {
        return Err(VoiceError::Cancelled(
            "voice generation cancelled".to_string(),
        ));
    }
    if !handshake_complete {
        return Err(VoiceError::Incompatible(
            "sidecar exited without a protocol handshake".to_string(),
        ));
    }
    if !status.success() && outcome.item_results.is_empty() && outcome.profile_meta.is_none() {
        return Err(VoiceError::Process(format!(
            "sidecar exited with status {status}"
        )));
    }
    Ok(outcome)
}

fn handle_event<F>(outcome: &mut GenerationOutcome, event: SidecarEvent, emit: &mut F)
where
    F: FnMut(VoiceGenerationProgress),
{
    match event {
        SidecarEvent::Hello { .. } => {}
        SidecarEvent::Stage {
            stage,
            status,
            embedding_dim,
            model_sha256,
            ref_audio_sha256,
            error,
            ..
        } => {
            if stage == "source"
                && status == "done"
                && let Some(embedding_dim) = embedding_dim
            {
                outcome.profile_meta = Some(ProfileExtractionMeta {
                    embedding_dim,
                    model_sha256: model_sha256.unwrap_or_default(),
                    ref_audio_sha256: ref_audio_sha256.unwrap_or_default(),
                });
            }
            emit(VoiceGenerationProgress::Stage {
                stage,
                status,
                error,
            });
        }
        SidecarEvent::Item {
            id,
            status,
            output_path,
            duration_sec,
            sample_rate,
            error,
            ..
        } => {
            if status != "start" {
                let ok = status == "ok";
                if ok {
                    outcome.completed += 1;
                } else {
                    outcome.failed += 1;
                }
                outcome.item_results.push(ItemResult {
                    id: id.clone(),
                    ok,
                    output_path,
                    duration_sec: duration_sec.and_then(|value| value.as_f64()),
                    sample_rate,
                    error: error.clone(),
                });
            }
            emit(VoiceGenerationProgress::Item { id, status, error });
        }
        SidecarEvent::Batch {
            completed, failed, ..
        } => emit(VoiceGenerationProgress::Finished { completed, failed }),
        SidecarEvent::Fatal { error } => {
            emit(VoiceGenerationProgress::Fatal { error });
        }
    }
}

fn emit_progress<R: Runtime>(app_handle: &AppHandle<R>, progress: VoiceGenerationProgress) {
    if let Err(error) = app_handle.emit(VOICE_GENERATION_PROGRESS_EVENT, progress) {
        warn!(target: "app::voice", "failed to emit generation progress: {error}");
    }
}

fn hide_window(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

struct PidSlotGuard {
    slot: Arc<Mutex<Option<u32>>>,
}

impl Drop for PidSlotGuard {
    fn drop(&mut self) {
        *self.slot.lock() = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HELLO: &str = r#"{"type":"hello","protocol_version":3,"engine":"qwen3-tts-sidecar","source_commit":"test","backend":"cpu","device":"CPU"}"#;

    fn script_command(script: &str) -> Command {
        #[cfg(windows)]
        let mut command = {
            let mut command = Command::new("powershell.exe");
            command.args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                script,
            ]);
            command
        };
        #[cfg(not(windows))]
        let mut command = {
            let mut command = Command::new("sh");
            command.args(["-c", script]);
            command
        };
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        hide_window(&mut command);
        command
    }

    fn scripted_child(script: &str) -> Child {
        script_command(script).spawn().unwrap()
    }

    fn drive_script(script: &str, cancel: &CancellationToken) -> VoiceResult<GenerationOutcome> {
        let mut child = scripted_child(script);
        drive_child_with_progress(&mut child, cancel, EngineBackend::Cpu, |_| {})
    }

    #[test]
    fn rejects_stub_probe() {
        let probe = EngineProbe {
            engine: "qwen3-tts-sidecar".to_string(),
            protocol_version: SIDECAR_PROTOCOL_VERSION,
            source_commit: "test".to_string(),
            build_type: "debug".to_string(),
            variant: "cpu".to_string(),
            stub: true,
            compiled_backends: vec![EngineBackend::Cpu],
            devices: Vec::new(),
            supported_languages: vec![
                VoiceLanguage::ZhCn,
                VoiceLanguage::EnUs,
                VoiceLanguage::JaJp,
            ],
        };
        assert!(validate_probe(&probe).is_err());
    }

    #[test]
    fn probe_accepts_a_compatible_fake_sidecar() {
        #[cfg(windows)]
        let script = format!(
            r#"[Console]::Out.WriteLine('{{"engine":"qwen3-tts-sidecar","protocolVersion":{SIDECAR_PROTOCOL_VERSION},"sourceCommit":"test","buildType":"Release","variant":"cpu","stub":false,"compiledBackends":["cpu"],"devices":[],"supportedLanguages":["zhCn","enUs","jaJp"]}}')"#
        );
        #[cfg(not(windows))]
        let script = format!(
            r#"printf '%s\n' '{{"engine":"qwen3-tts-sidecar","protocolVersion":{SIDECAR_PROTOCOL_VERSION},"sourceCommit":"test","buildType":"Release","variant":"cpu","stub":false,"compiledBackends":["cpu"],"devices":[],"supportedLanguages":["zhCn","enUs","jaJp"]}}'"#
        );

        let probe = execute_probe_command(script_command(&script), Duration::from_secs(2)).unwrap();

        assert_eq!(probe.protocol_version, SIDECAR_PROTOCOL_VERSION);
        assert!(!probe.stub);
    }

    #[test]
    fn probe_rejects_protocol_mismatch_and_abnormal_exit() {
        #[cfg(windows)]
        let incompatible = r#"[Console]::Out.WriteLine('{"engine":"qwen3-tts-sidecar","protocolVersion":999,"sourceCommit":"test","buildType":"Release","variant":"cpu","stub":false,"compiledBackends":["cpu"],"devices":[],"supportedLanguages":["zhCn","enUs","jaJp"]}')"#;
        #[cfg(not(windows))]
        let incompatible = r#"printf '%s\n' '{"engine":"qwen3-tts-sidecar","protocolVersion":999,"sourceCommit":"test","buildType":"Release","variant":"cpu","stub":false,"compiledBackends":["cpu"],"devices":[],"supportedLanguages":["zhCn","enUs","jaJp"]}'"#;
        assert!(matches!(
            execute_probe_command(script_command(incompatible), Duration::from_secs(2)),
            Err(VoiceError::Incompatible(_))
        ));

        #[cfg(windows)]
        let abnormal = "[Console]::Error.WriteLine('failed'); exit 7";
        #[cfg(not(windows))]
        let abnormal = "printf '%s\\n' failed >&2; exit 7";
        assert!(matches!(
            execute_probe_command(script_command(abnormal), Duration::from_secs(2)),
            Err(VoiceError::Process(_))
        ));
    }

    #[test]
    fn probe_times_out_and_terminates_the_child() {
        #[cfg(windows)]
        let script = "Start-Sleep -Seconds 2";
        #[cfg(not(windows))]
        let script = "sleep 2";

        let started = Instant::now();
        let error =
            execute_probe_command(script_command(script), Duration::from_millis(50)).unwrap_err();

        assert!(matches!(error, VoiceError::Process(message) if message.contains("timed out")));
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn batch_rejects_incompatible_handshake_and_abnormal_exit() {
        #[cfg(windows)]
        let incompatible = r#"[Console]::Out.WriteLine('{"type":"hello","protocol_version":999,"engine":"qwen3-tts-sidecar","source_commit":"test","backend":"cpu","device":"CPU"}'); Start-Sleep -Seconds 2"#;
        #[cfg(not(windows))]
        let incompatible = r#"printf '%s\n' '{"type":"hello","protocol_version":999,"engine":"qwen3-tts-sidecar","source_commit":"test","backend":"cpu","device":"CPU"}'; sleep 2"#;
        assert!(matches!(
            drive_script(incompatible, &CancellationToken::new()),
            Err(VoiceError::Incompatible(_))
        ));

        #[cfg(windows)]
        let abnormal = format!("[Console]::Out.WriteLine('{}'); exit 7", HELLO);
        #[cfg(not(windows))]
        let abnormal = format!("printf '%s\\n' '{HELLO}'; exit 7");
        assert!(matches!(
            drive_script(&abnormal, &CancellationToken::new()),
            Err(VoiceError::Process(_))
        ));
    }

    #[test]
    fn batch_preserves_partial_results_after_abnormal_exit() {
        let item = r#"{"type":"item","id":"asset-1","status":"ok","output_path":"asset.wav","duration_sec":1.0,"sample_rate":24000}"#;
        #[cfg(windows)]
        let script = format!(
            "[Console]::Out.WriteLine('{}'); [Console]::Out.WriteLine('{}'); exit 7",
            HELLO, item
        );
        #[cfg(not(windows))]
        let script = format!("printf '%s\\n' '{HELLO}' '{item}'; exit 7");

        let outcome = drive_script(&script, &CancellationToken::new()).unwrap();

        assert_eq!(outcome.completed, 1);
        assert_eq!(outcome.item_results.len(), 1);
        assert!(outcome.item_results[0].ok);
        assert_eq!(outcome.item_results[0].duration_sec, Some(1.0));
    }

    #[test]
    fn batch_honors_preexisting_cancellation() {
        #[cfg(windows)]
        let script = format!(
            "[Console]::Out.WriteLine('{}'); Start-Sleep -Seconds 2",
            HELLO
        );
        #[cfg(not(windows))]
        let script = format!("printf '%s\\n' '{HELLO}'; sleep 2");
        let cancel = CancellationToken::new();
        cancel.cancel();

        assert!(matches!(
            drive_script(&script, &cancel),
            Err(VoiceError::Cancelled(_))
        ));
    }
}
