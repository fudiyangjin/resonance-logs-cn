//! Imports arbitrary user audio into the phrase library.
//!
//! Any container rodio can decode (wav/mp3/flac/ogg/m4a) is decoded to
//! `f32`, downmixed to mono, resampled to the catalog rate and written back
//! out as a canonical 16-bit PCM WAV, so the playback worker and
//! `audio::read_wav_info` see exactly the same shape of file as generated
//! takes.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

use rodio::{Decoder, Source};
use sha2::{Digest, Sha256};

use super::error::{VoiceError, VoiceResult};

pub const IMPORT_SAMPLE_RATE: u32 = 24_000;
pub const MAX_IMPORT_FILE_BYTES: u64 = 50 * 1024 * 1024;
pub const MIN_IMPORT_DURATION_SEC: f64 = 0.2;
pub const MAX_IMPORT_DURATION_SEC: u32 = 30;

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
    let metadata = std::fs::metadata(path).map_err(|e| VoiceError::io_at("inspect", path, e))?;
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

    let file = File::open(path).map_err(|e| VoiceError::io_at("open", path, e))?;
    let decoder = Decoder::new(BufReader::new(file)).map_err(|e| {
        VoiceError::validation(
            IMPORT_PATH_FIELD,
            format!("unsupported or corrupt audio: {e}"),
        )
    })?;
    let samples = normalize(decoder)?;
    let duration_sec = samples.len() as f64 / f64::from(IMPORT_SAMPLE_RATE);
    Ok(ImportedClip {
        samples,
        duration_sec,
        sha256,
    })
}

/// Downmixes to mono, resamples to [`IMPORT_SAMPLE_RATE`] and quantizes to
/// PCM16. Generic over the source so tests can feed synthetic signals.
///
/// The whole clip is decoded first and resampled in a single pass. rodio's
/// `UniformSourceIterator` would instead rebuild its converter at every
/// decoder span (one per compressed packet), resetting the interpolation
/// phase and leaving audible discontinuities at packet boundaries.
fn normalize<S>(mut source: S) -> VoiceResult<Vec<i16>>
where
    S: Source<Item = f32>,
{
    let channels = usize::from(source.channels().get());
    let source_rate = source.sample_rate().get();
    let limit = u64::from(source_rate)
        .checked_mul(u64::from(MAX_IMPORT_DURATION_SEC))
        .and_then(|frames| usize::try_from(frames).ok())
        .ok_or_else(|| VoiceError::validation(IMPORT_PATH_FIELD, "audio frame limit overflow"))?;
    let invalid = |message| VoiceError::validation(IMPORT_PATH_FIELD, message);
    let mut mono = Vec::new();
    // Keep only mono frames. Check each decoded sample, including packet boundaries.
    'frames: loop {
        let mut sum = 0.0;
        for channel in 0..channels {
            let sample = source.next();
            if source.sample_rate().get() != source_rate
                || usize::from(source.channels().get()) != channels
            {
                return Err(invalid("audio format changed during decoding"));
            }
            let Some(sample) = sample else {
                if channel != 0 {
                    return Err(invalid("incomplete audio channel frame"));
                }
                break 'frames;
            };
            if mono.len() == limit {
                return Err(invalid("audio duration exceeds 30 seconds"));
            }
            sum += sample;
        }
        mono.push(sum / channels as f32);
    }
    if mono.len() as f64 / f64::from(source_rate) < MIN_IMPORT_DURATION_SEC {
        return Err(invalid("audio duration is shorter than 0.2 seconds"));
    }
    Ok(resample_linear(&mono, source_rate, IMPORT_SAMPLE_RATE)
        .map(|sample| (sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)).round() as i16)
        .collect())
}

/// Continuous interpolation, quantized without an intermediate resampled buffer.
fn resample_linear(input: &[f32], from_rate: u32, to_rate: u32) -> impl Iterator<Item = f32> + '_ {
    let out_len = ((input.len() as u64 * u64::from(to_rate)) / u64::from(from_rate)) as usize;
    let step = f64::from(from_rate) / f64::from(to_rate);
    (0..out_len).map(move |i| {
        let last = input.len() - 1;
        let pos = i as f64 * step;
        let idx = (pos as usize).min(last);
        let frac = (pos - idx as f64) as f32;
        let a = input[idx];
        let b = input[(idx + 1).min(last)];
        a + (b - a) * frac
    })
}

fn hash_file(path: &Path) -> VoiceResult<String> {
    let mut file = File::open(path).map_err(|e| VoiceError::io_at("open", path, e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buf)
            .map_err(|e| VoiceError::io_at("read", path, e))?;
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
        std::fs::create_dir_all(parent).map_err(|e| VoiceError::io_at("create", parent, e))?;
    }
    let file = File::create(path).map_err(|e| VoiceError::io_at("create", path, e))?;
    let mut out = BufWriter::new(file);
    let write_err = |e| VoiceError::io_at("write", path, e);

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
    use std::num::NonZero;

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
        let samples = normalize(sine(48_000, 2, 1.0)).unwrap();
        let duration = samples.len() as f64 / f64::from(IMPORT_SAMPLE_RATE);
        assert!((duration - 1.0).abs() < 0.01, "duration {duration}");
        assert!(samples.iter().any(|s| *s > 10_000));
        assert!(samples.iter().all(|s| s.unsigned_abs() <= 16_384 + 64));
    }

    #[test]
    fn resampled_sine_is_continuous_across_the_whole_clip() {
        // 3 s at 48 kHz stereo is well past rodio's 32768-sample span size,
        // so any per-span phase reset would show up as a jump here.
        let samples = normalize(sine(48_000, 2, 3.0)).unwrap();
        // 440 Hz at amplitude 0.5 sampled at 24 kHz: max slope per sample is
        // 0.5 * 2π * 440 / 24000 ≈ 0.0576 → ~1887 PCM16 units; allow slack.
        let max_step = 2_400;
        for (i, pair) in samples.windows(2).enumerate() {
            let step = (i32::from(pair[1]) - i32::from(pair[0])).abs();
            assert!(step <= max_step, "discontinuity at sample {i}: step {step}");
        }
        assert!((samples.len() as f64 / f64::from(IMPORT_SAMPLE_RATE) - 3.0).abs() < 0.01);
    }

    #[test]
    fn resample_linear_handles_identity_and_ratio() {
        let input: Vec<f32> = (0..10).map(|i| i as f32).collect();
        assert_eq!(resample_linear(&input, 100, 100).collect::<Vec<_>>(), input);
        let half: Vec<_> = resample_linear(&input, 100, 50).collect();
        assert_eq!(half.len(), 5);
        assert_eq!(half, vec![0.0, 2.0, 4.0, 6.0, 8.0]);
        let double: Vec<_> = resample_linear(&input, 50, 100).collect();
        assert_eq!(double.len(), 20);
        assert!((double[1] - 0.5).abs() < 1e-6);
        assert!(resample_linear(&[], 50, 100).next().is_none());
    }

    #[test]
    fn wav_roundtrip_is_readable_by_catalog_reader_and_importer() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("clip.wav");
        let samples = normalize(sine(44_100, 1, 0.5)).unwrap();
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

    struct CountingSource {
        remaining: usize,
        reads: std::rc::Rc<std::cell::Cell<usize>>,
        channels: u16,
        rate: u32,
        change_at: Option<usize>,
        change_channels: bool,
    }

    impl Iterator for CountingSource {
        type Item = f32;
        fn next(&mut self) -> Option<f32> {
            if self.remaining == 0 {
                return None;
            }
            self.remaining -= 1;
            self.reads.set(self.reads.get() + 1);
            Some(0.25)
        }
    }
    impl Source for CountingSource {
        fn current_span_len(&self) -> Option<usize> {
            None
        }
        fn channels(&self) -> std::num::NonZeroU16 {
            NonZero::new(
                self.channels
                    + u16::from(
                        self.change_channels
                            && self.change_at.is_some_and(|n| self.reads.get() >= n),
                    ),
            )
            .unwrap()
        }
        fn sample_rate(&self) -> std::num::NonZeroU32 {
            NonZero::new(
                self.rate
                    + u32::from(
                        !self.change_channels
                            && self.change_at.is_some_and(|n| self.reads.get() >= n),
                    ),
            )
            .unwrap()
        }
        fn total_duration(&self) -> Option<std::time::Duration> {
            None
        }
    }

    #[test]
    fn duration_limit_is_exact_and_stops_after_one_extra_sample() {
        for channels in [1, 2, 6] {
            let limit = 100 * 30 * usize::from(channels);
            for excess in [0, 1, 10_000] {
                let reads = std::rc::Rc::new(std::cell::Cell::new(0));
                let source = CountingSource {
                    remaining: limit + excess,
                    reads: reads.clone(),
                    channels,
                    rate: 100,
                    change_at: None,
                    change_channels: false,
                };
                let result = normalize(source);
                if excess == 0 {
                    assert_eq!(result.unwrap().len(), 30 * IMPORT_SAMPLE_RATE as usize);
                } else {
                    assert!(matches!(result, Err(VoiceError::Validation { .. })));
                }
                assert_eq!(reads.get(), limit + usize::from(excess != 0));
            }
        }
    }

    #[test]
    fn rejects_partial_frames_and_format_changes_and_short_audio() {
        for (remaining, channels, change_at, change_channels) in [
            (101, 2, None, false),
            (100, 1, Some(50), false),
            (100, 1, Some(50), true),
            (19, 1, None, false),
        ] {
            let source = CountingSource {
                remaining,
                reads: Default::default(),
                channels,
                rate: 100,
                change_at,
                change_channels,
            };
            assert!(matches!(
                normalize(source),
                Err(VoiceError::Validation { .. })
            ));
        }
        assert_eq!(normalize(sine(100, 1, 0.2)).unwrap().len(), 4_800);
    }

    #[test]
    fn rejects_out_of_range_duration_and_garbage() {
        let dir = tempfile::tempdir().unwrap();
        let short = dir.path().join("short.wav");
        write_pcm16_wav(&short, &vec![0; 1_200], IMPORT_SAMPLE_RATE).unwrap();
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
