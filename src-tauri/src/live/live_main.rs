//! Lifecycle owner for the single live-domain pipeline.

use std::future::pending;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use log::{debug, error, info, warn};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, oneshot};

use crate::live::bootstrap_snapshot::{MonitorRuntimeSnapshot, load_monitor_runtime_snapshot};
use crate::live::history_writer::HistoryWriterHandle;
use crate::live::ipc::models::LiveScenePayload;
use crate::live::ipc::publisher::LivePublicationCache;
use crate::live::ipc::topic::Topic;
use crate::live::live_core::{LiveCore, LiveCoreFlow, Publications};
use crate::live::runtime::events::{MonoTimeMs, monotonic_now_ms};
use crate::live::runtime_handle::RuntimeCommand;
use crate::live::voice_runtime_config::load_voice_runtime_snapshot;
use crate::packets;
use crate::packets::packet_capture::CaptureMethod;
use crate::packets::packet_process::CAPTURE_PIPELINE_FENCE;
use crate::voice::models::VoiceRuntimeSnapshot;

const DECODE_CHANNEL_CAPACITY: usize = 4_096;

/// Runs the only owner of live domain state.
pub async fn start(
    app: AppHandle,
    mut commands: mpsc::Receiver<RuntimeCommand>,
    publication_cache: LivePublicationCache,
    history_writer: HistoryWriterHandle,
    history_join: std::thread::JoinHandle<()>,
) {
    let initial_config = load_monitor_runtime_snapshot(&app).unwrap_or_else(|| {
        info!(target: "app::live", "monitor runtime snapshot missing; using defaults");
        MonitorRuntimeSnapshot::default()
    });
    let initial_voice = load_voice_runtime_snapshot(&app).unwrap_or_else(|| {
        info!(target: "app::live", "voice runtime snapshot missing; voice stays off until the main window syncs");
        VoiceRuntimeSnapshot::default()
    });
    let mut core = match LiveCore::new(
        app.clone(),
        history_writer.clone(),
        initial_config,
        initial_voice,
    ) {
        Ok(core) => core,
        Err(error) => {
            error!(target: "app::live", "live_core_start_failed error={error}");
            let _ = history_writer.shutdown();
            let _ = history_join.join();
            return;
        }
    };

    let capture = packets::packet_capture::start_capture(get_capture_method(&app));
    let (capture_receiver, capture_worker, outstanding) = capture.into_parts();
    let (batch_sender, mut batches) = mpsc::channel(DECODE_CHANNEL_CAPACITY);
    let decoder_worker =
        packets::decode_worker::spawn_decode_worker(capture_receiver, batch_sender);

    let mut batches_open = true;
    let mut pending_command: Option<RuntimeCommand> = None;
    let mut shutdown_reply: Option<oneshot::Sender<Result<(), String>>> = None;
    let mut failure: Option<String> = None;

    match core.publish_now() {
        Ok(publications) => publish_publications(&app, &publication_cache, publications),
        Err(error) => {
            warn!(target: "app::live", "initial_snapshot_publish_failed error={error}");
        }
    }

    loop {
        if pending_command.is_some() && outstanding_count(&outstanding) == 0 {
            let command = pending_command.take().expect("checked above");
            let result = core.handle_command(command).map(|flow| match flow {
                LiveCoreFlow::Continue => {
                    publish_due(&app, &publication_cache, &mut core, monotonic_now_ms());
                    flow
                }
                LiveCoreFlow::ShutdownRequested { .. } => flow,
            });
            match result {
                Ok(LiveCoreFlow::Continue) => {
                    outstanding.store(0, Ordering::Release);
                    continue;
                }
                Ok(LiveCoreFlow::ShutdownRequested { reply }) => {
                    shutdown_reply = Some(reply);
                    break;
                }
                Err(error) => {
                    failure = Some(error);
                    break;
                }
            }
        }

        let wakeup = core.next_wakeup();
        tokio::select! {
            biased;

            command = commands.recv(), if pending_command.is_none() => {
                let Some(command) = command else {
                    info!(target: "app::live", "live control channel closed");
                    break;
                };
                close_capture_gate(&outstanding);
                pending_command = Some(command);
            }
            batch = batches.recv(), if batches_open => {
                match batch {
                    Some(batch) => {
                        let batch_time = batch.meta.mono_ms();
                        let result = core.process_batch(batch);
                        decrement_outstanding(&outstanding);
                        if let Err(error) = result {
                            failure = Some(error);
                            break;
                        }
                        publish_due(&app, &publication_cache, &mut core, batch_time);
                    }
                    None => {
                        batches_open = false;
                        info!(target: "app::live", "protocol batch channel closed");
                    }
                }
            }
            () = wait_for_wakeup(wakeup), if outstanding.load(Ordering::Acquire) == 0 => {
                if !claim_deadline_fence(&outstanding) {
                    continue;
                }
                let now = monotonic_now_ms();
                outstanding.store(0, Ordering::Release);
                publish_due(&app, &publication_cache, &mut core, now);
            }
        }
    }

    // Stopping capture closes decoder ingress. Continue consuming decoder
    // output until it closes so every envelope accepted before cancellation is
    // applied in capture order.
    if capture_worker.join().is_err() {
        record_failure(&mut failure, "packet capture worker panicked");
    }
    while let Some(batch) = batches.recv().await {
        if failure.is_none() {
            let batch_time = batch.meta.mono_ms();
            if let Err(error) = core.process_batch(batch) {
                record_failure(&mut failure, error);
            } else {
                publish_due(&app, &publication_cache, &mut core, batch_time);
            }
        }
        decrement_outstanding(&outstanding);
    }
    if decoder_worker.join().is_err() {
        record_failure(&mut failure, "protocol decoder worker panicked");
    }

    if let Err(error) = core.shutdown() {
        record_failure(&mut failure, error);
    } else {
        match core.publish_now() {
            Ok(publications) => publish_publications(&app, &publication_cache, publications),
            Err(error) => record_failure(&mut failure, error),
        }
    }
    if let Err(error) = history_writer.shutdown() {
        record_failure(&mut failure, error);
    }
    if history_join.join().is_err() {
        record_failure(&mut failure, "history writer panicked");
    }

    let result = failure.map_or(Ok(()), Err);
    if let Some(reply) = shutdown_reply {
        let _ = reply.send(result.clone());
    }
    match result {
        Ok(()) => info!(target: "app::live", "live runtime stopped cleanly"),
        Err(error) => error!(target: "app::live", "live runtime stopped with error={error}"),
    }
}

fn publish_due(
    app: &AppHandle,
    publication_cache: &LivePublicationCache,
    core: &mut LiveCore,
    now: MonoTimeMs,
) {
    let Ok(publications) = core.take_due_publications(now) else {
        return;
    };
    publish_publications(app, publication_cache, publications);
}

fn publish_publications(
    app: &AppHandle,
    publication_cache: &LivePublicationCache,
    publications: Publications,
) {
    if let Some(scene) = publication_cache.publish(publications.topics) {
        emit_scene(app, &scene);
    }
}

/// Scene is the only live topic that remains event-driven. It is tiny and must
/// continue reaching `main` while that window is hidden so the toolbox can
/// control the overlay auto-hide policy.
fn emit_scene(app: &AppHandle, payload: &LiveScenePayload) {
    let topic = Topic::Scene;
    let event = topic
        .event_name()
        .expect("scene is the only event-backed live topic");
    for label in topic.window_labels() {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };
        if let Err(error) = window.emit(event, payload) {
            let message = error.to_string();
            // 0x8007139F: webview minimized / hidden / mid-transition.
            if message.contains("0x8007139F") || message.contains("not in the correct state") {
                debug!(target: "app::live", "emit_skipped_webview_busy event={event} label={label}");
            } else {
                warn!(target: "app::live", "emit_failed event={event} label={label} error={message}");
            }
        }
    }
}

async fn wait_for_wakeup(deadline: Option<MonoTimeMs>) {
    let Some(deadline) = deadline else {
        pending::<()>().await;
        return;
    };
    let delay_ms = deadline.0.saturating_sub(monotonic_now_ms().0);
    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
}

fn decrement_outstanding(outstanding: &AtomicUsize) {
    let _ = outstanding.fetch_update(Ordering::AcqRel, Ordering::Acquire, |depth| {
        let count = depth & !CAPTURE_PIPELINE_FENCE;
        if count == 0 {
            None
        } else {
            Some((depth & CAPTURE_PIPELINE_FENCE) | (count - 1))
        }
    });
}

fn claim_deadline_fence(outstanding: &AtomicUsize) -> bool {
    outstanding
        .compare_exchange(
            0,
            CAPTURE_PIPELINE_FENCE,
            Ordering::AcqRel,
            Ordering::Acquire,
        )
        .is_ok()
}

fn close_capture_gate(outstanding: &AtomicUsize) {
    outstanding.fetch_or(CAPTURE_PIPELINE_FENCE, Ordering::AcqRel);
}

fn outstanding_count(outstanding: &AtomicUsize) -> usize {
    outstanding.load(Ordering::Acquire) & !CAPTURE_PIPELINE_FENCE
}

fn record_failure(failure: &mut Option<String>, error: impl Into<String>) {
    let error = error.into();
    if failure.is_none() {
        *failure = Some(error);
    } else {
        warn!(target: "app::live", "additional_shutdown_error error={error}");
    }
}

fn get_capture_method(app: &AppHandle) -> CaptureMethod {
    let filename_candidates = ["packetCapture.json", "packetCapture.bin", "packetCapture"];
    let mut dir_candidates = Vec::new();
    if let Ok(dir) = app.path().app_data_dir() {
        dir_candidates.push(dir.join("stores"));
        dir_candidates.push(dir);
    }
    if let Ok(dir) = app.path().app_local_data_dir() {
        dir_candidates.push(dir.join("stores"));
        dir_candidates.push(dir);
    }

    for dir in dir_candidates {
        for file_name in filename_candidates {
            let path = dir.join(file_name);
            if let Some(method) = read_capture_method(&path) {
                return method;
            }
        }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let is_candidate = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("packetCapture"));
                if is_candidate && let Some(method) = read_capture_method(&path) {
                    return method;
                }
            }
        }
    }

    warn!(target: "app::capture", "packet capture config missing; using WinDivert");
    CaptureMethod::WinDivert
}

fn read_capture_method(path: &Path) -> Option<CaptureMethod> {
    if !path.exists() {
        return None;
    }
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) => {
            warn!(target: "app::capture", "capture_config_open_failed path={} error={error}", path.display());
            return None;
        }
    };
    let json = match serde_json::from_reader::<_, serde_json::Value>(file) {
        Ok(json) => json,
        Err(error) => {
            warn!(target: "app::capture", "capture_config_parse_failed path={} error={error}", path.display());
            return None;
        }
    };
    Some(capture_method_from_json(&json, path))
}

fn capture_method_from_json(json: &serde_json::Value, path: &Path) -> CaptureMethod {
    let method = json.get("method").and_then(serde_json::Value::as_str);
    let device = json
        .get("npcapDevice")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let (capture_method, source) = resolve_capture_method(method, device);
    info!(
        target: "app::capture",
        "capture_config_loaded path={} method={} device={} source={}",
        path.display(),
        method.unwrap_or("<missing>"),
        device,
        source
    );
    capture_method
}

fn resolve_capture_method(method: Option<&str>, device: &str) -> (CaptureMethod, &'static str) {
    match method {
        Some("WinDivert") => (CaptureMethod::WinDivert, "explicit"),
        Some("Npcap") => (CaptureMethod::Npcap(device.to_string()), "explicit"),
        Some(_) | None if device.trim().is_empty() => {
            (CaptureMethod::WinDivert, "default_windivert")
        }
        Some(_) | None => (
            CaptureMethod::Npcap(device.to_string()),
            "legacy_npcap_device",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        claim_deadline_fence, close_capture_gate, decrement_outstanding, outstanding_count,
        resolve_capture_method,
    };
    use crate::packets::packet_capture::CaptureMethod;
    use crate::packets::packet_process::CAPTURE_PIPELINE_FENCE;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn assert_npcap(method: Option<&str>, device: &str) {
        match resolve_capture_method(method, device).0 {
            CaptureMethod::Npcap(actual) => assert_eq!(actual, device),
            CaptureMethod::WinDivert => panic!("expected Npcap"),
        }
    }

    fn assert_windivert(method: Option<&str>, device: &str) {
        match resolve_capture_method(method, device).0 {
            CaptureMethod::WinDivert => {}
            CaptureMethod::Npcap(actual) => panic!("expected WinDivert, got Npcap({actual})"),
        }
    }

    #[test]
    fn explicit_windivert_wins() {
        assert_windivert(Some("WinDivert"), "npcap-device");
    }

    #[test]
    fn explicit_npcap_wins() {
        assert_npcap(Some("Npcap"), "npcap-device");
    }

    #[test]
    fn legacy_npcap_device_selects_npcap() {
        assert_npcap(None, "npcap-device");
    }

    #[test]
    fn empty_or_missing_legacy_config_defaults_to_windivert() {
        assert_windivert(None, "");
        assert_windivert(None, "   ");
    }

    #[test]
    fn unknown_method_falls_back_by_device_presence() {
        assert_npcap(Some("Other"), "npcap-device");
        assert_windivert(Some("Other"), "");
    }

    #[test]
    fn deadline_fence_only_claims_an_empty_capture_pipeline() {
        let outstanding = AtomicUsize::new(0);
        assert!(claim_deadline_fence(&outstanding));
        assert_eq!(outstanding.load(Ordering::Acquire), CAPTURE_PIPELINE_FENCE);
        assert!(!claim_deadline_fence(&outstanding));
        decrement_outstanding(&outstanding);
        assert_eq!(outstanding.load(Ordering::Acquire), CAPTURE_PIPELINE_FENCE);

        outstanding.store(2, Ordering::Release);
        assert!(!claim_deadline_fence(&outstanding));
        decrement_outstanding(&outstanding);
        assert_eq!(outstanding.load(Ordering::Acquire), 1);
    }

    #[test]
    fn command_gate_blocks_new_capture_while_existing_batches_drain() {
        let outstanding = AtomicUsize::new(2);
        close_capture_gate(&outstanding);
        assert_eq!(outstanding_count(&outstanding), 2);
        assert_eq!(
            outstanding.load(Ordering::Acquire) & CAPTURE_PIPELINE_FENCE,
            CAPTURE_PIPELINE_FENCE
        );

        decrement_outstanding(&outstanding);
        decrement_outstanding(&outstanding);
        assert_eq!(outstanding_count(&outstanding), 0);
        assert_eq!(outstanding.load(Ordering::Acquire), CAPTURE_PIPELINE_FENCE);
    }
}
