//! Typed Tauri commands for the voice feature.

use std::path::PathBuf;

use serde::Deserialize;
use specta::Type;
use tauri::State;

use super::error::{VoiceCommandError, VoiceError};
use super::model_manager::ModelDownloadSource;
use super::models::{
    FineTunedVoiceMeta, ModelState, VoiceGenerationBackend, VoiceLanguage, VoicePhraseMeta,
    VoiceStatus,
};
use super::types::{AssetId, ModelVersion, PhraseId, ProfileId};
use super::{
    GenerateItemRequest, GenerateRequest, GenerationSummary, ProfileSelection, ProfileSelectionNew,
    VoiceService, VoiceSourceSelection,
};

type CommandResult<T> = Result<T, VoiceCommandError>;

async fn run_blocking_voice_operation<T, F>(context: &'static str, operation: F) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, VoiceError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| {
            VoiceCommandError::from(VoiceError::Internal(format!(
                "{context} task failed: {error}"
            )))
        })?
        .map_err(VoiceCommandError::from)
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "mode"
)]
pub enum VoiceSourceSelectionDto {
    CloneNew {
        name: String,
        #[specta(rename = "referenceWavPath")]
        reference_wav_path: String,
        #[serde(default)]
        #[specta(rename = "keepReference")]
        keep_reference: bool,
    },
    CloneExisting {
        #[specta(rename = "profileId")]
        profile_id: String,
    },
    FineTuned,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VoiceGenerateRequestDto {
    pub source: VoiceSourceSelectionDto,
    pub phrase_ids: Vec<String>,
    #[serde(default)]
    pub backend_preference: VoiceGenerationBackend,
}

fn to_generate_request(dto: VoiceGenerateRequestDto) -> CommandResult<GenerateRequest> {
    if dto.phrase_ids.is_empty() {
        return Err(VoiceError::validation("phraseIds", "must not be empty").into());
    }
    let source = match dto.source {
        VoiceSourceSelectionDto::CloneNew {
            name,
            reference_wav_path,
            keep_reference,
        } => VoiceSourceSelection::Clone(ProfileSelection::New(ProfileSelectionNew {
            name,
            reference_wav_path,
            keep_reference,
        })),
        VoiceSourceSelectionDto::CloneExisting { profile_id } => {
            VoiceSourceSelection::Clone(ProfileSelection::Existing {
                profile_id: ProfileId::parse(profile_id).map_err(VoiceCommandError::from)?,
            })
        }
        VoiceSourceSelectionDto::FineTuned => VoiceSourceSelection::FineTuned,
    };
    let items = dto
        .phrase_ids
        .into_iter()
        .map(PhraseId::parse)
        .map(|result| result.map(|phrase_id| GenerateItemRequest { phrase_id }))
        .collect::<Result<Vec<_>, _>>()
        .map_err(VoiceCommandError::from)?;
    Ok(GenerateRequest {
        source,
        items,
        backend_preference: dto.backend_preference,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn voice_get_status(
    voice: State<'_, VoiceService>,
    force_refresh: bool,
) -> CommandResult<VoiceStatus> {
    Ok(voice.status(force_refresh).await)
}

#[tauri::command]
#[specta::specta]
pub async fn voice_install_model(
    voice: State<'_, VoiceService>,
    source: ModelDownloadSource,
) -> CommandResult<()> {
    voice
        .install_official_model(source)
        .await
        .map_err(VoiceCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn voice_cancel_model_download(voice: State<'_, VoiceService>) {
    voice.cancel_model_download();
}

#[tauri::command]
#[specta::specta]
pub async fn voice_manual_import_model(
    voice: State<'_, VoiceService>,
    model_version: String,
    source_files: Vec<String>,
) -> CommandResult<()> {
    let model_version = ModelVersion::parse(model_version).map_err(VoiceCommandError::from)?;
    let source_files = source_files.into_iter().map(PathBuf::from).collect();
    let service = voice.inner().clone();
    run_blocking_voice_operation("model import", move || {
        service.manual_import_model(model_version, source_files)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn voice_remove_model(
    voice: State<'_, VoiceService>,
    model_version: String,
) -> CommandResult<()> {
    let model_version = ModelVersion::parse(model_version).map_err(VoiceCommandError::from)?;
    let service = voice.inner().clone();
    run_blocking_voice_operation("model removal", move || service.remove_model(model_version)).await
}

#[tauri::command]
#[specta::specta]
pub async fn voice_verify_model(voice: State<'_, VoiceService>) -> CommandResult<ModelState> {
    let service = voice.inner().clone();
    run_blocking_voice_operation("model verification", move || service.verify_model()).await
}

#[tauri::command]
#[specta::specta]
pub async fn voice_inspect_finetuned_package(
    voice: State<'_, VoiceService>,
    package_path: String,
) -> CommandResult<FineTunedVoiceMeta> {
    let service = voice.inner().clone();
    run_blocking_voice_operation("fine-tuned package inspection", move || {
        service.inspect_fine_tuned_package(PathBuf::from(package_path).as_path())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn voice_set_finetuned_voice(
    voice: State<'_, VoiceService>,
    package_path: String,
    expected_sha256: String,
    replace_existing: bool,
) -> CommandResult<FineTunedVoiceMeta> {
    let service = voice.inner().clone();
    run_blocking_voice_operation("fine-tuned voice setup", move || {
        service.set_fine_tuned_voice(
            PathBuf::from(package_path).as_path(),
            &expected_sha256,
            replace_existing,
        )
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn voice_relink_finetuned_voice(
    voice: State<'_, VoiceService>,
    package_path: String,
    expected_sha256: String,
) -> CommandResult<FineTunedVoiceMeta> {
    let service = voice.inner().clone();
    run_blocking_voice_operation("fine-tuned voice relink", move || {
        service.relink_fine_tuned_voice(PathBuf::from(package_path).as_path(), &expected_sha256)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn voice_remove_finetuned_voice(voice: State<'_, VoiceService>) -> CommandResult<()> {
    let service = voice.inner().clone();
    run_blocking_voice_operation("fine-tuned voice removal", move || {
        service.remove_fine_tuned_voice()
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn voice_delete_profile(
    voice: State<'_, VoiceService>,
    profile_id: String,
) -> CommandResult<()> {
    let profile_id = ProfileId::parse(profile_id).map_err(VoiceCommandError::from)?;
    let service = voice.inner().clone();
    run_blocking_voice_operation("profile deletion", move || {
        service.delete_profile(profile_id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub fn voice_create_phrase(
    voice: State<'_, VoiceService>,
    name: String,
    text: String,
    language: VoiceLanguage,
) -> CommandResult<VoicePhraseMeta> {
    voice
        .create_phrase(name, text, language)
        .map_err(VoiceCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn voice_update_phrase(
    voice: State<'_, VoiceService>,
    id: String,
    name: String,
    text: String,
    language: VoiceLanguage,
) -> CommandResult<VoicePhraseMeta> {
    voice
        .update_phrase(
            PhraseId::parse(id).map_err(VoiceCommandError::from)?,
            name,
            text,
            language,
        )
        .map_err(VoiceCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub async fn voice_delete_phrase(voice: State<'_, VoiceService>, id: String) -> CommandResult<()> {
    let phrase_id = PhraseId::parse(id).map_err(VoiceCommandError::from)?;
    let service = voice.inner().clone();
    run_blocking_voice_operation("phrase deletion", move || service.delete_phrase(phrase_id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn voice_generate(
    voice: State<'_, VoiceService>,
    request: VoiceGenerateRequestDto,
) -> CommandResult<GenerationSummary> {
    let request = to_generate_request(request)?;
    let service = voice.inner().clone();
    run_blocking_voice_operation("generation", move || service.generate_blocking(request)).await
}

#[tauri::command]
#[specta::specta]
pub fn voice_cancel_generation(voice: State<'_, VoiceService>) {
    voice.cancel_generation();
}

#[tauri::command]
#[specta::specta]
pub fn voice_preview_asset(
    voice: State<'_, VoiceService>,
    phrase_id: String,
    asset_id: String,
) -> CommandResult<()> {
    voice
        .preview_asset(
            &PhraseId::parse(phrase_id).map_err(VoiceCommandError::from)?,
            &AssetId::parse(asset_id).map_err(VoiceCommandError::from)?,
        )
        .map_err(VoiceCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn voice_test_trigger(voice: State<'_, VoiceService>, phrase_id: String) -> CommandResult<()> {
    voice
        .test_trigger(&PhraseId::parse(phrase_id).map_err(VoiceCommandError::from)?)
        .map_err(VoiceCommandError::from)
}

/// Production playback entry point for frontend-detected cues (e.g. a
/// minimap mechanic edge), gated by the same enabled/volume/queue-policy
/// settings as backend rule-triggered cues. Unlike `voice_test_trigger`,
/// never errors on a missing/ungenerated asset: it falls back to a short
/// built-in tone instead.
#[tauri::command]
#[specta::specta]
pub fn voice_enqueue_phrase(
    voice: State<'_, VoiceService>,
    phrase_id: String,
    priority: u8,
) -> CommandResult<()> {
    voice.enqueue_phrase(
        &PhraseId::parse(phrase_id).map_err(VoiceCommandError::from)?,
        priority,
    );
    Ok(())
}

/// Creates-or-updates a phrase by `name`, used by the frontend voice
/// binding compiler so "auto"/"custom" bindings resolve to a stable phrase
/// id without the user visiting the phrase library manually.
#[tauri::command]
#[specta::specta]
pub fn voice_upsert_phrase(
    voice: State<'_, VoiceService>,
    name: String,
    text: String,
    language: VoiceLanguage,
) -> CommandResult<VoicePhraseMeta> {
    voice
        .upsert_phrase(name, text, language)
        .map_err(VoiceCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn voice_stop_playback(voice: State<'_, VoiceService>) {
    voice.stop_playback();
}
