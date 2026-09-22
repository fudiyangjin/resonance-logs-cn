//! Exercise the actual Tauri transport, signature verifier and installer parser.
//! Fixtures are deliberately NOT executable installers; tests must never exit.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;

use base64::{Engine, engine::general_purpose::STANDARD};
use ed25519_dalek::{Signer, SigningKey};
use tauri_plugin_updater::UpdaterExt;

use super::{UpdatePhase, UpdateState};

fn sign_fixture(bytes: &[u8]) -> (String, String) {
    let key = SigningKey::from_bytes(&[17; 32]);
    let key_id = [42; 8];
    let mut public = b"Ed".to_vec();
    public.extend(key_id);
    public.extend(key.verifying_key().as_bytes());
    let signature = key.sign(bytes).to_bytes();
    let mut packet = b"Ed".to_vec();
    packet.extend(key_id);
    packet.extend(signature);
    let comment = "timestamp:1234\tfile:fixture";
    let mut trusted = signature.to_vec();
    trusted.extend(comment.as_bytes());
    (
        STANDARD.encode(format!(
            "untrusted comment: test key\n{}\n",
            STANDARD.encode(public)
        )),
        STANDARD.encode(format!(
            "untrusted comment: test signature\n{}\ntrusted comment: {comment}\n{}\n",
            STANDARD.encode(packet),
            STANDARD.encode(key.sign(&trusted).to_bytes())
        )),
    )
}

/// Two HTTP requests: a manifest followed by the installer. Connection-close
/// framing deliberately exercises download servers without Content-Length.
async fn fixture_release(
    bytes: Vec<u8>,
    signed_bytes: &[u8],
    code: u16,
) -> (tauri_plugin_updater::Update, Arc<AtomicBool>) {
    let (public_key, signature) = sign_fixture(signed_bytes);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let manifest = serde_json::to_vec(&serde_json::json!({
        "version": "99.0.0",
        "url": format!("http://{address}/installer"),
        "signature": signature,
    }))
    .unwrap();
    listener.set_nonblocking(true).unwrap();
    std::thread::spawn(move || {
        for body in [manifest, bytes] {
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        if std::time::Instant::now() > deadline {
                            return;
                        }
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("fixture server failed: {error}"),
                }
            };
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = [0; 4096];
            let length = stream.read(&mut request).unwrap();
            let is_installer =
                String::from_utf8_lossy(&request[..length]).starts_with("GET /installer ");
            let response_code = if is_installer { code } else { 200 };
            write!(
                stream,
                "HTTP/1.1 {response_code} Fixture\r\nConnection: close\r\n\r\n"
            )
            .unwrap();
            stream.write_all(&body).unwrap();
        }
    });

    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({ "pubkey": public_key }),
    );
    let app = tauri::test::mock_builder()
        .plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(public_key)
                .build(),
        )
        .build(context)
        .unwrap();
    let exited = Arc::new(AtomicBool::new(false));
    let exit_flag = exited.clone();
    let release = app
        .updater_builder()
        .endpoints(vec![format!("http://{address}/manifest").parse().unwrap()])
        .unwrap()
        .configure_client(|client| client.no_proxy())
        .timeout(Duration::from_secs(5))
        .on_before_exit(move || {
            exit_flag.store(true, Ordering::Relaxed);
        })
        .build()
        .unwrap()
        .check()
        .await
        .unwrap()
        .unwrap();
    (release, exited)
}

#[tokio::test]
async fn missing_length_download_and_corrupt_installer_leave_exit_hook_untouched() {
    let bytes = b"signed but not a Windows installer";
    let (release, exited) = fixture_release(bytes.to_vec(), bytes, 200).await;
    let mut downloaded = 0;
    let result = release
        .download(
            |length, total| {
                downloaded += length;
                assert_eq!(total, None);
            },
            || {},
        )
        .await
        .unwrap();
    assert_eq!(downloaded, bytes.len());
    assert_eq!(result, bytes);
    assert!(release.install(result).is_err());
    assert!(!exited.load(Ordering::Relaxed));

    let mut state = UpdateState::default();
    state.release = Some(release);
    state.status.version = Some("99.0.0".into());
    state.transition(UpdatePhase::Available);
    assert!(state.begin_download().unwrap().is_some());
    assert!(state.begin_download().unwrap().is_none());
    state.fail("invalid installer".into());
    assert!(state.begin_download().unwrap().is_some());
}

#[tokio::test]
async fn corrupted_download_never_reaches_installation() {
    let (release, exited) = fixture_release(b"tampered".to_vec(), b"original", 200).await;
    assert!(release.download(|_, _| {}, || {}).await.is_err());
    assert!(!exited.load(Ordering::Relaxed));
}

#[tokio::test]
async fn failed_download_never_reaches_verification_or_exit() {
    let (release, exited) = fixture_release(b"offline".to_vec(), b"offline", 503).await;
    let mut verification_started = false;
    assert!(
        release
            .download(
                |_, _| {},
                || {
                    verification_started = true;
                }
            )
            .await
            .is_err()
    );
    assert!(!verification_started);
    assert!(!exited.load(Ordering::Relaxed));
}

#[test]
fn exit_save_preserves_pending_settings_without_persisting_live_mirrors_or_backups() {
    use tauri_plugin_svelte::ManagerExt;
    let directory = tempfile::tempdir().unwrap();
    let config_path = directory.path().join("settings.json");
    std::fs::write(&config_path, br#"{"existing":"kept"}"#).unwrap();
    let app = tauri::test::mock_builder()
        .plugin(
            tauri_plugin_svelte::Builder::default()
                .path(directory.path())
                .enable_debug_stores(false)
                .build(),
        )
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    app.with_store("settings", |store| {
        store.save_on_change(false);
        store.set("pending", "saved on update").unwrap();
    })
    .unwrap();
    app.with_store("liveMirror", |store| {
        store.save_on_change(false);
        store.save_on_exit(false);
        store.set("temporary", true).unwrap();
    })
    .unwrap();
    super::save_settings_on_exit(app.handle());
    let saved: serde_json::Value =
        serde_json::from_slice(&std::fs::read(config_path).unwrap()).unwrap();
    assert_eq!(saved["existing"], "kept");
    assert_eq!(saved["pending"], "saved on update");
    assert!(!directory.path().join("liveMirror.json").exists());
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
}
