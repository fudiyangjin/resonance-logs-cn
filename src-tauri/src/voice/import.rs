//! Imports arbitrary user audio into the phrase library.
//!
//! Any container rodio can decode (wav/mp3/flac/ogg/m4a) is decoded to
//! `f32`, downmixed to mono, resampled to the catalog rate and written back
//! out as a canonical 16-bit PCM WAV, so the playback worker and
//! `audio::read_wav_info` see exactly the same shape of file as generated
//! takes.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::num::NonZero;
use std::path::Path;

use rodio::source::UniformSourceIterator;
use rodio::{Decoder, Source};
use sha2::{Digest, Sha256};

use super::error::{VoiceError, VoiceResult};

pub const IMPORT_SAMPLE_RATE: u32 = 24_000;
pub const MAX_IMPORT_FILE_BYTES: u64 = 50 * 1024 * 1024;
pub const MIN_IMPORT_DURATION_SEC: f64 = 0.2;
pub const MAX_IMPORT_DURATION_SEC: f64 = 30.0;

const IMPORT_PATH_FIELD: &str = "importPath";

/// Decoded, normalized clip ready to be written into the catalog.
#[derive(Debug, Clone)]
pub struct ImportedClip {
    /// Mono PCM16 at [`IMPORT_SAMPLE_RATE`].
    pub samples: Vec<i16>,
    pub duration_sec: f64,
    /// SHA-256 of the *source file bytes* (not the normalized PCM), so the
    /// same file imported on another machine yields the same identity.
    pub sha256: String,
}

/// Reads, hashes and decodes `path`, producing mono PCM16 at the catalog
/// sample rate.
///
/// # Errors
/// `Validation` for oversized, undecodable or out-of-range-duration input;
/// `Io` for filesystem failures.
pub fn decode_and_normalize(path: &Path) -> VoiceResult<ImportedClip> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| VoiceError::io(format!("inspect {}", path.display()), e))?;
    if !metadata.is_file() {
        return Err(VoiceError::validation(
            IMPORT_PATH_FIELD,
            "not a regular file",
        ));
    }
    if metadata.len() > MAX_IMPORT_FILE_BYTES {
        return Err(VoiceError::validation(
            IMPORT_PATH_FIELD,
            format!(
                "audio file too large ({} bytes, max {})",
                metadata.len(),
                MAX_IMPORT_FILE_BYTES
            ),
        ));
    }

    let sha256 = hash_file(path)?;

    let file =
        File::open(path).map_err(|e| VoiceError::io(format!("open {}", path.display()), e))?;
    let decoder = Decoder::new(BufReader::new(file)).map_err(|e| {
        VoiceError::validation(
            IMPORT_PATH_FIELD,
            format!("unsupported or corrupt audio: {e}"),
        )
    })?;
    let samples = normalize(decoder);
    let duration_sec = samples.len() as f64 / f64::from(IMPORT_SAMPLE_RATE);
    if !(MIN_IMPORT_DURATION_SEC..=MAX_IMPORT_DURATION_SEC).contains(&duration_sec) {
        return Err(VoiceError::validation(
            IMPORT_PATH_FIELD,
            format!(
                "audio duration {duration_sec:.2}s out of allowed range [{MIN_IMPORT_DURATION_SEC}, {MAX_IMPORT_DURATION_SEC}]"
            ),
        ));
    }
    Ok(ImportedClip {
        samples,
        duration_sec,
        sha256,
    })
}

/// Downmixes to mono, resamples to [`IMPORT_SAMPLE_RATE`] and quantizes to
/// PCM16. Generic over the source so tests can feed synthetic signals.
fn normalize<S>(source: S) -> Vec<i16>
where
    S: Source<Item = f32>,
{
    let mono = NonZero::new(1u16).expect("1 is non-zero");
    let rate = NonZero::new(IMPORT_SAMPLE_RATE).expect("sample rate is non-zero");
    UniformSourceIterator::new(source, mono, rate)
        .map(|sample| (sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)).round() as i16)
        .collect()
}

fn hash_file(path: &Path) -> VoiceResult<String> {
    let mut file =
        File::open(path).map_err(|e| VoiceError::io(format!("open {}", path.display()), e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buf)
            .map_err(|e| VoiceError::io(format!("read {}", path.display()), e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Writes `samples` as a canonical 44-byte-header mono PCM16 RIFF/WAVE file.
pub fn write_pcm16_wav(path: &Path, samples: &[i16], sample_rate: u32) -> VoiceResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| VoiceError::io(format!("create {}", parent.display()), e))?;
    }
    let file =
        File::create(path).map_err(|e| VoiceError::io(format!("create {}", path.display()), e))?;
    let mut out = BufWriter::new(file);
    let write_err = |e| VoiceError::io(format!("write {}", path.display()), e);

    let channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let block_align = channels * bits_per_sample / 8;
    let byte_rate = sample_rate * u32::from(block_align);
    let data_bytes = u32::try_from(samples.len() * usize::from(block_align)).map_err(|_| {
        VoiceError::validation(IMPORT_PATH_FIELD, "audio too long for a WAV container")
    })?;

    out.write_all(b"RIFF").map_err(write_err)?;
    out.write_all(&(36 + data_bytes).to_le_bytes())
        .map_err(write_err)?;
    out.write_all(b"WAVE").map_err(write_err)?;
    out.write_all(b"fmt ").map_err(write_err)?;
    out.write_all(&16u32.to_le_bytes()).map_err(write_err)?;
    out.write_all(&1u16.to_le_bytes()).map_err(write_err)?; // PCM
    out.write_all(&channels.to_le_bytes()).map_err(write_err)?;
    out.write_all(&sample_rate.to_le_bytes())
        .map_err(write_err)?;
    out.write_all(&byte_rate.to_le_bytes()).map_err(write_err)?;
    out.write_all(&block_align.to_le_bytes())
        .map_err(write_err)?;
    out.write_all(&bits_per_sample.to_le_bytes())
        .map_err(write_err)?;
    out.write_all(b"data").map_err(write_err)?;
    out.write_all(&data_bytes.to_le_bytes())
        .map_err(write_err)?;
    for sample in samples {
        out.write_all(&sample.to_le_bytes()).map_err(write_err)?;
    }
    out.flush().map_err(write_err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;

    fn sine(rate: u32, channels: u16, seconds: f32) -> SamplesBuffer {
        let frames = (rate as f32 * seconds) as usize;
        let mut data = Vec::with_capacity(frames * usize::from(channels));
        for frame in 0..frames {
            let t = frame as f32 / rate as f32;
            let value = (t * 440.0 * std::f32::consts::TAU).sin() * 0.5;
            for _ in 0..channels {
                data.push(value);
            }
        }
        SamplesBuffer::new(
            NonZero::new(channels).unwrap(),
            NonZero::new(rate).unwrap(),
            data,
        )
    }

    #[test]
    fn normalize_downmixes_and_resamples() {
        let samples = normalize(sine(48_000, 2, 1.0));
        let duration = samples.len() as f64 / f64::from(IMPORT_SAMPLE_RATE);
        assert!((duration - 1.0).abs() < 0.01, "duration {duration}");
        assert!(samples.iter().any(|s| *s > 10_000));
        assert!(samples.iter().all(|s| s.unsigned_abs() <= 16_384 + 64));
    }

    #[test]
    fn wav_roundtrip_is_readable_by_catalog_reader_and_importer() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("clip.wav");
        let samples = normalize(sine(44_100, 1, 0.5));
        write_pcm16_wav(&path, &samples, IMPORT_SAMPLE_RATE).unwrap();

        let info = crate::voice::audio::read_wav_info(&path).unwrap();
        assert_eq!(info.sample_rate, IMPORT_SAMPLE_RATE);
        assert_eq!(info.channels, 1);
        assert_eq!(info.bits_per_sample, 16);
        assert!((info.duration_sec - 0.5).abs() < 0.01);

        let clip = decode_and_normalize(&path).unwrap();
        assert!((clip.duration_sec - 0.5).abs() < 0.01);
        assert_eq!(clip.sha256.len(), 64);
    }

    #[test]
    fn rejects_out_of_range_duration_and_garbage() {
        let dir = tempfile::tempdir().unwrap();
        let short = dir.path().join("short.wav");
        write_pcm16_wav(
            &short,
            &normalize(sine(24_000, 1, 0.05)),
            IMPORT_SAMPLE_RATE,
        )
        .unwrap();
        assert!(matches!(
            decode_and_normalize(&short),
            Err(VoiceError::Validation { .. })
        ));

        let garbage = dir.path().join("garbage.bin");
        std::fs::write(&garbage, b"definitely not audio").unwrap();
        assert!(matches!(
            decode_and_normalize(&garbage),
            Err(VoiceError::Validation { .. })
        ));
    }
}
