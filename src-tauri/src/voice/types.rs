use std::fmt;
use std::path::{Component, Path};

use super::error::{VoiceError, VoiceResult};

const MAX_ID_LEN: usize = 96;

fn validate_component(field: &'static str, value: &str, max_len: usize) -> VoiceResult<()> {
    if value.is_empty() {
        return Err(VoiceError::validation(field, "must not be empty"));
    }
    if value.len() > max_len {
        return Err(VoiceError::validation(
            field,
            format!("must be at most {max_len} bytes"),
        ));
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(VoiceError::validation(
            field,
            "contains unsupported characters",
        ));
    }
    Ok(())
}

fn validate_identifier(field: &'static str, value: &str, max_len: usize) -> VoiceResult<()> {
    validate_component(field, value, max_len)?;
    if value.contains('.') {
        return Err(VoiceError::validation(field, "must not contain dots"));
    }
    Ok(())
}

fn validate_path_component(field: &'static str, value: &str, max_len: usize) -> VoiceResult<()> {
    validate_component(field, value, max_len)?;
    let mut components = Path::new(value).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err(VoiceError::security(format!(
            "{field} is not a single path component: {value}"
        )));
    }
    let stem = value
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    ) || value.ends_with('.')
        || value.ends_with(' ')
    {
        return Err(VoiceError::security(format!(
            "{field} is reserved on Windows: {value}"
        )));
    }
    Ok(())
}

macro_rules! id_type {
    ($name:ident, $field:literal, $validator:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, Hash)]
        pub struct $name(String);

        impl $name {
            pub fn parse(value: impl Into<String>) -> VoiceResult<Self> {
                let value = value.into();
                $validator($field, &value, MAX_ID_LEN)?;
                Ok(Self(value))
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }

            pub fn into_inner(self) -> String {
                self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }
    };
}

id_type!(PhraseId, "phraseId", validate_identifier);
id_type!(ProfileId, "profileId", validate_identifier);
id_type!(AssetId, "assetId", validate_identifier);
id_type!(ModelVersion, "modelVersion", validate_path_component);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Sha256Hex(String);

impl Sha256Hex {
    pub fn parse(value: impl Into<String>) -> VoiceResult<Self> {
        let value = value.into();
        if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(VoiceError::validation(
                "sha256",
                "must contain exactly 64 hexadecimal characters",
            ));
        }
        Ok(Self(value.to_ascii_lowercase()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_inner(self) -> String {
        self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ManifestFileName(String);

impl ManifestFileName {
    pub fn parse(value: impl Into<String>) -> VoiceResult<Self> {
        let value = value.into();
        validate_path_component("manifest.files[].name", &value, 160)?;
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_inner(self) -> String {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_like_manifest_names() {
        for value in [
            "../model.gguf",
            "sub/model.gguf",
            r"sub\model.gguf",
            "C:model.gguf",
        ] {
            assert!(ManifestFileName::parse(value).is_err(), "accepted {value}");
        }
    }

    #[test]
    fn validates_sha256() {
        let valid = "a".repeat(64);
        assert_eq!(Sha256Hex::parse(valid.clone()).unwrap().as_str(), valid);
        assert!(Sha256Hex::parse("abc").is_err());
    }

    #[test]
    fn rejects_unsafe_model_versions_and_ambiguous_ids() {
        for value in [".", "..", "CON", "version/"] {
            assert!(ModelVersion::parse(value).is_err(), "accepted {value}");
        }
        assert!(ModelVersion::parse("qwen3-tts.0.6b-v1").is_ok());
        assert!(PhraseId::parse("phrase.with.dot").is_err());
        assert!(PhraseId::parse("phrase_safe-1").is_ok());
    }
}
